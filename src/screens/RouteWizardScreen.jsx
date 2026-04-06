import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { suggestPlace, generateRoute, searchPOIsPublic } from '../lib/routeGenerator.js'
import { haversineDistance } from '../lib/geo.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY
const TOTAL_STEPS = 6

const ACTIVITIES = [
  { id: 'hiking', icon: '🥾', labelKey: 'wizard.hiking' },
  { id: 'skiing', icon: '⛷', labelKey: 'wizard.skiing' },
  { id: 'skitouring', icon: '🎿', labelKey: 'wizard.skitouring' },
  { id: 'cycling', icon: '🚴', labelKey: 'wizard.cycling' },
  { id: 'mtb', icon: '🚵', labelKey: 'wizard.mtb' },
]

const DISTANCE_OPTIONS = {
  hiking: [5, 10, 20, 25], skiing: [5, 10, 20, 25], skitouring: [5, 10, 20, 25],
  cycling: [15, 30, 60, 80], mtb: [15, 30, 60, 80],
}
const DISTANCE_OVERFLOW = { hiking: 20, skiing: 20, skitouring: 20, cycling: 60, mtb: 60 }

const DIFFICULTY_OPTIONS = {
  hiking: [
    { id: 'easy', emoji: '🟢', labelKey: 'wizard.diffEasy', descKey: 'wizard.diffEasyDesc' },
    { id: 'medium', emoji: '🟡', labelKey: 'wizard.diffMedium', descKey: 'wizard.diffMediumDesc' },
    { id: 'hard', emoji: '🔴', labelKey: 'wizard.diffHard', descKey: 'wizard.diffHardDesc' },
  ],
  skiing: [
    { id: 'easy', emoji: '🟢', labelKey: 'wizard.diffEasy', descKey: 'wizard.diffEasyDesc' },
    { id: 'medium', emoji: '🟡', labelKey: 'wizard.diffMedium', descKey: 'wizard.diffMediumDesc' },
    { id: 'hard', emoji: '🔴', labelKey: 'wizard.diffHard', descKey: 'wizard.diffHardDesc' },
  ],
  skitouring: [
    { id: 'easy', emoji: '🟢', labelKey: 'wizard.skiEasy', descKey: 'wizard.skiEasyDesc' },
    { id: 'medium', emoji: '🟡', labelKey: 'wizard.skiMedium', descKey: 'wizard.skiMediumDesc' },
    { id: 'hard', emoji: '🔴', labelKey: 'wizard.skiHard', descKey: 'wizard.skiHardDesc' },
  ],
  cycling: [
    { id: 'easy', emoji: '🟢', labelKey: 'wizard.bikeEasy', descKey: 'wizard.bikeEasyDesc' },
    { id: 'medium', emoji: '🟡', labelKey: 'wizard.bikeMedium', descKey: 'wizard.bikeMediumDesc' },
    { id: 'hard', emoji: '🔴', labelKey: 'wizard.bikeHard', descKey: 'wizard.bikeHardDesc' },
  ],
  mtb: [
    { id: 'easy', emoji: '🟢', labelKey: 'wizard.bikeEasy', descKey: 'wizard.bikeEasyDesc' },
    { id: 'medium', emoji: '🟡', labelKey: 'wizard.bikeMedium', descKey: 'wizard.bikeMediumDesc' },
    { id: 'hard', emoji: '🔴', labelKey: 'wizard.bikeHard', descKey: 'wizard.bikeHardDesc' },
  ],
}

const POI_PREFS = [
  { id: 'pubs', icon: '🍺', labelKey: 'wizard.poiPubs', always: true },
  { id: 'landmarks', icon: '🏰', labelKey: 'wizard.poiLandmarks', always: true },
  { id: 'viewpoints', icon: '📸', labelKey: 'wizard.poiViewpoints', always: true },
  { id: 'nature', icon: '🌿', labelKey: 'wizard.poiNature', always: true },
  { id: 'huts', icon: '🏠', labelKey: 'wizard.poiHuts', forActivities: ['skiing', 'skitouring', 'hiking'] },
  { id: 'bikeservice', icon: '🚴', labelKey: 'wizard.poiBikeservice', forActivities: ['cycling', 'mtb'] },
]

const POI_ICONS = { pubs: '🍺', landmarks: '🏰', viewpoints: '📸', nature: '🌿', huts: '🏠', bikeservice: '🚴', generic: '📍' }

