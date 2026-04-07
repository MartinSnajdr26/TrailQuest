import { haversineDistance } from './geo.js'

export function placeChallengeTrigger(routeCoords, poiLat, poiLng) {
  if (!routeCoords?.length) return { trigger_lat: poiLat, trigger_lng: poiLng, poi_lat: poiLat, poi_lng: poiLng, trigger_radius_m: 80 }
  let ci = 0, cd = Infinity
  routeCoords.forEach((c, i) => { const d = haversineDistance([c[0], c[1]], [poiLng, poiLat]); if (d < cd) { cd = d; ci = i } })
  let acc = 0, ti = Math.max(0, ci - 1)
  for (let i = ci; i > 0; i--) {
    acc += haversineDistance([routeCoords[i][0], routeCoords[i][1]], [routeCoords[i - 1][0], routeCoords[i - 1][1]])
    if (acc >= 300) { ti = i - 1; break }
  }
  return { trigger_lat: routeCoords[ti][1], trigger_lng: routeCoords[ti][0], poi_lat: poiLat, poi_lng: poiLng, trigger_radius_m: 50 }
}

export function splitRouteAtTriggers(routeCoords, triggers) {
  if (!routeCoords?.length || !triggers?.length) return [routeCoords]
  const segs = []
  let start = 0
  for (const t of triggers) {
    let ci = start, cd = Infinity
    for (let i = start; i < routeCoords.length; i++) {
      const d = haversineDistance([routeCoords[i][0], routeCoords[i][1]], [t.trigger_lng, t.trigger_lat])
      if (d < cd) { cd = d; ci = i }
    }
    if (ci > start) { segs.push(routeCoords.slice(start, ci + 1)); start = ci }
  }
  if (start < routeCoords.length - 1) segs.push(routeCoords.slice(start))
  return segs.filter((s) => s.length >= 2)
}
