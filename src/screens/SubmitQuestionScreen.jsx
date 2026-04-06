import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const POI_TYPES = ['hrad', 'zámek', 'kostel', 'rozhledna', 'vyhlídka', 'pivovar', 'hospoda', 'muzeum', 'socha', 'příroda', 'most', 'náměstí', 'jiné']
const Q_TYPES = [
  { id: 'quiz', icon: '🧠', labelKey: 'submit.typeQuiz' },
  { id: 'count', icon: '🔢', labelKey: 'submit.typeCount' },
  { id: 'observe', icon: '👁', labelKey: 'submit.typeObserve' },
  { id: 'photo', icon: '📸', labelKey: 'submit.typePhoto' },
  { id: 'find', icon: '🔍', labelKey: 'submit.typeFind' },
  { id: 'checkin', icon: '✅', labelKey: 'submit.typeCheckin' },
]
const PLACEHOLDERS = {
  quiz: 'submit.phQuiz', count: 'submit.phCount', observe: 'submit.phObserve',
  photo: 'submit.phPhoto', find: 'submit.phFind', checkin: 'submit.phCheckin',
}

export default function SubmitQuestionScreen({ onBack }) {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [poiName, setPoiName] = useState('')
  const [poiType, setPoiType] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [questionType, setQuestionType] = useState('quiz')
  const [question, setQuestion] = useState('')
  const [optA, setOptA] = useState('')
  const [optB, setOptB] = useState('')
  const [optC, setOptC] = useState('')
  const [optD, setOptD] = useState('')
  const [correctIdx, setCorrectIdx] = useState(0) // 0-3
  const [correctCount, setCorrectCount] = useState('')
  const [tolerance, setTolerance] = useState(1)
  const [funFact, setFunFact] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  function useMyGPS() {
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(String(pos.coords.latitude)); setLng(String(pos.coords.longitude)) },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!poiName.trim() || !poiType || !question.trim()) return
    setError(''); setSaving(true)

    const opts = questionType === 'quiz' ? [optA, optB, optC, optD].filter(Boolean) : null
    const correct = questionType === 'quiz' ? [optA, optB, optC, optD][correctIdx] ?? optA
      : questionType === 'count' ? correctCount
      : null

    const { error: err } = await supabase.from('poi_questions').insert({
      poi_name: poiName.trim(),
      poi_type: poiType,
      gps_lat: lat ? Number(lat) : null,
      gps_lng: lng ? Number(lng) : null,
      gps_radius_m: 200,
      question: question.trim(),
      question_type: questionType,
      options: opts,
      correct_answer: correct,
      fun_fact: funFact.trim() || null,
      difficulty,
      language: 'cs',
      created_by: user?.id,
      is_approved: false,
      is_official: false,
      times_used: 0,
    })

    if (err) { setError(err.message); setSaving(false); return }
    setDone(true); setSaving(false)
  }

  if (done) {
    return (
      <div className="screen submit-screen">
        <div className="submit-done">
          <span className="submit-done-icon">🎉</span>
          <h2>{t('submit.thanks')}</h2>
          <p>{t('submit.sentForReview')}</p>
          <p className="submit-done-sub">{t('submit.willAppear')}</p>
          <button className="btn-primary" onClick={() => { setDone(false); setPoiName(''); setQuestion(''); setFunFact(''); setOptA(''); setOptB(''); setOptC(''); setOptD('') }}>
            {t('submit.addAnother')}
          </button>
          <button className="btn-secondary" onClick={onBack}>{t('submit.backToProfile')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen submit-screen">
      <div className="screen-header">
        <div className="routes-header-row">
          <h1 className="screen-title">{t('submit.title')}</h1>
          <button className="wiz-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      <form className="submit-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <label className="form-label">{t('submit.poiName')} *
          <input className="form-input" value={poiName} onChange={(e) => setPoiName(e.target.value)} required />
        </label>

        <label className="form-label">{t('submit.poiType')} *
          <select className="filter-select" value={poiType} onChange={(e) => setPoiType(e.target.value)} required>
            <option value="">—</option>
            {POI_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <div className="submit-gps-row">
          <button type="button" className="btn-secondary submit-gps-btn" onClick={useMyGPS}>📍 {t('submit.useGPS')}</button>
          <input className="form-input submit-gps-input" type="number" step="any" placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="form-input submit-gps-input" type="number" step="any" placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>

        <div className="submit-section">
          <span className="form-label">{t('submit.questionType')} *</span>
          <div className="wiz-chip-row">
            {Q_TYPES.map((qt) => (
              <button key={qt.id} type="button" className={`wiz-chip ${questionType === qt.id ? 'selected' : ''}`} onClick={() => setQuestionType(qt.id)}>
                {qt.icon} {t(qt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <label className="form-label">{t('submit.questionText')} *
          <textarea className="challenge-textarea" value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder={t(PLACEHOLDERS[questionType] ?? '')} required />
        </label>

        {questionType === 'quiz' && (
          <div className="submit-options">
            {['A', 'B', 'C', 'D'].map((letter, i) => (
              <div key={letter} className="submit-option-row">
                <input type="radio" name="correct" checked={correctIdx === i} onChange={() => setCorrectIdx(i)} />
                <input className="form-input" placeholder={`${t('submit.option')} ${letter} *`}
                  value={[optA, optB, optC, optD][i]}
                  onChange={(e) => [setOptA, setOptB, setOptC, setOptD][i](e.target.value)}
                  required
                />
              </div>
            ))}
            <p className="form-hint">{t('submit.selectCorrect')}</p>
          </div>
        )}

        {questionType === 'count' && (
          <div className="submit-count-row">
            <label className="form-label">{t('submit.correctAnswer')} *
              <input className="form-input" type="number" value={correctCount} onChange={(e) => setCorrectCount(e.target.value)} required />
            </label>
            <label className="form-label">{t('submit.tolerance')} ±
              <select className="filter-select" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))}>
                {[0, 1, 2, 5].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
        )}

        <label className="form-label">{t('submit.funFact')}
          <textarea className="challenge-textarea" value={funFact} onChange={(e) => setFunFact(e.target.value)} rows={2} placeholder={t('submit.funFactHint')} />
        </label>

        <div className="submit-section">
          <span className="form-label">{t('submit.difficulty')} *</span>
          <div className="wiz-chip-row">
            {['easy', 'medium', 'hard'].map((d) => (
              <button key={d} type="button" className={`wiz-chip ${difficulty === d ? 'selected' : ''}`} onClick={() => setDifficulty(d)}>
                {d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴'} {t(`submit.diff_${d}`)}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? '...' : t('submit.send')}
        </button>
      </form>
    </div>
  )
}
