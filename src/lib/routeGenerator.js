import { supabase } from './supabase.js'
import { haversineDistance } from './geo.js'
import { generateQuiz } from './quizGenerator.js'
import { generateRouteORS, generateRoundTripORS } from './orsRouting.js'
import { selectPOIsWithClaude, optimizePOIOrderWithClaude } from './routeOptimizer.js'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY
const ORS_KEY = import.meta.env.VITE_ORS_API_KEY

// ── Mapy.cz Suggest API (kept for POI discovery) ────────────

const POI_QUERIES = {
  pubs: ['hospoda', 'pivnice', 'restaurace', 'pivovar'],
  landmarks: ['hrad', 'zámek', 'kostel', 'kaple', 'muzeum'],
  viewpoints: ['rozhledna', 'vyhlídka', 'vrchol'],
  nature: ['pramen', 'vodopád', 'skalní útvar', 'jeskyně'],
  huts: ['horská chata', 'bouda', 'útulna'],
  bikeservice: ['cykloservis', 'bikeshop'],
}

async function suggestPlace(query, lat, lng, radius) {
  const url = new URL('https://api.mapy.cz/v1/suggest')
  url.searchParams.set('query', query)
  url.searchParams.set('apikey', API_KEY)
  url.searchParams.set('lang', 'cs')
  url.searchParams.set('limit', '10')
  if (lat != null && lng != null) { url.searchParams.set('lat', String(lat)); url.searchParams.set('lon', String(lng)) }
  if (radius) url.searchParams.set('radius', String(Math.round(radius)))
  const res = await fetch(url.toString())
  if (!res.ok) return []
  const data = await res.json()
  return (data.items ?? []).map((item) => ({
    name: item.name,
    lat: item.position?.lat ?? item.regionalStructure?.[0]?.lat,
    lng: item.position?.lon ?? item.regionalStructure?.[0]?.lon,
    label: item.label, category: item.category,
  })).filter((p) => p.lat != null && p.lng != null)
}
export { suggestPlace }

// ── Custom POI DB ────────────────────────────────────────────

const CUSTOM_POI_CATEGORIES = {
  pubs: ['minipivovar', 'restaurace'], landmarks: ['pamatnik', 'kaplička', 'mlyny'],
  viewpoints: ['vyhlidka'], nature: ['studanka', 'skalni_utvar'],
  huts: ['horska_chata', 'koliba'], wine: ['vinna_sklep'],
}
const CATEGORY_EMOJIS = {
  minipivovar: '🍺', horska_chata: '🏠', vyhlidka: '👁', studanka: '💧',
  skalni_utvar: '🪨', pamatnik: '🏛', kaplička: '⛪', mlyny: '⚙️',
  vinna_sklep: '🍷', koliba: '🏕', tajne_misto: '⭐', restaurace: '🍽',
}
export function getCategoryEmoji(cat) { return CATEGORY_EMOJIS[cat] || '📍' }

export async function recordPOIVisit(poiId) {
  if (!poiId) return
  try { const { data } = await supabase.from('custom_pois').select('visit_count').eq('id', poiId).single(); if (data) await supabase.from('custom_pois').update({ visit_count: (data.visit_count ?? 0) + 1 }).eq('id', poiId) } catch {}
}

// ── POI Search (custom DB + Mapy.com) ────────────────────────

function calcSearchRadius(distanceKm, isLoop) {
  return isLoop ? (distanceKm / 2) * 1000 * 0.4 : distanceKm * 1000 * 0.3
}

function filterByDistance(pois, lat, lng, distanceKm) {
  const maxM = (distanceKm / 2) * 1000
  return pois.filter((p) => haversineDistance([lng, lat], [Number(p.lng), Number(p.lat)]) <= maxM)
}

async function searchCustomPOIs(lat, lng, radiusM, preferences) {
  const cats = preferences.flatMap((p) => CUSTOM_POI_CATEGORIES[p] || [])
  if (cats.length === 0) return []
  const d = radiusM / 111000, dLng = radiusM / (111000 * Math.cos(lat * Math.PI / 180))
  const { data } = await supabase.from('custom_pois').select('*').eq('is_approved', true).eq('is_active', true).in('poi_category', cats).gte('gps_lat', lat - d).lte('gps_lat', lat + d).gte('gps_lng', lng - dLng).lte('gps_lng', lng + dLng).order('quality_score', { ascending: false }).limit(20)
  return (data || []).map((p) => ({ id: p.id, name: p.name, lat: p.gps_lat, lng: p.gps_lng, poiType: Object.entries(CUSTOM_POI_CATEGORIES).find(([, c]) => c.includes(p.poi_category))?.[0] ?? 'landmarks', category: p.poi_category, source: 'custom_db', quality: p.quality_score, description: p.description, is_partner: p.is_partner, partner_discount: p.partner_discount }))
}

