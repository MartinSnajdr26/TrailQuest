import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { checkCountAnswer } from '../lib/challenges.js'

const TYPE_LABELS = { quiz: 'Kvíz', count: 'Spočítej', observe: 'Pozoruj', observation: 'Pozoruj', photo: 'Foto', checkin: 'Stanoviště', find: 'Najdi' }
const TYPE_ICONS = { quiz: '🧠', count: '🔢', observe: '👁', observation: '🔍', photo: '📷', checkin: '📍', find: '🔍' }

export default function ChallengeCard({ challenge, challengeIndex, totalChallenges, onComplete }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [answer, setAnswer] = useState('')
  const [selectedOption, setSelectedOption] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [quizResult, setQuizResult] = useState(null) // null | 'correct' | 'wrong'
  const [countResult, setCountResult] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [showFunFact, setShowFunFact] = useState(false)
  const photoUrlRef = useRef(null)

  useEffect(() => { const t = setTimeout(() => setVisible(true), 16); return () => clearTimeout(t) }, [])
  useEffect(() => { return () => { if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current) } }, [])

  // Determine the effective question type
  const qType = challenge.question_type ?? challenge.content_json?.question_type ?? challenge.type ?? 'observation'

  const options = useMemo(() => {
    const raw = challenge.options ?? challenge.content_json?.options
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    try { return JSON.parse(raw) } catch { return [] }
  }, [challenge])

  const funFact = challenge.fun_fact ?? challenge.content_json?.fun_fact ?? ''
  const taskText = challenge.description ?? challenge.content_json?.task ?? challenge.question ?? challenge.title ?? ''
  const placeName = challenge.content_json?.place_name ?? challenge.title ?? ''
  const correctAnswer = challenge.correct_answer ?? challenge.content_json?.correct_answer ?? ''

  function handlePhotoCapture(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    const url = URL.createObjectURL(file)
    photoUrlRef.current = url
    setPhotoPreview(url)
  }

  function handleSubmit() {
    switch (qType) {
      case 'quiz': {
        if (!selectedOption) return
        const isCorrect = selectedOption === correctAnswer || selectedOption.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()
        setQuizResult(isCorrect ? 'correct' : 'wrong')
        if (!isCorrect) return
        setShowFunFact(true)
        break
      }
      case 'count': {
        if (!answer) return
        const tolerance = challenge.content_json?.tolerance ?? 1
        const isCorrect = checkCountAnswer(answer, correctAnswer, tolerance)
        setCountResult(isCorrect ? 'correct' : 'wrong')
        setShowFunFact(true)
        setSubmitted(true)
        return // don't auto-complete, user clicks "Pokračovat"
      }
      case 'observe':
      case 'observation':
      case 'find': {
        if (!answer.trim()) return
        setShowFunFact(true)
        setSubmitted(true)
        return
      }
      case 'photo': {
        const val = photoPreview ? 'photo_submitted' : answer.trim()
        if (!val) return
        setShowFunFact(true)
        setSubmitted(true)
        return
      }
      case 'checkin': {
        onComplete(challenge, 'checked_in')
        return
      }
      default: {
        onComplete(challenge, answer || null)
        return
      }
    }
  }

  function handleContinue() {
    const isCorrect = qType === 'quiz' ? quizResult === 'correct'
      : qType === 'count' ? countResult === 'correct'
      : true
    onComplete(challenge, answer || selectedOption || 'done', isCorrect)
  }

  const canSubmit = (() => {
    switch (qType) {
      case 'quiz': return selectedOption !== null && quizResult !== 'wrong'
      case 'count': return answer.length > 0 && !submitted
      case 'observe': case 'observation': case 'find': return answer.trim().length > 0 && !submitted
      case 'photo': return (photoPreview !== null || answer.trim().length > 0) && !submitted
      case 'checkin': return true
      default: return true
    }
  })()

  const showContinue = (qType === 'quiz' && quizResult === 'correct')
    || (qType === 'count' && submitted)
    || (['observe', 'observation', 'find'].includes(qType) && submitted)
    || (qType === 'photo' && submitted)

  const typeLabel = TYPE_LABELS[qType] ?? 'Výzva'
  const typeIcon = TYPE_ICONS[qType] ?? '⭐'

  return (
    <div className="challenge-overlay">
      <div className={`challenge-card ${visible ? 'challenge-card--visible' : ''}`}>
        <div className="challenge-card-handle" />

        {/* Header */}
        <div className="challenge-card-header">
          <div className="challenge-type-badge">
            <span className="challenge-type-icon">{typeIcon}</span>
            <span className="challenge-type-label">{typeLabel}</span>
          </div>
          <span className="challenge-counter">{challengeIndex} / {totalChallenges}</span>
        </div>

        {challenge.content_json?.is_partner && challenge.content_json?.partner_discount && (
          <div className="challenge-partner-badge">
            🎫 {challenge.content_json.partner_discount}
          </div>
        )}

        {placeName && <h2 className="challenge-title">{placeName}</h2>}
        {taskText && taskText !== placeName && <p className="challenge-desc">{taskText}</p>}

        {/* ── Quiz ───────────────────────────────── */}
        {qType === 'quiz' && (
          <div className="quiz-body">
            <div className="quiz-options">
              {options.map((opt) => {
                const isSelected = selectedOption === opt
                const cls = isSelected
                  ? quizResult === 'wrong' ? 'quiz-option quiz-option--wrong'
                    : quizResult === 'correct' ? 'quiz-option quiz-option--correct'
                    : 'quiz-option quiz-option--selected'
                  : 'quiz-option'
                return <button key={opt} className={cls} onClick={() => { setSelectedOption(opt); setQuizResult(null) }}>{opt}</button>
              })}
            </div>
            {quizResult === 'wrong' && <p className="quiz-feedback quiz-feedback--wrong">{t('challenge.wrongAnswer')}</p>}
            {quizResult === 'correct' && <p className="quiz-feedback quiz-feedback--correct">{t('challenge.correct')}</p>}
          </div>
        )}

        {/* ── Count ──────────────────────────────── */}
        {qType === 'count' && (
          <div className="challenge-body">
            <input
              className="form-input count-input"
              type="number"
              inputMode="numeric"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="?"
              disabled={submitted}
            />
            {countResult === 'correct' && <p className="quiz-feedback quiz-feedback--correct">{t('challenge.correct')}</p>}
            {countResult === 'wrong' && <p className="quiz-feedback quiz-feedback--wrong">{t('challenge.countWrong', { answer: correctAnswer })}</p>}
          </div>
        )}

        {/* ── Observe / Find ─────────────────────── */}
        {['observe', 'observation', 'find'].includes(qType) && (
          <div className="challenge-body">
            <textarea
              className="challenge-textarea"
              placeholder={t('challenge.yourAnswer')}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              disabled={submitted}
            />
          </div>
        )}

        {/* ── Photo ──────────────────────────────── */}
        {qType === 'photo' && (
          <div className="challenge-body">
            {photoPreview ? (
              <div className="photo-preview-wrap">
                <img src={photoPreview} alt="" className="photo-preview-img" />
                {!submitted && <button className="photo-retake-btn" onClick={() => { setPhotoPreview(null); photoUrlRef.current = null }}>Znovu</button>}
              </div>
            ) : !submitted ? (
              <div className="photo-capture-wrap">
                <label className="photo-capture-btn">
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={{ display: 'none' }} />
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                  {t('challenge.takePhoto')}
                </label>
                <div className="photo-or-divider">{t('challenge.or')}</div>
                <textarea className="challenge-textarea" placeholder={t('challenge.describeInstead')} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} />
              </div>
            ) : null}
          </div>
        )}

        {/* ── Checkin ─────────────────────────────── */}
        {qType === 'checkin' && (
          <div className="challenge-body checkin-body">
            <div className="checkin-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
          </div>
        )}

        {/* Fun fact */}
        {showFunFact && funFact && (
          <div className="challenge-funfact">
            <span className="funfact-icon">💡</span>
            <p>{funFact}</p>
          </div>
        )}

        {/* Action buttons */}
        {showContinue ? (
          <button className="btn-primary challenge-submit-btn" onClick={handleContinue}>
            {t('challenge.continue')} →
          </button>
        ) : (
          <button className="btn-primary challenge-submit-btn" onClick={handleSubmit} disabled={!canSubmit}>
            {qType === 'checkin' ? t('challenge.imHere') : t('challenge.submit')}
          </button>
        )}
      </div>
    </div>
  )
}
