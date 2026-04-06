import { supabase } from './supabase.js'

export const BADGE_DEFS = [
  { id: 'first_route', name: 'badge.firstRoute', desc: 'badge.firstRouteDesc', rarity: 'bronze', icon: '��', check: (s) => s.routesCompleted >= 1 },
  { id: 'first_challenge', name: 'badge.firstChallenge', desc: 'badge.firstChallengeDesc', rarity: 'bronze', icon: '⭐', check: (s) => s.challengesSolved >= 1 },
  { id: 'km_10', name: 'badge.km10', desc: 'badge.km10Desc', rarity: 'bronze', icon: '👣', check: (s) => s.totalKm >= 10 },
  { id: 'routes_5', name: 'badge.routes5', desc: 'badge.routes5Desc', rarity: 'silver', icon: '🗺️', check: (s) => s.routesCompleted >= 5 },
  { id: 'km_50', name: 'badge.km50', desc: 'badge.km50Desc', rarity: 'silver', icon: '🏃', check: (s) => s.totalKm >= 50 },
  { id: 'streak_7', name: 'badge.streak7', desc: 'badge.streak7Desc', rarity: 'silver', icon: '🔥', check: (s) => s.weeklyStreak >= 7 },
  { id: 'quiz_master', name: 'badge.quizMaster', desc: 'badge.quizMasterDesc', rarity: 'silver', icon: '🧠', check: (s) => s.quizCorrectPct >= 90 && s.challengesSolved >= 10 },
  { id: 'routes_20', name: 'badge.routes20', desc: 'badge.routes20Desc', rarity: 'gold', icon: '🏆', check: (s) => s.routesCompleted >= 20 },
  { id: 'km_200', name: 'badge.km200', desc: 'badge.km200Desc', rarity: 'gold', icon: '⛰️', check: (s) => s.totalKm >= 200 },
  { id: 'challenges_50', name: 'badge.challenges50', desc: 'badge.challenges50Desc', rarity: 'gold', icon: '💎', check: (s) => s.challengesSolved >= 50 },
  { id: 'routes_50', name: 'badge.routes50', desc: 'badge.routes50Desc', rarity: 'platinum', icon: '👑', check: (s) => s.routesCompleted >= 50 },
  { id: 'km_500', name: 'badge.km500', desc: 'badge.km500Desc', rarity: 'platinum', icon: '🌍', check: (s) => s.totalKm >= 500 },
]

export const RARITY_COLORS = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', platinum: '#e5e4e2' }

export async function checkAndAwardBadges(userId, stats) {
  if (!userId) return []
  const { data: earned } = await supabase.from('user_badges').select('badge_id').eq('user_id', userId)
  const earnedIds = new Set((earned ?? []).map((b) => b.badge_id))
  const newBadges = []
  for (const badge of BADGE_DEFS) {
    if (earnedIds.has(badge.id)) continue
    if (badge.check(stats)) {
      const { error } = await supabase.from('user_badges').upsert(
        { user_id: userId, badge_id: badge.id, awarded_at: new Date().toISOString() },
        { onConflict: 'user_id,badge_id' }
      )
      if (!error) newBadges.push(badge)
    }
  }
  return newBadges
}

export async function fetchUserBadges(userId) {
  if (!userId) return []
  const { data } = await supabase.from('user_badges').select('badge_id, awarded_at').eq('user_id', userId)
  return data ?? []
}

// ── Ambassador badge — first to complete a route ─────────────

export async function checkAmbassadorBadge(routeId, userId, runId) {
  if (!routeId || !userId) return false
  try {
    const { count } = await supabase
      .from('user_route_runs')
      .select('id', { count: 'exact', head: true })
      .eq('route_id', routeId)
      .eq('is_completed', true)
      .neq('user_id', userId)

    if (count === 0) {
      // First to finish! Try to award badge
      const { data: badge } = await supabase
        .from('badges')
        .select('id')
        .eq('condition_type', 'first_on_route')
        .single()

      if (badge) {
        await supabase.from('user_badges').upsert(
          { user_id: userId, badge_id: badge.id, run_id: runId, earned_at: new Date().toISOString() },
          { onConflict: 'user_id,badge_id', ignoreDuplicates: true }
        )
      }

      // Mark route ambassador
      await supabase.from('routes').update({ ambassador_user_id: userId }).eq('id', routeId)
      return true
    }
  } catch (e) {
    console.warn('Ambassador check failed:', e)
  }
  return false
}
