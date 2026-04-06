import { useTranslation } from 'react-i18next'

export default function AboutScreen({ onBack }) {
  const { t } = useTranslation()

  return (
    <div className="screen about-screen">
      <div className="screen-header">
        <div className="routes-header-row">
          <h1 className="screen-title">{t('about.title')}</h1>
          <button className="wiz-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      <div className="about-body">
        <div className="about-hero">
          <span className="about-logo">🧭</span>
          <h2 className="about-name">TrailQuest</h2>
          <p className="about-version">v1.0.0</p>
          <p className="about-tagline">{t('about.tagline')}</p>
        </div>

        <div className="about-section">
          <h3 className="about-section-title">{t('about.aboutTitle')}</h3>
          <p className="about-text">{t('about.aboutText')}</p>
        </div>

        <div className="about-section">
          <h3 className="about-section-title">{t('about.featuresTitle')}</h3>
          <ul className="about-features">
            {['feat1', 'feat2', 'feat3', 'feat4', 'feat5', 'feat6', 'feat7', 'feat8'].map((k) => (
              <li key={k}>✓ {t(`about.${k}`)}</li>
            ))}
          </ul>
        </div>

        <div className="about-section">
          <h3 className="about-section-title">{t('about.techTitle')}</h3>
          <div className="about-tech-row">
            <span>🗺 Mapy.com REST API</span>
            <span>🤖 Anthropic Claude</span>
            <span>☁️ Supabase</span>
            <span>⚡ Vite + React</span>
          </div>
        </div>

        <div className="about-section">
          <h3 className="about-section-title">{t('about.contactTitle')}</h3>
          <a className="btn-secondary about-contact-btn" href="mailto:support@trailquest.app">📧 {t('about.emailUs')}</a>
        </div>

        <p className="about-footer">© 2026 TrailQuest · v1.0.0</p>
      </div>
    </div>
  )
}