async function searchMapyPOIs(lat, lng, radiusM, preferences) {
  const all = []
  for (const pref of preferences) {
    for (const q of (POI_QUERIES[pref] ?? [])) {
      try { const r = await suggestPlace(q, lat, lng, radiusM); r.forEach((x) => all.push({ ...x, poiType: pref })) } catch {}
    }
  }
  const deduped = []
  for (const p of all) { if (!deduped.some((d) => haversineDistance([d.lng, d.lat], [p.lng, p.lat]) < 200)) deduped.push(p) }
  return deduped
}

export async function searchPOIsPublic(lat, lng, distanceKm, isLoop, preferences) {
  const r = calcSearchRadius(distanceKm, isLoop)
  const custom = await searchCustomPOIs(lat, lng, r, preferences)
  const mapy = await searchMapyPOIs(lat, lng, r, preferences)
  const merged = [...custom]
  for (const p of mapy) { if (!merged.some((m) => haversineDistance([m.lng, m.lat], [p.lng, p.lat]) < 200)) merged.push({ ...p, source: 'mapy_api', quality: 5 }) }
  merged.sort((a, b) => (b.quality ?? 5) - (a.quality ?? 5))
  return filterByDistance(merged, lat, lng, distanceKm)
}

// ── Challenge Assignment (DB-first) ──────────────────────────

function formatDbChallenge(dbQ, poi) {
  const type = dbQ.question_type === 'checkin' ? 'checkin' : dbQ.question_type === 'photo' ? 'photo' : dbQ.options ? 'quiz' : dbQ.question_type ?? 'observation'
  return { type, content_json: { task: dbQ.question, question: dbQ.question, options: dbQ.options, correct_answer: dbQ.correct_answer, fun_fact: dbQ.fun_fact, place_name: poi.name || dbQ.poi_name, question_type: dbQ.question_type, source_id: dbQ.id } }
}

async function getChallengeForPOI(poi, challengeTypes, region) {
  const { data: dbByName } = await supabase.from('poi_questions').select('*').eq('is_approved', true).eq('language', 'cs').ilike('poi_name', `%${poi.name}%`).limit(5)
  if (dbByName?.length > 0) { const q = dbByName[Math.floor(Math.random() * dbByName.length)]; supabase.from('poi_questions').update({ times_used: (q.times_used ?? 0) + 1 }).eq('id', q.id); return formatDbChallenge(q, poi) }

  if (poi.lat != null && poi.lng != null) {
    const { data: nearby } = await supabase.from('poi_questions').select('*').eq('is_approved', true).gte('gps_lat', poi.lat - 0.01).lte('gps_lat', poi.lat + 0.01).gte('gps_lng', poi.lng - 0.01).lte('gps_lng', poi.lng + 0.01).limit(10)
    const match = nearby?.find((q) => haversineDistance([poi.lng, poi.lat], [q.gps_lng, q.gps_lat]) <= (q.gps_radius_m ?? 200))
    if (match) { supabase.from('poi_questions').update({ times_used: (match.times_used ?? 0) + 1 }).eq('id', match.id); return formatDbChallenge(match, poi) }
  }

  const ln = (poi.name ?? '').toLowerCase(), lt = (poi.poiType ?? '')
  if (['pivovar', 'hospoda', 'pivnice', 'restaurace'].some((t) => ln.includes(t) || lt === 'pubs'))
    return { type: 'checkin', content_json: { task: `Zastav se v ${poi.name}! 🍺`, place_name: poi.name, alternative: 'Vyfotit vývěsní štít', question_type: 'checkin' } }
  if (['horská chata', 'bouda', 'útulna'].some((t) => ln.includes(t) || lt === 'huts'))
    return { type: 'checkin', content_json: { task: `Dojdi do ${poi.name} 🏠`, place_name: poi.name, alternative: 'Vyfotit vchod', question_type: 'checkin' } }
  if (lt === 'viewpoints' || ln.includes('rozhledna') || ln.includes('vyhlídka'))
    return { type: 'photo', content_json: { task: `Vyfoť výhled z ${poi.name} 📸`, place_name: poi.name, alternative: 'Napiš co vidíš', question_type: 'photo' } }

  if (['landmarks'].includes(poi.poiType) && challengeTypes?.includes('quiz')) {
    try { const quiz = await generateQuiz(poi.name, poi.category ?? 'památka', region); return { type: 'quiz', content_json: quiz } } catch {}
  }
  return { type: 'photo', content_json: { task: `Vyfoť zajímavost u ${poi.name} 📸`, place_name: poi.name, alternative: 'Napiš název obce', question_type: 'photo' } }
}

