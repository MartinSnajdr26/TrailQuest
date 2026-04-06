import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { suggestPlace, generateRoute, searchPOIsPublic, getCategoryEmoji } from '../lib/routeGenerator.js'
import { haversineDistance } from '../lib/geo.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import ElevationProfile from '../components/ElevationProfile.jsx'
import RouteStats, { formatDuration } from '../components/RouteStats.jsx'

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

// formatDuration imported from RouteStats

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
  const [fetchedPOIs, setFetchedPOIs] = useState(null)
  const [selectedPOIIds, setSelectedPOIIds] = useState(new Set())
  const [poiFetching, setPoiFetching] = useState(false)

  // Manual mode state
  const [manualStep, setManualStep] = useState('search') // 'search' | 'settings'
  const [manualSearch, setManualSearch] = useState('')
  const [manualCategory, setManualCategory] = useState('')
  const [manualResults, setManualResults] = useState([])
  const [manualSelected, setManualSelected] = useState([]) // ordered POI list
  const [manualSearching, setManualSearching] = useState(false)
  const [userLat, setUserLat] = useState(null)
  const [userLng, setUserLng] = useState(null)
  const manualDebounceRef = useRef(null)

  // Step 6 state — 3 variants
  const [generating, setGenerating] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [variants, setVariants] = useState([]) // up to 3 generated routes
  const [activeVariant, setActiveVariant] = useState(0)
  const [genError, setGenError] = useState(null)
  const generatedRoute = variants[activeVariant] ?? null

  // Stop editor
  const [editingStopIdx, setEditingStopIdx] = useState(null)
  const [stopAlternatives, setStopAlternatives] = useState([])
  const [stopSearchQuery, setStopSearchQuery] = useState('')
  const [stopSearching, setStopSearching] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const mapContainer = useRef(null)
  const mapRef = useRef(null)

  function next() { setStep((s) => Math.min(s + 1, TOTAL_STEPS)) }
  function back() {
    if (step === 6) { setVariants([]); setGenError(null); setGenerating(false) }
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

  // ── Manual mode: POI search ────────────────────────────────

  // Get user GPS on manual mode start
  useEffect(() => {
    if (mode !== 'manual' || userLat) return
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude) },
      () => {}, { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [mode])

  async function searchManualPOIs(query, category) {
    setManualSearching(true)
    let results = []
    // 1. Search custom DB
    let q = supabase.from('custom_pois').select('*').eq('is_approved', true).eq('is_active', true)
    if (query.length > 1) q = q.ilike('name', `%${query}%`)
    if (category) q = q.eq('poi_category', category)
    const { data: dbResults } = await q.limit(20)
    results = (dbResults ?? []).map((p) => ({
      id: p.id, name: p.name, description: p.description, category: p.poi_category,
      lat: p.gps_lat, lng: p.gps_lng, quality: p.quality_score, source: 'db',
      distanceKm: userLat ? (haversineDistance([userLng, userLat], [p.gps_lng, p.gps_lat]) / 1000).toFixed(1) : '?',
    }))
    // 2. Supplement with Mapy.com suggest
    if (query.length > 2) {
      try {
        const items = await suggestPlace(query, userLat, userLng)
        const mapyR = items.map((item) => ({
          id: `mapy_${item.name}_${item.lat}`, name: item.name, description: item.label, category: 'other',
          lat: item.lat, lng: item.lng, quality: 5, source: 'mapy',
          distanceKm: userLat ? (haversineDistance([userLng, userLat], [item.lng, item.lat]) / 1000).toFixed(1) : '?',
        }))
        results = [...results, ...mapyR]
      } catch { /* ignore */ }
    }
    results.sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm))
    setManualResults(results)
    setManualSearching(false)
  }

  function handleManualSearchChange(e) {
    const v = e.target.value
    setManualSearch(v)
    if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current)
    manualDebounceRef.current = setTimeout(() => searchManualPOIs(v, manualCategory), 300)
  }

  function handleManualCategoryTap(cat) {
    const next = manualCategory === cat ? '' : cat
    setManualCategory(next)
    searchManualPOIs(manualSearch, next)
  }

  function addManualPOI(poi) {
    if (manualSelected.some((p) => p.id === poi.id)) return
    setManualSelected((prev) => [...prev, poi])
  }

  function removeManualPOI(id) {
    setManualSelected((prev) => prev.filter((p) => p.id !== id))
  }

  function moveManualPOI(idx, dir) {
    setManualSelected((prev) => {
      const arr = [...prev]
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= arr.length) return arr
      ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
      return arr
    })
  }

  // Load default nearby POIs when entering manual mode
  useEffect(() => {
    if (mode === 'manual' && manualResults.length === 0 && userLat) {
      searchManualPOIs('', '')
    }
  }, [mode, userLat])
  function togglePoiPref(id) { setPoiPrefs((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) }

  function togglePOI(idx) {
    setSelectedPOIIds((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Auto-skip step 4 (difficulty removed)
  useEffect(() => { if (step === 4) setStep(5) }, [step])

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

  // Build generation params (reusable for regeneration)
  function getGenParams(poiOverride) {
    const pois = poiOverride ?? (mode === 'manual' && manualSelected.length > 0
      ? manualSelected
      : (fetchedPOIs && selectedPOIIds.size > 0 ? [...selectedPOIIds].map((i) => fetchedPOIs[i]).filter(Boolean) : undefined))
    return {
      activity: activity ?? 'hiking',
      startLat: startLocation?.lat ?? (manualSelected[0]?.lat ?? userLat ?? 50.08),
      startLng: startLocation?.lng ?? (manualSelected[0]?.lng ?? userLng ?? 14.42),
      startName: startLocation?.name ?? manualSelected[0]?.name ?? 'Start',
      endLat: isLoop ? undefined : endLocation?.lat,
      endLng: isLoop ? undefined : endLocation?.lng,
      isLoop, distanceKm: distanceKm ?? 10,
      challengeCount: pois?.length ?? challengeCount, challengeTypes, poiPreferences: poiPrefs,
      userId: user?.id, manualPOIs: pois,
    }
  }

  // Step 6: Generate 3 variants in parallel
  useEffect(() => {
    if (step !== 6 || variants.length > 0 || generating) return
    let cancelled = false
    async function run() {
      setGenerating(true); setGenError(null); setVariants([]); setActiveVariant(0)
      setProgressMsg(t('wizard.progVariants'))

      const base = getGenParams()

      // Generate 3 variants (different POI preferences rotations)
      const prefs = base.poiPreferences ?? []
      const configs = [
        { ...base, onProgress: (s) => !cancelled && setProgressMsg(t(`wizard.prog${s === 'done' ? 'Done' : 'Planning'}`) + ' (A)') },
        { ...base, poiPreferences: [...prefs.slice(1), prefs[0]].filter(Boolean), onProgress: () => {} },
        { ...base, poiPreferences: [...prefs].reverse(), onProgress: () => {} },
      ]

      // For manual mode: A=user order, B=optimized, C=reversed
      if (base.manualPOIs?.length > 1) {
        configs[0].manualPOIs = base.manualPOIs
        configs[1].manualPOIs = base.manualPOIs // optimizer will reorder
        configs[2].manualPOIs = [...base.manualPOIs].reverse()
      }

      const results = await Promise.allSettled(configs.map((c) => generateRoute(c)))
      if (cancelled) return

      const successful = results.filter((r) => r.status === 'fulfilled').map((r) => r.value).filter(Boolean)
      if (successful.length === 0) {
        setGenError(t('error.generic'))
      } else {
        setVariants(successful)
      }
      setGenerating(false)
    }
    run()
    return () => { cancelled = true }
  }, [step])

  // ── Stop editor functions ──────────────────────────────────

  async function openStopEditor(idx) {
    setEditingStopIdx(idx); setStopSearchQuery(''); setStopAlternatives([])
    setStopSearching(true)
    const ch = generatedRoute?.challenges?.[idx]
    if (!ch) return
    // Load nearby alternatives from DB
    const { data } = await supabase.from('custom_pois').select('*').eq('is_approved', true).eq('is_active', true)
      .gte('gps_lat', ch.lat - 0.08).lte('gps_lat', ch.lat + 0.08)
      .gte('gps_lng', ch.lng - 0.08).lte('gps_lng', ch.lng + 0.08)
      .order('quality_score', { ascending: false }).limit(8)
    setStopAlternatives((data ?? []).filter((p) => p.id !== ch.id?.replace?.('gen-', '')).map((p) => ({
      id: p.id, name: p.name, lat: p.gps_lat, lng: p.gps_lng, category: p.poi_category, quality: p.quality_score,
    })))
    setStopSearching(false)
  }

  async function searchStopAlternatives(query) {
    if (query.length < 2) return
    setStopSearching(true)
    const items = await suggestPlace(query, startLocation?.lat, startLocation?.lng)
    setStopAlternatives(items.slice(0, 6).map((p) => ({ id: `mapy_${p.name}`, name: p.name, lat: p.lat, lng: p.lng, category: 'other', quality: 5 })))
    setStopSearching(false)
  }

  async function swapStop(newPoi) {
    if (editingStopIdx == null || !generatedRoute) return
    setRegenerating(true)
    const newChallenges = [...generatedRoute.challenges]
    newChallenges[editingStopIdx] = { ...newChallenges[editingStopIdx], title: newPoi.name, lat: newPoi.lat, lng: newPoi.lng, poi_type: newPoi.category }
    // Regenerate route with new waypoints
    try {
      const pois = newChallenges.map((c) => ({ name: c.title, lat: c.lat, lng: c.lng, poiType: c.poi_type }))
      const result = await generateRoute({ ...getGenParams(pois) })
      setVariants((prev) => { const next = [...prev]; next[activeVariant] = result; return next })
    } catch (e) { console.warn('Regen failed:', e) }
    setEditingStopIdx(null); setRegenerating(false)
  }

  async function reorderStop(fromIdx, dir) {
    if (!generatedRoute) return
    const challenges = [...generatedRoute.challenges]
    const toIdx = fromIdx + dir
    if (toIdx < 0 || toIdx >= challenges.length) return
    ;[challenges[fromIdx], challenges[toIdx]] = [challenges[toIdx], challenges[fromIdx]]
    setRegenerating(true)
    try {
      const pois = challenges.map((c) => ({ name: c.title, lat: c.lat, lng: c.lng, poiType: c.poi_type }))
      const result = await generateRoute({ ...getGenParams(pois) })
      setVariants((prev) => { const next = [...prev]; next[activeVariant] = result; return next })
    } catch (e) { console.warn('Reorder regen failed:', e) }
    setRegenerating(false)
  }

  async function refreshAllStops() {
    setRegenerating(true); setVariants([]); setActiveVariant(0)
    try {
      const result = await generateRoute({ ...getGenParams(undefined), onProgress: (s) => setProgressMsg(s) })
      setVariants([result])
    } catch (e) { setGenError(e.message) }
    setRegenerating(false)
  }

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
        {/* Step 1 — Activity (surprise) OR POI search (manual) */}
        {step === 1 && mode === 'manual' && manualStep === 'search' && (
          <div className="wiz-step">
            <h2 className="wiz-title">🗺 {t('wizard.manualSearchTitle')}</h2>

            {/* Search input */}
            <input className="form-input" type="text" placeholder={`🔍 ${t('wizard.manualSearchPh')}`}
              value={manualSearch} onChange={handleManualSearchChange} />

            {/* Category pills */}
            <div className="wiz-chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {[
                { id: 'minipivovar', icon: '🍺' }, { id: 'pamatnik', icon: '🏰' }, { id: 'vyhlidka', icon: '👁' },
                { id: 'studanka', icon: '💧' }, { id: 'horska_chata', icon: '🏠' }, { id: 'vinna_sklep', icon: '🍷' },
                { id: 'kaplička', icon: '⛪' },
              ].map((c) => (
                <button key={c.id} className={`wiz-chip ${manualCategory === c.id ? 'selected' : ''}`}
                  onClick={() => handleManualCategoryTap(c.id)} style={{ flexShrink: 0 }}>
                  {c.icon} {c.id}
                </button>
              ))}
            </div>

            {/* Results */}
            <div className="manual-results">
              {manualSearching && <div className="wiz-loading-msg">🔍...</div>}
              {!manualSearching && manualResults.length === 0 && manualSearch.length > 1 && (
                <p className="wiz-poi-empty">{t('wizard.noPlacesFound')}</p>
              )}
              {manualResults.map((poi) => {
                const isAdded = manualSelected.some((p) => p.id === poi.id)
                return (
                  <div key={poi.id} className="manual-result-row">
                    <span className="manual-result-icon">{POI_ICONS[poi.category] ?? '📍'}</span>
                    <div className="manual-result-info">
                      <span className="manual-result-name">{poi.name}</span>
                      {poi.description && <span className="manual-result-desc">{poi.description.slice(0, 60)}</span>}
                    </div>
                    <span className="manual-result-dist">{poi.distanceKm} km</span>
                    <button className={`manual-add-btn ${isAdded ? 'added' : ''}`} onClick={() => isAdded ? removeManualPOI(poi.id) : addManualPOI(poi)}>
                      {isAdded ? '✓' : '+'}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Selected list */}
            {manualSelected.length > 0 && (
              <div className="manual-selected">
                <h3 className="wiz-section-label">{t('wizard.manualSelectedLabel')} ({manualSelected.length})</h3>
                {manualSelected.map((poi, i) => (
                  <div key={poi.id} className="manual-selected-row">
                    <span className="manual-selected-order">{i + 1}</span>
                    <span className="manual-selected-icon">{POI_ICONS[poi.category] ?? '📍'}</span>
                    <span className="manual-selected-name">{poi.name}</span>
                    <button className="manual-move-btn" onClick={() => moveManualPOI(i, -1)} disabled={i === 0}>↑</button>
                    <button className="manual-move-btn" onClick={() => moveManualPOI(i, 1)} disabled={i === manualSelected.length - 1}>↓</button>
                    <button className="manual-remove-btn" onClick={() => removeManualPOI(poi.id)}>×</button>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-primary" onClick={() => setManualStep('settings')} disabled={manualSelected.length < 1}>
              {t('wizard.manualContinue')} ({manualSelected.length}) →
            </button>
          </div>
        )}

        {/* Manual mode step 2: settings */}
        {step === 1 && mode === 'manual' && manualStep === 'settings' && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.manualSettingsTitle')}</h2>

            <div className="wiz-section">
              <h3 className="wiz-section-label">{t('wizard.step1Title')}</h3>
              <div className="wiz-activity-grid">
                {ACTIVITIES.map((a) => (
                  <button key={a.id} className={`wiz-activity-btn ${activity === a.id ? 'selected' : ''}`} onClick={() => setActivity(a.id)}>
                    <span className="wiz-activity-icon">{a.icon}</span>
                    <span className="wiz-activity-label">{t(a.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="wiz-loop-toggle">
              <button className={`wiz-toggle-btn ${isLoop ? 'active' : ''}`} onClick={() => setIsLoop(true)}>⟳ {t('wizard.loop')}</button>
              <button className={`wiz-toggle-btn ${!isLoop ? 'active' : ''}`} onClick={() => setIsLoop(false)}>→ {t('wizard.pointToPoint')}</button>
            </div>

            <button className="btn-secondary" onClick={() => setManualStep('search')}>← {t('wizard.manualBackToSearch')}</button>

            <button className="btn-primary" onClick={() => {
              // Use first manual POI as start, generate route
              const start = manualSelected[0]
              if (!start || !activity) return
              setStartLocation({ name: start.name, lat: start.lat, lng: start.lng })
              setChallengeCount(manualSelected.length)
              setDistanceKm(10)
              setDifficulty('medium')
              setStep(6) // jump to generation
            }} disabled={!activity}>
              🚀 {t('wizard.generate')}
            </button>
          </div>
        )}

        {/* Step 1 — Activity (surprise mode only) */}
        {step === 1 && mode !== 'manual' && (
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

        {/* Step 4 removed — skip handled by effect below */}

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

        {/* Step 6: Preview with variants */}
        {step === 6 && (
          <div className="wiz-step wiz-step-preview">
            {generating && <div className="wiz-loading"><div className="wiz-loading-spinner" /><p className="wiz-loading-msg">{progressMsg}</p></div>}
            {genError && !generating && <div className="wiz-error"><p>{genError}</p><button className="btn-primary" onClick={() => { setGenError(null); setVariants([]); setGenerating(false) }}>{t('wizard.retry')}</button></div>}

            {variants.length > 0 && (
              <>
                {/* Variant selector tabs */}
                {variants.length > 1 && (
                  <div className="variant-tabs">
                    {variants.map((v, i) => {
                      const km = ((v.routeLength ?? 0) / 1000).toFixed(1)
                      const icons = (v.challenges ?? []).slice(0, 3).map((c) => POI_ICONS[c.poi_type] ?? '📍').join('')
                      const labels = mode === 'manual' ? [t('wizard.varOriginal'), t('wizard.varOptimized'), t('wizard.varReversed')] : ['A', 'B', 'C']
                      return (
                        <button key={i} className={`variant-tab ${activeVariant === i ? 'active' : ''}`} onClick={() => setActiveVariant(i)}>
                          <span className="variant-tab-label">{labels[i] ?? `${i + 1}`}</span>
                          <span className="variant-tab-stats">{km} km {icons}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {regenerating && <div className="wiz-regen-overlay"><div className="wiz-loading-spinner" /></div>}

                <div ref={mapContainer} className="wiz-preview-map" />
                <p className="wiz-lock-hint">🔒 {t('wizard.lockHint')}</p>

                <RouteStats distanceKm={(generatedRoute?.routeLength ?? 0) / 1000} durationSec={generatedRoute?.routeDuration} ascentM={generatedRoute?.route?.elevation_gain_m} />
                <ElevationProfile geometry={generatedRoute?.routeGeometry} />

                {/* Editable challenge list */}
                <div className="wiz-challenge-list">
                  {(generatedRoute?.challenges ?? []).map((ch, i) => (
                    <div key={i} className="wiz-stop-row">
                      <button className="wiz-stop-move" onClick={() => reorderStop(i, -1)} disabled={i === 0 || regenerating}>↑</button>
                      <button className="wiz-stop-move" onClick={() => reorderStop(i, 1)} disabled={i === (generatedRoute?.challenges?.length ?? 0) - 1 || regenerating}>↓</button>
                      <span className="wiz-ch-num">{i + 1}</span>
                      <span className="wiz-ch-name">{ch.title}</span>
                      <span className="wiz-ch-icon">{POI_ICONS[ch.poi_type] ?? '⭐'}</span>
                      <button className="wiz-stop-edit" onClick={() => openStopEditor(i)}>✏️</button>
                    </div>
                  ))}
                </div>

                <div className="wiz-preview-actions">
                  <button className="btn-secondary" onClick={() => { setStep(5); setVariants([]) }}>← {t('wizard.edit')}</button>
                  <button className="btn-secondary" onClick={refreshAllStops} disabled={regenerating}>🔄 {t('wizard.refreshStops')}</button>
                  <button className="btn-primary wiz-start-btn" onClick={() => onRouteGenerated(generatedRoute)}>🚀 {t('wizard.startAdventure')}</button>
                </div>
              </>
            )}

            {/* Stop editor sheet */}
            {editingStopIdx != null && (
              <div className="stop-editor-overlay" onClick={() => setEditingStopIdx(null)}>
                <div className="stop-editor" onClick={(e) => e.stopPropagation()}>
                  <div className="stop-editor-handle" />
                  <h3 className="stop-editor-title">{t('wizard.changeStop')} {editingStopIdx + 1}</h3>
                  <p className="stop-editor-current">
                    {t('wizard.currentStop')}: {generatedRoute?.challenges?.[editingStopIdx]?.title}
                  </p>

                  <input className="form-input" type="text" placeholder={`🔍 ${t('wizard.searchAlternative')}`}
                    value={stopSearchQuery} onChange={(e) => { setStopSearchQuery(e.target.value); searchStopAlternatives(e.target.value) }} />

                  {stopSearching && <p className="wiz-loading-msg">🔍...</p>}

                  <div className="stop-alt-list">
                    {stopAlternatives.map((alt) => (
                      <button key={alt.id} className="stop-alt-row" onClick={() => swapStop(alt)}>
                        <span>{getCategoryEmoji(alt.category)} {alt.name}</span>
                      </button>
                    ))}
                    {!stopSearching && stopAlternatives.length === 0 && stopSearchQuery.length > 1 && (
                      <p className="wiz-poi-empty">{t('wizard.noPlacesFound')}</p>
                    )}
                  </div>

                  <button className="btn-secondary" onClick={() => setEditingStopIdx(null)}>{t('wizard.cancelEdit')}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