function LocationInput({ value, onChange, onSelect, placeholder }) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); return }
    try { const items = await suggestPlace(q); setResults(items.slice(0, 5)); setOpen(true) } catch { setResults([]) }
  }, [])
  function handleChange(e) {
    const q = e.target.value; setQuery(q); onChange?.(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 300)
  }
  function handleSelect(item) { setQuery(item.name); setResults([]); setOpen(false); onSelect(item) }
  return (
    <div className="location-input-wrap">
      <input className="form-input" type="text" value={query} onChange={handleChange} placeholder={placeholder}
        onFocus={() => results.length > 0 && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {open && results.length > 0 && (
        <div className="location-dropdown">
          {results.map((r, i) => (
            <button key={i} className="location-option" onMouseDown={() => handleSelect(r)}>
              <span className="location-option-name">{r.name}</span>
              {r.label && <span className="location-option-label">{r.label}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m} min`
}

// ── Main Wizard ──────────────────────────────────────────────

export default function RouteWizardScreen({ onRouteGenerated }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [step, setStep] = useState(0) // 0 = mode select
  const [mode, setMode] = useState(null) // 'surprise' | 'manual'

  const [seasonalEvent, setSeasonalEvent] = useState(null)
  const [activity, setActivity] = useState(null)
  const [startLocation, setStartLocation] = useState(null)
  const [endLocation, setEndLocation] = useState(null)
  const [isLoop, setIsLoop] = useState(true)
  const [distanceKm, setDistanceKm] = useState(null)
  const [difficulty, setDifficulty] = useState(null)
  const [challengeCount, setChallengeCount] = useState(5)
  const [challengeTypes, setChallengeTypes] = useState(['quiz', 'photo'])
  const [poiPrefs, setPoiPrefs] = useState(['pubs', 'landmarks', 'viewpoints', 'nature'])

  // POI picker state (fetched in background when step 4 completes)
  const [fetchedPOIs, setFetchedPOIs] = useState(null) // null = not fetched, [] = empty
  const [selectedPOIIds, setSelectedPOIIds] = useState(new Set())
  const [poiFetching, setPoiFetching] = useState(false)

  // Step 6 state
  const [generating, setGenerating] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [generatedRoute, setGeneratedRoute] = useState(null)
  const [genError, setGenError] = useState(null)

  const mapContainer = useRef(null)
  const mapRef = useRef(null)

  function next() { setStep((s) => Math.min(s + 1, TOTAL_STEPS)) }
  function back() {
    if (step === 6) { setGeneratedRoute(null); setGenError(null); setGenerating(false) }
    setStep((s) => Math.max(s - 1, 0))
  }

  async function useMyLocation() {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const results = await suggestPlace(`${pos.coords.latitude},${pos.coords.longitude}`, pos.coords.latitude, pos.coords.longitude, 500)
          const loc = results[0] ?? { name: 'Moje poloha', lat: pos.coords.latitude, lng: pos.coords.longitude }
          setStartLocation(loc); resolve(loc)
        },
        () => resolve(null), { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  function toggleChallengeType(type) { setChallengeTypes((p) => p.includes(type) ? p.filter((t) => t !== type) : [...p, type]) }
  function togglePoiPref(id) { setPoiPrefs((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) }

  function togglePOI(idx) {
    setSelectedPOIIds((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Seasonal event banner
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    supabase.from('seasonal_events').select('*').lte('active_from', today).gte('active_to', today).limit(1)
      .then(({ data }) => { if (data?.[0]) setSeasonalEvent(data[0]) })
  }, [])

  // Background POI fetch: trigger when difficulty is selected (entering step 5)
  useEffect(() => {
    if (step !== 5 || !startLocation || !distanceKm || fetchedPOIs !== null) return
    let cancelled = false
    async function fetchPOIs() {
      setPoiFetching(true)
      try {
        const pois = await searchPOIsPublic(startLocation.lat, startLocation.lng, distanceKm, isLoop, poiPrefs)
        if (!cancelled) {
          setFetchedPOIs(pois)
          // Pre-select best POIs up to challengeCount
          const preselect = new Set()
          for (let i = 0; i < Math.min(pois.length, challengeCount); i++) preselect.add(i)
          setSelectedPOIIds(preselect)
        }
      } catch {
        if (!cancelled) setFetchedPOIs([])
      }
      if (!cancelled) setPoiFetching(false)
    }
    fetchPOIs()
    return () => { cancelled = true }
  }, [step, startLocation, distanceKm])

  // Re-fetch if preferences change on step 5
  useEffect(() => {
    if (step !== 5 || !startLocation || !distanceKm) return
    setFetchedPOIs(null) // triggers the fetch effect above
  }, [poiPrefs.join(',')])

  // Step 6: Generate route
  useEffect(() => {
    if (step !== 6 || generatedRoute || generating) return
    let cancelled = false
    async function run() {
      setGenerating(true); setGenError(null)
      try {
        // Pass user-selected POIs if available
        const manualPOIs = fetchedPOIs && selectedPOIIds.size > 0
          ? [...selectedPOIIds].map((i) => fetchedPOIs[i]).filter(Boolean)
          : undefined
        const result = await generateRoute({
          activity, startLat: startLocation.lat, startLng: startLocation.lng, startName: startLocation.name,
          endLat: isLoop ? startLocation.lat : endLocation?.lat, endLng: isLoop ? startLocation.lng : endLocation?.lng,
          isLoop, distanceKm, difficulty, challengeCount, challengeTypes, poiPreferences: poiPrefs,
          userId: user?.id, manualPOIs,
          onProgress: (stage) => {
            if (cancelled) return
            const msgs = { searching: t('wizard.progSearching'), planning: t('wizard.progPlanning'), challenges: t('wizard.progChallenges'), saving: t('wizard.progSaving'), done: t('wizard.progDone') }
            setProgressMsg(msgs[stage] ?? '')
          },
        })
        if (!cancelled) setGeneratedRoute(result)
      } catch (e) { if (!cancelled) setGenError(e.message) }
      if (!cancelled) setGenerating(false)
    }
    run()
    return () => { cancelled = true }
  }, [step])

  // Step 6: Preview map — show ONLY first segment + grayed markers
  useEffect(() => {
    if (!generatedRoute || !mapContainer.current) return
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

    const geo = typeof generatedRoute.routeGeometry === 'string' ? JSON.parse(generatedRoute.routeGeometry) : generatedRoute.routeGeometry
    const allCoords = geo?.coordinates ?? geo?.geometry?.coordinates ?? []
    if (allCoords.length < 2) return

    // Find first challenge coord to split first segment
    const ch0 = generatedRoute.challenges[0]
    let firstSegEnd = Math.min(Math.floor(allCoords.length / (generatedRoute.challenges.length + 1)), allCoords.length - 1)
    if (ch0?.lat && ch0?.lng) {
      let minD = Infinity
      allCoords.forEach((c, i) => { const d = haversineDistance(c, [ch0.lng, ch0.lat]); if (d < minD) { minD = d; firstSegEnd = i } })
    }
    const firstSeg = allCoords.slice(0, firstSegEnd + 1)
    const center = firstSeg[Math.floor(firstSeg.length / 2)] ?? allCoords[0]
    const mapset = ['skiing', 'skitouring'].includes(activity) ? 'winter' : 'outdoor'

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: { version: 8, sources: { mapy: { type: 'raster', url: `https://api.mapy.cz/v1/maptiles/${mapset}/tiles.json?apikey=${API_KEY}`, tileSize: 256, attribution: '© Mapy.cz' } }, layers: [{ id: 'base', type: 'raster', source: 'mapy' }] },
      center, zoom: 13,
    })

    map.on('load', () => {
      // Only first segment as green line
      map.addSource('first-seg', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: firstSeg } } })
      map.addLayer({ id: 'first-seg-line', type: 'line', source: 'first-seg', paint: { 'line-color': '#4ade80', 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })

      // Challenge markers: first = bright, rest = grayed
      generatedRoute.challenges.forEach((ch, i) => {
        if (!ch.lat || !ch.lng) return
        const el = document.createElement('div')
        el.className = i === 0 ? 'ch-marker ch-marker--next' : 'ch-marker ch-marker--locked'
        el.innerHTML = i === 0 ? `<span class="ch-marker-num">1</span>` : `<span class="ch-marker-num" style="opacity:0.5">${i + 1}</span>`
        new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([ch.lng, ch.lat]).addTo(map)
      })

      if (firstSeg.length >= 2) {
        const bounds = firstSeg.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(firstSeg[0], firstSeg[0]))
        map.fitBounds(bounds, { padding: 40 })
      }
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [generatedRoute])

  function StepIndicator() {
    return (
      <div className="wiz-steps">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i} className={`wiz-step-dot ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}`}>{i + 1}</div>
        ))}
      </div>
    )
  }

  return (
    <div className="wizard-screen">
      {step > 0 && (
        <div className="wiz-header">
          {step > 1 && <button className="wiz-back" onClick={back}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button>}
          <StepIndicator />
        </div>
      )}

      <div className="wiz-body">
        {/* ── Step 0: Mode Selection ───────────────── */}
        {step === 0 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.modeTitle')}</h2>
            <div className="wiz-mode-grid">
              <button className="wiz-mode-card" onClick={() => { setMode('manual'); setStep(1) }}>
                <span className="wiz-mode-icon">🗺</span>
                <strong>{t('wizard.modeCustom')}</strong>
                <p className="wiz-mode-desc">{t('wizard.modeCustomDesc')}</p>
              </button>
              <button className="wiz-mode-card" onClick={() => { setMode('surprise'); setStep(1) }}>
                <span className="wiz-mode-icon">🎲</span>
                <strong>{t('wizard.modeSurprise')}</strong>
                <p className="wiz-mode-desc">{t('wizard.modeSurpriseDesc')}</p>
              </button>
            </div>
          </div>
        )}

        {step >= 1 && seasonalEvent && (
          <div className="seasonal-banner">
            <span>{seasonalEvent.emoji ?? '🎉'} <strong>{seasonalEvent.name}</strong> — {seasonalEvent.description}</span>
            <button className="seasonal-close" onClick={() => setSeasonalEvent(null)}>×</button>
          </div>
        )}
        {/* Step 1 */}
        {step === 1 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step1Title')}</h2>
            <div className="wiz-activity-grid">
              {ACTIVITIES.map((a) => (
                <button key={a.id} className={`wiz-activity-btn ${activity === a.id ? 'selected' : ''}`} onClick={() => { setActivity(a.id); next() }}>
                  <span className="wiz-activity-icon">{a.icon}</span>
                  <span className="wiz-activity-label">{t(a.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step2Title')}</h2>
            <button className="btn-primary wiz-gps-btn" onClick={async () => { const loc = await useMyLocation(); if (loc) next() }}>📍 {t('wizard.useMyLocation')}</button>
            <div className="wiz-or">{t('wizard.or')}</div>
            <LocationInput value={startLocation} onChange={() => {}} onSelect={(loc) => setStartLocation(loc)} placeholder={t('wizard.searchStart')} />
            <div className="wiz-loop-toggle">
              <button className={`wiz-toggle-btn ${isLoop ? 'active' : ''}`} onClick={() => setIsLoop(true)}>⟳ {t('wizard.loop')}</button>
              <button className={`wiz-toggle-btn ${!isLoop ? 'active' : ''}`} onClick={() => setIsLoop(false)}>→ {t('wizard.pointToPoint')}</button>
            </div>
            {!isLoop && <LocationInput value={endLocation} onChange={() => {}} onSelect={(loc) => setEndLocation(loc)} placeholder={t('wizard.searchEnd')} />}
            <button className="btn-primary" onClick={next} disabled={!startLocation || (!isLoop && !endLocation)}>{t('wizard.next')}</button>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step3Title')}</h2>
            <div className="wiz-option-grid">
              {(DISTANCE_OPTIONS[activity] ?? DISTANCE_OPTIONS.hiking).map((km, idx, arr) => (
                <button key={km} className={`wiz-option-btn ${distanceKm === km ? 'selected' : ''}`} onClick={() => { setDistanceKm(km); next() }}>
                  {idx === arr.length - 1 ? `${DISTANCE_OVERFLOW[activity] ?? 20}+ km` : `${t('wizard.upTo')} ${km} km`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step4Title')}</h2>
            <div className="wiz-diff-list">
              {(DIFFICULTY_OPTIONS[activity] ?? DIFFICULTY_OPTIONS.hiking).map((d) => (
                <button key={d.id} className={`wiz-diff-btn ${difficulty === d.id ? 'selected' : ''}`} onClick={() => { setDifficulty(d.id); next() }}>
                  <span className="wiz-diff-emoji">{d.emoji}</span>
                  <div><div className="wiz-diff-label">{t(d.labelKey)}</div><div className="wiz-diff-desc">{t(d.descKey)}</div></div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Challenges + POI picker */}
        {step === 5 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step5Title')}</h2>

            <div className="wiz-section">
              <h3 className="wiz-section-label">{t('wizard.howManyStops')}</h3>
              <div className="wiz-count-row">
                {[3, 5, 7].map((n) => (
                  <button key={n} className={`wiz-count-btn ${challengeCount === n ? 'selected' : ''}`} onClick={() => setChallengeCount(n)}>{n}</button>
                ))}
                <input type="number" className="wiz-count-input" min={1} max={10} value={challengeCount}
                  onChange={(e) => setChallengeCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
              </div>
            </div>

            <div className="wiz-section">
              <h3 className="wiz-section-label">{t('wizard.challengeTypes')}</h3>
              <div className="wiz-chip-row">
                {[{ id: 'quiz', icon: '🧠', label: t('wizard.typeQuiz') }, { id: 'photo', icon: '📸', label: t('wizard.typePhoto') }, { id: 'mix', icon: '🎲', label: t('wizard.typeMix') }].map((ct) => (
                  <button key={ct.id} className={`wiz-chip ${challengeTypes.includes(ct.id) ? 'selected' : ''}`} onClick={() => toggleChallengeType(ct.id)}>{ct.icon} {ct.label}</button>
                ))}
              </div>
            </div>

            <div className="wiz-section">
              <h3 className="wiz-section-label">{t('wizard.poiPrefs')}</h3>
              <div className="wiz-poi-list">
                {POI_PREFS.filter((p) => p.always || p.forActivities?.includes(activity)).map((p) => (
                  <label key={p.id} className="wiz-poi-check">
                    <input type="checkbox" checked={poiPrefs.includes(p.id)} onChange={() => togglePoiPref(p.id)} />
                    <span>{p.icon} {t(p.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* POI picker */}
            <div className="wiz-section">
              <h3 className="wiz-section-label">{t('wizard.foundPlaces')}</h3>
              {poiFetching && <div className="wiz-poi-skeleton"><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" /></div>}
              {fetchedPOIs && fetchedPOIs.length === 0 && <p className="wiz-poi-empty">{t('wizard.noPlacesFound')}</p>}
              {fetchedPOIs && fetchedPOIs.length > 0 && (
                <>
                  <div className="wiz-poi-picker">
                    {fetchedPOIs.map((poi, i) => {
                      const dist = startLocation ? haversineDistance([startLocation.lng, startLocation.lat], [poi.lng, poi.lat]) : 0
                      return (
                        <label key={i} className={`wiz-poi-pick-row ${selectedPOIIds.has(i) ? 'selected' : ''}`}>
                          <input type="checkbox" checked={selectedPOIIds.has(i)} onChange={() => togglePOI(i)} />
                          <span className="wiz-poi-pick-icon">{POI_ICONS[poi.poiType] ?? '📍'}</span>
                          <span className="wiz-poi-pick-name">{poi.name}</span>
                          <span className="wiz-poi-pick-dist">{(dist / 1000).toFixed(1)} km</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="wiz-poi-pick-count">
                    {t('wizard.selected')}: {selectedPOIIds.size} {t('wizard.stops')}
                    {selectedPOIIds.size > challengeCount && <span className="wiz-poi-warn"> — {t('wizard.tooMany', { n: challengeCount })}</span>}
                  </p>
                </>
              )}
            </div>

            <button className="btn-primary" onClick={next}>{t('wizard.generate')}</button>
          </div>
        )}

        {/* Step 6: Preview */}
        {step === 6 && (
          <div className="wiz-step wiz-step-preview">
            {generating && <div className="wiz-loading"><div className="wiz-loading-spinner" /><p className="wiz-loading-msg">{progressMsg}</p></div>}
            {genError && <div className="wiz-error"><p>{genError}</p><button className="btn-primary" onClick={() => { setGenError(null); setGenerating(false); setGeneratedRoute(null) }}>{t('wizard.retry')}</button></div>}
            {generatedRoute && (
              <>
                <div ref={mapContainer} className="wiz-preview-map" />
                <p className="wiz-lock-hint">🔒 {t('wizard.lockHint')}</p>

                <div className="wiz-route-stats">
                  <span>📏 {(generatedRoute.routeLength / 1000).toFixed(1)} km</span>
                  <span>⏱ {formatDuration(generatedRoute.routeDuration)}</span>
                  {generatedRoute.route.elevation_gain_m > 0 && <span>↗ {generatedRoute.route.elevation_gain_m} m</span>}
                  <span className={`wiz-diff-tag diff-${difficulty}`}>{difficulty}</span>
                </div>

                <div className="wiz-challenge-list">
                  {generatedRoute.challenges.map((ch, i) => (
                    <details key={i} className="wiz-challenge-row-detail">
                      <summary className="wiz-challenge-row">
                        <span className="wiz-ch-num">{i + 1}</span>
                        <span className="wiz-ch-name">{ch.title}</span>
                        <span className="wiz-ch-icon">{POI_ICONS[ch.poi_type] ?? '⭐'}</span>
                      </summary>
                      <p className="wiz-ch-preview">{ch.description}</p>
                    </details>
                  ))}
                </div>

                <div className="wiz-preview-actions">
                  <button className="btn-secondary" onClick={() => { setStep(5); setGeneratedRoute(null) }}>← {t('wizard.edit')}</button>
                  <button className="btn-primary wiz-start-btn" onClick={() => onRouteGenerated(generatedRoute)}>🚀 {t('wizard.startAdventure')}</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
