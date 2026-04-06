import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const FAQ = [
  { section: 'help.basics', items: ['help.q1', 'help.q2', 'help.q3'] },
  { section: 'help.navigation', items: ['help.q4', 'help.q5', 'help.q6'] },
  { section: 'help.routes', items: ['help.q7', 'help.q8', 'help.q9', 'help.q10'] },
  { section: 'help.challengeTypes', items: ['help.q11', 'help.q12'] },
  { section: 'help.badges', items: ['help.q13', 'help.q14'] },
  { section: 'help.community', items: ['help.q15', 'help.q16'] },
  { section: 'help.contributing', items: ['help.q17', 'help.q18'] },
  { section: 'help.technical', items: ['help.q19', 'help.q20', 'help.q21'] },
]

export default function HelpScreen({ onBack }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return FAQ
    const q = search.toLowerCase()
    return FAQ.map((sec) => ({
      ...sec,
      items: sec.items.filter((key) => {
        const question = t(`${key}.q`).toLowerCase()
        const answer = t(`${key}.a`).toLowerCase()
        return question.includes(q) || answer.includes(q)
      }),
    })).filter((sec) => sec.items.length > 0)
  }, [search, t])

  return (
    <div className="screen help-screen">
      <div className="screen-header">
        <div className="routes-header-row">
          <h1 className="screen-title">{t('help.title')}</h1>
          <button className="wiz-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <input className="form-input" style={{ marginTop: 10 }} type="text" placeholder={`🔍 ${t('help.searchPlaceholder')}`}
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="help-body">
        {filtered.map((sec) => (
          <div key={sec.section} className="help-section">
            <h3 className="help-section-title">{t(sec.section)}</h3>
            {sec.items.map((key) => {
              const isOpen = openId === key
              return (
                <div key={key} className="help-item">
                  <button className="help-question" onClick={() => setOpenId(isOpen ? null : key)}>
                    <span>{t(`${key}.q`)}</span>
                    <span className="help-chevron">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div className="help-answer">
                      <p>{t(`${key}.a`)}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div className="help-footer">
          <p className="help-footer-text">{t('help.notFound')}</p>
          <a className="btn-secondary help-footer-btn" href="mailto:support@trailquest.app">{t('help.contactUs')}</a>
        </div>
      </div>
    </div>
  )
}
