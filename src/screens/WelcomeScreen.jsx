import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function WelcomeScreen({ onComplete }) {
  const { t, i18n } = useTranslation()
  const [slide, setSlide] = useState(0)
  const [theme, setTheme] = useState(localStorage.getItem('tq_theme') ?? 'dark')
  const total = 4

  function nextSlide() { setSlide((s) => Math.min(s + 1, total - 1)) }
  function goToSlide(i) { setSlide(i) }
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

  function finish() {
    localStorage.setItem('tq_onboarding', 'done')
    onComplete()
  }

  const S = {
    screen: { position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    skip: { position: 'absolute', top: 14, right: 16, zIndex: 2, fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit' },
    body: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '20px', textAlign: 'center' },
    emoji: { fontSize: '64px', lineHeight: 1 },
    title: { fontSize: '26px', fontWeight: 700, color: 'var(--text)' },
    text: { fontSize: '15px', color: 'var(--text-muted)', maxWidth: '340px', lineHeight: 1.6 },
    steps: { textAlign: 'left', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: '320px' },
    dots: { display: 'flex', gap: '8px', justifyContent: 'center', padding: '16px 0 24px' },
    dot: (active) => ({ width: active ? 24 : 8, height: 8, borderRadius: 4, background: active ? 'var(--accent)' : 'var(--border)', transition: 'all 0.2s', cursor: 'pointer', border: 'none' }),
    langRow: { display: 'flex', gap: '8px' },
    langBtn: (active) => ({ padding: '10px 16px', borderRadius: '10px', border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-dim)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--text)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }),
    themeRow: { display: 'flex', gap: '10px' },
    themeBtn: (active) => ({ padding: '12px 20px', borderRadius: '12px', border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-dim)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--text)', fontWeight: 600, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }),
    finishBtn: { padding: '16px 32px', background: 'var(--accent)', color: '#0d1117', fontWeight: 700, fontSize: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  }

  return (
    <div style={S.screen}>
      {slide < total - 1 && (
        <button style={S.skip} onClick={skip}>{t('welcome.skip')} →</button>
      )}

      <div style={S.body} onClick={slide < total - 1 ? nextSlide : undefined}>
        {slide === 0 && (
          <>
            <span style={S.emoji}>🧭</span>
            <h1 style={S.title}>{t('welcome.title')}</h1>
            <p style={S.text}>{t('welcome.intro')}</p>
          </>
        )}

        {slide === 1 && (
          <>
            <span style={S.emoji}>🗺</span>
            <h1 style={S.title}>{t('welcome.howTitle')}</h1>
            <div style={S.steps}>
              <p>1. {t('welcome.step1')}</p>
              <p>2. {t('welcome.step2')}</p>
              <p>3. {t('welcome.step3')}</p>
              <p>4. {t('welcome.step4')}</p>
            </div>
          </>
        )}

        {slide === 2 && (
          <div onClick={(e) => e.stopPropagation()}>
            <span style={S.emoji}>⚙️</span>
            <h1 style={{ ...S.title, marginBottom: 16 }}>{t('welcome.settingsTitle')}</h1>

            <p style={{ ...S.text, marginBottom: 10 }}>{t('profile.language')}</p>
            <div style={S.langRow}>
              {[{ code: 'cs', flag: '🇨🇿', label: 'Čeština' }, { code: 'en', flag: '🇬🇧', label: 'English' }, { code: 'de', flag: '🇩🇪', label: 'Deutsch' }].map((l) => (
                <button key={l.code} style={S.langBtn(i18n.language === l.code)} onClick={() => changeLang(l.code)}>
                  {l.flag} {l.label}
                </button>
              ))}
            </div>

            <p style={{ ...S.text, margin: '20px 0 10px' }}>{t('profile.theme')}</p>
            <div style={S.themeRow}>
              <button style={S.themeBtn(theme === 'light')} onClick={() => changeTheme('light')}>☀️ {t('profile.lightMode')}</button>
              <button style={S.themeBtn(theme === 'dark')} onClick={() => changeTheme('dark')}>🌙 {t('profile.darkMode')}</button>
            </div>
          </div>
        )}

        {slide === 3 && (
          <>
            <span style={S.emoji}>🚀</span>
            <h1 style={S.title}>{t('welcome.readyTitle')}</h1>
            <p style={S.text}>{t('welcome.readyText')}</p>
            <button style={S.finishBtn} onClick={finish}>
              {t('welcome.start')} →
            </button>
          </>
        )}
      </div>

      <div style={S.dots}>
        {Array.from({ length: total }, (_, i) => (
          <button key={i} style={S.dot(i === slide)} onClick={() => goToSlide(i)} />
        ))}
      </div>
    </div>
  )
}
