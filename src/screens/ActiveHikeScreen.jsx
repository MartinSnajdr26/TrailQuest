import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTranslation } from 'react-i18next'
import {
  haversineDistance,
  extractRouteCoords,
  splitRouteIntoSegments,
  formatDistance,
} from '../lib/geo.js'
import { enqueueCompletion, setupOnlineSync } from '../lib/offlineQueue.js'
import { fetchCurrentWeather, getWeatherEmoji } from '../lib/weather.js'
import { audioGuide } from '../lib/audioGuide.js'
import { recordPOIVisit } from '../lib/routeGenerator.js'
import ChallengeCard from '../components/ChallengeCard.jsx'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY

const LOCKED_PAINT = { 'line-color': '#374151', 'line-opacity': 0, 'line-width': 3, 'line-dasharray': [4, 4] }
const UNLOCKED_PAINT = { 'line-color': '#4ade80', 'line-opacity': 1, 'line-width': 5 }

function animateSegmentReveal(map, layerId, onDone) {
  map.setPaintProperty(layerId, 'line-color', '#4ade80')
  map.setPaintProperty(layerId, 'line-width', 5)
  map.setPaintProperty(layerId, 'line-dasharray', null)
  map.setPaintProperty(layerId, 'line-opacity', 0)
  let start = null
  function step(ts) {
    if (!start) start = ts
    const t = Math.min((ts - start) / 800, 1)
    map.setPaintProperty(layerId, 'line-opacity', 1 - (1 - t) ** 3)
    if (t < 1) requestAnimationFrame(step)
    else onDone?.()
  }
  requestAnimationFrame(step)
}

function fitSegment(map, coords, extra = 0) {
  if (!coords || coords.length < 2) return
  const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
  map.fitBounds(bounds, { padding: { top: 70, bottom: 100 + extra, left: 40, right: 40 }, duration: 600 })
}

