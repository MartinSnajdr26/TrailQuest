import { supabase } from './supabase.js'
import { haversineDistance } from './geo.js'
import { generateQuiz } from './quizGenerator.js'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY

const POI_QUERIES = {
  pubs: ['hospoda', 'pivnice', 'restaurace', 'pivovar'],
  landmarks: ['hrad', 'zámek', 'kostel', 'kaple', 'muzeum'],
  viewpoints: ['rozhledna', 'vyhlídka', 'vrchol'],
  nature: ['pramen', 'vodopád', 'skalní útvar', 'jeskyně'],
  huts: ['horská chata', 'bouda', 'útulna'],
  bikeservice: ['cykloservis', 'bikeshop'],
}

const ROUTE_TYPES = {
  hiking: 'foot_fast',
  crosscountry: 'foot_fast',
  skitouring: 'foot_fast',
  skiing: 'foot_fast',
  cycling: 'bike_road',
  mtb: 'bike_mountain',
}

// ── Mapy.cz Suggest API ──────────────────────────────────────

async function suggestPlace(query, lat, lng, radius) {
  const url = new URL('https://api.mapy.cz/v1/suggest')
  url.searchParams.set('query', query)
  url.searchParams.set('apikey', API_KEY)
  url.searchParams.set('lang', 'cs')
  url.searchParams.set('limit', '10')
  if (lat != null && lng != null) {
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
  }
  if (radius) {
    url.searchParams.set('radius', String(Math.round(radius)))
  }
  const res = await fetch(url.toString())
  if (!res.ok) return []
  const data = await res.json()
  return (data.items ?? []).map((item) => ({
    name: item.name,
    lat: item.position?.lat ?? item.regionalStructure?.[0]?.lat,
    lng: item.position?.lon ?? item.regionalStructure?.[0]?.lon,
    label: item.label,
    category: item.category,
  })).filter((p) => p.lat != null && p.lng != null)
}

export { suggestPlace }

// ── Custom POI DB category mapping ───────────────────────────

const CUSTOM_POI_CATEGORIES = {
  pubs: ['minipivovar', 'restaurace'],
  landmarks: ['pamatnik', 'kaplička', 'mlyny'],
  viewpoints: ['vyhlidka'],
  nature: ['studanka', 'skalni_utvar'],
  huts: ['horska_chata', 'koliba'],
  wine: ['vinna_sklep'],
}

const CATEGORY_EMOJIS = {
  minipivovar: '🍺', horska_chata: '🏠', vyhlidka: '👁', studanka: '💧',
  skalni_utvar: '🪨', pamatnik: '🏛', kaplička: '⛪', mlyny: '⚙️',
  vinna_sklep: '🍷', koliba: '🏕', tajne_misto: '⭐', restaurace: '🍽',
}

export function getCategoryEmoji(category) {
  return CATEGORY_EMOJIS[category] || '📍'
}

// ── Search custom POI DB ─────────────────────────────────────

async function searchCustomPOIs(lat, lng, radiusM, preferences) {
  const selectedCategories = preferences.flatMap((pref) => CUSTOM_POI_CATEGORIES[pref] || [])
  if (selectedCategories.length === 0) return []

  const latDelta = radiusM / 111000
  const lngDelta = radiusM / (111000 * Math.cos(lat * Math.PI / 180))

  const { data } = await supabase
    .from('custom_pois')
    .select('*')
    .eq('is_approved', true)
    .eq('is_active', true)
    .in('poi_category', selectedCategories)
    .gte('gps_lat', lat - latDelta)
    .lte('gps_lat', lat + latDelta)
    .gte('gps_lng', lng - lngDelta)
    .lte('gps_lng', lng + lngDelta)
    .order('quality_score', { ascending: false })
    .limit(20)

  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.gps_lat,
    lng: p.gps_lng,
    poiType: Object.entries(CUSTOM_POI_CATEGORIES).find(([, cats]) => cats.includes(p.poi_category))?.[0] ?? 'landmarks',
    category: p.poi_category,
    source: 'custom_db',
    quality: p.quality_score,
    description: p.description,
    is_partner: p.is_partner,
    partner_discount: p.partner_discount,
  }))
}

