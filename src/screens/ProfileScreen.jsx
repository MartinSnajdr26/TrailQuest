import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { fetchUserStats } from '../lib/stats.js'
import { fetchUserBadges } from '../lib/badges.js'
import BadgeWall from '../components/BadgeWall.jsx'
import SubmitQuestionScreen from './SubmitQuestionScreen.jsx'
import AddPOIScreen from './AddPOIScreen.jsx'
import PassportScreen from './PassportScreen.jsx'
import HelpScreen from './HelpScreen.jsx'
import AboutScreen from './AboutScreen.jsx'
import AdminScreen from './AdminScreen.jsx'

const LANGUAGES = [
  { code: 'cs', label: 'Čeština' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
]

function getInitials(username) {
  if (!username) return '??'
  return username.slice(0, 2).toUpperCase()
}

function AdminCard({ onOpen }) {
  const { t } = useTranslation()
  const [qCount, setQCount] = useState(0)
  const [pCount, setPCount] = useState(0)
  useEffect(() => {
    Promise.all([
      supabase.from('poi_questions').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      supabase.from('custom_pois').select('id', { count: 'exact', head: true }).eq('is_approved', false),
    ]).then(([q, p]) => { setQCount(q.count ?? 0); setPCount(p.count ?? 0) })
  }, [])
  return (
    <div className="admin-card-profile" onClick={onOpen}>
      <div className="admin-card-profile-header">
        <span>⚙️ {t('admin.title')}</span>
        <span className="admin-card-arrow">→</span>
      </div>
      <div className="admin-card-profile-meta">
        {t('admin.pendingLabel')}: {qCount} {t('admin.questions')}, {pCount} {t('admin.places')}
      </div>
    </div>
  )
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const { user, profile, signOut, saveUsername } = useAuth()
  const [stats, setStats] = useState(null)
  const [earnedBadgeIds, setEarnedBadgeIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [recentRuns, setRecentRuns] = useState([])

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('tq_theme') ?? 'dark')

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('tq_theme', next)
  }

  // Edit username state
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [usernameSaving, setUsernameSaving] = useState(false)

  // Contributions
  const [myQuestions, setMyQuestions] = useState([])
  const [showSubmit, setShowSubmit] = useState(false)
  const [showAddPoi, setShowAddPoi] = useState(false)
  const [showPassport, setShowPassport] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      const [s, badges, runs, questions] = await Promise.all([
        fetchUserStats(user.id),
        fetchUserBadges(user.id),
        supabase
          .from('user_route_runs')
          .select('id, started_at, completed_at, is_completed, routes(name, distance_km)')
          .eq('user_id', user.id)
          .eq('is_completed', true)
          .order('completed_at', { ascending: false })
          .limit(5)
          .then(({ data }) => data ?? []),
        supabase
          .from('poi_questions')
          .select('id, poi_name, question_type, is_approved, times_used')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data }) => data ?? []),
      ])
      if (cancelled) return
      setStats(s)
      setEarnedBadgeIds(badges.map((b) => b.badge_id))
      setRecentRuns(runs)
      setMyQuestions(questions)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user])

  function changeLanguage(code) {
    i18n.changeLanguage(code)
    localStorage.setItem('tq_lang', code)
  }

  async function handleSaveUsername() {
    const val = newUsername.trim()
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(val)) {
      setUsernameError(t('username.hint'))
      return
    }
    setUsernameSaving(true)
    setUsernameError('')
    try {
      // Check uniqueness
      const { data } = await supabase
        .from('users')
        .select('id')
        .ilike('username', val)
        .neq('id', user?.id ?? '')
        .limit(1)
      if (data && data.length > 0) {
        setUsernameError(t('username.taken'))
        setUsernameSaving(false)
        return
      }
      await saveUsername(val)
      setEditingUsername(false)
    } catch (e) {
      setUsernameError(e?.message ?? t('error.generic'))
    }
    setUsernameSaving(false)
  }

  const initials = getInitials(profile?.username)

  if (showSubmit) return <SubmitQuestionScreen onBack={() => setShowSubmit(false)} />
  if (showAddPoi) return <AddPOIScreen onBack={() => setShowAddPoi(false)} />
  if (showPassport) return <PassportScreen onBack={() => setShowPassport(false)} />
  if (showHelp) return <HelpScreen onBack={() => setShowHelp(false)} />
  if (showAbout) return <AboutScreen onBack={() => setShowAbout(false)} />
  if (showAdmin) return <AdminScreen onBack={() => setShowAdmin(false)} />

  return (
    <div className="screen profile-screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('profile.title')}</h1>
      </div>

      <div className="profile-body">
        {/* Avatar with initials + username */}
        <div className="profile-top">
          <div className="profile-avatar-circle">
            <span className="profile-avatar-initials">{initials}</span>
          </div>

          {editingUsername ? (
            <div className="profile-edit-username">
              <input
                className="form-input"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.replace(/\s/g, ''))}
                maxLength={20}
                autoFocus
              />
              {usernameError && <p className="username-hint username-hint--taken">{usernameError}</p>}
              <div className="profile-edit-btns">
                <button className="btn-primary" onClick={handleSaveUsername} disabled={usernameSaving}>
                  {usernameSaving ? '...' : t('username.save')}
                </button>
                <button className="btn-secondary" onClick={() => setEditingUsername(false)}>
                  {t('username.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-username-row">
              <div className="profile-username">@{profile?.username}</div>
              <button className="profile-edit-btn" onClick={() => { setNewUsername(profile?.username ?? ''); setEditingUsername(true); setUsernameError('') }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-state">{t('profile.loading')}</div>
        ) : stats ? (
          <>
            {/* Stats cards */}
            <div className="profile-stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.totalKm}</div>
                <div className="stat-label">{t('profile.totalKm')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.routesCompleted}</div>
                <div className="stat-label">{t('profile.routesCompleted')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.challengesSolved}</div>
                <div className="stat-label">{t('profile.challengesSolved')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.quizCorrectPct}%</div>
                <div className="stat-label">{t('profile.quizAccuracy')}</div>
              </div>
            </div>

            {/* Weekly streak */}
            <div className="profile-streak">
              <span className="streak-fire">🔥</span>
              <span className="streak-count">{stats.weeklyStreak}</span>
              <span className="streak-label">{t('profile.weekStreak')}</span>
            </div>

            {/* Monthly chart */}
            {stats.monthlyData && stats.monthlyData.some((d) => d.km > 0) && (
              <div className="profile-chart">
                <h3 className="profile-section-title">{t('profile.monthlyActivity')}</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.monthlyData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <XAxis dataKey="month" tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3', fontSize: 13 }}
                      labelStyle={{ color: '#8b949e' }}
                    />
                    <Bar dataKey="km" name="km" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent completed routes */}
            {recentRuns.length > 0 && (
              <div className="profile-recent">
                <h3 className="profile-section-title">{t('profile.recentRoutes')}</h3>
                <div className="recent-list">
                  {recentRuns.map((run) => (
                    <div key={run.id} className="recent-row">
                      <span className="recent-name">{run.routes?.name ?? '—'}</span>
                      <span className="recent-meta">
                        {run.routes?.distance_km ? `${Number(run.routes.distance_km).toFixed(1)} km` : ''}
                        {run.completed_at && ` · ${new Date(run.completed_at).toLocaleDateString()}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Personal records */}
            {(stats.longestRoute || stats.mostElevation) && (
              <div className="profile-records">
                <h3 className="profile-section-title">{t('profile.personalRecords')}</h3>
                {stats.longestRoute && stats.longestRoute.distance_km > 0 && (
                  <div className="record-row">
                    <span className="record-label">{t('profile.longestRoute')}</span>
                    <span className="record-value">
                      {stats.longestRoute.name} — {Number(stats.longestRoute.distance_km).toFixed(1)} km
                    </span>
                  </div>
                )}
                {stats.mostElevation && stats.mostElevation.elevation_m > 0 && (
                  <div className="record-row">
                    <span className="record-label">{t('profile.mostElevation')}</span>
                    <span className="record-value">
                      {stats.mostElevation.name} — {stats.mostElevation.elevation_m} m
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Visited regions */}
            {stats.regions && stats.regions.length > 0 && (
              <div className="profile-regions">
                <h3 className="profile-section-title">{t('profile.visitedRegions')}</h3>
                <div className="region-chips">
                  {stats.regions.map((r) => (
                    <span key={r} className="region-chip">{r}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Badge wall */}
            <BadgeWall earnedBadgeIds={earnedBadgeIds} />
          </>
        ) : (
          <div className="empty-state">{t('profile.noData')}</div>
        )}

        {/* Contributions */}
        {/* Passport */}
        <button className="btn-secondary" onClick={() => setShowPassport(true)}>
          📔 {t('passport.title')}
        </button>

        <div className="profile-contributions">
          <h3 className="profile-section-title">{t('profile.myContributions')}</h3>
          <div className="contrib-stats-row">
            <span>{myQuestions.length} {t('profile.submitted')}</span>
            <span>{myQuestions.filter((q) => q.is_approved).length} {t('profile.approved')}</span>
            <span>{myQuestions.filter((q) => !q.is_approved).length} {t('profile.pending')}</span>
          </div>
          <div className="contrib-btn-row">
            <button className="btn-primary" onClick={() => setShowSubmit(true)}>
              + {t('profile.addChallenge')}
            </button>
            <button className="btn-secondary" onClick={() => setShowAddPoi(true)}>
              📍 {t('profile.addPlace')}
            </button>
          </div>
          {myQuestions.length > 0 && (
            <div className="contrib-list">
              {myQuestions.slice(0, 5).map((q) => (
                <div key={q.id} className="contrib-row">
                  <span className="contrib-name">{q.poi_name}</span>
                  <span className={`contrib-status ${q.is_approved ? 'approved' : 'pending'}`}>
                    {q.is_approved ? `✅ ×${q.times_used ?? 0}` : '⏳'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin panel — only if user has is_admin flag */}
        {profile?.is_admin && (
          <AdminCard onOpen={() => setShowAdmin(true)} />
        )}

        {/* Help & About */}
        <button className="btn-secondary" onClick={() => setShowHelp(true)}>❓ {t('help.title')}</button>
        <button className="btn-secondary" onClick={() => setShowAbout(true)}>ℹ️ {t('about.title')}</button>

        {/* Theme toggle */}
        <div className="profile-lang">
          <h3 className="profile-section-title">{t('profile.theme')}</h3>
          <div className="theme-toggle-wrap">
            <span className="theme-toggle-label">{theme === 'dark' ? t('profile.darkMode') : t('profile.lightMode')}</span>
            <button className={`theme-toggle ${theme === 'dark' ? 'active' : ''}`} onClick={toggleTheme} aria-label="Toggle theme">
              <span className="theme-toggle-knob" />
            </button>
          </div>
        </div>

        {/* Language switcher */}
        <div className="profile-lang">
          <h3 className="profile-section-title">{t('profile.language')}</h3>
          <div className="lang-row">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={`lang-btn ${i18n.language === lang.code ? 'active' : ''}`}
                onClick={() => changeLanguage(lang.code)}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-secondary profile-logout" onClick={signOut}>
          {t('auth.logout')}
        </button>
      </div>
    </div>
  )
}
