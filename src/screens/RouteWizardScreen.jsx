import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { suggestPlace } from '../lib/routeGenerator.js'
import { loadPOICache, getCache } from '../lib/poiCache.js'
import { haversineDistance } from '../lib/geo.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { fetchAllStories, getLocalizedStory } from '../lib/storySystem.js'
import RoutePlannerScreen from './RoutePlannerScreen.jsx'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY
const TOTAL_STEPS = 5

const STORY_GROUPS = [
  { label: '🕵️ Urban & absurdní mystery', themes: ['absurd', 'urban', 'mystery', 'tech', 'animal', 'everyday'] },
  { label: '🍺 Food & beer quest', themes: ['food', 'beer', 'coffee'] },
  { label: '💬 Dating & social', themes: ['dating', 'social', 'fitness'] },
  { label: '💼 Office & adult humor', themes: ['office', 'diy'] },
]
const THEME_EMOJI = { food: '🍽', beer: '🍺', coffee: '☕', urban: '🏙', mystery: '🕵️', tech: '📱', office: '💼', social: '💬', dating: '💕', fitness: '🏃', animal: '🐾', diy: '🔧', everyday: '🏠', absurd: '🎭' }

function getStopCount(story) {
  let tmpl = story.narrative_template
  if (typeof tmpl === 'string') { try { tmpl = JSON.parse(tmpl) } catch { return 0 } }
  return tmpl?.stops?.length || 0
}

function getStoryDifficulty(theme) {
  const easy = ['food', 'beer', 'coffee', 'everyday', 'animal']
  const hard = ['mystery', 'tech', 'absurd']
  if (easy.includes(theme)) return { stars: 1, label: 'Lehké' }
  if (hard.includes(theme)) return { stars: 3, label: 'Těžké' }
  return { stars: 2, label: 'Střední' }
}

function groupStories(stories) {
  const allGroupedThemes = STORY_GROUPS.flatMap(g => g.themes)
  const grouped = STORY_GROUPS.map(g => ({ ...g, stories: stories.filter(s => g.themes.includes(s.theme)) })).filter(g => g.stories.length > 0)
  const uncategorized = stories.filter(s => !allGroupedThemes.includes(s.theme))
  if (uncategorized.length > 0) grouped.push({ label: '📖 Ostatní', stories: uncategorized })
  return grouped
}

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
  { id: 'skalni_utvar', icon: '🪨', label: 'Skály' },
  { id: 'horska_chata', icon: '🏠', label: 'Chaty' },
  { id: 'vinna_sklep', icon: '🍷', label: 'Víno' },
  { id: 'kaplička', icon: '⛪', label: 'Kapličky' },
  { id: 'mlyny', icon: '⚙️', label: 'Mlýny' },
  { id: 'restaurace', icon: '🍽', label: 'Restaurace' },
]

// Normalize category aliases to canonical category IDs
function normalizePOICategory(cat) {
  const aliases = {
    hrad: 'pamatnik', zamek: 'pamatnik', zámek: 'pamatnik', castle: 'pamatnik', ruins: 'pamatnik', memorial: 'pamatnik', museum: 'pamatnik',
    kaple: 'kaplička', kaple: 'kaplička', chapel: 'kaplička', church: 'kaplička', kostel: 'kaplička',
    hospoda: 'minipivovar', pub: 'minipivovar', pivovar: 'minipivovar', brewery: 'minipivovar', biergarten: 'minipivovar',
    chata: 'horska_chata', alpine_hut: 'horska_chata', chalet: 'horska_chata',
    spring: 'studanka', waterfall: 'studanka',
    viewpoint: 'vyhlidka', peak: 'vyhlidka', tower: 'vyhlidka',
    rock: 'skalni_utvar', cave: 'skalni_utvar', nature_reserve: 'skalni_utvar',
    winery: 'vinna_sklep',
    watermill: 'mlyny', windmill: 'mlyny',
    restaurant: 'restaurace',
  }
  if (!cat) return 'other'
  return aliases[cat] ?? cat
}
const POI_ICONS = { minipivovar: '🍺', horska_chata: '🏠', vyhlidka: '👁', studanka: '💧', skalni_utvar: '🪨', pamatnik: '🏛', kaplička: '⛪', mlyny: '⚙️', vinna_sklep: '🍷', restaurace: '🍽' }