// Record visit to custom POI
export async function recordPOIVisit(poiId) {
  if (!poiId) return
  try {
    const { data } = await supabase.from('custom_pois').select('visit_count').eq('id', poiId).single()
    if (data) await supabase.from('custom_pois').update({ visit_count: (data.visit_count ?? 0) + 1 }).eq('id', poiId)
  } catch { /* ignore */ }
}

// Public wrapper for wizard POI picker — fetches + filters POIs, DB-first
export async function searchPOIsPublic(lat, lng, distanceKm, isLoop, preferences) {
  const radiusM = calcSearchRadius(distanceKm, isLoop)
  // Custom DB first
  const customPOIs = await searchCustomPOIs(lat, lng, radiusM, preferences)
  // Supplement with Mapy.com
  const mapyPOIs = await searchPOIs(lat, lng, radiusM, preferences)
  // Merge, deduplicate by proximity
  const merged = [...customPOIs]
  for (const p of mapyPOIs) {
    const dup = merged.some((m) => haversineDistance([m.lng, m.lat], [p.lng, p.lat]) < 200)
    if (!dup) merged.push({ ...p, source: 'mapy_api', quality: 5 })
  }
  // Sort by quality desc
  merged.sort((a, b) => (b.quality ?? 5) - (a.quality ?? 5))
  return filterPOIsByDistance(merged, lat, lng, distanceKm)
}

// Sort POIs by bearing from start — creates natural loop shape
function sortPOIsByBearing(startLat, startLng, pois) {
  return [...pois]
    .map((p) => ({
      ...p,
      _bearing: Math.atan2(p.lng - startLng, p.lat - startLat) * 180 / Math.PI,
    }))
    .sort((a, b) => a._bearing - b._bearing)
}

// ── POI search radius calculation ────────────────────────────

function calcSearchRadius(distanceKm, isLoop) {
  if (isLoop) {
    // POIs should be within ~40% of half the loop distance from start
    return (distanceKm / 2) * 1000 * 0.4
  }
  // Point-to-point: POIs within ~30% of total distance from route line
  return distanceKm * 1000 * 0.3
}

// ── Loop waypoint generation ─────────────────────────────────
// Creates a point ~distanceKm/3 away at a given bearing to force routing
// into a loop shape instead of start→start (which gives 0 distance).

function getLoopWaypoint(startLat, startLng, distanceKm) {
  const R = 6371 // Earth radius km
  const d = (distanceKm / 3) / R // angular distance in radians
  const bearing = Math.PI / 2 // east (90°)
  const lat1 = startLat * Math.PI / 180
  const lng1 = startLng * Math.PI / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
  )
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  )
  return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI }
}

// ── POI Search ───────────────────────────────────────────────

async function searchPOIs(lat, lng, radiusM, preferences) {
  const cacheKey = `tq_pois_${lat.toFixed(3)}_${lng.toFixed(3)}_${Math.round(radiusM)}_${preferences.sort().join(',')}`
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* ignore */ }
  }

  const allPois = []
  for (const pref of preferences) {
    const queries = POI_QUERIES[pref] ?? []
    for (const q of queries) {
      try {
        const results = await suggestPlace(q, lat, lng, radiusM)
        results.forEach((r) => {
          allPois.push({ ...r, poiType: pref })
        })
      } catch { /* ignore individual failures */ }
    }
  }

  // Deduplicate by proximity (200m)
  const deduped = []
  for (const poi of allPois) {
    const tooClose = deduped.some(
      (d) => haversineDistance([d.lng, d.lat], [poi.lng, poi.lat]) < 200
    )
    if (!tooClose) deduped.push(poi)
  }

  sessionStorage.setItem(cacheKey, JSON.stringify(deduped))
  return deduped
}

// ── POI distance filtering ───────────────────────────────────

function filterPOIsByDistance(pois, startLat, startLng, distanceKm) {
  const maxDistM = (distanceKm / 2) * 1000
  return pois.filter((p) => {
    const d = haversineDistance([startLng, startLat], [p.lng, p.lat])
    return d <= maxDistM
  })
}

// ── POI Selection ────────────────────────────────────────────

