import { supabase } from './supabase.js'

export async function fetchUserStats(userId) {
  if (!userId) return null

  const [runsRes, completionsRes] = await Promise.all([
    supabase
      .from('user_route_runs')
      .select('id, route_id, started_at, completed_at, is_completed, routes(distance_km, name, elevation_gain_m, region)')
      .eq('user_id', userId)
      .order('started_at', { ascending: false }),
    supabase
      .from('user_challenge_completions')
      .select('id, challenge_id, completed_at, answer, challenges(type, correct_answer)')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false }),
  ])

  const runs = runsRes.data ?? []
  const completions = completionsRes.data ?? []

  const completedRuns = runs.filter((r) => r.is_completed === true)

  // Total km
  const totalKm = completedRuns.reduce((sum, r) => {
    return sum + (r.routes?.distance_km ?? 0)
  }, 0)

  // Challenges solved
  const challengesSolved = completions.length

  // Quiz accuracy
  const quizCompletions = completions.filter((c) => c.challenges?.type === 'quiz')
  const quizCorrect = quizCompletions.filter((c) => {
    const correct = c.challenges?.correct_answer
    if (!correct) return false
    return String(c.answer).trim().toLowerCase() === String(correct).trim().toLowerCase()
  })
  const quizCorrectPct = quizCompletions.length > 0
    ? Math.round((quizCorrect.length / quizCompletions.length) * 100)
    : 0

  // Monthly data for chart (last 6 months)
  const monthlyData = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = d.toLocaleString('cs', { month: 'short' })
    const year = d.getFullYear()
    const monthNum = d.getMonth()
    const km = completedRuns
      .filter((r) => {
        const rd = new Date(r.completed_at)
        return rd.getFullYear() === year && rd.getMonth() === monthNum
      })
      .reduce((s, r) => s + (r.routes?.distance_km ?? 0), 0)
    const routes = completedRuns.filter((r) => {
      const rd = new Date(r.completed_at)
      return rd.getFullYear() === year && rd.getMonth() === monthNum
    }).length
    monthlyData.push({ month, km: Math.round(km * 10) / 10, routes })
  }

  // Weekly streak
  const weeklyStreak = calcWeeklyStreak(completedRuns)

  // Personal records
  const longestRoute = completedRuns.reduce((best, r) => {
    const d = r.routes?.distance_km ?? 0
    return d > (best?.distance_km ?? 0) ? { name: r.routes?.name, distance_km: d } : best
  }, null)
  const mostElevation = completedRuns.reduce((best, r) => {
    const e = r.routes?.elevation_gain_m ?? 0
    return e > (best?.elevation_m ?? 0) ? { name: r.routes?.name, elevation_m: e } : best
  }, null)

  // Regions
  const regions = [...new Set(completedRuns.map((r) => r.routes?.region).filter(Boolean))]

  return {
    routesCompleted: completedRuns.length,
    totalKm: Math.round(totalKm * 10) / 10,
    challengesSolved,
    quizCorrectPct,
    quizTotal: quizCompletions.length,
    quizCorrect: quizCorrect.length,
    monthlyData,
    weeklyStreak,
    longestRoute,
    mostElevation,
    regions,
    // For badge checks
    totalRuns: runs.length,
  }
}

function calcWeeklyStreak(completedRuns) {
  if (completedRuns.length === 0) return 0

  const daySet = new Set()
  completedRuns.forEach((r) => {
    if (r.completed_at) {
      const d = new Date(r.completed_at)
      daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }
  })

  // Count consecutive weeks with at least one activity
  const now = new Date()
  let streak = 0
  for (let w = 0; w < 52; w++) {
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - w * 7)
    let hasActivity = false
    for (let d = 0; d < 7; d++) {
      const check = new Date(weekStart)
      check.setDate(check.getDate() + d)
      if (daySet.has(`${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`)) {
        hasActivity = true
        break
      }
    }
    if (hasActivity) streak++
    else break
  }
  return streak
}
