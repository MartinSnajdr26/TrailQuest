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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        const uname = username.trim().toLowerCase()
        if (!USERNAME_RE.test(uname)) {
          setError(t('username.hint'))
          setLoading(false)
          return
        }
        await signUp(email, password, uname)
      }
    } catch (err) {
      const msg = err?.message ?? ''
      if (msg.includes('Invalid login credentials')) {
        setError(t('error.invalidCredentials'))
      } else if (msg.includes('already registered')) {
        setError(t('error.emailInUse'))
      } else {
        setError(t('error.generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <div className="auth-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="var(--accent)" opacity="0.15" />
            <path d="M12 34L20 18l8 10 5-8 7 14H12z" fill="var(--accent)" />
            <circle cx="35" cy="16" r="3" fill="var(--accent)" />
          </svg>
        </div>
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
              <input
                className="form-input"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                required
                autoComplete="username"
                placeholder="trail_hiker_42"
                minLength={3}
                maxLength={20}
              />
              <span className="form-hint">{t('username.hint')}</span>
            </label>
          )}

          <label className="form-label">
            {t('auth.email')}
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="vas@email.cz"
            />
          </label>

          <label className="form-label">
            {t('auth.password')}
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              minLength={6}
            />
          </label>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading
              ? (mode === 'login' ? t('auth.loggingIn') : t('auth.signingUp'))
              : (mode === 'login' ? t('auth.login') : t('auth.signup'))
            }
          </button>
        </form>

        <button
          className="auth-switch"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
        >
          {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
          {' '}
          <span className="auth-switch-link">
            {mode === 'login' ? t('auth.signup') : t('auth.login')}
          </span>
        </button>
      </div>
    </div>
  )
}
