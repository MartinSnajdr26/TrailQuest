import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { suggestPlace } from '../lib/routeGenerator.js'
import { loadPOICache, getCache } from '../lib/poiCache.js'
import { haversineDistance } from '../lib/geo.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import RoutePlannerScreen from './RoutePlannerScreen.jsx'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY
const TOTAL_STEPS = 5

const ACTIVITIES = [
  { id: 'hiking', icon: '🥾', labelKey: 'wizard.hiking' },
  { id: 'skiing', icon: '⛷', labelKey: 'wizard.skiing' },
  { id: 'skitouring', icon: '🎿', labelKey: 'wizard.skitouring' },
  { id: 'cycling', icon: '🚴', labelKey: 'wizard.cycling' },
  { id: 'mtb', icon: '🚵', labelKey: 'wizard.mtb' },
]
const ACTIVITY_SPEED = { hiking: 3.5, crosscountry: 8, skitouring: 2.5, skiing: 8, cycling: 18, mtb: 12 }

const POI_CATEGORIES = [
  { id: '', icon: '⭐', label: 'Vše' },
  { id: 'minipivovar', icon: '🍺', label: 'Pivovary' },
  { id: 'pamatnik', icon: '🏰', label: 'Hrady' },
  { id: 'vyhlidka', icon: '👁', label: 'Vyhlídky' },
  { id: 'studanka', icon: '💧', label: 'Studánky' },
  { id: 'horska_chata', icon: '🏠', label: 'Chaty' },
  { id: 'vinna_sklep', icon: '🍷', label: 'Víno' },
  { id: 'kaplička', icon: '⛪', label: 'Kapličky' },
]
const POI_ICONS = { minipivovar: '🍺', horska_chata: '🏠', vyhlidka: '👁', studanka: '💧', skalni_utvar: '🪨', pamatnik: '🏛', kaplička: '⛪', mlyny: '⚙️', vinna_sklep: '🍷', restaurace: '🍽' }

