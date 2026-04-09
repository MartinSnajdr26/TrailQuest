import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchAllBadges, RARITY_COLORS } from '../lib/badges.js'

const CONDITION_EMOJI = {
  total_km: '📏', streak_weeks: '🔥', correct_quizzes: '🧠', photo_tasks: '📸',
  brewery_checkins: '🍺', rain_hike: '🌧️', snow_hike: '❄️', heat_hike: '🌡️',
  storm_hike: '⛈️', below_zero: '🏔️', before_7am: '🌅', after_sunset: '🌙',
  first_on_route: '👑',
}

function getConditionText(badge) {
  const v = badge.condition_value ?? 1
  const map = {
    total_km: `Nachodí celkem ${v} km.`,
    streak_weeks: `Choď na trasy ${v} týdnů v řadě.`,
    correct_quizzes: `Odpověz správně na ${v} kvízových otázek.`,
    photo_tasks: `Splň ${v} foto výzev.`,
    brewery_checkins: `Navštiv ${v} pivovarů.`,
    rain_hike: 'Dokonči trasu za deště.',
    snow_hike: 'Dokonči trasu při sněžení.',
    heat_hike: 'Dokonči trasu při teplotě nad 30 °C.',
    storm_hike: 'Dokonči trasu za bouřky.',
    below_zero: 'Dokonči trasu při teplotě pod 0 °C.',
    before_7am: 'Vyraz na trasu před 7:00 ráno.',
    after_sunset: 'Dokonči trasu po západu slunce.',
    first_on_route: 'Buď první, kdo projde novou trasu.',
  }
  return map[badge.condition_type] || 'Splň podmínky pro získání odznaku.'
}

function getProgress(badge, stats) {
  if (!stats || !badge.condition_value) return null
  const map = {
    total_km: stats.totalKm ?? 0,
    streak_weeks: stats.weeklyStreak ?? 0,
    correct_quizzes: stats.quizCorrect ?? 0,
    photo_tasks: stats.photoTasks ?? 0,
    brewery_checkins: stats.breweryCheckins ?? 0,
  }
  const current = map[badge.condition_type]
  if (current == null) return null
  return { current: Math.round(current * 10) / 10, target: badge.condition_value }
}

export default function BadgeWall({ earnedBadgeIds, userStats }) {
  const { t, i18n } = useTranslation()
  const [allBadges, setAllBadges] = useState([])
  const [selected, setSelected] = useState(null)
  const earnedSet = new Set(earnedBadgeIds ?? [])
  const lang = i18n.language?.slice(0, 2) || 'cs'

  useEffect(() => { fetchAllBadges().then(setAllBadges) }, [])

  if (!allBadges.length) return null

  const selectedBadge = selected
  const selectedEarned = selected ? earnedSet.has(selected.id) : false

  return (
    <div className="badge-wall">
      <h3 className="badge-wall-title">{t('profile.badges')}</h3>
      <div className="badge-grid">
        {allBadges.map((badge) => {
          const earned = earnedSet.has(badge.id)
          const color = RARITY_COLORS[badge.rarity] ?? '#c0c0c0'
          const name = badge[`name_${lang}`] || badge.name_cs
          return (
            <div key={badge.id} className={`badge-item ${earned ? 'badge-item--earned' : 'badge-item--locked'}`}
              onClick={() => setSelected(badge)} style={{ cursor: 'pointer' }}>
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

      {/* ── Badge popup ─────────────────────────────── */}
      {selectedBadge && (
        <>
          <div onClick={() => setSelected(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, backdropFilter: 'blur(4px)',
          }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-card)',
            borderRadius: '24px 24px 0 0', padding: '28px 24px 40px', zIndex: 1001,
            animation: 'slideUp 250ms ease',
          }}>
            <button onClick={() => setSelected(null)} style={{
              position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%',
              background: 'var(--bg-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>

            {/* Icon */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 56, filter: selectedEarned ? 'none' : 'grayscale(1)', opacity: selectedEarned ? 1 : 0.4, marginBottom: 8 }}>
                {selectedBadge.icon_emoji || '🏅'}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 20,
                background: selectedEarned ? 'rgba(34,197,94,0.15)' : 'var(--bg-raised)',
                border: selectedEarned ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border)',
                fontSize: 12, fontWeight: 600, color: selectedEarned ? '#22c55e' : 'var(--text-muted)',
              }}>
                {selectedEarned ? '✓ Získáno' : '🔒 Nezískáno'}
              </div>
            </div>

            {/* Name */}
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8 }}>
              {selectedBadge[`name_${lang}`] || selectedBadge.name_cs}
            </div>

            {selectedBadge[`description_${lang}`] || selectedBadge.description_cs ? (
              <div style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
                {selectedBadge[`description_${lang}`] || selectedBadge.description_cs}
              </div>
            ) : null}

            <div style={{ height: 1, background: 'var(--border)', margin: '0 0 20px' }} />

            {/* How to earn */}
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
              {selectedEarned ? 'Jak jsi ji získal' : 'Jak ji získat'}
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
              background: selectedEarned ? 'rgba(34,197,94,0.08)' : 'var(--bg-raised)',
              borderRadius: 14, border: selectedEarned ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{CONDITION_EMOJI[selectedBadge.condition_type] || '🏅'}</span>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {getConditionText(selectedBadge)}
              </div>
            </div>

            {/* Progress bar */}
            {!selectedEarned && (() => {
              const prog = getProgress(selectedBadge, userStats)
              if (!prog) return null
              const pct = Math.min(100, Math.round((prog.current / prog.target) * 100))
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>Postup</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{prog.current} / {prog.target}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-raised)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 600ms ease' }} />
                  </div>
                </div>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