// ── Mapy.cz routing fallback ─────────────────────────────────

const MAPY_ROUTE_TYPES = { hiking: 'foot_fast', crosscountry: 'foot_fast', skitouring: 'foot_fast', cycling: 'bike_road', mtb: 'bike_mountain' }

async function fallbackMapyCzRouting(activity, startLat, startLng, waypoints, isLoop) {
  const url = new URL('https://api.mapy.cz/v1/routing/route')
  url.searchParams.set('apikey', API_KEY); url.searchParams.set('lang', 'cs')
  url.searchParams.set('start', `${startLng},${startLat}`)
  url.searchParams.set('end', `${startLng},${startLat}`)
  url.searchParams.set('routeType', MAPY_ROUTE_TYPES[activity] ?? 'foot_fast')
  waypoints.forEach((p) => url.searchParams.append('waypoints', `${Number(p.lng)},${Number(p.lat)}`))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('Mapy.cz fallback failed')
  const json = await res.json()
  return { geometry: json.geometry ?? json, distance: json.length ?? 0, duration: json.duration ?? 0, ascent: 0, descent: 0 }
}

// ── Equidistant points along a geometry ──────────────────────

function generateEquidistantPoints(geometry, count) {
  const coords = geometry?.geometry?.coordinates ?? geometry?.coordinates ?? []
  if (coords.length < 2 || count < 1) return []
  const points = [], step = Math.floor(coords.length / (count + 1))
  for (let i = 1; i <= count; i++) {
    const idx = Math.min(i * step, coords.length - 1)
    points.push({ lat: coords[idx][1], lng: coords[idx][0], name: `Zastávka ${i}`, poiType: 'generic', source: 'auto_generated' })
  }
  return points
}

// ── Route name generation ────────────────────────────────────

function generateRouteName(activity, startName, pois) {
  const names = { hiking: 'Turistika', cycling: 'Kolo', mtb: 'MTB', skitouring: 'Skialpy', skiing: 'Běžky', crosscountry: 'Běh' }
  const act = names[activity] ?? 'Trasa'
  if (!pois?.length) return `${act} z ${startName}`
  const notable = pois.find((p) => ['minipivovar', 'pamatnik', 'vyhlidka'].includes(p.category ?? p.poiType)) ?? pois[0]
  return pois.length === 1 ? `${act} přes ${notable.name}` : `${act} přes ${notable.name} +${pois.length - 1}`
}

// ══════════════════════════════════════════════════════════════
// MAIN GENERATOR — ORS routing + Claude AI POI selection
// ══════════════════════════════════════════════════════════════