export default function RouteWizardScreen({ onRouteGenerated }) {
  const { t } = useTranslation()
  const { user } = useAuth()

  // Step state
  const [step, setStep] = useState(0)
  const [experienceType, setExperienceType] = useState(null)
  const [activity, setActivity] = useState(null)
  const [isLoop, setIsLoop] = useState(true)

  // Location
  const [startMode, setStartMode] = useState('gps')
  const [startLocation, setStartLocation] = useState(null)
  const [customStartName, setCustomStartName] = useState('')
  const [customStartLat, setCustomStartLat] = useState(null)
  const [customStartLng, setCustomStartLng] = useState(null)
  const [locQuery, setLocQuery] = useState('')
  const [locResults, setLocResults] = useState([])
  const locDebounceRef = useRef(null)

  // POI selection
  const [poiSearch, setPoiSearch] = useState('')
  const [poiCategory, setPoiCategory] = useState('')
  const [poiResults, setPoiResults] = useState([])
  const [poiSearching, setPoiSearching] = useState(false)
  const [selectedPOIs, setSelectedPOIs] = useState([])
  const poiDebounceRef = useRef(null)

  // Challenge count
  const [challengeCount, setChallengeCount] = useState(3)

  // Planner
  const [showPlanner, setShowPlanner] = useState(false)

  // Effective start
  const effectiveStartLat = startMode === 'custom' && customStartLat ? customStartLat : startLocation?.lat
  const effectiveStartLng = startMode === 'custom' && customStartLng ? customStartLng : startLocation?.lng
  const effectiveStartName = startMode === 'custom' && customStartName ? customStartName : (startLocation?.name ?? 'Start')

  function next() { setStep((s) => Math.min(s + 1, TOTAL_STEPS)) }
  function back() { setStep((s) => Math.max(s - 1, 0)) }

  // GPS
  async function useMyLocation() {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const results = await suggestPlace(`${pos.coords.latitude},${pos.coords.longitude}`, pos.coords.latitude, pos.coords.longitude, 500)
          const loc = results[0] ?? { name: 'Moje poloha', lat: pos.coords.latitude, lng: pos.coords.longitude }
          setStartLocation(loc); resolve(loc)
        }, () => resolve(null), { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  // Location search
  function searchLocation(q) {
    if (q.length < 2) { setLocResults([]); return }
    if (locDebounceRef.current) clearTimeout(locDebounceRef.current)
    locDebounceRef.current = setTimeout(async () => {
      try { const items = await suggestPlace(q, 49.8, 15.5); setLocResults(items.slice(0, 5)) } catch { setLocResults([]) }
    }, 350)
  }

  // POI search
  function searchPOIs(query, category) {
    setPoiSearching(true)
    if (poiDebounceRef.current) clearTimeout(poiDebounceRef.current)
    poiDebounceRef.current = setTimeout(async () => {
      let results = []
      // DB search
      let q = supabase.from('custom_pois').select('*').eq('is_approved', true).eq('is_active', true)
      if (query.length > 1) q = q.ilike('name', `%${query}%`)
      if (category) q = q.eq('poi_category', category)
      const { data } = await q.limit(20)
      results = (data ?? []).map((p) => ({
        id: p.id, name: p.name, description: p.description, category: p.poi_category,
        lat: p.gps_lat, lng: p.gps_lng, gps_lat: p.gps_lat, gps_lng: p.gps_lng,
        quality: p.quality_score, source: 'db',
        distanceKm: effectiveStartLat ? (haversineDistance([effectiveStartLng, effectiveStartLat], [p.gps_lng, p.gps_lat]) / 1000).toFixed(1) : '?',
      }))
      // Supplement with Mapy.com if text query
      if (query.length > 2) {
        try {
          const items = await suggestPlace(query, effectiveStartLat, effectiveStartLng)
          items.forEach((r) => { if (!results.some((p) => p.name === r.name)) results.push({ id: `m_${r.name}`, name: r.name, description: r.label, category: 'other', lat: r.lat, lng: r.lng, gps_lat: r.lat, gps_lng: r.lng, quality: 5, source: 'mapy', distanceKm: effectiveStartLat ? (haversineDistance([effectiveStartLng, effectiveStartLat], [r.lng, r.lat]) / 1000).toFixed(1) : '?' }) })
        } catch {}
      }
      results.sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm))
      setPoiResults(results)
      setPoiSearching(false)
    }, 300)
  }

  // Load nearby POIs when entering step 3 (POI selection)
  useEffect(() => {
    if (step === 3 && effectiveStartLat) {
      loadPOICache(effectiveStartLat, effectiveStartLng).then(() => searchPOIs('', ''))
    }
  }, [step, effectiveStartLat])

  function addPOI(poi) {
    if (selectedPOIs.some((p) => p.id === poi.id)) return
    setSelectedPOIs((prev) => [...prev, poi])
  }
  function removePOI(id) { setSelectedPOIs((prev) => prev.filter((p) => p.id !== id)) }
  function movePOI(idx, dir) {
    setSelectedPOIs((prev) => { const a = [...prev]; const ni = idx + dir; if (ni < 0 || ni >= a.length) return a; [a[idx], a[ni]] = [a[ni], a[idx]]; return a })
  }

  // Auto-set challenge count when POIs change
  useEffect(() => { if (selectedPOIs.length > 0) setChallengeCount(selectedPOIs.length) }, [selectedPOIs.length])

  // ── If planner is shown, render it full-screen ────────────

  if (showPlanner) {
    return (
      <RoutePlannerScreen
        activity={activity ?? 'hiking'}
        experienceType={experienceType ?? 'mix'}
        challengeCount={challengeCount}
        startLat={effectiveStartLat ?? 50.08}
        startLng={effectiveStartLng ?? 14.42}
        startName={effectiveStartName}
        isLoop={isLoop}
        distanceKm={10}
        selectedPOIs={selectedPOIs}
        onBack={() => setShowPlanner(false)}
        onStartRoute={onRouteGenerated}
      />
    )
  }

  // ── Render wizard steps ───────────────────────────────────

  return (
    <div className="wizard-screen">
      {/* Header with dots */}
      <div className="wiz-header">
        {step > 0 && <button className="wiz-back" onClick={back}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button>}
        <div className="wiz-steps">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className={`wiz-step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}>{i + 1}</div>
          ))}
        </div>
      </div>

      <div className="wiz-body">

        {/* ── Step 0: Experience type ──────────────────── */}
        {step === 0 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.experienceTitle')}</h2>
            {[
              { type: 'quiz', emoji: '🧠', titleKey: 'wizard.expQuiz', descKey: 'wizard.expQuizDesc' },
              { type: 'tasks', emoji: '📸', titleKey: 'wizard.expTasks', descKey: 'wizard.expTasksDesc' },
              { type: 'rebus', emoji: '🔤', titleKey: 'wizard.expRebus', descKey: 'wizard.expRebusDesc' },
              { type: 'mix', emoji: '🎲', titleKey: 'wizard.expMix', descKey: 'wizard.expMixDesc' },
            ].map((o) => (
              <div key={o.type} className={`wiz-exp-card ${experienceType === o.type ? 'selected' : ''}`} onClick={() => { setExperienceType(o.type); next() }}>
                <span className="wiz-exp-icon">{o.emoji}</span>
                <div><div className="wiz-exp-title">{t(o.titleKey)}</div><div className="wiz-exp-desc">{t(o.descKey)}</div></div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 1: Activity + route type ────────────── */}
        {step === 1 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step1Title')}</h2>
            <div className="wiz-activity-grid">
              {ACTIVITIES.map((a) => (
                <button key={a.id} className={`wiz-activity-btn ${activity === a.id ? 'selected' : ''}`} onClick={() => setActivity(a.id)}>
                  <span className="wiz-activity-icon">{a.icon}</span>
                  <span className="wiz-activity-label">{t(a.labelKey)}</span>
                </button>
              ))}
            </div>
            <div className="wiz-loop-toggle" style={{ marginTop: 16 }}>
              <button className={`wiz-toggle-btn ${isLoop ? 'active' : ''}`} onClick={() => setIsLoop(true)}>⟳ {t('wizard.loop')}</button>
              <button className={`wiz-toggle-btn ${!isLoop ? 'active' : ''}`} onClick={() => setIsLoop(false)}>→ {t('wizard.pointToPoint')}</button>
            </div>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={next} disabled={!activity}>{t('wizard.next')}</button>
          </div>
        )}

        {/* ── Step 2: Start point ──────────────────────── */}
        {step === 2 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.step2Title')}</h2>
            <div className={`wiz-loc-card ${startMode === 'gps' ? 'selected' : ''}`} onClick={async () => { setStartMode('gps'); if (!startLocation) await useMyLocation() }}>
              <span style={{ fontSize: 24 }}>📍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('wizard.useMyLocation')}</div>
                {startLocation && startMode === 'gps' && <div style={{ fontSize: 11, color: 'var(--accent)' }}>{startLocation.name}</div>}
              </div>
            </div>
            <div className={`wiz-loc-card ${startMode === 'custom' ? 'selected' : ''}`} onClick={() => setStartMode('custom')}>
              <span style={{ fontSize: 24 }}>🔍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('wizard.customLocation')}</div>
                {customStartName && <div style={{ fontSize: 11, color: 'var(--accent)' }}>{customStartName}</div>}
              </div>
            </div>
            {startMode === 'custom' && (
              <div style={{ marginTop: 8 }}>
                <input className="form-input" type="text" placeholder={t('wizard.searchLocationPh')} value={locQuery} autoFocus
                  onChange={(e) => { setLocQuery(e.target.value); searchLocation(e.target.value) }} />
                {locResults.length > 0 && <div className="location-dropdown" style={{ position: 'relative' }}>{locResults.map((r, i) => (
                  <button key={i} className="location-option" onClick={() => { setCustomStartLat(r.lat); setCustomStartLng(r.lng); setCustomStartName(r.name); setLocQuery(r.name); setLocResults([]) }}>
                    <span className="location-option-name">📌 {r.name}</span>
                    {r.label && <span className="location-option-label">{r.label}</span>}
                  </button>
                ))}</div>}
              </div>
            )}
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={next}
              disabled={!(startMode === 'gps' ? startLocation : customStartLat)}>{t('wizard.next')}</button>
          </div>
        )}

        {/* ── Step 3: POI Selection ────────────────────── */}
        {step === 3 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.poiSelectTitle')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{t('wizard.poiSelectDesc')}</p>

            <input className="form-input" type="text" placeholder={`🔍 ${t('wizard.manualSearchPh')}`}
              value={poiSearch} onChange={(e) => { setPoiSearch(e.target.value); searchPOIs(e.target.value, poiCategory) }} />

            <div className="wiz-chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto', marginTop: 8 }}>
              {POI_CATEGORIES.map((c) => (
                <button key={c.id} className={`wiz-chip ${poiCategory === c.id ? 'selected' : ''}`} style={{ flexShrink: 0 }}
                  onClick={() => { setPoiCategory(c.id); searchPOIs(poiSearch, c.id) }}>{c.icon} {c.label}</button>
              ))}
            </div>

            <div className="manual-results" style={{ marginTop: 8 }}>
              {poiSearching && <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>🔍...</p>}
              {poiResults.map((poi) => {
                const isAdded = selectedPOIs.some((p) => p.id === poi.id)
                return (
                  <div key={poi.id} className="manual-result-row">
                    <span className="manual-result-icon">{POI_ICONS[poi.category] ?? '📍'}</span>
                    <div className="manual-result-info">
                      <span className="manual-result-name">{poi.name}</span>
                      {poi.description && <span className="manual-result-desc">{poi.description.slice(0, 50)}</span>}
                    </div>
                    <span className="manual-result-dist">{poi.distanceKm} km</span>
                    <button className={`manual-add-btn ${isAdded ? 'added' : ''}`} onClick={() => isAdded ? removePOI(poi.id) : addPOI(poi)}>{isAdded ? '✓' : '+'}</button>
                  </div>
                )
              })}
            </div>

            {selectedPOIs.length > 0 && (
              <div className="manual-selected" style={{ marginTop: 12 }}>
                <h3 className="wiz-section-label">{t('wizard.manualSelectedLabel')} ({selectedPOIs.length})</h3>
                {selectedPOIs.map((poi, i) => (
                  <div key={poi.id} className="manual-selected-row">
                    <span className="manual-selected-order">{i + 1}</span>
                    <span className="manual-selected-icon">{POI_ICONS[poi.category] ?? '📍'}</span>
                    <span className="manual-selected-name">{poi.name}</span>
                    <button className="manual-move-btn" onClick={() => movePOI(i, -1)} disabled={i === 0}>↑</button>
                    <button className="manual-move-btn" onClick={() => movePOI(i, 1)} disabled={i === selectedPOIs.length - 1}>↓</button>
                    <button className="manual-remove-btn" onClick={() => removePOI(poi.id)}>×</button>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>{t('wizard.poiSelectHint')}</p>

            <button className="btn-primary" style={{ marginTop: 12 }} onClick={next}>
              {selectedPOIs.length > 0 ? `${t('wizard.next')} (${selectedPOIs.length} ${t('wizard.stops5plus')}) →` : t('wizard.continueNoStops')}
            </button>
          </div>
        )}

        {/* ── Step 4: Challenge count ──────────────────── */}
        {step === 4 && (
          <div className="wiz-step">
            <h2 className="wiz-title">{t('wizard.howManyStops')}</h2>
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
            {selectedPOIs.length > 0 && challengeCount !== selectedPOIs.length && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                {challengeCount < selectedPOIs.length ? t('wizard.fewerThanSelected') : t('wizard.moreThanSelected')}
              </p>
            )}
            <button className="btn-primary" style={{ marginTop: 24 }} onClick={() => setShowPlanner(true)}>
              🗺 {t('planner.title')} →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
