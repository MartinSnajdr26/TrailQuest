const ORS_BASE = 'https://api.openrouteservice.org'

export const ORS_PROFILES = {
  hiking: 'foot-hiking',
  crosscountry: 'foot-hiking',
  skitouring: 'foot-hiking',
  skiing: 'foot-hiking',
  cycling: 'cycling-road',
  mtb: 'cycling-mountain',
}

/**
 * Generate route through waypoints using ORS Directions API.
 * waypoints = [{lat, lng}, ...] including start and optionally end.
 */
export async function generateRouteORS({ activity, waypoints, isLoop, apiKey }) {
  const profile = ORS_PROFILES[activity] || 'foot-hiking'
  const coords = waypoints.map((p) => [Number(p.lng), Number(p.lat)])
  if (isLoop && coords.length > 1) coords.push(coords[0])

  const body = {
    coordinates: coords,
    instructions: false,
    elevation: true,
    extra_info: ['surface'],
  }

  const res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ORS routing failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) throw new Error('ORS returned no route')

  return {
    geometry: feature,
    distance: feature.properties?.summary?.distance ?? 0,
    duration: feature.properties?.summary?.duration ?? 0,
    ascent: feature.properties?.ascent ?? 0,
    descent: feature.properties?.descent ?? 0,
  }
}

/**
 * Generate a round-trip loop from a single start point.
 */
export async function generateRoundTripORS({ activity, startLat, startLng, targetDistanceM, apiKey }) {
  const profile = ORS_PROFILES[activity] || 'foot-hiking'

  const body = {
    coordinates: [[Number(startLng), Number(startLat)]],
    options: {
      round_trip: {
        length: targetDistanceM,
        points: 5,
        seed: Math.floor(Math.random() * 90),
      },
    },
    instructions: false,
    elevation: true,
  }

  const res = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ORS round_trip failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) throw new Error('ORS returned no round trip')

  return {
    geometry: feature,
    distance: feature.properties?.summary?.distance ?? 0,
    duration: feature.properties?.summary?.duration ?? 0,
    ascent: feature.properties?.ascent ?? 0,
    descent: feature.properties?.descent ?? 0,
  }
}
