import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function OnboardingScreen({ onComplete }) {
  const { t, i18n } = useTranslation()
  const [slide, setSlide] = useState(0)
  const [theme, setTheme] = useState(localStorage.getItem('tq_theme') ?? 'dark')
  const [authMode, setAuthMode] = useState(null) // null | 'signup' | 'login'
  const total = 5

  function next() { setSlide((s) => Math.min(s + 1, total - 1)) }
  function prev() { setSlide((s) => Math.max(s - 1, 0)) }
  function skip() { setSlide(total - 1) }

  function changeLang(code) {
    i18n.changeLanguage(code)
    localStorage.setItem('tq_lang', code)
  }

  function changeTheme(t) {
    setTheme(t)
    localStorage.setItem('tq_theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  function finish(mode) {
    localStorage.setItem('tq_firstLaunch', 'done')
    onComplete(mode) // 'signup' or 'login'
  }

  return (
    <div className="onboarding">
      {slide > 0 && slide < total - 1 && (
        <button className="ob-back" onClick={prev}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      {slide < total - 1 && (
        <button className="ob-skip" onClick={skip}>{t('ob.skip')} →</button>
      )}

      <div className="ob-body">
        {/* ── Slide 1: Theme & Language ─────────────── */}
        {slide === 0 && (
          <div className="ob-slide">
            <span className="ob-emoji">🧭</span>
            <h1 className="ob-title">TrailQuest</h1>
            <p className="ob-tagline">Outdoor treasure hunt</p>

            <div className="ob-section">
              <p className="ob-label">{t('ob.chooseLang')}</p>
              <div className="ob-lang-row">
                {[{ c: 'cs', f: '🇨🇿', l: 'Čeština' }, { c: 'en', f: '🇬🇧', l: 'English' }, { c: 'de', f: '🇩🇪', l: 'Deutsch' }].map((lang) => (
                  <button key={lang.c} className={`ob-lang-btn ${i18n.language === lang.c ? 'active' : ''}`} onClick={() => changeLang(lang.c)}>
                    {lang.f} {lang.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="ob-section">
              <p className="ob-label">{t('ob.chooseTheme')}</p>
              <div className="ob-theme-row">
                <button className={`ob-theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => changeTheme('light')}>☀️ {t('profile.lightMode')}</button>
                <button className={`ob-theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => changeTheme('dark')}>🌙 {t('profile.darkMode')}</button>
              </div>
            </div>

            <button className="btn-primary ob-next" onClick={next}>{t('ob.continue')} →</button>
          </div>
        )}

        {/* ── Slide 2: What is TrailQuest ──────────── */}
        {slide === 1 && (
          <div className="ob-slide" onClick={next}>
            <span className="ob-emoji">🗺️</span>
            <h1 className="ob-title">{t('ob.whatTitle')}</h1>
            <div className="ob-cards">
              <div className="ob-card"><span className="ob-card-icon">🧭</span><strong>{t('ob.card1Title')}</strong><p>{t('ob.card1Text')}</p></div>
              <div className="ob-card"><span className="ob-card-icon">🍺</span><strong>{t('ob.card2Title')}</strong><p>{t('ob.card2Text')}</p></div>
              <div className="ob-card"><span className="ob-card-icon">🏆</span><strong>{t('ob.card3Title')}</strong><p>{t('ob.card3Text')}</p></div>
            </div>
            <p className="ob-stats">{t('ob.stats')}</p>
          </div>
        )}

        {/* ── Slide 3: How it works ────────────────── */}
        {slide === 2 && (
          <div className="ob-slide" onClick={next}>
            <h1 className="ob-title">{t('ob.howTitle')}</h1>
            <div className="ob-steps">
              {[
                { n: '①', icon: '🎯', k: 'ob.how1' },
                { n: '②', icon: '🗺', k: 'ob.how2' },
                { n: '③', icon: '🔒', k: 'ob.how3' },
                { n: '④', icon: '🧠', k: 'ob.how4' },
                { n: '⑤', icon: '🏅', k: 'ob.how5' },
              ].map((s) => (
                <div key={s.n} className="ob-step-row">
                  <span className="ob-step-icon">{s.icon}</span>
                  <p className="ob-step-text">{t(s.k)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Slide 4: Two modes ───────────────────── */}
        {slide === 3 && (
          <div className="ob-slide" onClick={next}>
            <h1 className="ob-title">{t('ob.modesTitle')}</h1>
            <div className="ob-modes">
              <div className="ob-mode-card ob-mode-surprise">
                <span className="ob-mode-icon">🎲</span>
                <strong>{t('ob.surpriseTitle')}</strong>
                <p>{t('ob.surpriseText')}</p>
              </div>
              <div className="ob-mode-card ob-mode-custom">
                <span className="ob-mode-icon">🗺</span>
                <strong>{t('ob.customTitle')}</strong>
                <p>{t('ob.customText')}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Slide 5: Ready ───────────────────────── */}
        {slide === 4 && (
          <div className="ob-slide">
            <span className="ob-emoji">🚀</span>
            <h1 className="ob-title">{t('ob.readyTitle')}</h1>
            <p className="ob-text">{t('ob.readyText')}</p>
            <button className="btn-primary ob-finish" onClick={() => finish('signup')}>{t('ob.createAccount')}</button>
            <button className="btn-secondary ob-finish" onClick={() => finish('login')}>{t('ob.login')}</button>
          </div>
        )}
      </div>

      {/* Dots */}
      <div className="ob-dots">
        {Array.from({ length: total }, (_, i) => (
          <button key={i} className={`ob-dot ${i === slide ? 'active' : ''}`} onClick={() => setSlide(i)} />
        ))}
      </div>
    </div>
  )
}
