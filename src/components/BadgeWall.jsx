import { useTranslation } from 'react-i18next'
import { BADGE_DEFS, RARITY_COLORS } from '../lib/badges.js'

export default function BadgeWall({ earnedBadgeIds }) {
  const { t } = useTranslation()
  const earnedSet = new Set(earnedBadgeIds ?? [])

  return (
    <div className="badge-wall">
      <h3 className="badge-wall-title">{t('profile.badges')}</h3>
      <div className="badge-grid">
        {BADGE_DEFS.map((badge) => {
          const earned = earnedSet.has(badge.id)
          const color = RARITY_COLORS[badge.rarity]
          return (
            <div
              key={badge.id}
              className={`badge-item ${earned ? 'badge-item--earned' : 'badge-item--locked'}`}
            >
              <div
                className="badge-icon-wrap"
                style={{ borderColor: earned ? color : 'var(--border)' }}
              >
                <span className="badge-icon-emoji">{badge.icon}</span>
              </div>
              <div className="badge-item-name">{t(badge.name)}</div>
              <div className="badge-item-rarity" style={{ color: earned ? color : 'var(--text-muted)' }}>
                {t(`badge.${badge.rarity}`)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