function selectPOIs(pois, count, startLat, startLng, endLat, endLng) {
  if (pois.length === 0) return generateFallbackPoints(count, startLat, startLng, endLat, endLng)

  // Sort by distance from start
  const sorted = pois
    .map((p) => ({
      ...p,
      distFromStart: haversineDistance([startLng, startLat], [p.lng, p.lat]),
    }))
    .sort((a, b) => a.distFromStart - b.distFromStart)

  // Pick spread across the route
  const selected = []
  const step = Math.max(1, Math.floor(sorted.length / count))
  for (let i = 0; i < sorted.length && selected.length < count; i += step) {
    selected.push(sorted[i])
  }

  // If not enough, fill from remaining
  if (selected.length < count) {
    for (const p of sorted) {
      if (selected.length >= count) break
      if (!selected.includes(p)) selected.push(p)
    }
  }

  // If still not enough, add fallback points
  if (selected.length < count) {
    const fallbacks = generateFallbackPoints(
      count - selected.length,
      startLat, startLng, endLat, endLng
    )
    selected.push(...fallbacks)
  }

  return selected.slice(0, count)
}

function generateFallbackPoints(count, startLat, startLng, endLat, endLng) {
  const points = []
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1)
    points.push({
      name: `Zastávka ${i}`,
      lat: startLat + (endLat - startLat) * t + (Math.random() - 0.5) * 0.003,
      lng: startLng + (endLng - startLng) * t + (Math.random() - 0.5) * 0.003,
      poiType: 'generic',
      category: 'checkpoint',
    })
  }
  return points
}

// ── Mapy.cz Routing API ──────────────────────────────────────

