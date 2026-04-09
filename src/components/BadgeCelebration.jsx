import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RARITY_COLORS } from '../lib/badges.js'

export default function BadgeCelebration({ badges, onClose }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 16)
    return () => clearTimeout(timer)
  }, [])

  if (!badges || badges.length === 0) return null

  const badge = badges[current]
  const color = RARITY_COLORS[badge.rarity] ?? RARITY_COLORS.bronze

  function handleNext() {
    if (current < badges.length - 1) {
      setCurrent((c) => c + 1)
    } else {
      onClose()
    }
  }

  return (
    <div className={`badge-celebration-overlay ${visible ? 'visible' : ''}`} onClick={handleNext}>
      <div className="badge-celebration" onClick={(e) => e.stopPropagation()}>
        <div className="badge-celebration-glow" style={{ background: color }} />
        <div className="badge-celebration-icon" style={{ borderColor: color }}>
          <span className="badge-celebration-emoji">{badge.icon ?? badge.icon_emoji ?? '🏅'}</span>
        </div>
        <h2 className="badge-celebration-title">{t('badge.earned')}</h2>
        <h3 className="badge-celebration-name" style={{ color }}>
          {badge.name ?? t(badge.name_cs)}
        </h3>
        {badge.desc && <p className="badge-celebration-desc">{t(badge.desc)}</p>}
        <div className="badge-celebration-rarity" style={{ color }}>
          {t(`badge.${badge.rarity}`)}
        </div>
        <button className="btn-primary badge-celebration-btn" onClick={handleNext}>
          {current < badges.length - 1 ? t('badge.next') : t('badge.close')}
        </button>
      </div>
    </div>
  )
}