export async function generateRoute({
  activity, startLat, startLng, startName, endLat, endLng, isLoop,
  distanceKm, difficulty, challengeCount, challengeTypes, poiPreferences,
  userId, manualPOIs, onProgress,
}) {
  let selectedPOIs = []

  // ── MANUAL MODE: optimize user's POI order ─────────────────

  if (manualPOIs && manualPOIs.length > 0) {
    onProgress?.('planning')
    selectedPOIs = await optimizePOIOrderWithClaude({ startLat, startLng, selectedPOIs: manualPOIs, isLoop })

  // ── AUTO MODE: find + select POIs with Claude ──────────────

  } else {
    onProgress?.('searching')
    const radiusM = calcSearchRadius(distanceKm ?? 10, isLoop)
    const customPOIs = await searchCustomPOIs(startLat, startLng, radiusM, poiPreferences ?? [])
    const mapyPOIs = await searchMapyPOIs(startLat, startLng, radiusM, poiPreferences ?? [])
    const merged = [...customPOIs]
    for (const p of mapyPOIs) { if (!merged.some((m) => haversineDistance([m.lng, m.lat], [p.lng, p.lat]) < 200)) merged.push({ ...p, source: 'mapy_api', quality: 5 }) }
    const available = filterByDistance(merged, startLat, startLng, distanceKm ?? 10)

    onProgress?.('planning')
    if (available.length >= (challengeCount ?? 3)) {
      selectedPOIs = await selectPOIsWithClaude({
        startLat, startLng, startName: startName ?? 'Start',
        distanceKm: distanceKm ?? 10, challengeCount: challengeCount ?? 3,
        poiPreferences: poiPreferences ?? [], availablePOIs: available, activity: activity ?? 'hiking',
      })
    } else {
      selectedPOIs = available.slice(0, challengeCount ?? 3)
    }
  }

  // ── ROUTE via OpenRouteService (with Mapy.cz fallback) ─────

  onProgress?.('challenges')
  let routeResult

  try {
    if (selectedPOIs.length > 0) {
      const waypoints = [
        { lat: startLat, lng: startLng },
        ...selectedPOIs.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })),
      ]
      if (!isLoop && endLat && endLng) waypoints.push({ lat: endLat, lng: endLng })

      routeResult = await generateRouteORS({ activity: activity ?? 'hiking', waypoints, isLoop, apiKey: ORS_KEY })
    } else {
      routeResult = await generateRoundTripORS({ activity: activity ?? 'hiking', startLat, startLng, targetDistanceM: (distanceKm ?? 10) * 1000, apiKey: ORS_KEY })
    }
  } catch (orsErr) {
    console.warn('ORS failed, trying Mapy.cz fallback:', orsErr.message)
    try {
      routeResult = await fallbackMapyCzRouting(activity ?? 'hiking', startLat, startLng, selectedPOIs, isLoop)
    } catch (mapyErr) {
      throw new Error(`Nepodařilo se naplánovat trasu: ${mapyErr.message}`)
    }
  }

  const routeKm = (routeResult.distance ?? 0) / 1000
  console.warn(`Requested: ${distanceKm}km, Got: ${routeKm.toFixed(1)}km`)

  // If no POIs, create equidistant challenge points
  const challengePOIs = selectedPOIs.length > 0 ? selectedPOIs : generateEquidistantPoints(routeResult.geometry, challengeCount ?? 3)

  // ── ASSIGN CHALLENGES ──────────────────────────────────────

  const challenges = []
  for (const poi of challengePOIs) {
    const ch = await getChallengeForPOI(poi, challengeTypes, startName)
    if (poi.is_partner && ch.content_json) { ch.content_json.is_partner = true; ch.content_json.partner_discount = poi.partner_discount }
    if (poi.source === 'custom_db' && poi.id) { ch.content_json = ch.content_json ?? {}; ch.content_json.custom_poi_id = poi.id }
    challenges.push({ ...ch, gps_lat: Number(poi.lat), gps_lng: Number(poi.lng), poi_name: poi.name, poi_type: poi.poiType ?? poi.category })
  }

  // ── SAVE TO SUPABASE ───────────────────────────────────────

  onProgress?.('saving')
  const routeName = generateRouteName(activity, startName, challengePOIs)
  const geometry = routeResult.geometry

  const { data: route, error: routeErr } = await supabase.from('routes').insert({
    name: routeName,
    description: `${challengePOIs.length} zastávek, ${routeKm.toFixed(1)} km`,
    activity_type: activity ?? 'hiking', distance_km: routeKm, difficulty: difficulty ?? 'medium',
    is_loop: isLoop, region: startName ?? '', elevation_gain_m: Math.round(routeResult.ascent ?? 0),
    start_lat: startLat, start_lng: startLng, gpx_data: JSON.stringify(geometry), created_by: userId,
  }).select().single()

  if (routeErr) throw new Error(`Nepodařilo se uložit trasu: ${routeErr.message}`)

  const inserts = challenges.map((ch, i) => ({
    route_id: route.id, sequence_order: i, type: ch.type, title: ch.poi_name,
    description: ch.content_json?.task, question: ch.content_json?.task,
    options: ch.content_json?.options ? JSON.stringify(ch.content_json.options) : null,
    correct_answer: ch.content_json?.correct_answer ?? null, prompt: ch.content_json?.alternative ?? null,
    lat: ch.gps_lat, lng: ch.gps_lng,
  }))
  await supabase.from('challenges').insert(inserts)

  onProgress?.('done')

  return { route, challenges: inserts, routeGeometry: geometry, routeLength: routeResult.distance, routeDuration: routeResult.duration }
}
