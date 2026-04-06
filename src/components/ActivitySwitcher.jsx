import { useTranslation } from 'react-i18next'

export const ACTIVITIES = [
  { id: 'hiking',       labelKey: 'activity.hiking',       routeType: 'foot_fast',      icon: '🥾' },
  { id: 'cycling',      labelKey: 'activity.cycling',      routeType: 'bike_road',      icon: '🚴' },
  { id: 'mtb',          labelKey: 'activity.mtb',          routeType: 'bike_mountain',  icon: '🚵' },
  { id: 'crosscountry', labelKey: 'activity.crosscountry', routeType: 'foot_fast',      icon: '🏃' },
  { id: 'skitouring',   labelKey: 'activity.skitouring',   routeType: 'foot_fast',      icon: '⛷️' },
]

export default function ActivitySwitcher({ active, onChange }) {
  const { t } = useTranslation()

  return (
    <div className="activity-switcher">
      <div className="activity-scroll">
        {ACTIVITIES.map(act => (
          <button
            key={act.id}
            className={`activity-chip ${active === act.id ? 'active' : ''}`}
            onClick={() => onChange(act.id)}
          >
            <span className="activity-icon">{act.icon}</span>
            <span className="activity-label">{t(act.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
