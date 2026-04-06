import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function UsernameSetup() {
  const { t } = useTranslation()
  const { user, saveUsername } = useAuth()
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState(null) // null | true | false
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)

  const valid = USERNAME_RE.test(value)

  // Debounced uniqueness check against users table
  useEffect(() => {
    setAvailable(null)
    if (!valid) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setChecking(true)
      const { data } = await supabase
        .from('users')
        .select('id')
        .ilike('username', value.trim())
        .neq('id', user?.id ?? '')
        .limit(1)
      setAvailable(!data || data.length === 0)
      setChecking(false)
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, valid, user?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!valid || available === false) return
    setError('')
    setSaving(true)
    try {
      await saveUsername(value.trim())
    } catch (err) {
      setError(err?.message ?? t('error.generic'))
      setSaving(false)
    }
  }

  const showHint = value.length > 0 && !valid
  const canSubmit = valid && available === true && !checking && !saving

  return (
    <div className="username-setup">
      <div className="username-setup-card">
        <div className="username-setup-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="var(--accent)" opacity="0.15" />
            <path d="M12 34L20 18l8 10 5-8 7 14H12z" fill="var(--accent)" />
            <circle cx="35" cy="16" r="3" fill="var(--accent)" />
          </svg>
        </div>
        <h1 className="username-setup-title">{t('username.welcome')}</h1>
        <p className="username-setup-sub">{t('username.chooseName')}</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="username-setup-form">
          <div className="username-input-wrap">
            <input
              className={`form-input username-input ${
                value.length > 0
                  ? (valid && available ? 'input--valid' : (valid && available === false) || showHint ? 'input--invalid' : '')
                  : ''
              }`}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
              placeholder={t('username.placeholder')}
              autoFocus
              maxLength={20}
              autoComplete="username"
            />
            {checking && <span className="username-status">...</span>}
            {!checking && valid && available === true && (
              <span className="username-status username-status--ok">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            )}
            {!checking && valid && available === false && (
              <span className="username-status username-status--taken">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </span>
            )}
          </div>

          {showHint && (
            <p className="username-hint">{t('username.hint')}</p>
          )}
          {valid && available === false && (
            <p className="username-hint username-hint--taken">{t('username.taken')}</p>
          )}

          <button className="btn-primary" type="submit" disabled={!canSubmit}>
            {saving ? t('username.saving') : t('username.continue')}
          </button>
        </form>
      </div>
    </div>
  )
}
