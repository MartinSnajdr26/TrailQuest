import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { suggestPlace, searchPOIsPublic, getCategoryEmoji } from '../lib/routeGenerator.js'
import { generateSmartRoute, clearPOICache } from '../lib/smartRouteAlgorithm.js'
import { haversineDistance } from '../lib/geo.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import ElevationProfile from '../components/ElevationProfile.jsx'
import RouteStats, { formatDuration } from '../components/RouteStats.jsx'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY
const TOTAL_STEPS = 7

const ACTIVITIES = [
  { id: 'hiking', icon: '🥾', labelKey: 'wizard.hiking' },
  { id: 'skiing', icon: '⛷', labelKey: 'wizard.skiing' },
  { id: 'skitouring', icon: '🎿', labelKey: 'wizard.skitouring' },
  { id: 'cycling', icon: '🚴', labelKey: 'wizard.cycling' },
  { id: 'mtb', icon: '🚵', labelKey: 'wizard.mtb' },
]

const DISTANCE_OPTIONS = {
  hiking: [5, 10, 15, 20], skiing: [5, 10, 15, 20], skitouring: [5, 10, 15, 20],
  cycling: [10, 20, 40, 60], mtb: [10, 20, 40, 60],
}
const ACTIVITY_SPEED = { hiking: 3.5, crosscountry: 8, skitouring: 2.5, skiing: 8, cycling: 18, mtb: 12 }

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
  const [step, setStep] = useState(0) // 0 = experience type, 1 = mode select, ...
  const [experienceType, setExperienceType] = useState(null) // 'quiz'|'tasks'|'rebus'|'mix'
  const [mode, setMode] = useState(null) // 'surprise' | 'manual'

  const [seasonalEvent, setSeasonalEvent] = useState(null)
  const [activity, setActivity] = useState(null)
  const [startLocation, setStartLocation] = useState(null)
  const [endLocation, setEndLocation] = useState(null)
  const [isLoop, setIsLoop] = useState(true)
  const [distanceKm, setDistanceKm] = useState(null)
  const [isCustomDist, setIsCustomDist] = useState(false)
  const [customDist, setCustomDist] = useState(10)
  const selectedDistance = isCustomDist ? customDist : distanceKm

  function estimateTime(km) {
    if (!km || !activity) return ''
    const speed = ACTIVITY_SPEED[activity] ?? 3.5
    const hours = km / speed
    const h = Math.floor(hours), m = Math.round((hours - h) * 60)
    if (h === 0) return `~${m} min`
    if (m === 0) return `~${h} hod`
    return `~${h} hod ${m} min`
  }

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

  // Start point
  const [startMode, setStartMode] = useState('gps') // 'gps' | 'custom'
  const [customStartName, setCustomStartName] = useState('')
  const [customStartLat, setCustomStartLat] = useState(null)
  const [customStartLng, setCustomStartLng] = useState(null)
  const [locSearchQuery, setLocSearchQuery] = useState('')
  const [locResults, setLocResults] = useState([])
  const locDebounceRef = useRef(null)

  // Preview toggle
  const [showFullRoute, setShowFullRoute] = useState(false)

  // Step 7 state — variants
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

  // Step 4 (difficulty) was removed — skip it in both directions
  // Steps: 0=experience, 1=mode, 2=activity, 3=location, 4=distance, 5=skip(difficulty), 6=challenges, 7=preview
  function next() { setStep((s) => { const n = Math.min(s + 1, TOTAL_STEPS); return n === 5 ? 6 : n }) }
  function back() {
    if (step === 7) { setVariants([]); setGenError(null); setGenerating(false) }
    setStep((s) => { const n = Math.max(s - 1, 0); return n === 5 ? 4 : n })
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

  // Location search for custom start point
  function searchLocation(query) {
    if (query.length < 2) { setLocResults([]); return }
    if (locDebounceRef.current) clearTimeout(locDebounceRef.current)
    locDebounceRef.current = setTimeout(async () => {
      try {
        const items = await suggestPlace(query, 49.8, 15.5, undefined)
        setLocResults(items.slice(0, 5))
      } catch { setLocResults([]) }
    }, 350)
  }

  // Effective start coordinates (GPS or custom)
  const effectiveStartLat = startMode === 'custom' && customStartLat ? customStartLat : (startLocation?.lat ?? userLat)
  const effectiveStartLng = startMode === 'custom' && customStartLng ? customStartLng : (startLocation?.lng ?? userLng)
  const effectiveStartName = startMode === 'custom' && customStartName ? customStartName : (startLocation?.name ?? 'Start')

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

  // Step 5 (difficulty) removed — skip handled in next()/back()

  // Save wizard state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('tq_wizard', JSON.stringify({ mode, activity, distanceKm, isCustomDist, customDist, isLoop, challengeCount, challengeTypes, poiPrefs }))
  }, [mode, activity, distanceKm, isCustomDist, customDist, isLoop, challengeCount, challengeTypes, poiPrefs])

  // Seasonal event banner
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    supabase.from('seasonal_events').select('*').lte('active_from', today).gte('active_to', today).limit(1)
      .then(({ data }) => { if (data?.[0]) setSeasonalEvent(data[0]) })
  }, [])

  // Background POI fetch: trigger when difficulty is selected (entering step 5)
  useEffect(() => {
    if (step !== 6 || !startLocation || !distanceKm || fetchedPOIs !== null) return
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
    if (step !== 6 || !startLocation || !distanceKm) return
    setFetchedPOIs(null) // triggers the fetch effect above
  }, [poiPrefs.join(',')])

  // Build generation params (reusable for regeneration)
  function getGenParams(poiOverride) {
    const pois = poiOverride ?? (mode === 'manual' && manualSelected.length > 0
      ? manualSelected
      : (fetchedPOIs && selectedPOIIds.size > 0 ? [...selectedPOIIds].map((i) => fetchedPOIs[i]).filter(Boolean) : undefined))
    return {
      activity: activity ?? 'hiking',
      startLat: effectiveStartLat ?? (manualSelected[0]?.lat ?? 50.08),
      startLng: effectiveStartLng ?? (manualSelected[0]?.lng ?? 14.42),
      startName: effectiveStartName ?? manualSelected[0]?.name ?? 'Start',
      endLat: isLoop ? undefined : endLocation?.lat,
      endLng: isLoop ? undefined : endLocation?.lng,
      isLoop, distanceKm: selectedDistance ?? 10,
      challengeCount: pois?.length ?? challengeCount, challengeTypes, poiPreferences: poiPrefs,
      userId: user?.id, manualPOIs: pois,
    }
  }

  // Step 6: Generate 2 themed variants via smart algorithm
  useEffect(() => {
    if (step !== 7 || variants.length > 0 || generating) return
    let cancelled = false
    async function run() {
      setGenerating(true); setGenError(null); setVariants([]); setActiveVariant(0)

      const base = {
        mode, activity: activity ?? 'hiking', experienceType: experienceType ?? 'mix',
        startLat: startLocation?.lat ?? (manualSelected[0]?.lat ?? userLat ?? 50.08),
        startLng: startLocation?.lng ?? (manualSelected[0]?.lng ?? userLng ?? 14.42),
        startName: startLocation?.name ?? manualSelected[0]?.name ?? 'Start',
        endLat: isLoop ? undefined : endLocation?.lat, endLng: isLoop ? undefined : endLocation?.lng,
        isLoop, distanceKm: selectedDistance ?? 10,
        challengeCount: (mode === 'manual' && manualSelected.length > 0) ? manualSelected.length : challengeCount,
        manualPOIs: mode === 'manual' ? manualSelected : undefined,
        dryRun: true, userId: user?.id,
        anthropicKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
      }

      // Manual mode: single route
      if (base.manualPOIs?.length > 0) {
        setProgressMsg(t('wizard.progPlanning'))
        const result = await generateSmartRoute({ ...base, onProgress: (m) => !cancelled && setProgressMsg(m) }).catch(() => null)
        if (!cancelled) { if (result) setVariants([result]); else setGenError(t('error.generic')); setGenerating(false) }
        return
      }

      // Auto mode: 2 themed variants
      setProgressMsg('🍺 ' + t('wizard.progFoodDrink'))
      const varA = await generateSmartRoute({
        ...base, variantSeed: 0, variantTheme: 'food_drink',
        onProgress: (m) => { if (!cancelled) setProgressMsg(m) },
      }).catch((e) => { console.warn('Variant A:', e); return null })
      if (cancelled) return
      if (varA) setVariants([varA])

      setProgressMsg('🏰 ' + t('wizard.progCultureNature'))
      const usedNames = (varA?.challenges ?? []).map((c) => c.poi_name).filter(Boolean)
      const varB = await generateSmartRoute({
        ...base, variantSeed: 1, variantTheme: 'culture_nature', usedPOINames: usedNames,
        onProgress: (m) => { if (!cancelled) setProgressMsg(m) },
      }).catch((e) => { console.warn('Variant B:', e); return null })

      if (cancelled) return
      const all = [varA, varB].filter(Boolean)
      if (!all.length) setGenError(t('error.generic'))
      else setVariants(all)
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
      const result = await generateSmartRoute({ ...getGenParams(pois), dryRun: true, userId: user?.id, anthropicKey: import.meta.env.VITE_ANTHROPIC_API_KEY })
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
      const result = await generateSmartRoute({ ...getGenParams(pois), dryRun: true, userId: user?.id, anthropicKey: import.meta.env.VITE_ANTHROPIC_API_KEY })
      setVariants((prev) => { const next = [...prev]; next[activeVariant] = result; return next })
    } catch (e) { console.warn('Reorder regen failed:', e) }
    setRegenerating(false)
  }

  async function refreshAllStops() {
    setRegenerating(true); setVariants([]); setActiveVariant(0)
    try {
      const result = await generateSmartRoute({ mode, activity: activity ?? 'hiking', experienceType: experienceType ?? 'mix', startLat: effectiveStartLat ?? 50, startLng: effectiveStartLng ?? 14.4, startName: effectiveStartName ?? 'Start', isLoop, distanceKm: selectedDistance ?? 10, challengeCount, dryRun: true, userId: user?.id, anthropicKey: import.meta.env.VITE_ANTHROPIC_API_KEY, onProgress: (s) => setProgressMsg(s) })
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
        {/* ── Step 0: Experience Type ───────────────── */}
        {step === 0 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.experienceTitle')}</h2>
            {[
              { type: 'quiz', emoji: '🧠', titleKey: 'wizard.expQuiz', descKey: 'wizard.expQuizDesc' },
              { type: 'tasks', emoji: '📸', titleKey: 'wizard.expTasks', descKey: 'wizard.expTasksDesc' },
              { type: 'rebus', emoji: '🔤', titleKey: 'wizard.expRebus', descKey: 'wizard.expRebusDesc' },
              { type: 'mix', emoji: '🎲', titleKey: 'wizard.expMix', descKey: 'wizard.expMixDesc' },
            ].map((opt) => (
              <div key={opt.type} className={`wiz-exp-card ${experienceType === opt.type ? 'selected' : ''}`}
                onClick={() => { setExperienceType(opt.type); next() }}>
                <span className="wiz-exp-icon">{opt.emoji}</span>
                <div><div className="wiz-exp-title">{t(opt.titleKey)}</div><div className="wiz-exp-desc">{t(opt.descKey)}</div></div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 1: Mode Selection ───────────────── */}
        {step === 1 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.modeTitle')}</h2>
            <div className="wiz-mode-grid">
              <button className="wiz-mode-card" onClick={() => { setMode('manual'); setStep(2) }}>
                <span className="wiz-mode-icon">🗺</span>
                <strong>{t('wizard.modeCustom')}</strong>
                <p className="wiz-mode-desc">{t('wizard.modeCustomDesc')}</p>
              </button>
              <button className="wiz-mode-card" onClick={() => { setMode('surprise'); setStep(2) }}>
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
        {step === 2 && mode === 'manual' && manualStep === 'search' && (
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
        {step === 2 && mode === 'manual' && manualStep === 'settings' && (
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
              setStep(7) // jump to generation
            }} disabled={!activity}>
              🚀 {t('wizard.generate')}
            </button>
          </div>
        )}

        {/* Step 1 — Activity (surprise mode only) */}
        {step === 2 && mode !== 'manual' && (
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

        {/* Step 3: Location (GPS or custom search) */}
        {step === 3 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step2Title')}</h2>

            {/* GPS option */}
            <div className={`wiz-loc-card ${startMode === 'gps' ? 'selected' : ''}`} onClick={async () => { setStartMode('gps'); if (!startLocation) { const loc = await useMyLocation(); if (loc) {} } }}>
              <span style={{ fontSize: 28 }}>📍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t('wizard.useMyLocation')}</div>
                {startLocation && startMode === 'gps' && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>{startLocation.name}</div>}
              </div>
              {startMode === 'gps' && startLocation && <span style={{ color: 'var(--accent)' }}>✓</span>}
            </div>

            {/* Custom location */}
            <div className={`wiz-loc-card ${startMode === 'custom' ? 'selected' : ''}`} onClick={() => setStartMode('custom')}>
              <span style={{ fontSize: 28 }}>🔍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t('wizard.customLocation')}</div>
                {customStartName && startMode === 'custom' && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>{customStartName}</div>}
              </div>
              {startMode === 'custom' && customStartLat && <span style={{ color: 'var(--accent)' }}>✓</span>}
            </div>

            {startMode === 'custom' && (
              <div style={{ marginTop: 8 }}>
                <input className="form-input" type="text" placeholder={t('wizard.searchLocationPh')} value={locSearchQuery}
                  autoFocus onChange={(e) => { setLocSearchQuery(e.target.value); searchLocation(e.target.value) }} />
                {locResults.length > 0 && (
                  <div className="location-dropdown" style={{ position: 'relative' }}>
                    {locResults.map((r, i) => (
                      <button key={i} className="location-option" onClick={() => { setCustomStartLat(r.lat); setCustomStartLng(r.lng); setCustomStartName(r.name); setLocSearchQuery(r.name); setLocResults([]) }}>
                        <span className="location-option-name">📌 {r.name}</span>
                        {r.label && <span className="location-option-label">{r.label}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="wiz-loop-toggle" style={{ marginTop: 12 }}>
              <button className={`wiz-toggle-btn ${isLoop ? 'active' : ''}`} onClick={() => setIsLoop(true)}>⟳ {t('wizard.loop')}</button>
              <button className={`wiz-toggle-btn ${!isLoop ? 'active' : ''}`} onClick={() => setIsLoop(false)}>→ {t('wizard.pointToPoint')}</button>
            </div>

            <button className="btn-primary" style={{ marginTop: 12 }} onClick={next}
              disabled={!(startMode === 'gps' ? startLocation : (customStartLat && customStartLng))}>
              {t('wizard.next')}
            </button>
          </div>
        )}

        {/* Step 3 */}
        {step === 4 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step3Title')}</h2>
            <div className="wiz-option-grid">
              {(DISTANCE_OPTIONS[activity] ?? DISTANCE_OPTIONS.hiking).map((km) => (
                <button key={km} className={`wiz-option-btn ${!isCustomDist && distanceKm === km ? 'selected' : ''}`}
                  onClick={() => { setDistanceKm(km); setIsCustomDist(false) }}>
                  {km} km
                </button>
              ))}
              <button className={`wiz-option-btn ${isCustomDist ? 'selected' : ''}`}
                onClick={() => setIsCustomDist(true)}>
                {t('wizard.custom')}
              </button>
            </div>

            {isCustomDist && (
              <div className="wiz-custom-dist">
                <input className="form-input wiz-custom-input" type="number" min={2} max={100} step={1}
                  value={customDist} onChange={(e) => setCustomDist(Math.min(100, Math.max(2, Number(e.target.value) || 2)))} />
                <span className="wiz-custom-unit">km</span>
                <p className="wiz-custom-range">{t('wizard.distRange')}</p>
              </div>
            )}

            {selectedDistance && (
              <p className="wiz-time-estimate">⏱ {t('wizard.estimatedTime')}: {estimateTime(selectedDistance)}</p>
            )}

            <p className="wiz-dist-hint">{t('wizard.distTolerance')}</p>

            <button className="btn-primary" onClick={next} disabled={!selectedDistance}>
              {t('wizard.next')}
            </button>
          </div>
        )}

        {/* Step 4 removed — skip handled by effect below */}

        {/* Step 6: Challenges + POI picker */}
        {step === 6 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step5Title')}</h2>

            <div className="wiz-section">
              <h3 className="wiz-section-label">{t('wizard.howManyStops')}</h3>
              <div className="wiz-counter">
                <button className="wiz-counter-btn wiz-counter-minus" onClick={() => { navigator.vibrate?.(30); setChallengeCount((p) => Math.max(1, p - 1)) }} disabled={challengeCount <= 1}>−</button>
                <div className="wiz-counter-display">
                  <span className="wiz-counter-num">{challengeCount}</span>
                  <span className="wiz-counter-label">{challengeCount === 1 ? t('wizard.stop1') : challengeCount < 5 ? t('wizard.stops234') : t('wizard.stops5plus')}</span>
                </div>
                <button className="wiz-counter-btn wiz-counter-plus" onClick={() => { navigator.vibrate?.(30); setChallengeCount((p) => Math.min(10, p + 1)) }} disabled={challengeCount >= 10}>+</button>
              </div>
              <p className="wiz-counter-hint">
                {challengeCount <= 3 ? t('wizard.countHintShort') : challengeCount <= 6 ? t('wizard.countHintMedium') : t('wizard.countHintLong')}
              </p>
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
        {step === 7 && (
          <div className="wiz-step wiz-step-preview">
            {generating && <div className="wiz-loading"><div className="wiz-loading-spinner" /><p className="wiz-loading-msg">{progressMsg}</p></div>}
            {genError && !generating && <div className="wiz-error"><p>{genError}</p><button className="btn-primary" onClick={() => { setGenError(null); setVariants([]); setGenerating(false) }}>{t('wizard.retry')}</button></div>}

            {variants.length > 0 && (
              <>
                {/* Variant selector — 2 themed cards */}
                {variants.length > 1 && (
                  <div className="variant-cards">
                    {variants.map((v, i) => {
                      const km = ((v.routeLength ?? 0) / 1000).toFixed(1)
                      const stopIcons = (v.challenges ?? []).slice(0, 4).map((c) => POI_ICONS[c.poi_type] ?? '📍').join(' ')
                      const themes = [
                        { emoji: '🍺', label: t('wizard.themeFoodDrink'), cls: 'variant-card--food' },
                        { emoji: '🏰', label: t('wizard.themeCultureNature'), cls: 'variant-card--culture' },
                      ]
                      const theme = themes[i] ?? themes[0]
                      return (
                        <button key={i} className={`variant-card ${theme.cls} ${activeVariant === i ? 'active' : ''}`} onClick={() => setActiveVariant(i)}>
                          <span className="variant-card-emoji">{theme.emoji}</span>
                          <span className="variant-card-label">{theme.label}</span>
                          <span className="variant-card-stats">📏 {km} km · {(v.challenges ?? []).length} {t('wizard.stops5plus')}</span>
                          <span className="variant-card-icons">{stopIcons}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {regenerating && <div className="wiz-regen-overlay"><div className="wiz-loading-spinner" /></div>}

                {/* Route preview toggle */}
                <div className="wiz-preview-toggle">
                  <button className={`wiz-toggle-btn ${!showFullRoute ? 'active' : ''}`} onClick={() => setShowFullRoute(false)}>🔒 {t('wizard.firstSegment')}</button>
                  <button className={`wiz-toggle-btn ${showFullRoute ? 'active' : ''}`} onClick={() => setShowFullRoute(true)}>🗺 {t('wizard.fullRoute')}</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <div ref={mapContainer} className="wiz-preview-map" />
                  {!showFullRoute && <div className="wiz-lock-overlay">🔒 {t('wizard.lockHint')}</div>}
                </div>
                <p className="wiz-lock-hint">🔒 {t('wizard.lockHint')}</p>

                <RouteStats distanceKm={(generatedRoute?.routeLength ?? 0) / 1000} durationSec={generatedRoute?.routeDuration} ascentM={generatedRoute?.route?.elevation_gain_m} />
                {selectedDistance && (() => {
                  const actual = (generatedRoute?.routeLength ?? 0) / 1000
                  const diff = Math.abs(actual - selectedDistance) / selectedDistance
                  if (diff <= 0.1) return <p className="wiz-tolerance wiz-tolerance--ok">✓ {t('wizard.distMatch')}</p>
                  if (diff <= 0.3) return <p className="wiz-tolerance wiz-tolerance--warn">≈ {t('wizard.distClose', { req: selectedDistance })}</p>
                  return <p className="wiz-tolerance wiz-tolerance--far">⚠ {t('wizard.distFar', { req: selectedDistance })}</p>
                })()}
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
                  <button className="btn-secondary" onClick={() => { setStep(6); setVariants([]) }}>← {t('wizard.edit')}</button>
                  <button className="btn-secondary" onClick={refreshAllStops} disabled={regenerating}>🔄 {t('wizard.refreshStops')}</button>
                  <button className="btn-primary wiz-start-btn" disabled={regenerating} onClick={async () => {
                    if (!generatedRoute) return
                    if (generatedRoute.isDryRun) {
                      setRegenerating(true)
                      try {
                        const saved = await generateSmartRoute({ preGeneratedData: generatedRoute, userId: user?.id })
                        clearPOICache()
                        onRouteGenerated(saved)
                      } catch (e) { setGenError(e.message); setRegenerating(false) }
                    } else {
                      onRouteGenerated(generatedRoute)
                    }
                  }}>🚀 {t('wizard.startAdventure')}</button>
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
