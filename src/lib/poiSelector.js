import { haversineDistance } from './geo.js'

const THEME_CATS = {
  food_drink: ['minipivovar', 'hospoda', 'restaurace', 'vinna_sklep', 'koliba'],
  culture_nature: ['hrad', 'zamek', 'kostel', 'kaple', 'rozhledna', 'vyhlidka', 'pamatnik', 'skalni_utvar', 'studanka', 'mlyny', 'horska_chata'],
}

function getBearing(lat1, lng1, lat2, lng2) {
  const dL = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(dL) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dL)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

function scorePOI(poi, ctx) {
  let s = (poi.quality_score ?? 5) * 3
  const distKm = poi._distM / 1000, idealMin = ctx.targetDistanceKm * 0.05, idealMax = ctx.targetDistanceKm * 0.30
  s += (distKm >= idealMin && distKm <= idealMax) ? 20 : distKm < idealMin ? 5 : -10
  if ((THEME_CATS[ctx.theme] ?? []).includes(poi.poi_category)) s += 25
  if (ctx.selected.length > 0) {
    const myB = getBearing(ctx.startLat, ctx.startLng, poi.gps_lat, poi.gps_lng)
    if (ctx.selected.some((sel) => { const d = Math.abs(myB - getBearing(ctx.startLat, ctx.startLng, sel.gps_lat, sel.gps_lng)); return Math.min(d, 360 - d) < 30 })) s -= 25
  }
  if (ctx.selected.some((sel) => haversineDistance([poi.gps_lng, poi.gps_lat], [sel.gps_lng, sel.gps_lat]) < 500)) s -= 40
  if (ctx.usedNames?.includes(poi.name)) s -= 50
  s += Math.min((poi.visit_count ?? 0) * 0.5, 10)
  if (poi.is_partner) s += 10
  return s
}

export function selectPOIs({ allPOIs, startLat, startLng, targetDistanceKm, challengeCount, theme, isLoop, usedPOINames = [] }) {
  const maxM = targetDistanceKm * 400
  const candidates = allPOIs.map((p) => ({ ...p, _distM: haversineDistance([startLng, startLat], [p.gps_lng, p.gps_lat]) })).filter((p) => p._distM <= maxM && p._distM > 50)
  if (!candidates.length) return []
  const selected = [], remaining = [...candidates]
  for (let i = 0; i < challengeCount && remaining.length; i++) {
    const scored = remaining.map((p) => ({ p, s: scorePOI(p, { startLat, startLng, targetDistanceKm, theme, selected, usedNames: usedPOINames }) })).sort((a, b) => b.s - a.s)
    const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))]
    selected.push(pick.p)
    remaining.splice(remaining.indexOf(pick.p), 1)
  }
  return selected
}

export function sortForLoop(startLat, startLng, pois) {
  return [...pois].sort((a, b) => getBearing(startLat, startLng, a.gps_lat, a.gps_lng) - getBearing(startLat, startLng, b.gps_lat, b.gps_lng))
}

export function nearestNeighborOrder(startLat, startLng, pois) {
  if (pois.length <= 2) return pois
  const rem = [...pois], ord = []
  let cLat = startLat, cLng = startLng
  while (rem.length) {
    let ni = 0, nd = Infinity
    rem.forEach((p, i) => { const d = haversineDistance([cLng, cLat], [p.gps_lng, p.gps_lat]); if (d < nd) { nd = d; ni = i } })
    const n = rem.splice(ni, 1)[0]
    ord.push(n); cLat = n.gps_lat; cLng = n.gps_lng
  }
  return ord
}
