import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext.jsx'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function AuthScreen() {
  const { t } = useTranslation()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password)
      } else {
        const uname = username.trim().toLowerCase()
        if (!USERNAME_RE.test(uname)) { setError(t('username.hint')); setLoading(false); return }

        const data = await signUp(email.trim(), password, uname)

        // Check if email confirmation is required
        if (data?.user && !data?.session) {
          setEmailSent(true)
          setLoading(false)
          return
        }
      }
    } catch (err) {
      const msg = err?.message ?? ''
      if (msg.includes('Invalid login credentials')) setError(t('error.invalidCredentials'))
      else if (msg.includes('already registered')) setError(t('error.emailInUse'))
      else if (msg.includes('Username already taken')) setError(t('username.taken'))
      else if (msg.includes('Password')) setError(t('error.passwordShort'))
      else setError(msg || t('error.generic'))
    } finally {
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 48 }}>📧</span>
          <h2 className="auth-card-title">{t('auth.checkEmail')}</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{t('auth.confirmEmailText')}</p>
          <button className="btn-primary" onClick={() => { setEmailSent(false); setMode('login') }}>
            {t('auth.backToLogin')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <span style={{ fontSize: 48 }}>🧭</span>
        <h1 className="auth-title">{t('app.name')}</h1>
        <p className="auth-tagline">{t('auth.tagline')}</p>
      </div>

      <div className="auth-card">
        <h2 className="auth-card-title">
          {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
        </h2>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <label className="form-label">
              {t('username.label')}
              <input className="form-input" type="text" value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                required autoComplete="username" placeholder="trail_hiker_42" minLength={3} maxLength={20} />
              <span className="form-hint">{t('username.hint')}</span>
            </label>
          )}

          <label className="form-label">
            {t('auth.email')}
            <input className="form-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="vas@email.cz" />
          </label>

          <label className="form-label">
            {t('auth.password')}
            <input className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••" minLength={6} />
          </label>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? (mode === 'login' ? t('auth.loggingIn') : t('auth.signingUp')) : (mode === 'login' ? t('auth.login') : t('auth.signup'))}
          </button>
        </form>

        <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
          {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
          {' '}<span className="auth-switch-link">{mode === 'login' ? t('auth.signup') : t('auth.login')}</span>
        </button>
      </div>
    </div>
  )
}
