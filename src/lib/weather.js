export async function fetchCurrentWeather(lat, lng) {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('current', 'temperature_2m,precipitation,snowfall,weather_code,wind_speed_10m')
    url.searchParams.set('timezone', 'Europe/Prague')

    const res = await fetch(url.toString())
    if (!res.ok) return null
    const data = await res.json()
    const c = data.current
    if (!c) return null

    return {
      temp_c: c.temperature_2m,
      rain_mm: c.precipitation,
      snow_cm: c.snowfall,
      wind_kmh: c.wind_speed_10m,
      condition: interpretWeatherCode(c.weather_code),
      weather_code: c.weather_code,
    }
  } catch {
    return null
  }
}

function interpretWeatherCode(code) {
  if (code === 0) return 'sunny'
  if (code <= 3) return 'cloudy'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'showers'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

export function getWeatherEmoji(condition) {
  const map = { sunny: '☀️', cloudy: '⛅', rain: '🌧️', snow: '❄️', showers: '🌦️', storm: '⛈️' }
  return map[condition] || '🌤️'
}

export function isAfterSunset(completedAt, lat) {
  const date = new Date(completedAt)
  const hour = date.getHours()
  const month = date.getMonth()
  // Approximate sunset hours for Czech Republic by month
  const sunsetHours = [16, 17, 18, 19, 20, 21, 21, 21, 20, 19, 17, 16]
  return hour >= sunsetHours[month]
}

export async function checkWeatherBadges(weather, run, userId, runId, supabase) {
  if (!weather || !userId) return []
  const earned = []

  const checks = [
    { condition: weather.rain_mm > 1, type: 'rain_hike' },
    { condition: weather.snow_cm > 0.5, type: 'snow_hike' },
    { condition: weather.temp_c > 30, type: 'heat_hike' },
    { condition: weather.condition === 'storm', type: 'storm_hike' },
    { condition: weather.temp_c < 0, type: 'below_zero' },
    { condition: run?.started_at && new Date(run.started_at).getHours() < 7, type: 'before_7am' },
    { condition: run?.completed_at && isAfterSunset(run.completed_at), type: 'after_sunset' },
  ]

  for (const check of checks) {
    if (!check.condition) continue
    try {
      const { data: badge } = await supabase
        .from('badges')
        .select('id')
        .eq('condition_type', check.type)
        .single()
      if (badge) {
        await supabase.from('user_badges').upsert(
          { user_id: userId, badge_id: badge.id, run_id: runId, earned_at: new Date().toISOString() },
          { onConflict: 'user_id,badge_id', ignoreDuplicates: true }
        )
        earned.push({ ...badge, condition_type: check.type })
      }
    } catch { /* badge type may not exist yet */ }
  }

  return earned
}