async function fetchRoute(startLat, startLng, endLat, endLng, waypoints, routeType) {
  const url = new URL('https://api.mapy.cz/v1/routing/route')
  url.searchParams.set('apikey', API_KEY)
  url.searchParams.set('lang', 'cs')
  url.searchParams.set('start', `${startLng},${startLat}`)
  url.searchParams.set('end', `${endLng},${endLat}`)
  url.searchParams.set('routeType', routeType)

  waypoints.forEach((wp) => {
    url.searchParams.append('waypoints', `${wp.lng},${wp.lat}`)
  })

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`)
  return res.json()
}

// ── Challenge Assignment (DB-first) ──────────────────────────

function formatDbChallenge(dbQ, poi) {
  const type = dbQ.question_type === 'checkin' ? 'checkin'
    : dbQ.question_type === 'photo' ? 'photo'
    : dbQ.options ? 'quiz'
    : dbQ.question_type ?? 'observation'
  return {
    type,
    content_json: {
      task: dbQ.question,
      question: dbQ.question,
      options: dbQ.options,
      correct_answer: dbQ.correct_answer,
      fun_fact: dbQ.fun_fact,
      place_name: poi.name || dbQ.poi_name,
      question_type: dbQ.question_type,
      difficulty: dbQ.difficulty,
      source_id: dbQ.id,
    },
  }
}

async function getChallengeForPOI(poi, challengeTypes, region) {
  // STEP 1: Look up question in DB by name match
  const { data: dbByName } = await supabase
    .from('poi_questions')
    .select('*')
    .eq('is_approved', true)
    .eq('language', 'cs')
    .ilike('poi_name', `%${poi.name}%`)
    .limit(5)

  if (dbByName && dbByName.length > 0) {
    const q = dbByName[Math.floor(Math.random() * dbByName.length)]
    supabase.from('poi_questions').update({ times_used: (q.times_used ?? 0) + 1 }).eq('id', q.id)
    return formatDbChallenge(q, poi)
  }

  // STEP 2: Search by GPS proximity
  if (poi.lat != null && poi.lng != null) {
    const { data: nearby } = await supabase
      .from('poi_questions')
      .select('*')
      .eq('is_approved', true)
      .gte('gps_lat', poi.lat - 0.01)
      .lte('gps_lat', poi.lat + 0.01)
      .gte('gps_lng', poi.lng - 0.01)
      .lte('gps_lng', poi.lng + 0.01)
      .limit(10)

    if (nearby && nearby.length > 0) {
      const match = nearby.find((q) =>
        haversineDistance([poi.lng, poi.lat], [q.gps_lng, q.gps_lat]) <= (q.gps_radius_m ?? 200)
      )
      if (match) {
        supabase.from('poi_questions').update({ times_used: (match.times_used ?? 0) + 1 }).eq('id', match.id)
        return formatDbChallenge(match, poi)
      }
    }
  }

  // STEP 3: Template for pubs/huts
  const lowerName = (poi.name ?? '').toLowerCase()
  const lowerType = (poi.poiType ?? '').toLowerCase()
  if (['pivovar', 'hospoda', 'pivnice', 'restaurace'].some((t) => lowerName.includes(t) || lowerType === 'pubs')) {
    return { type: 'checkin', content_json: { task: `Zastav se v ${poi.name}! Dej si něco k pití nebo razítkuj turistický pas. 🍺`, place_name: poi.name, alternative: 'Vyfotit vývěsní štít nebo budovu', question_type: 'checkin' } }
  }
  if (['horská chata', 'bouda', 'útulna'].some((t) => lowerName.includes(t) || lowerType === 'huts')) {
    return { type: 'checkin', content_json: { task: `Dojdi do ${poi.name} a razítkuj turistický pas 🏠`, place_name: poi.name, alternative: 'Vyfotit vchod s cedulí', question_type: 'checkin' } }
  }
  if (lowerType === 'viewpoints' || lowerName.includes('rozhledna') || lowerName.includes('vyhlídka')) {
    return { type: 'photo', content_json: { task: `Vyfoť panoramatický výhled z ${poi.name} 📸`, place_name: poi.name, alternative: 'Napiš co vidíš do dálky (alespoň 3 zajímavosti)', question_type: 'photo' } }
  }

  // STEP 4: Claude API fallback for landmarks
  if (['landmarks'].includes(poi.poiType) && challengeTypes.includes('quiz')) {
    try {
      const quiz = await generateQuiz(poi.name, poi.category ?? 'památka', region)
      return { type: 'quiz', content_json: quiz }
    } catch { /* fall through */ }
  }

  // STEP 5: Generic fallback
  return { type: 'photo', content_json: { task: `Vyfoť nejzajímavější věc u ${poi.name} 📸`, place_name: poi.name, alternative: 'Napiš název nejbližší vesnice nebo ulice', question_type: 'photo' } }
}

async function assignChallenges(pois, challengeTypes, region) {
  const challenges = []
  for (const poi of pois) {
    const challenge = await getChallengeForPOI(poi, challengeTypes, region)
    // Include partner info in content_json
    if (poi.is_partner && challenge.content_json) {
      challenge.content_json.is_partner = true
      challenge.content_json.partner_discount = poi.partner_discount
    }
    if (poi.source === 'custom_db' && poi.id) {
      challenge.content_json = challenge.content_json ?? {}
      challenge.content_json.custom_poi_id = poi.id
    }
    challenges.push({ ...challenge, gps_lat: poi.lat, gps_lng: poi.lng, poi_name: poi.name, poi_type: poi.poiType })
  }
  return challenges
}

// ── Main Generator ───────────────────────────────────────────

export async function generateRoute({
  activity,
  startLat,
  startLng,
  startName,
  endLat,
  endLng,
  isLoop,
  distanceKm,
  difficulty,
  challengeCount,
  challengeTypes,
  poiPreferences,
  userId,
  manualPOIs,
  onProgress,
}) {
  const loopWp = isLoop ? getLoopWaypoint(startLat, startLng, distanceKm) : null
  const eLat = isLoop ? startLat : endLat
  const eLng = isLoop ? startLng : endLng

  let selectedPOIs

  if (manualPOIs && manualPOIs.length > 0) {
    // User picked POIs manually in the wizard
    onProgress?.('searching')
    selectedPOIs = manualPOIs.slice(0, challengeCount)
    // Fill remaining with fallbacks if needed
    if (selectedPOIs.length < challengeCount) {
      const fb = generateFallbackPoints(challengeCount - selectedPOIs.length, startLat, startLng, loopWp?.lat ?? eLat, loopWp?.lng ?? eLng)
      selectedPOIs.push(...fb)
    }
  } else {
    // Auto-search POIs
    onProgress?.('searching')
    const radiusM = calcSearchRadius(distanceKm, isLoop)
    const rawPois = await searchPOIs(startLat, startLng, radiusM, poiPreferences)
    const pois = filterPOIsByDistance(rawPois, startLat, startLng, distanceKm)
    onProgress?.('planning')
    const fallbackEndLat = isLoop ? (loopWp?.lat ?? startLat) : endLat
    const fallbackEndLng = isLoop ? (loopWp?.lng ?? startLng) : endLng
    selectedPOIs = selectPOIs(pois, challengeCount, startLat, startLng, fallbackEndLat, fallbackEndLng)
  }

  // For loop routes, sort POIs by bearing to create circular path
  if (isLoop && selectedPOIs.length > 1) {
    selectedPOIs = sortPOIsByBearing(startLat, startLng, selectedPOIs)
  }

  onProgress?.('planning')

  // Step C — Build route through POIs
  const routeType = ROUTE_TYPES[activity] ?? 'foot_fast'

  // For loop routes, insert the loop waypoint if no POIs would push the route outward
  let waypoints = [...selectedPOIs]
  if (isLoop && loopWp) {
    // Check if any POI is already near the loop waypoint direction
    const loopWpDistFromStart = haversineDistance([startLng, startLat], [loopWp.lng, loopWp.lat])
    const farthestPoi = waypoints.reduce((max, p) => {
      const d = haversineDistance([startLng, startLat], [p.lng, p.lat])
      return d > max ? d : max
    }, 0)
    // If all POIs are clustered close to start, add the loop waypoint
    if (farthestPoi < loopWpDistFromStart * 0.5) {
      waypoints = [loopWp, ...waypoints]
    }
  }

  let routeData
  try {
    routeData = await fetchRoute(startLat, startLng, eLat, eLng, waypoints, routeType)
  } catch (e) {
    throw new Error(`Nepodařilo se naplánovat trasu: ${e.message}`)
  }

  const routeLenKm = (routeData.length ?? 0) / 1000
  console.warn(`Requested: ${distanceKm}km, Got: ${routeLenKm.toFixed(1)}km`)

  // Validation: if route is more than 2.5x requested, POIs were too far
  // Regenerate with just the loop waypoint (no POI waypoints)
  if (routeLenKm > distanceKm * 2.5 && isLoop && loopWp) {
    console.warn(`Route too long (${routeLenKm.toFixed(1)}km vs ${distanceKm}km requested). Regenerating simple loop.`)
    try {
      routeData = await fetchRoute(startLat, startLng, eLat, eLng, [loopWp], routeType)
      const newLen = (routeData.length ?? 0) / 1000
      console.warn(`Simple loop: ${newLen.toFixed(1)}km`)
      // Replace selected POIs with fallback points along the new route
      selectedPOIs.length = 0
      const fallbacks = generateFallbackPoints(challengeCount, startLat, startLng, loopWp.lat, loopWp.lng)
      selectedPOIs.push(...fallbacks)
    } catch (e2) {
      throw new Error(`Nepodařilo se naplánovat trasu: ${e2.message}`)
    }
  }

  // Step D — Assign challenges
  onProgress?.('challenges')
  const challenges = await assignChallenges(selectedPOIs, challengeTypes, startName)

  // Step E — Save to Supabase
  onProgress?.('saving')
  const activityLabel = { hiking: 'Turistika', cycling: 'Cyklo', mtb: 'MTB', skitouring: 'Skialpy', skiing: 'Běžky' }
  const routeName = `${activityLabel[activity] ?? 'Trasa'} z ${startName}`

  const geometry = routeData.geometry ?? routeData
  const finalLenKm = (routeData.length ?? distanceKm * 1000) / 1000

  const { data: route, error: routeErr } = await supabase
    .from('routes')
    .insert({
      name: routeName,
      description: `${challengeCount} zastávek, ${finalLenKm.toFixed(1)} km`,
      activity_type: activity,
      distance_km: finalLenKm,
      difficulty,
      is_loop: isLoop,
      region: startName,
      elevation_gain_m: routeData.ascent ?? 0,
      start_lat: startLat,
      start_lng: startLng,
      gpx_data: JSON.stringify(geometry),
      created_by: userId,
    })
    .select()
    .single()

  if (routeErr) throw new Error(`Nepodařilo se uložit trasu: ${routeErr.message}`)

  const challengeInserts = challenges.map((ch, i) => ({
    route_id: route.id,
    sequence_order: i,
    type: ch.type,
    title: ch.poi_name,
    description: ch.content_json.task,
    question: ch.content_json.task,
    options: ch.content_json.options ? JSON.stringify(ch.content_json.options) : null,
    correct_answer: ch.content_json.correct_answer ?? null,
    prompt: ch.content_json.alternative ?? null,
    lat: ch.gps_lat,
    lng: ch.gps_lng,
  }))

  await supabase.from('challenges').insert(challengeInserts)

  onProgress?.('done')

  return {
    route,
    challenges: challengeInserts,
    routeGeometry: geometry,
    routeLength: routeData.length,
    routeDuration: routeData.duration,
  }
}
