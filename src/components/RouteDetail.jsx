import { useTranslation } from 'react-i18next'

const ACTIVITY_ICONS = { hiking: '🥾', cycling: '🚴', mtb: '🚵', crosscountry: '🏃', skitouring: '⛷️' }

function difficultyLabel(t, val) {
  if (!val) return '—'
  const v = String(val).toLowerCase()
  if (v === 'easy' || v === '1' || v === 'snadná') return t('route.easy')
  if (v === 'medium' || v === '2' || v === '3' || v === 'střední') return t('route.medium')
  if (v === 'hard' || v === '4' || v === '5' || v === 'náročná') return t('route.hard')
  return val
}

function formatDistance(km) {
  if (!km && km !== 0) return '—'
  return Number(km).toFixed(1)
}

export default function RouteDetail({ route, onClose, onStart }) {
  const { t } = useTranslation()
  if (!route) return null

  const icon = ACTIVITY_ICONS[route.activity_type] ?? '🥾'

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
              <span className="route-meta-chip">
                {formatDistance(route.distance_km)} {t('route.km')}
              </span>
              <span className="route-meta-chip">
                {difficultyLabel(t, route.difficulty)}
              </span>
              {route.elevation_gain_m > 0 && (
                <span className="route-meta-chip">↑ {route.elevation_gain_m} m</span>
              )}
              {route.region && (
                <span className="route-meta-chip">{route.region}</span>
              )}
              {route.is_loop && (
                <span className="route-meta-chip">↻ {t('route.loop')}</span>
              )}
            </div>
          </div>
          <button className="route-detail-close" onClick={onClose} aria-label={t('route.close')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {route.description && (
          <p className="route-detail-desc">{route.description}</p>
        )}

        <button className="btn-primary route-detail-start" onClick={onStart}>
          {t('route.start')}
        </button>
      </div>
    </div>
  )
}