export default function RouteWizardScreen({ onRouteGenerated }) {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language?.slice(0, 2) || 'cs'
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
  const [poiCategory, setPoiCategory] = useState('all')
  const [allCachedPOIs, setAllCachedPOIs] = useState([]) // full cache with distances
  const [poiResults, setPoiResults] = useState([]) // displayed results
  const [poiSearching, setPoiSearching] = useState(false)
  const [selectedPOIs, setSelectedPOIs] = useState([])
  const [poiRadiusKm, setPoiRadiusKm] = useState(15)
  const poiDebounceRef = useRef(null)

  // Challenge count
  const [challengeCount, setChallengeCount] = useState(3)

  // Story selection (rebus mode)
  const [selectedStory, setSelectedStory] = useState(null)
  const [stories, setStories] = useState([])
  const [storiesLoading, setStoriesLoading] = useState(false)
  const [showStorySelector, setShowStorySelector] = useState(false)

  // Planner
  const [showPlanner, setShowPlanner] = useState(false)

  // Effective start
  const effectiveStartLat = startMode === 'custom' && customStartLat ? customStartLat : startLocation?.lat
  const effectiveStartLng = startMode === 'custom' && customStartLng ? customStartLng : startLocation?.lng
  const effectiveStartName = startMode === 'custom' && customStartName ? customStartName : (startLocation?.name ?? 'Start')

  function next() { setStep((s) => Math.min(s + 1, TOTAL_STEPS)) }
  function back() {
    // If going back to step 0 from step 1 and rebus was selected, show story selector
    if (step === 1 && experienceType === 'rebus') { setStep(0); setShowStorySelector(true); return }
    setStep((s) => Math.max(s - 1, 0))
  }

  // Load stories eagerly when rebus is selected
  async function handleSelectRebus() {
    setExperienceType('rebus')
    setShowStorySelector(true)
    if (stories.length === 0) {
      setStoriesLoading(true)
      try {
        const data = await fetchAllStories()
        setStories(data ?? [])
      } catch (e) {
        console.warn('Failed to load stories:', e)
        setStories([])
      }
      setStoriesLoading(false)
    }
  }

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

  // Load POI cache on step 3 entry, compute distances
  useEffect(() => {
    if (step !== 3 || !effectiveStartLat) return
    setPoiSearching(true)
    loadPOICache(effectiveStartLat, effectiveStartLng).then((pois) => {
      const withDist = (pois ?? []).map((p) => {
        const normalizedCat = normalizePOICategory(p.poi_category)
        return {
        ...p, id: p.id, name: p.name, description: p.description, category: normalizedCat, poi_category: normalizedCat,
        lat: p.gps_lat, lng: p.gps_lng, gps_lat: p.gps_lat, gps_lng: p.gps_lng,
        quality_score: p.quality_score ?? 5, source: 'db',
        distanceKm: haversineDistance([effectiveStartLng, effectiveStartLat], [p.gps_lng, p.gps_lat]) / 1000,
      }}).sort((a, b) => a.distanceKm - b.distanceKm)
      setAllCachedPOIs(withDist)
      setPoiSearching(false)
    })
  }, [step, effectiveStartLat])

  // Filter cached POIs by radius + category + search query
  const filteredPOIs = allCachedPOIs.filter((p) => {
    if (p.distanceKm > poiRadiusKm) return false
    if (poiCategory !== 'all' && p.poi_category !== poiCategory) return false
    if (poiSearch.length > 1 && !p.name.toLowerCase().includes(poiSearch.toLowerCase())) return false
    return true
  })

  // Category counts within radius
  const categoryCounts = allCachedPOIs.filter((p) => p.distanceKm <= poiRadiusKm).reduce((acc, p) => { acc[p.poi_category] = (acc[p.poi_category] ?? 0) + 1; return acc }, {})

  // Reset category filter if selected category has no POIs in current radius
  useEffect(() => {
    if (poiCategory !== 'all' && (categoryCounts[poiCategory] ?? 0) === 0) setPoiCategory('all')
  }, [poiRadiusKm, categoryCounts[poiCategory]])

  // Displayed results (filtered + Mapy.com supplement for text search)
  function handlePoiSearch(query) {
    setPoiSearch(query)
    if (query.length < 3) return
    if (poiDebounceRef.current) clearTimeout(poiDebounceRef.current)
    poiDebounceRef.current = setTimeout(async () => {
      try {
        const items = await suggestPlace(query, effectiveStartLat, effectiveStartLng)
        const mapyPOIs = items.filter((r) => r.lat && r.lng).map((r) => ({
          id: `m_${r.name}_${r.lat}`, name: r.name, description: r.label, category: 'other', poi_category: 'other',
          lat: r.lat, lng: r.lng, gps_lat: r.lat, gps_lng: r.lng, quality_score: 5, source: 'mapy',
          distanceKm: haversineDistance([effectiveStartLng, effectiveStartLat], [r.lng, r.lat]) / 1000,
        })).filter((p) => p.distanceKm <= poiRadiusKm)
        // Append to display — merged with local results
        const localNames = new Set(filteredPOIs.map((p) => p.name.toLowerCase()))
        const extra = mapyPOIs.filter((p) => !localNames.has(p.name.toLowerCase()))
        setPoiResults(extra)
      } catch { setPoiResults([]) }
    }, 300)
  }

  // Combined display list: filtered cache + mapy supplement
  const displayedPOIs = [...filteredPOIs.slice(0, 40), ...poiResults].slice(0, 50)

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
        selectedStory={selectedStory}
        onBack={() => setShowPlanner(false)}
        onStartRoute={onRouteGenerated}
      />
    )
  }

  // ── Render wizard steps ───────────────────────────────────

  return (
    <>
    {/* ── Story selector overlay (rendered on top, not early return) ── */}
    {showStorySelector && (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0a0f0a', zIndex: 9999, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0a0f0a', zIndex: 10 }}>
          <button onClick={() => { setShowStorySelector(false); setSelectedStory(null) }} style={{
            width: 40, height: 40, borderRadius: '50%', background: '#1a231a', border: 'none',
            fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff',
          }}>←</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Vyber příběh pro rébus</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Hádanky na zastávkách budou z tohoto příběhu</div>
          </div>
        </div>

        {/* Loading */}
        {storiesLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Načítám příběhy...</div>
        )}

        {/* Stories list */}
        {!storiesLoading && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {stories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📖</div>
                <div style={{ fontSize: 15, marginBottom: 8 }}>Žádné příběhy v databázi</div>
                <div style={{ fontSize: 12 }}>Hádanky budou generovány automaticky</div>
              </div>
            ) : (
              groupStories(stories).map(group => (
                <div key={group.label} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#475569', marginBottom: 10, paddingLeft: 4 }}>
                    {group.label}
                  </div>
                  {group.stories.map(rawStory => {
                    const story = getLocalizedStory(rawStory, currentLang)
                    const stopCount = getStopCount(rawStory)
                    const difficulty = getStoryDifficulty(rawStory.theme)
                    return (
                      <div key={rawStory.id} onClick={() => { setSelectedStory(story); setShowStorySelector(false); setStep(1) }} style={{
                        padding: 16, borderRadius: 14, cursor: 'pointer', border: '1.5px solid rgba(255,255,255,0.1)', background: '#111811', marginBottom: 8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 24, flexShrink: 0 }}>{THEME_EMOJI[rawStory.theme] || '📖'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', lineHeight: 1.3 }}>{story.title}</div>
                          </div>
                        </div>
                        {story.description && (
                          <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.4, marginBottom: 10, paddingLeft: 34 }}>{story.description}</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 34 }}>
                          {stopCount > 0 ? (
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span>🧩</span><span>{stopCount} hádanek</span>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#475569' }}>🎲 Hádanky generovány AI</div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>{difficulty.label}</span>
                            <span style={{ fontSize: 13 }}>{'⭐'.repeat(difficulty.stars)}{'☆'.repeat(3 - difficulty.stars)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}

            {/* Skip story */}
            <div onClick={() => { setSelectedStory(null); setShowStorySelector(false); setStep(1) }} style={{
              textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: 14, cursor: 'pointer',
              borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8,
            }}>
              Pokračovat bez příběhu →
            </div>
          </div>
        )}
      </div>
    )}

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
              <div key={o.type} className={`wiz-exp-card ${experienceType === o.type ? 'selected' : ''}`} onClick={() => {
                if (o.type === 'rebus') handleSelectRebus()
                else { setExperienceType(o.type); next() }
              }}>
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
          <div className="wiz-step" style={{ gap: 0 }}>
            <h2 className="wiz-title" style={{ marginBottom: 4 }}>{t('wizard.poiSelectTitle')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>{t('wizard.poiSelectDesc')}</p>

            {/* Search */}
            <input className="form-input" type="text" placeholder={`🔍 ${t('wizard.manualSearchPh')}`}
              value={poiSearch} onChange={(e) => handlePoiSearch(e.target.value)} />

            {/* Category chips with counts */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 0', scrollbarWidth: 'none' }}>
              {POI_CATEGORIES.map((c) => {
                const catKey = c.id || 'all'
                const count = c.id ? (categoryCounts[c.id] ?? 0) : Object.values(categoryCounts).reduce((s, v) => s + v, 0)
                const isEmpty = c.id && count === 0
                const isActive = poiCategory === catKey
                return (
                  <button key={c.id} onClick={() => !isEmpty && setPoiCategory(catKey)} style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 16,
                    border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: isActive ? 'var(--accent-dim)' : 'var(--bg-raised)',
                    cursor: isEmpty ? 'default' : 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text)',
                    transition: 'all 120ms', opacity: isEmpty ? 0.35 : 1,
                  }}>
                    <span style={{ fontSize: 14 }}>{c.icon}</span> {c.label}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 8, padding: '0 5px' }}>{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Radius slider */}
            <div style={{ padding: '4px 0 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                <span>{t('wizard.showWithinRadius')}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{poiRadiusKm} km</span>
              </div>
              <input type="range" min={2} max={50} step={1} value={poiRadiusKm} onChange={(e) => setPoiRadiusKm(Number(e.target.value))} className="planner-slider" />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {displayedPOIs.length > 0 ? `${filteredPOIs.length} míst do ${poiRadiusKm} km` : ''}
              </div>
            </div>

            {/* POI list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {poiSearching && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>🔍 Načítám místa...</p>}
              {!poiSearching && displayedPOIs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Žádná místa do {poiRadiusKm} km</div>
                  <button onClick={() => setPoiRadiusKm(Math.min(50, poiRadiusKm + 10))} style={{ padding: '8px 20px', borderRadius: 16, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                    Rozšířit na {Math.min(50, poiRadiusKm + 10)} km
                  </button>
                </div>
              )}
              {displayedPOIs.map((poi) => {
                const isAdded = selectedPOIs.some((p) => p.id === poi.id)
                const dKm = poi.distanceKm
                return (
                  <div key={poi.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, cursor: 'pointer',
                    background: isAdded ? 'var(--accent-dim)' : 'var(--bg-card)', border: isAdded ? '1.5px solid var(--accent-border)' : '1px solid var(--border)',
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {POI_ICONS[poi.poi_category ?? poi.category] ?? '📍'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{poi.name}</div>
                      {poi.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{poi.description.slice(0, 50)}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: dKm < 5 ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {dKm < 1 ? `${Math.round(dKm * 1000)} m` : `${dKm.toFixed(1)} km`}
                      </span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); isAdded ? removePOI(poi.id) : addPOI(poi) }} style={{
                      width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700,
                      background: isAdded ? 'var(--bg-raised)' : 'var(--accent)', color: isAdded ? 'var(--accent)' : '#fff',
                    }}>{isAdded ? '✓' : '+'}</button>
                  </div>
                )
              })}
            </div>

            {/* Selected list */}
            {selectedPOIs.length > 0 && (
              <div className="manual-selected" style={{ marginTop: 10 }}>
                <h3 className="wiz-section-label">{t('wizard.manualSelectedLabel')} ({selectedPOIs.length})</h3>
                {selectedPOIs.map((poi, i) => (
                  <div key={poi.id} className="manual-selected-row">
                    <span className="manual-selected-order">{i + 1}</span>
                    <span className="manual-selected-icon">{POI_ICONS[poi.poi_category ?? poi.category] ?? '📍'}</span>
                    <span className="manual-selected-name">{poi.name}</span>
                    <button className="manual-move-btn" onClick={() => movePOI(i, -1)} disabled={i === 0}>↑</button>
                    <button className="manual-move-btn" onClick={() => movePOI(i, 1)} disabled={i === selectedPOIs.length - 1}>↓</button>
                    <button className="manual-remove-btn" onClick={() => removePOI(poi.id)}>×</button>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>{t('wizard.poiSelectHint')}</p>

            <button className="btn-primary" style={{ marginTop: 8 }} onClick={next}>
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
    </>
  )
}
