import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import RouteStats from './RouteStats.jsx'
import ElevationProfile from './ElevationProfile.jsx'

const ACTIVITY_ICONS = { hiking: '🥾', cycling: '🚴', mtb: '🚵', crosscountry: '🏃', skitouring: '⛷️' }

export default function RouteDetail({ route, onClose, onStart }) {
  const { t } = useTranslation()
  if (!route) return null

  const icon = ACTIVITY_ICONS[route.activity_type] ?? '🥾'
  const geometry = useMemo(() => {
    if (!route.gpx_data) return null
    try { return typeof route.gpx_data === 'string' ? JSON.parse(route.gpx_data) : route.gpx_data } catch { return null }
  }, [route.gpx_data])

  return (
    <div className="route-detail-overlay" onClick={onClose}>
      <div className="route-detail" onClick={e => e.stopPropagation()}>
        <div className="route-detail-handle" />

        <div className="route-detail-header">
          <div>
            <div className="route-detail-name-row">
              <span className="route-detail-icon">{icon}</span>
              <h2 className="route-detail-name">{route.name ?? '—'}</h2>
            </div>
            <div className="route-detail-meta">
              <RouteStats distanceKm={route.distance_km} durationSec={route.duration_sec} ascentM={route.elevation_gain_m} />
              {route.region && <span className="route-meta-chip">{route.region}</span>}
              {route.is_loop && <span className="route-meta-chip">↻ {t('route.loop')}</span>}
            </div>
          </div>
          <button className="route-detail-close" onClick={onClose} aria-label={t('route.close')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {geometry && <ElevationProfile geometry={geometry} />}

        {route.description && <p className="route-detail-desc">{route.description}</p>}

        <button className="btn-primary route-detail-start" onClick={onStart}>
          {t('route.start')}
        </button>
      </div>
    </div>
  )
}
