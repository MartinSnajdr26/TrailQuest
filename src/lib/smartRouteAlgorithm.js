import { supabase } from './supabase.js'
import { haversineDistance, extractRouteCoords } from './geo.js'
import { loadPOICache, clearPOICache } from './poiCache.js'
import { selectPOIs, sortForLoop, nearestNeighborOrder } from './poiSelector.js'
import { generateTrailRoute, generateLoopWaypoint } from './trailRouting.js'
import { placeChallengeTrigger, splitRouteAtTriggers } from './triggerPlacement.js'
import { assignChallenge } from './challengeAssigner.js'
import { generateRebus, buildRebusFinale } from './rebusSystem.js'
import { selectStory, getStopNarrative } from './storySystem.js'

export { clearPOICache }

export async function generateSmartRoute({
  mode, activity, experienceType, startLat, startLng, startName, endLat, endLng,
  isLoop, distanceKm, challengeCount, variantTheme, manualPOIs,
  dryRun = false, preGeneratedData, variantSeed = 0, usedPOINames = [],
  anthropicKey, mapyczApiKey, orsApiKey, onProgress, userId,
}) {
  // Fast path: save pre-generated data
  if (preGeneratedData) {
    const r = preGeneratedData.route, chs = preGeneratedData.challenges, geo = preGeneratedData.routeGeometry
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id
    const { data: saved, error } = await supabase.from('routes').insert({
      name: r.name, description: r.description, activity_type: r.activity_type, distance_km: r.distance_km,
      elevation_gain_m: r.elevation_gain_m, duration_sec: r.duration_sec, region: r.region, is_loop: r.is_loop,
      gpx_data: typeof geo === 'string' ? geo : JSON.stringify(geo), created_by: uid,
    }).select().single()
    if (error) throw new Error('Save failed: ' + error.message)
    const ins = chs.map((c, i) => ({
      route_id: saved.id, sequence_order: i + 1, type: c.type, title: c.poi_name,
      description: c.content_json?.task, question: c.content_json?.question ?? c.content_json?.task,
      options: c.content_json?.options ? JSON.stringify(c.content_json.options) : null,
      correct_answer: c.content_json?.correct_answer ?? null, prompt: c.content_json?.alternative ?? null,
      lat: c.gps_lat ?? c.trigger_lat, lng: c.gps_lng ?? c.trigger_lng,
    }))
    await supabase.from('challenges').insert(ins)
    return { route: saved, challenges: ins, routeGeometry: geo, distance: (r.distance_km ?? 0) * 1000, duration: r.duration_sec ?? 0, isDryRun: false }
  }

  // 1. Load POIs
  onProgress?.('🔍 Načítám databázi míst...')
  const allPOIs = await loadPOICache(startLat, startLng)

  // 2. Select POIs
  let selected
  if (mode === 'manual' && manualPOIs?.length) {
    selected = manualPOIs
  } else {
    onProgress?.('🧭 Vybírám nejlepší zastávky...')
    selected = selectPOIs({ allPOIs, startLat, startLng, targetDistanceKm: distanceKm, challengeCount, theme: variantTheme, isLoop, usedPOINames })
  }

  // 3. Sort
  if (isLoop && selected.length > 1) selected = sortForLoop(startLat, startLng, selected)
  else if (!isLoop && selected.length > 2) selected = nearestNeighborOrder(startLat, startLng, selected)

  // 4. Build waypoints
  onProgress?.('🗺 Plánuji trasu po turistických stezkách...')
  let waypoints = [{ lat: startLat, lng: startLng }]
  if (selected.length > 0) waypoints.push(...selected.map((p) => ({ lat: Number(p.gps_lat ?? p.lat), lng: Number(p.gps_lng ?? p.lng) })))
  else if (isLoop) { const b = [90, 180, 270, 45, 135][variantSeed % 5]; waypoints.push(generateLoopWaypoint(startLat, startLng, distanceKm, b)) }
  if (!isLoop && endLat && endLng) waypoints.push({ lat: endLat, lng: endLng })

  // 5. Route
  let routeResult = await generateTrailRoute({
    activity, waypoints, isLoop, targetDistanceKm: distanceKm,
    mapyczApiKey: mapyczApiKey ?? import.meta.env.VITE_MAPYCZ_API_KEY,
    orsApiKey: orsApiKey ?? import.meta.env.VITE_ORS_API_KEY,
  })

  // 6. Trim if too long
  if (routeResult.distance / 1000 > distanceKm * 1.35 && selected.length > 1) {
    onProgress?.('⚡ Zkracuji trasu...')
    const trimmed = selected.slice(0, -1)
    try {
      const tr = await generateTrailRoute({ activity, waypoints: [waypoints[0], ...trimmed.map((p) => ({ lat: Number(p.gps_lat), lng: Number(p.gps_lng) }))], isLoop, targetDistanceKm: distanceKm, mapyczApiKey: import.meta.env.VITE_MAPYCZ_API_KEY, orsApiKey: import.meta.env.VITE_ORS_API_KEY })
      if (tr.distance / 1000 <= distanceKm * 1.35) { routeResult = tr; selected = trimmed }
    } catch { /* keep original */ }
  }

  const routeCoords = routeResult.geometry?.geometry?.coordinates ?? routeResult.geometry?.coordinates ?? []
  const routeKm = routeResult.distance / 1000

  // 7. Triggers
  onProgress?.('📍 Rozmísťuji výzvy...')
  const points = selected.map((poi, i) => ({ ...poi, ...placeChallengeTrigger(routeCoords, Number(poi.gps_lat ?? poi.lat), Number(poi.gps_lng ?? poi.lng)), stopIndex: i }))

  // 8. Rebus
  let rebusWord = experienceType === 'rebus' ? generateRebus(challengeCount) : null

  // 9. Story
  const story = await selectStory(startName)

  // 10. Challenges
  onProgress?.('🧩 Připravuji výzvy...')
  const challenges = await Promise.all(points.map((p, i) =>
    assignChallenge({ poi: p, stopIndex: i, experienceType, rebusWord, storyNarrative: getStopNarrative(story, i), region: startName, anthropicKey })
      .then((ch) => ({ ...ch, sequence_order: i + 1, gps_lat: p.trigger_lat, gps_lng: p.trigger_lng, trigger_radius_m: p.trigger_radius_m, poi_lat: p.poi_lat, poi_lng: p.poi_lng, poi_name: p.name, language: 'cs' }))
  ))

  // Rebus finale
  if (rebusWord) {
    const finLoc = isLoop ? { lat: startLat, lng: startLng } : { lat: Number(selected[selected.length - 1]?.gps_lat ?? startLat), lng: Number(selected[selected.length - 1]?.gps_lng ?? startLng) }
    challenges.push({ sequence_order: challengeCount + 1, type: 'rebus_finale', content_json: buildRebusFinale(rebusWord), gps_lat: finLoc.lat, gps_lng: finLoc.lng, trigger_radius_m: 100, poi_name: 'Finále rébusu', language: 'cs' })
  }

  // 11. Segments
  const segments = splitRouteAtTriggers(routeCoords, points.map((p) => ({ trigger_lat: p.trigger_lat, trigger_lng: p.trigger_lng })))

  // 12. Route data
  const acts = { hiking: 'Turistika', cycling: 'Kolo', mtb: 'MTB', skitouring: 'Skialpy', crosscountry: 'Běžky' }
  const notable = selected.find((p) => ['minipivovar', 'hrad', 'zamek', 'rozhledna', 'vyhlidka'].includes(p.poi_category))
  const routeName = story ? `${story.title_cs ?? story.name ?? ''} — ${startName}` : experienceType === 'rebus' ? `🔤 Rébus: ${acts[activity] ?? 'Trasa'} z ${startName}` : notable ? `${acts[activity] ?? 'Trasa'} přes ${notable.name}` : `${acts[activity] ?? 'Trasa'} z ${startName}`

  const routeData = { name: routeName, description: `${selected.length} zastávek, ${routeKm.toFixed(1)} km`, activity_type: activity, distance_km: routeKm, elevation_gain_m: Math.round(routeResult.ascent ?? 0), duration_sec: Math.round(routeResult.duration ?? 0), region: startName ?? '', is_loop: isLoop, start_lat: startLat, start_lng: startLng }

  if (dryRun) {
    onProgress?.('✅ Trasa připravena!')
    return { route: { ...routeData, id: 'preview_' + Date.now() }, challenges, routeGeometry: routeResult.geometry, routeSegments: segments, distance: routeResult.distance, duration: routeResult.duration, ascent: routeResult.ascent, story, rebusWord, isDryRun: true }
  }

  // Save
  onProgress?.('💾 Ukládám trasu...')
  clearPOICache()
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id
  const { data: saved, error } = await supabase.from('routes').insert({ ...routeData, gpx_data: JSON.stringify(routeResult.geometry), created_by: uid }).select().single()
  if (error) throw new Error('Save failed: ' + error.message)
  const ins = challenges.map((c) => ({ ...c, route_id: saved.id, content_json: undefined }))
  await supabase.from('challenges').insert(ins.map((c) => ({ route_id: c.route_id, sequence_order: c.sequence_order, type: c.type, title: c.poi_name, description: c.content_json?.task ?? challenges.find((x) => x.sequence_order === c.sequence_order)?.content_json?.task, lat: c.gps_lat, lng: c.gps_lng })))

  onProgress?.('✅ Trasa připravena!')
  return { route: saved, challenges, routeGeometry: routeResult.geometry, routeSegments: segments, distance: routeResult.distance, duration: routeResult.duration, ascent: routeResult.ascent, story, rebusWord, isDryRun: false }
}
