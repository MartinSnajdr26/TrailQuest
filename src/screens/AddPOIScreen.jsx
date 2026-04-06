import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const CATEGORIES = [
  { id: 'minipivovar', icon: '🍺' }, { id: 'horska_chata', icon: '🏠' },
  { id: 'vyhlidka', icon: '👁' }, { id: 'studanka', icon: '💧' },
  { id: 'skalni_utvar', icon: '🌲' }, { id: 'kaplička', icon: '⛪' },
  { id: 'vinna_sklep', icon: '🍷' }, { id: 'mlyny', icon: '⚙️' },
  { id: 'tajne_misto', icon: '📍' }, { id: 'restaurace', icon: '🍽️' },
]
const REGIONS = ['Praha', 'Středočeský', 'Jihočeský', 'Plzeňský', 'Karlovarský', 'Ústecký', 'Liberecký', 'Královéhradecký', 'Pardubický', 'Vysočina', 'Jihomoravský', 'Olomoucký', 'Zlínský', 'Moravskoslezský']
const TAGS = ['razítko', 'ubytování', 'psí přátelský', 'bezbariérový', 'rodinný', 'výhled', 'historický', 'wifi', 'venkovní posezení']

export default function AddPOIScreen({ onBack }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('')
  const [openingHours, setOpeningHours] = useState('')
  const [website, setWebsite] = useState('')
  const [tags, setTags] = useState([])
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  function useGPS() {
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(String(pos.coords.latitude)); setLng(String(pos.coords.longitude)) },
      () => {}, { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function toggleTag(tag) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !category || !lat || !lng) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('custom_pois').insert({
      name: name.trim(), description: description.trim() || null,
      poi_category: category, gps_lat: Number(lat), gps_lng: Number(lng),
      region: region || null, opening_hours: openingHours.trim() || null,
      website: website.trim() || null, tags,
      submitted_by: user?.id, is_approved: false, is_active: true, quality_score: 5, visit_count: 0,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setDone(true); setSaving(false)
  }

  if (done) {
    return (
      <div className="screen submit-screen">
        <div className="submit-done">
          <span className="submit-done-icon">📍</span>
          <h2>{t('addPoi.thanks')}</h2>
          <p>{t('addPoi.sentForReview')}</p>
          <button className="btn-primary" onClick={() => { setDone(false); setName(''); setDescription('') }}>{t('addPoi.addAnother')}</button>
          <button className="btn-secondary" onClick={onBack}>{t('submit.backToProfile')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen submit-screen">
      <div className="screen-header">
        <div className="routes-header-row">
          <h1 className="screen-title">{t('addPoi.title')}</h1>
          <button className="wiz-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      <form className="submit-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <label className="form-label">{t('addPoi.name')} *
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="submit-section">
          <span className="form-label">{t('addPoi.category')} *</span>
          <div className="wiz-activity-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={`wiz-activity-btn ${category === c.id ? 'selected' : ''}`} style={{ padding: '12px 8px' }} onClick={() => setCategory(c.id)}>
                <span style={{ fontSize: '24px' }}>{c.icon}</span>
                <span style={{ fontSize: '10px' }}>{c.id}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="submit-gps-row">
          <button type="button" className="btn-secondary submit-gps-btn" onClick={useGPS}>📍 GPS</button>
          <input className="form-input submit-gps-input" type="number" step="any" placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} required />
          <input className="form-input submit-gps-input" type="number" step="any" placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} required />
        </div>

        <label className="form-label">{t('addPoi.description')}
          <textarea className="challenge-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={300} placeholder={t('addPoi.descHint')} />
        </label>

        <label className="form-label">{t('addPoi.region')}
          <select className="filter-select" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">—</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <label className="form-label">{t('addPoi.openingHours')}
          <input className="form-input" value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} />
        </label>

        <label className="form-label">Web
          <input className="form-input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
        </label>

        <div className="submit-section">
          <span className="form-label">{t('addPoi.tags')}</span>
          <div className="wiz-chip-row">
            {TAGS.map((tag) => (
              <button key={tag} type="button" className={`wiz-chip ${tags.includes(tag) ? 'selected' : ''}`} onClick={() => toggleTag(tag)}>{tag}</button>
            ))}
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? '...' : t('addPoi.submit')}
        </button>
      </form>
    </div>
  )
}
