import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const REGIONS = [
  'Praha', 'Středočeský', 'Jihočeský', 'Plzeňský',
  'Karlovarský', 'Ústecký', 'Liberecký', 'Královéhradecký',
  'Pardubický', 'Vysočina', 'Jihomoravský', 'Olomoucký',
  'Zlínský', 'Moravskoslezský',
]

const REGION_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f43f5e', '#14b8a6', '#a855f7', '#6366f1',
  '#0ea5e9', '#10b981',
]

const KRAJ_NORMALIZE = {
  'Praha a okolí': 'Praha', 'Hlavní město Praha': 'Praha', 'Prague': 'Praha',
  'Střední Čechy': 'Středočeský', 'Středočeský kraj': 'Středočeský',
  'Jižní Čechy': 'Jihočeský', 'Jihočeský kraj': 'Jihočeský',
  'Západní Čechy': 'Plzeňský', 'Plzeňský kraj': 'Plzeňský',
  'Karlovarský kraj': 'Karlovarský',
  'Severní Čechy': 'Ústecký', 'Ústecký kraj': 'Ústecký',
  'Liberecký kraj': 'Liberecký',
  'Královéhradecký kraj': 'Královéhradecký',
  'Pardubický kraj': 'Pardubický',
  'Kraj Vysočina': 'Vysočina',
  'Jižní Morava': 'Jihomoravský', 'Jihomoravský kraj': 'Jihomoravský',
  'Střední Morava': 'Olomoucký', 'Olomoucký kraj': 'Olomoucký',
  'Zlínský kraj': 'Zlínský',
  'Moravskoslezský kraj': 'Moravskoslezský', 'Moravskoslezský': 'Moravskoslezský',
}
function normalizeKraj(name) { return KRAJ_NORMALIZE[name] || name || null }

function getInitials(name) { return name ? name.slice(0, 2).toUpperCase() : '??' }

export default function PassportScreen({ onBack }) {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const passportRef = useRef(null)
  const [visitedRegions, setVisitedRegions] = useState({}) // region → first_date
  const [totalKm, setTotalKm] = useState(0)
  const [totalRoutes, setTotalRoutes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const year = new Date().getFullYear()

  useEffect(() => {
    if (!user) return
    async function load() {
      const { data: runs } = await supabase
        .from('user_route_runs')
        .select('completed_at, total_km, kraj, routes(region, distance_km)')
        .eq('user_id', user.id)
        .eq('is_completed', true)
        .order('completed_at', { ascending: true })

      const regions = {}
      let km = 0
      let count = 0

      for (const run of runs ?? []) {
        // Use kraj from run (new), fall back to route region (old), normalize both
        const rawRegion = run.kraj || run.routes?.region
        const region = normalizeKraj(rawRegion)
        km += run.total_km ?? run.routes?.distance_km ?? 0
        count++
        if (region && REGIONS.includes(region) && !regions[region]) {
          regions[region] = run.completed_at ? new Date(run.completed_at).toLocaleDateString() : ''
        }
      }
      setVisitedRegions(regions)
      setTotalKm(Math.round(km * 10) / 10)
      setTotalRoutes(count)
      setLoading(false)
    }
    load()
  }, [user])

  const visitedCount = Object.keys(visitedRegions).length

  async function exportPassport() {
    if (!passportRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(passportRef.current, { backgroundColor: '#0d1117', scale: 2, width: 620, height: 874 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a'); a.href = url; a.download = `trailquest-pas-${year}.png`; a.click()
    } catch (e) { console.warn('Export failed:', e) }
    setExporting(false)
  }

  return (
    <div className="screen passport-screen">
      <div className="screen-header">
        <div className="routes-header-row">
          <h1 className="screen-title">{t('passport.title')}</h1>
          <button className="wiz-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {loading ? <div className="loading-state">{t('profile.loading')}</div> : (
        <div className="passport-body">
          <div className="passport-card" ref={passportRef}>
            <div className="passport-header">
              <span className="passport-logo">📔</span>
              <span className="passport-title-text">{t('passport.header', { year })}</span>
            </div>

            <div className="passport-owner">
              <div className="passport-avatar">{getInitials(profile?.username)}</div>
              <span className="passport-username">@{profile?.username}</span>
            </div>

            <div className="passport-grid">
              {REGIONS.map((region, i) => {
                const visited = visitedRegions[region]
                return (
                  <div key={region} className={`passport-stamp ${visited ? 'visited' : ''}`}>
                    <div className="passport-stamp-circle" style={{ borderColor: visited ? REGION_COLORS[i] : 'rgba(255,255,255,0.15)', color: visited ? REGION_COLORS[i] : 'rgba(255,255,255,0.25)' }}>
                      {visited ? '✓' : ''}
                    </div>
                    <span className="passport-stamp-name">{region}</span>
                    {visited && <span className="passport-stamp-date">{visited}</span>}
                  </div>
                )
              })}
            </div>

            <div className="passport-stats">
              {t('passport.visited', { n: visitedCount })} · {totalKm} km · {totalRoutes} {t('passport.routes')}
            </div>

            <div className="passport-progress">
              <div className="passport-progress-bar">
                <div className="passport-progress-fill" style={{ width: `${(visitedCount / 14) * 100}%` }} />
              </div>
              <span className="passport-progress-label">{year}: {visitedCount}/14 {t('passport.regions')}</span>
            </div>
          </div>

          <button className="btn-primary" onClick={exportPassport} disabled={exporting}>
            💾 {t('passport.download', { year })}
          </button>
        </div>
      )}
    </div>
  )
}
