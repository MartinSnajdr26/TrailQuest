const MAPYCZ_TYPES = { hiking: 'foot_fast', crosscountry: 'foot_fast', skitouring: 'foot_fast', cycling: 'bike_road', mtb: 'bike_mountain' }
const ORS_PROFILES = { hiking: 'foot-hiking', crosscountry: 'foot-hiking', skitouring: 'foot-hiking', cycling: 'cycling-road', mtb: 'cycling-mountain' }

export async function routeViaMapyCz({ activity, waypoints, isLoop, apiKey }) {
  const url = new URL('https://api.mapy.cz/v1/routing/route')
  url.searchParams.set('apikey', apiKey); url.searchParams.set('lang', 'cs')
  url.searchParams.set('routeType', MAPYCZ_TYPES[activity] ?? 'foot_fast')
  url.searchParams.set('start', `${waypoints[0].lng},${waypoints[0].lat}`)
  const end = isLoop ? waypoints[0] : waypoints[waypoints.length - 1]
  url.searchParams.set('end', `${end.lng},${end.lat}`)
  const mids = isLoop ? waypoints.slice(1) : waypoints.slice(1, -1)
  mids.forEach((wp) => url.searchParams.append('waypoints', `${wp.lng},${wp.lat}`))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Mapy.cz ${res.status}`)
  const json = await res.json()
  return { geometry: json.geometry ?? json, distance: json.length ?? 0, duration: json.duration ?? 0, ascent: json.ascent ?? 0, source: 'mapycz' }
}

export async function routeViaORS({ activity, waypoints, isLoop, apiKey }) {
  const coords = waypoints.map((p) => [Number(p.lng), Number(p.lat)])
  if (isLoop) coords.push(coords[0])
  const res = await fetch(`https://api.openrouteservice.org/v2/directions/${ORS_PROFILES[activity] ?? 'foot-hiking'}/geojson`, {
    method: 'POST', headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: coords, instructions: false, elevation: true }),
  })
  if (!res.ok) throw new Error(`ORS ${res.status}`)
  const data = await res.json()
  const f = data.features?.[0]
  if (!f) throw new Error('ORS no route')
  return { geometry: f, distance: f.properties?.summary?.distance ?? 0, duration: f.properties?.summary?.duration ?? 0, ascent: f.properties?.ascent ?? 0, source: 'ors' }
}

export function generateLoopWaypoint(startLat, startLng, distanceKm, bearing = 90) {
  const R = 6371000, d = (distanceKm * 400) / R, b = bearing * Math.PI / 180
  const lat1 = startLat * Math.PI / 180, lng1 = startLng * Math.PI / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI }
}

async function enrichWithElevation(geometry, orsApiKey) {
  if (!orsApiKey) return geometry
  try {
    const coords = geometry?.geometry?.coordinates ?? geometry?.coordinates ?? []
    if (coords.length < 3 || (coords[0]?.length >= 3 && coords[0][2] > 0)) return geometry // already has elevation
    const maxPts = 500, step = Math.max(1, Math.floor(coords.length / maxPts))
    const sampled = coords.filter((_, i) => i % step === 0).map((c) => [c[0], c[1]])
    if (sampled.length < 2) return geometry
    const res = await fetch('https://api.openrouteservice.org/elevation/line', {
      method: 'POST', headers: { Authorization: orsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ format_in: 'geojson', format_out: 'geojson', geometry: { type: 'LineString', coordinates: sampled } }),
    })
    if (!res.ok) return geometry
    const data = await res.json()
    const elevated = data.geometry?.coordinates
    if (!elevated?.length) return geometry
    const enriched = coords.map((c, i) => {
      const si = Math.min(Math.floor(i / step), elevated.length - 1)
      const e = elevated[si]?.[2]
      return e != null ? [c[0], c[1], e] : c
    })
    if (geometry?.geometry?.coordinates) return { ...geometry, geometry: { ...geometry.geometry, coordinates: enriched } }
    return { ...geometry, coordinates: enriched }
  } catch (e) { console.warn('Elevation enrichment failed:', e.message); return geometry }
}

export async function generateTrailRoute({ activity, waypoints, isLoop, targetDistanceKm, mapyczApiKey, orsApiKey }) {
  let result
  try {
    result = await routeViaMapyCz({ activity, waypoints, isLoop, apiKey: mapyczApiKey })
    console.log(`Mapy.cz: ${(result.distance / 1000).toFixed(1)}km (target: ${targetDistanceKm}km)`)
    if (result.distance / 1000 > targetDistanceKm * 1.4) { console.warn('Mapy.cz too long, trying ORS'); result = null }
  } catch (e) { console.warn('Mapy.cz failed:', e.message) }
  if (!result && orsApiKey) {
    try {
      result = await routeViaORS({ activity, waypoints, isLoop, apiKey: orsApiKey })
      console.log(`ORS: ${(result.distance / 1000).toFixed(1)}km`)
    } catch (e) { console.warn('ORS failed:', e.message) }
  }
  if (!result) throw new Error('All routing failed')
  // Enrich with elevation data
  if (orsApiKey) result.geometry = await enrichWithElevation(result.geometry, orsApiKey)
  return result
}
