import { supabase } from './supabase.js'

export const RARITY_COLORS = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', platinum: '#e5e4e2' }

export async function fetchAllBadges() {
  const { data } = await supabase.from('badges').select('*').order('condition_value')
  return data ?? []
}

export async function fetchUserBadges(userId) {
  if (!userId) return []
  const { data } = await supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', userId)
  return data ?? []
}

export async function checkAndAwardBadges(userId, stats) {
  if (!userId) return []
  try {
    const [{ data: allBadges }, { data: alreadyEarned }] = await Promise.all([
      supabase.from('badges').select('*'),
      supabase.from('user_badges').select('badge_id').eq('user_id', userId),
    ])
    if (!allBadges?.length) return []
    const earnedIds = new Set((alreadyEarned ?? []).map(b => b.badge_id))
    const newBadges = []

    for (const badge of allBadges) {
      if (earnedIds.has(badge.id)) continue
      if (!checkBadgeCondition(badge, stats)) continue

      const { error } = await supabase.from('user_badges').upsert(
        { user_id: userId, badge_id: badge.id, earned_at: new Date().toISOString() },
        { onConflict: 'user_id,badge_id', ignoreDuplicates: true }
      )
      if (!error) {
        newBadges.push({ id: badge.id, icon: badge.icon_emoji, name: badge.name_cs, rarity: badge.rarity })
      } else {
        console.warn('Badge insert error:', badge.name_cs, error.message)
      }
    }
    return newBadges
  } catch (e) {
    console.warn('checkAndAwardBadges error:', e)
    return []
  }
}

function checkBadgeCondition(badge, stats) {
  const val = badge.condition_value ?? 1
  switch (badge.condition_type) {
    case 'total_km': return (stats.totalKm ?? 0) >= val
    case 'streak_weeks': return (stats.weeklyStreak ?? 0) >= val
    case 'correct_quizzes': return (stats.quizCorrect ?? 0) >= val
    case 'photo_tasks': return (stats.photoTasks ?? 0) >= val
    case 'brewery_checkins': return (stats.breweryCheckins ?? 0) >= val
    // Weather/time badges are handled by checkWeatherBadges
    case 'rain_hike': case 'snow_hike': case 'heat_hike': case 'storm_hike':
    case 'below_zero': case 'before_7am': case 'after_sunset':
    case 'first_on_route':
      return false // handled separately
    default: return false
  }
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
      await supabase.from('routes').update({ ambassador_user_id: userId }).eq('id', routeId)
      return true
    }
  } catch (e) {
    console.warn('Ambassador check failed:', e)
  }
  return false
}
