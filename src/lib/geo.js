/**
 * Haversine distance in meters between two [lng, lat] coordinate pairs.
 */
export function haversineDistance([lng1, lat1], [lng2, lat2]) {
  const R = 6_371_000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Extract a [lng, lat][] coordinate array from a route's geometry field.
 * Handles GeoJSON Feature, LineString, or a raw array.
 */
export function extractRouteCoords(geometry) {
  if (!geometry) return null
  try {
    const geo = typeof geometry === 'string' ? JSON.parse(geometry) : geometry
    // Direct LineString
    if (geo.type === 'LineString') return geo.coordinates ?? null
    // Feature wrapping LineString
    if (geo.type === 'Feature') return geo.geometry?.coordinates ?? null
    // FeatureCollection — merge all LineStrings
    if (geo.type === 'FeatureCollection' && Array.isArray(geo.features)) {
      const all = []
      for (const f of geo.features) {
        const c = f.geometry?.coordinates ?? f.coordinates
        if (Array.isArray(c)) all.push(...c)
      }
      return all.length > 0 ? all : null
    }
    // Mapy.com response: { geometry: { ... } }
    if (geo.geometry) return extractRouteCoords(geo.geometry)
    // Raw coordinate array
    if (Array.isArray(geo) && geo.length > 0 && Array.isArray(geo[0])) return geo
    return null
  } catch {
    return null
  }
}

/**
 * Split a route's coordinate array into (challenges.length + 1) segments.
 *
 * For each challenge, find the nearest coordinate index along the route,
 * then slice the array there. Each segment ends at the challenge's exact
 * GPS point so the path is continuous on the map.
 *
 * Returns an array of coordinate arrays (each a valid LineString).
 */
export function splitRouteIntoSegments(allCoords, challenges) {
  if (!allCoords || allCoords.length < 2) return allCoords ? [allCoords] : []
  if (!challenges || challenges.length === 0) return [allCoords]

  // Only challenges with valid GPS coords
  const valid = challenges.filter(
    (ch) =>
      ch.lat != null &&
      ch.lng != null &&
      !isNaN(Number(ch.lat)) &&
      !isNaN(Number(ch.lng))
  )
  if (valid.length === 0) return [allCoords]

  // Map each challenge to its nearest route coord index
  const splits = valid.map((ch) => {
    const chCoord = [Number(ch.lng), Number(ch.lat)]
    let minDist = Infinity
    let nearestIdx = 0
    allCoords.forEach((coord, i) => {
      const d = haversineDistance(coord, chCoord)
      if (d < minDist) {
        minDist = d
        nearestIdx = i
      }
    })
    return { challenge: ch, idx: nearestIdx, coord: chCoord }
  })

  // Sort by position along route (ensure forward-only splits)
  splits.sort((a, b) => a.idx - b.idx)

  const segments = []
  let prevIdx = 0

  for (const split of splits) {
    const idx = Math.max(split.idx, prevIdx)
    const slice = allCoords.slice(prevIdx, idx + 1)
    // Append the exact challenge GPS point as the segment endpoint
    const seg = [...slice]
    const last = seg[seg.length - 1]
    if (
      !last ||
      haversineDistance(last, split.coord) > 1 // > 1 m apart
    ) {
      seg.push(split.coord)
    }
    if (seg.length >= 2) segments.push(seg)
    prevIdx = idx
  }

  // Final segment: last challenge point → route end
  const tail = allCoords.slice(prevIdx)
  if (tail.length >= 2) {
    segments.push(tail)
  } else if (tail.length === 1 && segments.length > 0) {
    segments[segments.length - 1].push(tail[0])
  }

  return segments.filter((s) => s.length >= 2)
}

/**
 * Format meters as a human-readable distance string.
 */
export function formatDistance(meters) {
  if (meters == null || isNaN(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
