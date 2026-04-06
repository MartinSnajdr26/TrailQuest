import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { supabase } from './lib/supabase.js'
import { fetchUserStats } from './lib/stats.js'
import { checkAndAwardBadges, checkAmbassadorBadge } from './lib/badges.js'
import { fetchCurrentWeather, checkWeatherBadges } from './lib/weather.js'
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

function AppShell() {
  const { session, user, profile, needsUsername } = useAuth()
  const [tab, setTab] = useState('wizard')
  const [activeHike, setActiveHike] = useState(null)
  const [summary, setSummary] = useState(null)
  const [newBadges, setNewBadges] = useState(null)

  // Called when wizard generates a route, or user starts an existing route
  async function handleStartRoute(routeOrGenerated) {
    let route, challenges, routeGeometry

    if (routeOrGenerated.routeGeometry) {
      // From wizard
      route = routeOrGenerated.route
      challenges = routeOrGenerated.challenges.map((ch, i) => ({
        ...ch,
        id: ch.id ?? `gen-${i}`,
        route_id: route.id,
      }))
      routeGeometry = routeOrGenerated.routeGeometry
    } else {
      // From routes list — load challenges
      route = routeOrGenerated
      const { data } = await supabase
        .from('challenges')
        .select('*')
        .eq('route_id', route.id)
        .order('sequence_order', { ascending: true })
      challenges = data ?? []
      routeGeometry = route.gpx_data
    }

    let runId = null
    try {
      const { data: run } = await supabase
        .from('user_route_runs')
        .insert({
          user_id: user?.id,
          route_id: route.id,
          started_at: new Date().toISOString(),
          is_completed: false,
        })
        .select('id')
        .single()
      runId = run?.id ?? null
    } catch (e) {
      console.warn('Could not create route run:', e)
    }

    setActiveHike({
      route,
      challenges,
      routeGeometry,
      runId,
      startedAt: new Date().toISOString(),
    })
  }

  async function handleFinishHike(result) {
    const route = activeHike?.route
    const runId = activeHike?.runId

    // Save weather data to run
    const hikeWeather = result?.weather
    if (runId && result?.completed) {
      const updateData = { completed_at: new Date().toISOString(), is_completed: true }
      if (hikeWeather) {
        updateData.weather_temp_c = hikeWeather.temp_c
        updateData.weather_condition = hikeWeather.condition
        updateData.weather_rain_mm = hikeWeather.rain_mm
        updateData.weather_snow_cm = hikeWeather.snow_cm
      }
      supabase.from('user_route_runs').update(updateData).eq('id', runId).then(() => {})
    }

    setActiveHike(null)

    let earned = []
    let isAmbassador = false
    if (user && result?.completed) {
      try {
        const stats = await fetchUserStats(user.id)
        if (stats) earned = await checkAndAwardBadges(user.id, stats)
        if (hikeWeather) {
          const weatherBadges = await checkWeatherBadges(hikeWeather, result, user.id, runId, supabase)
          earned = [...earned, ...weatherBadges]
        }
        isAmbassador = await checkAmbassadorBadge(route.id, user.id, runId)
      } catch (e) {
        console.warn('Badge check failed:', e)
      }
    }

    if (result?.completed && route) {
      setSummary({ route, hikeResult: result, earnedBadges: earned, weather: hikeWeather, isAmbassador })
      if (earned.length > 0) setNewBadges(earned)
    }
  }

  // Loading
  if (session === undefined) return <div className="splash" />
  if (!session) return <AuthScreen />
  if (profile === undefined) return <div className="splash" />
  if (needsUsername()) return <UsernameSetup />

  // Overlays
  if (newBadges?.length > 0) {
    return (
      <>
        {summary && <RouteSummary route={summary.route} hikeResult={summary.hikeResult} earnedBadges={summary.earnedBadges} weather={summary.weather} isAmbassador={summary.isAmbassador} onClose={() => setSummary(null)} />}
        <BadgeCelebration badges={newBadges} onClose={() => setNewBadges(null)} />
      </>
    )
  }
  if (summary) {
    return <RouteSummary route={summary.route} hikeResult={summary.hikeResult} earnedBadges={summary.earnedBadges} weather={summary.weather} isAmbassador={summary.isAmbassador} onClose={() => setSummary(null)} />
  }
  if (activeHike) {
    return (
      <ActiveHikeScreen
        route={activeHike.route}
        challenges={activeHike.challenges}
        routeGeometry={activeHike.routeGeometry}
        runId={activeHike.runId}
        startedAt={activeHike.startedAt}
        onFinish={handleFinishHike}
      />
    )
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {tab === 'wizard' && <RouteWizardScreen onRouteGenerated={handleStartRoute} />}
        {tab === 'routes' && <RoutesScreen onStartRoute={handleStartRoute} />}
        {tab === 'social' && <SocialScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
