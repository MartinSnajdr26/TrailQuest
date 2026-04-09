import { useState, useEffect, useCallback } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { supabase } from './lib/supabase.js'
import { fetchUserStats } from './lib/stats.js'
import { checkAndAwardBadges, checkAmbassadorBadge } from './lib/badges.js'
import { fetchCurrentWeather, checkWeatherBadges } from './lib/weather.js'
import OnboardingScreen from './screens/OnboardingScreen.jsx'
import AuthScreen from './screens/AuthScreen.jsx'
import UsernameSetup from './screens/UsernameSetup.jsx'
import RouteWizardScreen from './screens/RouteWizardScreen.jsx'
import RoutesScreen from './screens/RoutesScreen.jsx'
import ProfileScreen from './screens/ProfileScreen.jsx'
import SocialScreen from './screens/SocialScreen.jsx'
import ActiveHikeScreen from './screens/ActiveHikeScreen.jsx'
import BottomNav from './components/BottomNav.jsx'
import RouteSummary from './components/RouteSummary.jsx'
import BadgeCelebration from './components/BadgeCelebration.jsx'

const HIKE_KEY = 'tq_active_hike'

function inferKraj(lat, lng) {
  if (!lat || !lng) return null
  lat = parseFloat(lat); lng = parseFloat(lng)
  if (lat > 49.9 && lat < 50.25 && lng > 14.2 && lng < 14.7) return 'Praha'
  if (lat > 49.7 && lat < 50.25 && lng > 13.3 && lng < 14.7) return 'Středočeský'
  if (lat > 48.5 && lat < 49.6 && lng > 13.0 && lng < 14.7) return 'Jihočeský'
  if (lat > 49.3 && lat < 50.0 && lng > 12.7 && lng < 13.7) return 'Plzeňský'
  if (lat > 50.0 && lat < 50.7 && lng > 12.1 && lng < 13.5) return 'Karlovarský'
  if (lat > 50.3 && lat < 51.0 && lng > 13.1 && lng < 15.0) return 'Ústecký'
  if (lat > 50.6 && lat < 51.05 && lng > 14.7 && lng < 15.5) return 'Liberecký'
  if (lat > 50.2 && lat < 50.8 && lng > 15.4 && lng < 16.5) return 'Královéhradecký'
  if (lat > 49.7 && lat < 50.3 && lng > 15.5 && lng < 17.0) return 'Pardubický'
  if (lat > 49.2 && lat < 50.0 && lng > 14.9 && lng < 16.5) return 'Vysočina'
  if (lat > 48.5 && lat < 49.5 && lng > 16.0 && lng < 17.5) return 'Jihomoravský'
  if (lat > 49.3 && lat < 50.0 && lng > 16.8 && lng < 17.9) return 'Olomoucký'
  if (lat > 48.9 && lat < 49.7 && lng > 17.3 && lng < 18.4) return 'Zlínský'
  if (lat > 49.3 && lat < 50.0 && lng > 17.8 && lng < 18.9) return 'Moravskoslezský'
  return null
}

function loadSavedHike() {
  try { const s = localStorage.getItem(HIKE_KEY); return s ? JSON.parse(s) : null } catch { return null }
}

