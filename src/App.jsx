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

function loadSavedHike() {
  try { const s = localStorage.getItem(HIKE_KEY); return s ? JSON.parse(s) : null } catch { return null }
}

function AppShell() {
  const { session, user, profile, needsUsername } = useAuth()
  const [tab, setTab] = useState('wizard')
  const [activeHike, setActiveHike] = useState(loadSavedHike)
  const [hikeVisible, setHikeVisible] = useState(!!loadSavedHike())
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

  // Persist active hike — save on every change, auto-save interval
  useEffect(() => {
    if (activeHike) localStorage.setItem(HIKE_KEY, JSON.stringify(activeHike))
    else localStorage.removeItem(HIKE_KEY)
  }, [activeHike])

  // Auto-save every 30s
  useEffect(() => {
    if (!activeHike) return
    const id = setInterval(() => {
      localStorage.setItem(HIKE_KEY, JSON.stringify(activeHike))
    }, 30000)
    return () => clearInterval(id)
  }, [activeHike])

  const handleChallengeCompleted = useCallback((challengeId) => {
    setActiveHike((prev) => {
      if (!prev) return prev
      const completed = [...(prev.completedChallengeIds ?? [])]
      if (!completed.includes(challengeId)) completed.push(challengeId)
      return { ...prev, completedChallengeIds: completed }
    })
  }, [])

  // Save walked distance + paused time from ActiveHikeScreen
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
      const { data: run } = await supabase.from('user_route_runs').insert({ user_id: user?.id, route_id: route.id, started_at: new Date().toISOString(), is_completed: false }).select('id').single()
      runId = run?.id ?? null
    } catch (e) { console.warn('Could not create route run:', e) }
    const hike = { route, challenges, routeGeometry, runId, startedAt: new Date().toISOString(), completedChallengeIds: [], walkedKm: 0, totalPausedMs: 0 }
    setActiveHike(hike)
    setHikeVisible(true)
  }

  function resumeHike() {
    // activeHike already loaded from localStorage
    if (activeHike) setHikeVisible(true)
  }

  async function handleFinishHike(result) {
    const route = activeHike?.route
    const runId = activeHike?.runId
    const hikeWeather = result?.weather
    if (runId && result?.completed) {
      const u = { completed_at: new Date().toISOString(), is_completed: true }
      if (hikeWeather) { u.weather_temp_c = hikeWeather.temp_c; u.weather_condition = hikeWeather.condition; u.weather_rain_mm = hikeWeather.rain_mm; u.weather_snow_cm = hikeWeather.snow_cm }
      supabase.from('user_route_runs').update(u).eq('id', runId).then(() => {})
    }
    setActiveHike(null)
    setHikeVisible(false)
    let earned = [], isAmbassador = false
    if (user && result?.completed) {
      try {
        const stats = await fetchUserStats(user.id)
        if (stats) earned = await checkAndAwardBadges(user.id, stats)
        if (hikeWeather) { const wb = await checkWeatherBadges(hikeWeather, result, user.id, runId, supabase); earned = [...earned, ...wb] }
        isAmbassador = await checkAmbassadorBadge(route.id, user.id, runId)
      } catch (e) { console.warn('Badge check failed:', e) }
    }
    if (result?.completed && route) {
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

  // Keep ActiveHikeScreen mounted (hidden) so map doesn't get destroyed
  // Show it on top when hikeVisible=true
  return (
    <div className="app-shell">
      {activeHike && (
        <div style={{ position: 'fixed', inset: 0, zIndex: hikeVisible ? 50 : -1, opacity: hikeVisible ? 1 : 0, pointerEvents: hikeVisible ? 'auto' : 'none' }}>
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
        {tab === 'routes' && <RoutesScreen onStartRoute={handleStartRoute} activeHike={activeHike} onResumeHike={resumeHike} />}
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
