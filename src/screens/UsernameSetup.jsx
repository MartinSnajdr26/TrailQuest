import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function UsernameSetup() {
  const { t } = useTranslation()
  const { user, signOut, refreshProfile } = useAuth()
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)

  const valid = USERNAME_RE.test(value)

  // Debounced uniqueness check
  useEffect(() => {
    setAvailable(null)
    if (!valid) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setChecking(true)
      try {
        const { data } = await supabase.from('users').select('id').ilike('username', value.trim()).neq('id', user?.id ?? '').maybeSingle()
        setAvailable(!data)
      } catch { setAvailable(null) }
      setChecking(false)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, valid, user?.id])

  async function handleSubmit(e) {
    e?.preventDefault()
    if (!valid || available === false || saving) return
    await doSave(value.trim())
  }

  async function handleSkip() {
    if (saving) return
    await doSave('user_' + Math.random().toString(36).slice(2, 8))
  }

  async function doSave(username) {
    setSaving(true)
    setError('')

    try {
      // Verify session is alive
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      console.log('UsernameSetup: current user:', currentUser?.id)

      if (!currentUser) {
        setError(t('error.sessionExpired'))
        setSaving(false)
        return
      }

      const uid = currentUser.id

      // Try UPDATE first (row likely exists from trigger)
      console.log('UsernameSetup: trying update for', uid, '→', username)
      const { data: updated, error: updateErr } = await supabase
        .from('users')
        .update({ username })
        .eq('id', uid)
        .select('id')
        .maybeSingle()

      console.log('UsernameSetup: update result:', { updated, updateErr })

      if (updateErr) {
        console.warn('UsernameSetup: update failed:', updateErr.message)
      }

      if (!updated && !updateErr) {
        // Row doesn't exist — insert it
        console.log('UsernameSetup: no row found, inserting')
        const { error: insertErr } = await supabase
          .from('users')
          .insert({ id: uid, username })

        if (insertErr) {
          console.error('UsernameSetup: insert failed:', insertErr.message)
          if (insertErr.code === '23505') {
            setError(t('username.taken'))
          } else {
            setError(insertErr.message)
          }
          setSaving(false)
          return
        }
      }

      console.log('UsernameSetup: saved! Refreshing profile...')
      // Refresh profile in AuthContext to clear needsUsername
      await refreshProfile()

    } catch (err) {
      console.error('UsernameSetup: unexpected error:', err)
      setError(err?.message ?? t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = valid && available === true && !checking && !saving

  return (
    <div className="username-setup">
      <div className="username-setup-card">
        <span style={{ fontSize: 56 }}>🧭</span>
        <h1 className="username-setup-title">{t('username.welcome')}</h1>
        <p className="username-setup-sub">{t('username.chooseName')}</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="username-setup-form">
          <div className="username-input-wrap">
            <input
              className={`form-input username-input ${value.length > 0 ? (valid && available ? 'input--valid' : (valid && available === false) ? 'input--invalid' : '') : ''}`}
              type="text" value={value}
              onChange={(e) => { setValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()); setError('') }}
              placeholder={t('username.placeholder')} autoFocus maxLength={20} autoComplete="username" autoCapitalize="none"
            />
            {checking && <span className="username-status">...</span>}
            {!checking && valid && available === true && <span className="username-status username-status--ok">✓</span>}
            {!checking && valid && available === false && <span className="username-status username-status--taken">✗</span>}
          </div>

          {value.length > 0 && !valid && <p className="username-hint">{t('username.hint')}</p>}
          {valid && available === false && <p className="username-hint username-hint--taken">{t('username.taken')}</p>}

          <button className="btn-primary" type="submit" disabled={!canSubmit}>
            {saving ? t('username.saving') : t('username.continue')}
          </button>
        </form>

        <button className="username-skip" onClick={handleSkip} disabled={saving}>
          {t('username.skipForNow')}
        </button>

        <button className="username-signout" onClick={signOut} disabled={saving}>
          ← {t('username.backToLogin')}
        </button>
      </div>
    </div>
  )
}
