import { supabase } from './supabase.js'
import { haversineDistance } from './geo.js'

const CACHE_KEY = 'tq_poi_cache'
const CACHE_RADIUS_KM = 50

export async function loadPOICache(centerLat, centerLng) {
  const existing = getCache()
  if (existing && haversineDistance([existing.centerLng, existing.centerLat], [centerLng, centerLat]) < 10000) {
    return existing.pois
  }

  const d = CACHE_RADIUS_KM / 111
  const dLng = CACHE_RADIUS_KM / (111 * Math.cos(centerLat * Math.PI / 180))

  const { data } = await supabase.from('custom_pois').select('*')
    .eq('is_approved', true).eq('is_active', true)
    .gte('gps_lat', centerLat - d).lte('gps_lat', centerLat + d)
    .gte('gps_lng', centerLng - dLng).lte('gps_lng', centerLng + dLng)

  const pois = data ?? []
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ centerLat, centerLng, pois, loadedAt: Date.now() }))
  console.log('POI cache loaded:', pois.length)
  return pois
}

export function getCache() {
  try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}

export function clearPOICache() { sessionStorage.removeItem(CACHE_KEY) }