function formatTimer(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ── Inline styles (theme-proof: always dark bg + white text) ─────────────

const S_TOPBAR = {
  position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
  padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: '6px',
}
const S_TOPBAR_ROW = { display: 'flex', alignItems: 'center', gap: '10px' }
const S_TOPBAR_LABEL = { fontSize: '13px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap' }
const S_EXIT_BTN = {
  width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#ffffff', flexShrink: 0, cursor: 'pointer',
}
const S_PROGRESS_TRACK = { flex: 1, display: 'flex', gap: '3px', height: '6px' }
const S_PIP = (unlocked) => ({
  flex: 1, borderRadius: '3px',
  background: unlocked ? '#4ade80' : 'rgba(255,255,255,0.2)',
  transition: 'background 0.4s',
})

const S_HUD_OUTER = (collapsed) => ({
  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
  transform: collapsed ? 'translateY(calc(100% - 28px))' : 'translateY(0)',
  transition: 'transform 0.3s ease',
})
const S_CHEVRON_STRIP = {
  display: 'flex', justifyContent: 'center', padding: '2px 0',
  background: 'rgba(0,0,0,0.75)', cursor: 'pointer',
}
const S_CHEVRON = { fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1 }
const S_HUD = {
  background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
  padding: '12px 16px', display: 'flex', justifyContent: 'space-around', alignItems: 'center',
  minHeight: '64px',
}
const S_HUD_ITEM = { fontSize: '15px', fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px' }
const S_PAUSE_BTN = {
  width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  color: '#ffffff', fontSize: '14px', cursor: 'pointer', marginLeft: '4px', flexShrink: 0,
}

const S_MAP_BTNS = {
  position: 'absolute', top: '60px', right: '10px', zIndex: 10,
  display: 'flex', flexDirection: 'column', gap: '6px',
}
const S_MAP_BTN = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '16px', color: '#ffffff', cursor: 'pointer',
}

// ─────────────────────────────────────────────────────────────────────────

export default function ActiveHikeScreen({ route, challenges, routeGeometry, runId, startedAt, completedChallengeIds, savedWalkedKm, savedTotalPausedMs, onChallengeCompleted, onStateUpdate, onFinish }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  const restoredIds = completedChallengeIds ?? []
  const completedIdsRef = useRef(new Set(restoredIds))
  const triggeredIdsRef = useRef(new Set(restoredIds))
  const [completedCount, setCompletedCount] = useState(restoredIds.length)
  const unlockedCount = completedCount + 1

  const [activeChallenge, setActiveChallenge] = useState(null)
  const [nextDist, setNextDist] = useState(null)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // HUD state — restore from persisted values
  const totalPausedMsRef = useRef(savedTotalPausedMs ?? 0)
  const startMs = startedAt ? new Date(startedAt).getTime() : Date.now()
  const [elapsed, setElapsed] = useState(Math.max(0, Date.now() - startMs - totalPausedMsRef.current))
  const [walkedKm, setWalkedKm] = useState(savedWalkedKm ?? 0)
  const prevPosRef = useRef(null)
  const startTimeRef = useRef(startMs)
  const [paused, setPaused] = useState(false)
  const pausedAtRef = useRef(0)
  const [hudCollapsed, setHudCollapsed] = useState(false)

  const markerEls = useRef(new Map())

  // Weather + audio
  const [weather, setWeather] = useState(null)
  const [audioEnabled, setAudioEnabled] = useState(() => audioGuide.enabled)

  useEffect(() => setupOnlineSync(), [])

  // Derived data
  const allCoords = useMemo(() => extractRouteCoords(routeGeometry ?? route.gpx_data), [routeGeometry, route.gpx_data])
  const sortedChallenges = useMemo(() => [...challenges].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)), [challenges])
  const segments = useMemo(() => splitRouteIntoSegments(allCoords, sortedChallenges), [allCoords, sortedChallenges])
  const totalSegments = Math.max(segments.length, 1)

  // Fetch weather + announce start
  useEffect(() => {
    const startCoord = allCoords?.[0]
    if (startCoord) fetchCurrentWeather(startCoord[1], startCoord[0]).then((w) => { if (w) setWeather(w) })
    audioGuide.speak('Trasa zahájena! Přejeme příjemný výlet a hodně zábavy.', 'high')
    return () => audioGuide.stop()
  }, [])

  // Timer — respects pause, uses totalPausedMs
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current - totalPausedMsRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [paused])

  function togglePause() {
    if (paused) {
      // Resume: add pause duration to total
      const dur = Date.now() - pausedAtRef.current
      totalPausedMsRef.current += dur
      pausedAtRef.current = 0
      setPaused(false)
      onStateUpdate?.({ totalPausedMs: totalPausedMsRef.current })
    } else {
      pausedAtRef.current = Date.now()
      setPaused(true)
      onStateUpdate?.({ totalPausedMs: totalPausedMsRef.current })
    }
  }

  // Map init
  useEffect(() => {
    if (mapRef.current) return
    const startCenter = allCoords?.[0] ?? [15.4, 49.8]
    const mapset = ['skiing', 'skitouring'].includes(route.activity_type) ? 'winter' : 'outdoor'
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: { mapy: { type: 'raster', url: `https://api.mapy.cz/v1/maptiles/${mapset}/tiles.json?apikey=${API_KEY}`, tileSize: 256, attribution: '© Mapy.cz' } },
        layers: [{ id: 'mapy-layer', type: 'raster', source: 'mapy' }],
      },
      center: startCenter, zoom: 14,
    })
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Add segments + markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    segments.forEach((seg, i) => {
      const srcId = `hike-seg-${i}`, layId = `hike-seg-${i}-line`
      if (map.getSource(srcId)) return
      map.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg } } })
      // Show already-unlocked segments (restored from persisted state)
      const isUnlocked = i < unlockedCount
      map.addLayer({ id: layId, type: 'line', source: srcId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: isUnlocked ? UNLOCKED_PAINT : LOCKED_PAINT })
    })
    sortedChallenges.forEach((ch, i) => {
      if (ch.lat == null || ch.lng == null) return
      const el = document.createElement('div')
      const chKey = ch.id ?? `ch-${i}`
      const isDone = completedIdsRef.current.has(chKey)
      const isNext = !isDone && i === completedIdsRef.current.size
      el.className = isDone ? 'ch-marker ch-marker--done' : isNext ? 'ch-marker ch-marker--next' : 'ch-marker ch-marker--locked'
      el.innerHTML = isDone
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : isNext ? `<span class="ch-marker-num">${i + 1}</span>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
      new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([Number(ch.lng), Number(ch.lat)]).addTo(map)
      markerEls.current.set(ch.id ?? `ch-${i}`, el)
    })
    // Fit to latest unlocked segment
    const fitIdx = Math.min(unlockedCount - 1, segments.length - 1)
    if (segments[fitIdx]) fitSegment(map, segments[fitIdx])
  }, [mapReady, segments, sortedChallenges])

  // Add GPS user location dot
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (map.getSource('user-loc')) return
    map.addSource('user-loc', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: allCoords?.[0] ?? [15.4, 49.8] } } })
    map.addLayer({ id: 'user-loc-glow', type: 'circle', source: 'user-loc', paint: { 'circle-radius': 18, 'circle-color': '#22c55e', 'circle-opacity': 0.12 } })
    map.addLayer({ id: 'user-loc-ring', type: 'circle', source: 'user-loc', paint: { 'circle-radius': 10, 'circle-color': '#ffffff', 'circle-opacity': 1 } })
    map.addLayer({ id: 'user-loc-dot', type: 'circle', source: 'user-loc', paint: { 'circle-radius': 7, 'circle-color': '#22c55e', 'circle-opacity': 1 } })
  }, [mapReady])

  // Animate newly unlocked segment
  const prevUnlockedRef = useRef(restoredIds.length + 1)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || unlockedCount <= prevUnlockedRef.current) return
    const idx = unlockedCount - 1, layerId = `hike-seg-${idx}-line`
    if (!map.getLayer(layerId)) return
    prevUnlockedRef.current = unlockedCount
    animateSegmentReveal(map, layerId, () => {
      if (segments[idx]) fitSegment(map, segments[idx], 80)
      const remaining = sortedChallenges.length - completedCount
      audioGuide.speak(`Skvěle! Další úsek trasy se odemkl. ${remaining > 0 ? `Ještě ${remaining} zastávek.` : 'Poslední úsek!'}`)
    })
  }, [unlockedCount, mapReady, segments])

  // Update markers on completion
  useEffect(() => {
    const done = completedIdsRef.current
    const nextCh = sortedChallenges.find((ch) => !done.has(ch.id ?? `ch-${sortedChallenges.indexOf(ch)}`))
    sortedChallenges.forEach((ch, i) => {
      const key = ch.id ?? `ch-${i}`, el = markerEls.current.get(key)
      if (!el) return
      if (done.has(key)) { el.className = 'ch-marker ch-marker--done'; el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' }
      else if (key === (nextCh?.id ?? `ch-${sortedChallenges.indexOf(nextCh)}`)) { el.className = 'ch-marker ch-marker--next'; el.innerHTML = `<span class="ch-marker-num">${i + 1}</span>` }
    })
  }, [completedCount, sortedChallenges])

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation || sortedChallenges.length === 0) return
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const coord = [pos.coords.longitude, pos.coords.latitude]
      if (prevPosRef.current) {
        const d = haversineDistance(prevPosRef.current, coord)
        if (d > 3 && d < 500) {
          setWalkedKm((p) => { const next = p + d / 1000; onStateUpdate?.({ walkedKm: next }); return next })
        }
      }
      prevPosRef.current = coord
      // Update user location dot on map
      const locSrc = mapRef.current?.getSource('user-loc')
      if (locSrc) locSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: coord } })
      const next = sortedChallenges.find((ch, i) => !completedIdsRef.current.has(ch.id ?? `ch-${i}`))
      if (!next || next.lat == null || next.lng == null) { setNextDist(null); return }
      const dist = haversineDistance(coord, [Number(next.lng), Number(next.lat)])
      setNextDist(Math.round(dist))
      const nextKey = next.id ?? `ch-${sortedChallenges.indexOf(next)}`
      if (dist <= 100 && !triggeredIdsRef.current.has(nextKey)) {
        triggeredIdsRef.current.add(nextKey); setActiveChallenge(next)
        audioGuide.speak(`Blížíš se k zastávce ${sortedChallenges.indexOf(next) + 1}. ${next.content_json?.place_name ?? next.title ?? ''}`, 'high')
      }
    }, (err) => console.warn('GPS:', err.message), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [sortedChallenges])

  const recenter = useCallback(() => {
    if (mapRef.current && prevPosRef.current) mapRef.current.flyTo({ center: prevPosRef.current, zoom: 15, duration: 400 })
  }, [])

  async function handleChallengeComplete(challenge, answer) {
    const key = challenge.id ?? `ch-${sortedChallenges.indexOf(challenge)}`
    completedIdsRef.current.add(key); setActiveChallenge(null); setCompletedCount((p) => p + 1)
    // Persist progress to parent (→ localStorage)
    onChallengeCompleted?.(key)
    const funFact = challenge.content_json?.fun_fact ?? challenge.fun_fact
    audioGuide.speak(funFact ? `Výborně! ${funFact}` : 'Výzva splněna.')
    if (challenge.content_json?.custom_poi_id) recordPOIVisit(challenge.content_json.custom_poi_id)
    if (user) {
      const payload = { user_id: user.id, challenge_id: challenge.id, answer: answer ?? null, completed_at: new Date().toISOString() }
      if (runId) payload.route_run_id = runId
      if (!navigator.onLine) enqueueCompletion(payload)
      else supabase.from('user_challenge_completions').insert(payload).then(({ error }) => { if (error) enqueueCompletion(payload) })
    }
  }

  const nextChallenge = sortedChallenges.find((ch, i) => !completedIdsRef.current.has(ch.id ?? `ch-${i}`))
  const nextChallengeIdx = nextChallenge ? sortedChallenges.indexOf(nextChallenge) + 1 : null
  const allDone = completedCount >= sortedChallenges.length && sortedChallenges.length > 0
  const progressPct = sortedChallenges.length > 0 ? (completedCount / sortedChallenges.length) * 100 : 0

  return (
    <div className="hike-screen">
      {/* ── Top bar (always dark) ─────────────────────── */}
      <div style={S_TOPBAR}>
        <div style={S_TOPBAR_ROW}>
          <span style={S_TOPBAR_LABEL}>
            {t('hike.challenge')} {Math.min(completedCount + 1, sortedChallenges.length)}/{sortedChallenges.length}
          </span>
          {weather && (
            <span style={{ ...S_TOPBAR_LABEL, fontSize: '12px', opacity: 0.8, marginLeft: 'auto' }}>
              {getWeatherEmoji(weather.condition)} {Math.round(weather.temp_c)}°
            </span>
          )}
          <button style={S_EXIT_BTN} onClick={() => setShowExitConfirm(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {/* Progress bar */}
        <div style={S_PROGRESS_TRACK}>
          {Array.from({ length: totalSegments }).map((_, i) => (
            <div key={i} style={S_PIP(i < unlockedCount)} />
          ))}
        </div>
      </div>

      {/* ── Map ───────────────────────────────────────── */}
      <div ref={mapContainer} className="hike-map" />

      {/* Map overlay buttons */}
      <div style={S_MAP_BTNS}>
        <button style={S_MAP_BTN} onClick={() => setAudioEnabled(audioGuide.toggle())}>{audioEnabled ? '🔊' : '🔇'}</button>
        <button style={S_MAP_BTN} onClick={recenter}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m10-10h-4M6 12H2"/></svg>
        </button>
      </div>

      {/* ── Bottom HUD (collapsible, always dark) ─────── */}
      <div style={S_HUD_OUTER(hudCollapsed)}>
        <div style={S_CHEVRON_STRIP} onClick={() => setHudCollapsed(!hudCollapsed)}>
          <span style={S_CHEVRON}>{hudCollapsed ? '▲' : '▼'}</span>
        </div>
        <div style={S_HUD}>
          <span style={S_HUD_ITEM}>📏 {walkedKm.toFixed(1)} km</span>
          <span style={S_HUD_ITEM}>
            ⏱ {formatTimer(elapsed)}
            <button style={S_PAUSE_BTN} onClick={togglePause}>{paused ? '▶' : '⏸'}</button>
          </span>
          <span style={S_HUD_ITEM}>🧠 {completedCount}/{sortedChallenges.length}</span>
        </div>
        {paused && (
          <div style={{ textAlign: 'center', padding: '4px 0 8px', background: 'rgba(0,0,0,0.82)', color: '#facc15', fontSize: '12px', fontWeight: 700, letterSpacing: '2px' }}>
            PAUZA
          </div>
        )}
      </div>

      {/* Distance to next */}
      {!activeChallenge && nextChallenge && nextDist !== null && (
        <div className="hike-dist-bar">
          <div className="hike-dist-inner">
            <span className="hike-dist-icon">🏁</span>
            <span className="hike-dist-text">
              {t('hike.challenge')} {nextChallengeIdx} {t('hike.in')} <strong>{formatDistance(nextDist)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Route complete */}
      {allDone && !activeChallenge && (
        <div className="hike-complete-banner">
          <span>🎉 {t('hike.routeDone')}</span>
          <button className="hike-complete-btn" onClick={() => {
            audioGuide.speak(`Gratuluju! Dokončil jsi trasu. Ušels ${walkedKm.toFixed(1)} kilometrů.`)
            onFinish({ completed: true, completedCount, totalChallenges: sortedChallenges.length, startedAt, finishedAt: new Date().toISOString(), walkedKm, weather })
          }}>
            {t('hike.results')}
          </button>
        </div>
      )}

      {/* Challenge card + dim */}
      {activeChallenge && (
        <>
          <div className="hike-dim-overlay" />
          <ChallengeCard challenge={activeChallenge} challengeIndex={sortedChallenges.indexOf(activeChallenge) + 1} totalChallenges={sortedChallenges.length} onComplete={handleChallengeComplete} />
        </>
      )}

      {/* Exit confirm */}
      {showExitConfirm && (
        <div className="hike-confirm-overlay" onClick={() => setShowExitConfirm(false)}>
          <div className="hike-confirm" onClick={(e) => e.stopPropagation()}>
            <p>{t('hike.exitConfirm')}</p>
            <div className="hike-confirm-btns">
              <button className="btn-primary" onClick={() => { setShowExitConfirm(false); onFinish({ completed: false }) }}>{t('hike.exitYes')}</button>
              <button className="btn-secondary" onClick={() => setShowExitConfirm(false)}>{t('hike.exitNo')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
