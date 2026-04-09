import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchAllBadges, RARITY_COLORS } from '../lib/badges.js'

export default function BadgeWall({ earnedBadgeIds }) {
  const { t, i18n } = useTranslation()
  const [allBadges, setAllBadges] = useState([])
  const earnedSet = new Set(earnedBadgeIds ?? [])
  const lang = i18n.language?.slice(0, 2) || 'cs'

  useEffect(() => {
    fetchAllBadges().then(setAllBadges)
  }, [])

  if (!allBadges.length) return null

  return (
    <div className="badge-wall">
      <h3 className="badge-wall-title">{t('profile.badges')}</h3>
      <div className="badge-grid">
        {allBadges.map((badge) => {
          const earned = earnedSet.has(badge.id)
          const color = RARITY_COLORS[badge.rarity] ?? '#c0c0c0'
          const name = badge[`name_${lang}`] || badge.name_cs
          return (
            <div key={badge.id} className={`badge-item ${earned ? 'badge-item--earned' : 'badge-item--locked'}`}>
              <div className="badge-icon-wrap" style={{ borderColor: earned ? color : 'var(--border)' }}>
                <span className="badge-icon-emoji">{badge.icon_emoji ?? '🏅'}</span>
              </div>
              <div className="badge-item-name">{name}</div>
              <div className="badge-item-rarity" style={{ color: earned ? color : 'var(--text-muted)' }}>
                {t(`badge.${badge.rarity}`, badge.rarity)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
