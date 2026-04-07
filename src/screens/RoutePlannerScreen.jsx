import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { routeViaMapyCz, generateLoopWaypoint } from '../lib/trailRouting.js'
import { loadPOICache, getCache, clearPOICache } from '../lib/poiCache.js'
import { selectPOIs, sortForLoop } from '../lib/poiSelector.js'
import { generateSmartRoute } from '../lib/smartRouteAlgorithm.js'
import { haversineDistance } from '../lib/geo.js'
import { getCategoryEmoji } from '../lib/routeGenerator.js'
import { formatDuration } from '../components/RouteStats.jsx'
import ElevationProfile from '../components/ElevationProfile.jsx'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY

export default function RoutePlannerScreen({ activity, experienceType, challengeCount, startLat, startLng, startName, isLoop, variantTheme, distanceKm, onBack, onStartRoute }) {
  const { t } = useTranslation()
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const routeDebounceRef = useRef(null)
  const variantSeedRef = useRef(0)

  const [mapReady, setMapReady] = useState(false)
  const [sLat, setSLat] = useState(startLat)
  const [sLng, setSLng] = useState(startLng)
  const [waypoints, setWaypoints] = useState([])
  const [routeGeometry, setRouteGeometry] = useState(null)
  const [routeStats, setRouteStats] = useState(null)
  const [isRouting, setIsRouting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [nearbyPOIs, setNearbyPOIs] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sliderKm, setSliderKm] = useState(distanceKm || 10)
  const [panelExpanded, setPanelExpanded] = useState(false)

  const sliderMin = ['cycling', 'mtb'].includes(activity) ? 5 : 2
  const sliderMax = activity === 'cycling' ? 100 : activity === 'mtb' ? 60 : 40

  // ── Map init ──────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current) return
    const mapset = ['skiing', 'skitouring'].includes(activity) ? 'winter' : 'outdoor'
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: { version: 8, sources: { mapy: { type: 'raster', url: `https://api.mapy.cz/v1/maptiles/${mapset}/tiles.json?apikey=${API_KEY}`, tileSize: 256, attribution: '© Mapy.cz' } }, layers: [{ id: 'base', type: 'raster', source: 'mapy' }] },
      center: [sLng, sLat], zoom: 13,
    })
    map.on('load', () => {
      map.addSource('route-full', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } })
      map.addLayer({ id: 'route-full-line', type: 'line', source: 'route-full', paint: { 'line-color': '#22c55e', 'line-width': 3, 'line-opacity': 0.35, 'line-dasharray': [3, 3] }, layout: { 'line-cap': 'round' } })
      map.addSource('route-first', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } })
      map.addLayer({ id: 'route-first-line', type: 'line', source: 'route-first', paint: { 'line-color': '#22c55e', 'line-width': 5, 'line-opacity': 1 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      addStartMarker(map, sLat, sLng)
      setMapReady(true)
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Initial route + POI load
  useEffect(() => {
    if (!mapReady) return
    loadPOICache(sLat, sLng).then(() => {
      autoSelectPOIs()
    })
  }, [mapReady])

  // ── Markers ───────────────────────────────────────────────

  function addStartMarker(map, lat, lng) {
    markersRef.current.start?.remove()
    const el = document.createElement('div')
    el.className = 'planner-start-marker'
    el.innerHTML = '<span>S</span>'
    const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(map)
    marker.on('dragend', () => { const p = marker.getLngLat(); setSLat(p.lat); setSLng(p.lng); scheduleReroute(0) })
    markersRef.current.start = marker
  }

  function addWPMarker(map, poi, idx) {
    const key = `wp_${idx}`
    markersRef.current[key]?.remove()
    const el = document.createElement('div')
    el.className = 'planner-wp-marker'
    el.textContent = idx + 1
    const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([Number(poi.lng ?? poi.gps_lng), Number(poi.lat ?? poi.gps_lat)]).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLngLat()
      setWaypoints((prev) => prev.map((w, i) => i === idx ? { ...w, lat: p.lat, lng: p.lng, gps_lat: p.lat, gps_lng: p.lng } : w))
      scheduleReroute(0)
    })
    markersRef.current[key] = marker
  }

  function removeAllWPMarkers() {
    Object.keys(markersRef.current).filter((k) => k.startsWith('wp_')).forEach((k) => { markersRef.current[k]?.remove(); delete markersRef.current[k] })
  }

  // ── Routing ───────────────────────────────────────────────

  function scheduleReroute(delay = 500) {
    clearTimeout(routeDebounceRef.current)
    routeDebounceRef.current = setTimeout(() => doRoute(), delay)
  }

  const doRoute = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    setIsRouting(true)
    const wps = getWaypointsFromMarkers()
    try {
      const r = await routeViaMapyCz({ activity, waypoints: wps, isLoop, apiKey: API_KEY })
      const coords = r.geometry?.geometry?.coordinates ?? r.geometry?.coordinates ?? []
      setRouteStats({ distanceKm: (r.distance / 1000).toFixed(1), durationSec: r.duration, ascentM: Math.round(r.ascent ?? 0) })
      map.getSource('route-full')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
      const firstEnd = Math.max(2, Math.floor(coords.length * 0.25))
      map.getSource('route-first')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords.slice(0, firstEnd) } })
      setRouteGeometry(r.geometry)
      loadPOIsAlongRoute(coords)
    } catch (e) { console.warn('Route failed:', e.message) }
    setIsRouting(false)
  }, [activity, isLoop, sLat, sLng])

  function getWaypointsFromMarkers() {
    const wps = []
    const s = markersRef.current.start?.getLngLat()
    if (s) wps.push({ lat: s.lat, lng: s.lng })
    Object.keys(markersRef.current).filter((k) => k.startsWith('wp_')).sort().forEach((k) => {
      const p = markersRef.current[k]?.getLngLat()
      if (p) wps.push({ lat: p.lat, lng: p.lng })
    })
    return wps
  }

  // ── POI discovery ─────────────────────────────────────────

  function loadPOIsAlongRoute(coords) {
    if (!coords.length) return
    const step = Math.max(1, Math.floor(coords.length / 10))
    const samples = coords.filter((_, i) => i % step === 0)
    const cache = getCache()
    const pois = cache?.pois ?? []
    const near = pois.filter((p) => samples.some((c) => haversineDistance([c[0], c[1]], [p.gps_lng, p.gps_lat]) < 600))
    setNearbyPOIs(near)
  }

  function autoSelectPOIs() {
    const cache = getCache()
    if (!cache?.pois?.length) { scheduleReroute(100); return }
    const selected = selectPOIs({ allPOIs: cache.pois, startLat: sLat, startLng: sLng, targetDistanceKm: sliderKm, challengeCount, theme: variantTheme, isLoop })
    const sorted = isLoop && selected.length > 1 ? sortForLoop(sLat, sLng, selected) : selected
    setWaypoints(sorted)
    setSelectedIds(new Set(sorted.map((p) => p.id)))
    removeAllWPMarkers()
    sorted.forEach((p, i) => addWPMarker(mapRef.current, p, i))
    scheduleReroute(100)
  }

  function togglePOI(poi) {
    const newSel = new Set(selectedIds)
    if (newSel.has(poi.id)) {
      newSel.delete(poi.id)
      const idx = waypoints.findIndex((w) => w.id === poi.id)
      if (idx >= 0) {
        setWaypoints((prev) => prev.filter((_, i) => i !== idx))
        markersRef.current[`wp_${idx}`]?.remove()
        delete markersRef.current[`wp_${idx}`]
      }
    } else {
      newSel.add(poi.id)
      setWaypoints((prev) => {
        const updated = [...prev, poi]
        addWPMarker(mapRef.current, poi, updated.length - 1)
        return updated
      })
    }
    setSelectedIds(newSel)
    scheduleReroute(200)
  }

  function handleSliderChange(v) {
    setSliderKm(v)
    if (waypoints.length === 0 && isLoop) {
      const wp = generateLoopWaypoint(sLat, sLng, v, 90)
      if (markersRef.current.wp_0) markersRef.current.wp_0.setLngLat([wp.lng, wp.lat])
      else addWPMarker(mapRef.current, wp, 0)
    }
    scheduleReroute(300)
  }

  function handleRegenerate() {
    variantSeedRef.current = (variantSeedRef.current + 1) % 5
    removeAllWPMarkers()
    setSelectedIds(new Set())
    autoSelectPOIs()
  }

  // ── Confirm ───────────────────────────────────────────────

  async function handleConfirm() {
    if (!routeGeometry) return
    setIsSaving(true)
    try {
      const wps = getWaypointsFromMarkers()
      const pois = waypoints.map((w, i) => ({ ...w, gps_lat: wps[i + 1]?.lat ?? w.lat ?? w.gps_lat, gps_lng: wps[i + 1]?.lng ?? w.lng ?? w.gps_lng }))
      const result = await generateSmartRoute({
        dryRun: false, mode: pois.length > 0 ? 'manual' : 'auto', activity, experienceType,
        startLat: wps[0]?.lat ?? sLat, startLng: wps[0]?.lng ?? sLng, startName, isLoop,
        distanceKm: parseFloat(routeStats?.distanceKm ?? sliderKm), challengeCount, variantTheme,
        manualPOIs: pois, precomputedGeometry: routeGeometry, precomputedDistance: parseFloat(routeStats?.distanceKm ?? 10) * 1000,
        anthropicKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
      })
      clearPOICache()
      onStartRoute(result)
    } catch (e) { console.error('Save failed:', e); alert('Nepodařilo se uložit: ' + e.message) }
    setIsSaving(false)
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', flexShrink: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>←</button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>🗺 {t('planner.title')}</span>
        {isRouting && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⟳</span>}
      </div>

      {/* Map */}
      <div ref={mapContainerRef} style={{ flex: 1, minHeight: 0 }} />

      {/* Bottom panel */}
      <div style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', maxHeight: panelExpanded ? '55vh' : '220px', overflow: 'auto', transition: 'max-height 300ms ease', flexShrink: 0 }}>
        {/* Drag handle */}
        <div onClick={() => setPanelExpanded(!panelExpanded)} style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px', cursor: 'pointer' }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, padding: '6px 20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)' }}>📏 {routeStats?.distanceKm ?? '...'} km</span>
          {routeStats?.durationSec > 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>⏱ {formatDuration(routeStats.durationSec)}</span>}
          {routeStats?.ascentM > 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>↗ {routeStats.ascentM} m</span>}
        </div>

        {/* Elevation */}
        {routeGeometry && <div style={{ padding: '0 16px' }}><ElevationProfile geometry={routeGeometry} height={56} /></div>}

        {/* Slider */}
        <div style={{ padding: '6px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>{t('planner.distance')}</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{sliderKm} km</span>
          </div>
          <input type="range" min={sliderMin} max={sliderMax} step={1} value={sliderKm} onChange={(e) => handleSliderChange(Number(e.target.value))} className="planner-slider" />
        </div>

        {/* POIs along route */}
        {nearbyPOIs.length > 0 && (
          <div style={{ padding: '4px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '0 20px 6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('planner.nearbyPOIs')}</div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px 4px', scrollbarWidth: 'none' }}>
              {nearbyPOIs.slice(0, 12).map((poi) => {
                const isSel = selectedIds.has(poi.id)
                return (
                  <button key={poi.id} onClick={() => togglePOI(poi)} style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 16, border: isSel ? '2px solid var(--accent)' : '1px solid var(--border)', background: isSel ? 'var(--accent-dim)' : 'var(--bg-raised)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', transition: 'all 150ms' }}>
                    <span style={{ fontSize: 14 }}>{getCategoryEmoji(poi.poi_category)}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{poi.name}</span>
                    {isSel && <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px calc(8px + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={handleRegenerate} style={{ flex: 1, height: 44, borderRadius: 22, border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--text)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            🎲 {t('planner.newStops')}
          </button>
          <button onClick={handleConfirm} disabled={!routeGeometry || isRouting || isSaving} style={{ flex: 2, height: 44, borderRadius: 22, border: 'none', background: (!routeGeometry || isSaving) ? 'var(--bg-raised)' : 'var(--accent)', color: (!routeGeometry || isSaving) ? 'var(--text-muted)' : '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: routeGeometry ? '0 4px 16px rgba(34,197,94,0.3)' : 'none' }}>
            {isSaving ? '💾...' : '🚀 ' + t('planner.start')}
          </button>
        </div>
      </div>
    </div>
  )
}
