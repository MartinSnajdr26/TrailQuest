import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabase.js'
import { getWeatherEmoji } from '../lib/weather.js'

const ACTIVITY_ICONS = { hiking: '🥾', cycling: '🚴', mtb: '🚵', crosscountry: '🏃', skitouring: '⛷️' }

function formatElapsed(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return '—'
  const ms = new Date(finishedAt) - new Date(startedAt)
  const mins = Math.floor(ms / 60000)
  const hrs = Math.floor(mins / 60)
  const m = mins % 60
  return hrs > 0 ? `${hrs}h ${m}m` : `${m}m`
}

function formatKm(km) { return km ? `${Number(km).toFixed(1)} km` : '0 km' }

export default function RouteSummary({ route, hikeResult, earnedBadges, weather, isAmbassador, onClose }) {
  const { t } = useTranslation()
  const cardRef = useRef(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Friend challenge state
  const [showFriendChallenge, setShowFriendChallenge] = useState(false)
  const [friendSearch, setFriendSearch] = useState('')
  const [friendResults, setFriendResults] = useState([])
  const [challengeMsg, setChallengeMsg] = useState('')
  const [challengeSent, setChallengeSent] = useState(false)

  const icon = ACTIVITY_ICONS[route.activity_type] ?? '🥾'
  const elapsed = formatElapsed(hikeResult?.startedAt, hikeResult?.finishedAt)
  const elapsedSec = hikeResult?.startedAt && hikeResult?.finishedAt
    ? Math.round((new Date(hikeResult.finishedAt) - new Date(hikeResult.startedAt)) / 1000)
    : 0

  async function exportImage(aspect) {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0d1117', scale: 2, width: 540, height: aspect === 'story' ? 960 : 540 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a'); a.href = url; a.download = `trailquest-${route.name?.replace(/\s+/g, '-') ?? 'route'}.png`; a.click()
    } catch (e) { console.warn('Export failed:', e) }
    setExporting(false)
  }

  async function handleCopyLink() { try { await navigator.clipboard.writeText(window.location.href) } catch {} }

  async function submitRating() {
    if (rating === 0 || ratingSubmitted) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await supabase.from('route_ratings').upsert({ user_id: session.user.id, route_id: route.id, rating, comment: comment.trim() || null, created_at: new Date().toISOString() }, { onConflict: 'user_id,route_id' })
      }
    } catch (e) { console.warn('Rating save failed:', e) }
    setRatingSubmitted(true)
  }

  // Friend challenge
  async function searchFriends(q) {
    if (q.length < 2) { setFriendResults([]); return }
    const { data } = await supabase.from('users').select('id, username').ilike('username', `%${q}%`).limit(8)
    setFriendResults(data ?? [])
  }

  async function sendChallenge(friendId) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    await supabase.from('friend_challenges').insert({
      challenger_id: session.user.id,
      challenged_id: friendId,
      route_id: route.id,
      status: 'pending',
      challenger_time_sec: elapsedSec,
      message: challengeMsg.trim() || null,
    })
    setChallengeSent(true)
  }

  return (
    <div className="summary-overlay">
      <div className="summary-scroll">
        <div className="summary-card" ref={cardRef}>
          <div className="summary-brand">TrailQuest</div>
          <div className="summary-icon">{icon}</div>
          <h1 className="summary-route-name">{route.name}</h1>

          {/* Ambassador banner */}
          {isAmbassador && (
            <div className="summary-ambassador">
              🥇 {t('summary.ambassador')}
            </div>
          )}

          <div className="summary-stats-grid">
            <div className="summary-stat">
              <div className="summary-stat-val">{formatKm(route.distance_km)}</div>
              <div className="summary-stat-label">{t('summary.distance')}</div>
            </div>
            <div className="summary-stat">
              <div className="summary-stat-val">{elapsed}</div>
              <div className="summary-stat-label">{t('summary.time')}</div>
            </div>
            <div className="summary-stat">
              <div className="summary-stat-val">{route.elevation_gain_m ? `${route.elevation_gain_m} m` : '—'}</div>
              <div className="summary-stat-label">{t('summary.elevation')}</div>
            </div>
            <div className="summary-stat">
              <div className="summary-stat-val">{hikeResult?.completedCount ?? 0}/{hikeResult?.totalChallenges ?? 0}</div>
              <div className="summary-stat-label">{t('summary.challenges')}</div>
            </div>
          </div>

          {weather && (
            <div className="summary-weather">
              <span>{getWeatherEmoji(weather.condition)} {Math.round(weather.temp_c)}°C</span>
              {weather.rain_mm > 0 && <span>🌧️ {weather.rain_mm} mm</span>}
              {weather.snow_cm > 0 && <span>❄️ {weather.snow_cm} cm</span>}
            </div>
          )}

          {earnedBadges && earnedBadges.length > 0 && (
            <div className="summary-badges">
              <div className="summary-badges-label">{t('summary.badgesEarned')}</div>
              <div className="summary-badges-row">
                {earnedBadges.map((b) => (
                  <span key={b.id} className="summary-badge-chip">{b.icon} {t(b.name, b.name)}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rating */}
        <div className="summary-section">
          <h3 className="summary-section-title">{t('summary.rateRoute')}</h3>
          <div className="summary-stars">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} className={`summary-star ${s <= rating ? 'active' : ''}`} onClick={() => setRating(s)}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill={s <= rating ? '#ffd700' : 'none'} stroke={s <= rating ? '#ffd700' : 'currentColor'} strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            ))}
          </div>
          <textarea className="challenge-textarea" placeholder={t('summary.commentPlaceholder')} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          <button className="btn-primary" onClick={submitRating} disabled={rating === 0 || ratingSubmitted}>
            {ratingSubmitted ? t('summary.ratingSubmitted') : t('summary.submitRating')}
          </button>
        </div>

        {/* Friend challenge */}
        <div className="summary-section">
          {!showFriendChallenge ? (
            <button className="btn-secondary" onClick={() => setShowFriendChallenge(true)}>
              ⚔️ {t('summary.challengeFriend')}
            </button>
          ) : challengeSent ? (
            <div className="summary-challenge-sent">✅ {t('summary.challengeSent')}</div>
          ) : (
            <div className="summary-challenge-form">
              <h3 className="summary-section-title">⚔️ {t('summary.challengeFriend')}</h3>
              <input
                className="form-input"
                type="text"
                placeholder={t('social.searchPlaceholder')}
                value={friendSearch}
                onChange={(e) => { setFriendSearch(e.target.value); searchFriends(e.target.value) }}
              />
              {friendResults.length > 0 && (
                <div className="summary-friend-results">
                  {friendResults.map((f) => (
                    <button key={f.id} className="summary-friend-btn" onClick={() => sendChallenge(f.id)}>
                      {f.username}
                    </button>
                  ))}
                </div>
              )}
              <input className="form-input" type="text" placeholder={t('summary.challengeMsg')} value={challengeMsg} onChange={(e) => setChallengeMsg(e.target.value)} />
            </div>
          )}
        </div>

        {/* Share */}
        <div className="summary-section">
          <h3 className="summary-section-title">{t('summary.share')}</h3>
          <div className="summary-share-row">
            <button className="btn-secondary summary-share-btn" onClick={() => exportImage('story')} disabled={exporting}>{t('summary.exportStory')}</button>
            <button className="btn-secondary summary-share-btn" onClick={() => exportImage('feed')} disabled={exporting}>{t('summary.exportFeed')}</button>
            <button className="btn-secondary summary-share-btn" onClick={handleCopyLink}>{t('summary.copyLink')}</button>
          </div>
        </div>

        <button className="btn-primary summary-close-btn" onClick={onClose}>{t('summary.backToMap')}</button>
      </div>
    </div>
  )
}