function AppShell() {
  const { session, user, profile, needsUsername } = useAuth()
  const [tab, setTab] = useState('wizard')
  const [activeHike, setActiveHike] = useState(loadSavedHike)
  const [hikeVisible, setHikeVisible] = useState(false) // start hidden, user must tap resume or start
  const [summary, setSummary] = useState(null)
  const [newBadges, setNewBadges] = useState(null)
  const [adminPending, setAdminPending] = useState(0)

  const [firstLaunch] = useState(() => localStorage.getItem('tq_firstLaunch') !== 'done')
  const [showOnboarding, setShowOnboarding] = useState(firstLaunch)

  useEffect(() => {
    if (!profile?.is_admin) return
    Promise.all([
      supabase.from('poi_questions').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      supabase.from('custom_pois').select('id', { count: 'exact', head: true }).eq('is_approved', false),
    ]).then(([q, p]) => setAdminPending((q.count ?? 0) + (p.count ?? 0)))
  }, [profile?.is_admin])

  // Persist to localStorage on every activeHike change
  useEffect(() => {
    if (activeHike) localStorage.setItem(HIKE_KEY, JSON.stringify(activeHike))
    else localStorage.removeItem(HIKE_KEY)
  }, [activeHike])

  const handleChallengeCompleted = useCallback((challengeId) => {
    setActiveHike((prev) => {
      if (!prev) return prev
      const completed = [...(prev.completedChallengeIds ?? [])]
      if (!completed.includes(challengeId)) completed.push(challengeId)
      return { ...prev, completedChallengeIds: completed }
    })
  }, [])

  const handleHikeStateUpdate = useCallback((patch) => {
    setActiveHike((prev) => prev ? { ...prev, ...patch } : prev)
  }, [])

  async function handleStartRoute(routeOrGenerated) {
    let route, challenges, routeGeometry
    if (routeOrGenerated.routeGeometry) {
      route = routeOrGenerated.route
      challenges = routeOrGenerated.challenges.map((ch, i) => ({ ...ch, id: ch.id ?? `gen-${i}`, route_id: route.id }))
      routeGeometry = routeOrGenerated.routeGeometry
    } else {
      route = routeOrGenerated
      const { data } = await supabase.from('challenges').select('*').eq('route_id', route.id).order('sequence_order', { ascending: true })
      challenges = data ?? []
      routeGeometry = route.gpx_data
    }
    let runId = null
    try {
      const { data: run } = await supabase.from('user_route_runs').insert({
        user_id: user?.id, route_id: route.id, started_at: new Date().toISOString(), is_completed: false,
        activity_type: route.activity_type || 'hiking', region: route.region || null,
        kraj: inferKraj(route.start_lat, route.start_lng), experience_type: route.experience_type || null,
      }).select('id').single()
      runId = run?.id ?? null
    } catch (e) { console.warn('Could not create route run:', e) }
    setActiveHike({ route, challenges, routeGeometry, runId, startedAt: new Date().toISOString(), completedChallengeIds: [], walkedKm: 0, totalPausedMs: 0 })
    setHikeVisible(true)
  }

  function resumeHike() {
    if (activeHike) setHikeVisible(true)
  }

  function clearActiveHike() {
    setActiveHike(null)
    setHikeVisible(false)
  }

  async function handleFinishHike(result) {
    if (!result?.completed) {
      setHikeVisible(false)
      return
    }

    const route = activeHike?.route
    const runId = activeHike?.runId
    const hikeWeather = result?.weather

    // Save run completion with full stats
    if (runId) {
      const u = {
        completed_at: new Date().toISOString(), is_completed: true,
        total_km: parseFloat(result.walkedKm ?? route?.distance_km ?? 0),
        challenges_completed: result.completedCount ?? 0,
      }
      if (hikeWeather) { u.weather_temp_c = hikeWeather.temp_c; u.weather_condition = hikeWeather.condition; u.weather_rain_mm = hikeWeather.rain_mm; u.weather_snow_cm = hikeWeather.snow_cm }
      const { error } = await supabase.from('user_route_runs').update(u).eq('id', runId)
      if (error) console.warn('Run update error:', error.message)
    }

    // Sync user totals (fallback if DB trigger not yet created)
    if (user) {
      try {
        const { data: runs } = await supabase.from('user_route_runs').select('total_km, challenges_completed').eq('user_id', user.id).eq('is_completed', true)
        if (runs) {
          await supabase.from('users').update({
            total_routes: runs.length,
            total_km: parseFloat(runs.reduce((s, r) => s + (r.total_km ?? 0), 0).toFixed(2)),
            total_challenges: runs.reduce((s, r) => s + (r.challenges_completed ?? 0), 0),
          }).eq('id', user.id)
        }
      } catch (e) { console.warn('Stats sync error:', e) }
    }

    setActiveHike(null)
    setHikeVisible(false)

    // Award badges
    let earned = [], isAmbassador = false
    if (user) {
      try {
        const stats = await fetchUserStats(user.id)
        if (stats) earned = await checkAndAwardBadges(user.id, stats)
        if (hikeWeather) { const wb = await checkWeatherBadges(hikeWeather, result, user.id, runId, supabase); earned = [...earned, ...wb] }
        isAmbassador = await checkAmbassadorBadge(route.id, user.id, runId)
      } catch (e) { console.warn('Badge check failed:', e) }
    }
    if (route) {
      setSummary({ route, hikeResult: result, earnedBadges: earned, weather: hikeWeather, isAmbassador })
      if (earned.length > 0) setNewBadges(earned)
    }
  }

  if (showOnboarding) return <OnboardingScreen onComplete={() => setShowOnboarding(false)} />
  if (session === undefined) return <div className="splash" />
  if (!session) return <AuthScreen />
  if (profile === undefined) return <div className="splash" />
  if (needsUsername()) return <UsernameSetup />

  if (newBadges?.length > 0) {
    return (
      <>
        {summary && <RouteSummary route={summary.route} hikeResult={summary.hikeResult} earnedBadges={summary.earnedBadges} weather={summary.weather} isAmbassador={summary.isAmbassador} onClose={() => setSummary(null)} />}
        <BadgeCelebration badges={newBadges} onClose={() => setNewBadges(null)} />
      </>
    )
  }
  if (summary) return <RouteSummary route={summary.route} hikeResult={summary.hikeResult} earnedBadges={summary.earnedBadges} weather={summary.weather} isAmbassador={summary.isAmbassador} onClose={() => setSummary(null)} />

  return (
    <div className="app-shell">
      {/* ActiveHikeScreen: always mounted when hike exists, shown/hidden via z-index */}
      {activeHike && (
        <div style={{ position: 'fixed', inset: 0, zIndex: hikeVisible ? 50 : -1, visibility: hikeVisible ? 'visible' : 'hidden' }}>
          <ActiveHikeScreen
            route={activeHike.route}
            challenges={activeHike.challenges}
            routeGeometry={activeHike.routeGeometry}
            runId={activeHike.runId}
            startedAt={activeHike.startedAt}
            completedChallengeIds={activeHike.completedChallengeIds}
            savedWalkedKm={activeHike.walkedKm}
            savedTotalPausedMs={activeHike.totalPausedMs}
            onChallengeCompleted={handleChallengeCompleted}
            onStateUpdate={handleHikeStateUpdate}
            onFinish={handleFinishHike}
          />
        </div>
      )}
      <main className="app-main">
        {tab === 'wizard' && <RouteWizardScreen onRouteGenerated={handleStartRoute} />}
        {tab === 'routes' && <RoutesScreen onStartRoute={handleStartRoute} activeHike={activeHike} onResumeHike={resumeHike} onClearActiveHike={clearActiveHike} />}
        {tab === 'social' && <SocialScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>
      <BottomNav active={tab} onChange={setTab} adminPending={adminPending} />
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppShell /></AuthProvider>
}
