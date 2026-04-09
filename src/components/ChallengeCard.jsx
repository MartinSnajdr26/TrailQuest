import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { checkCountAnswer } from '../lib/challenges.js'

const TYPE_LABELS = { quiz: 'Kvíz', count: 'Spočítej', observe: 'Pozoruj', observation: 'Pozoruj', photo: 'Foto', checkin: 'Stanoviště', find: 'Najdi', rebus: 'Rébus' }
const TYPE_ICONS = { quiz: '🧠', count: '🔢', observe: '👁', observation: '🔍', photo: '📷', checkin: '📍', find: '🔍', rebus: '🔤' }

export default function ChallengeCard({ challenge, challengeIndex, totalChallenges, onComplete }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [answer, setAnswer] = useState('')
  const [selectedOption, setSelectedOption] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [quizResult, setQuizResult] = useState(null)
  const [countResult, setCountResult] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [showFunFact, setShowFunFact] = useState(false)
  const photoUrlRef = useRef(null)

  // Rebus-specific state
  const [rebusPhase, setRebusPhase] = useState('atmosphere') // 'atmosphere' | 'riddle' | 'result'
  const [rebusAnswer, setRebusAnswer] = useState(null)
  const [rebusCorrect, setRebusCorrect] = useState(null)
  const [showHint, setShowHint] = useState(false)
  const [hintLevel, setHintLevel] = useState(0)
  const [skipConfirm, setSkipConfirm] = useState(false)
  const [letterRevealed, setLetterRevealed] = useState(false)

  useEffect(() => { const t = setTimeout(() => setVisible(true), 16); return () => clearTimeout(t) }, [])
  useEffect(() => { return () => { if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current) } }, [])

  const qType = challenge.question_type ?? challenge.content_json?.question_type ?? challenge.type ?? 'observation'
  const isStoryRebus = qType === 'rebus' && challenge.content_json?.story_riddle

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

  // Rebus data
  const cj = challenge.content_json ?? {}
  const rebusLetter = cj.rebus_letter
  const rebusIndex = cj.rebus_index
  const rebusTotal = cj.rebus_total
  const rebusProgress = cj.rebus_progress ?? ''

  function handlePhotoCapture(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    const url = URL.createObjectURL(file)
    photoUrlRef.current = url
    setPhotoPreview(url)
  }

  // ── Rebus handlers ─────────────────────────────────────
  const [wrongFlash, setWrongFlash] = useState(false)
  const [wrongAttempts, setWrongAttempts] = useState(0)

  function handleRebusAnswer(opt) {
    if (rebusCorrect || wrongFlash) return
    const correct = opt.startsWith(cj.correct_answer + ':') || opt.split(':')[0].trim() === cj.correct_answer
    if (correct) {
      setRebusAnswer(opt)
      setRebusCorrect(true)
      setTimeout(() => { setRebusPhase('result'); setLetterRevealed(false); setTimeout(() => setLetterRevealed(true), 300) }, 600)
    } else {
      setWrongAttempts(prev => prev + 1)
      setWrongFlash(true)
      setRebusAnswer(null)
      setRebusCorrect(null)
      setTimeout(() => setWrongFlash(false), 1500)
    }
  }

  function handleRebusHint() {
    setShowHint(true)
    setHintLevel(prev => Math.min(prev + 1, 3))
  }

  function handleRebusSkip() {
    if (!skipConfirm) { setSkipConfirm(true); return }
    // Confirm skip — complete with '?' letter
    onComplete(challenge, '?_skipped', false, { skipped: true, hintsUsed: hintLevel })
  }

  function handleRebusContinue() {
    onComplete(challenge, rebusLetter, true, { skipped: false, hintsUsed: hintLevel })
  }

  function getCurrentHint() {
    if (hintLevel >= 3) return 'Nápovědy vyčerpány. Zkus to nebo přeskoč.'
    if (hintLevel === 1) return cj.hint_level_1 || 'Přemýšlej o tom jinak.'
    if (hintLevel === 2) return cj.hint_level_2 || 'Zkus vyloučit špatné odpovědi.'
    if (hintLevel === 3) return cj.hint_level_3 || 'Odpověď se skrývá na místě.'
    return ''
  }

  // ── Story rebus render ─────────────────────────────────
  if (isStoryRebus) {
    return (
      <div className="challenge-overlay">
        <div className={`challenge-card ${visible ? 'challenge-card--visible' : ''}`}>
          <div className="challenge-card-handle" />

          {/* Header */}
          <div className="challenge-card-header">
            <div className="challenge-type-badge">
              <span className="challenge-type-icon">🔤</span>
              <span className="challenge-type-label">Rébus</span>
            </div>
            <span className="challenge-counter">{challengeIndex} / {totalChallenges}</span>
          </div>

          {/* ── PHASE: Atmosphere ──────────────── */}
          {rebusPhase === 'atmosphere' && (
            <div style={{ padding: '8px 0' }}>
              {cj.story_title && (
                <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>
                  📖 {cj.story_title}
                </div>
              )}
              {placeName && <h2 className="challenge-title">{placeName}</h2>}
              {cj.story_atmosphere && (
                <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.6, margin: '12px 0' }}>
                  "{cj.story_atmosphere}"
                </p>
              )}
              {/* Rebus progress bar */}
              <div style={{ background: 'var(--bg-raised)', borderRadius: 12, padding: '10px 14px', margin: '12px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>🔤 Rébus:</div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.15em', fontFamily: 'monospace' }}>
                  {rebusProgress}
                </div>
              </div>
              <button className="btn-primary challenge-submit-btn" onClick={() => setRebusPhase('riddle')}>
                Zobrazit hádanku →
              </button>
            </div>
          )}

          {/* ── PHASE: Riddle ─────────────────── */}
          {rebusPhase === 'riddle' && (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>🧩 Hádanka</div>
              <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.5, margin: '8px 0 16px' }}>
                "{cj.riddle}"
              </p>

              {/* Wrong answer flash */}
              {wrongFlash && (
                <div className="rebus-shake" style={{
                  background: 'rgba(239,68,68,0.12)', border: '1.5px solid rgba(239,68,68,0.4)',
                  borderRadius: 12, padding: '14px 16px', marginBottom: 12, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>❌</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f87171' }}>
                    {cj.wrong_answer_text || 'Špatná odpověď! Zkus to znovu.'}
                  </div>
                </div>
              )}

              {/* Answer options grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {options.map(opt => {
                  const isSelected = rebusAnswer === opt
                  let borderColor = 'var(--border)'
                  let bg = 'var(--bg-raised)'
                  if (isSelected && rebusCorrect === true) { borderColor = 'var(--accent)'; bg = 'var(--accent-dim)' }
                  return (
                    <button key={opt} onClick={() => handleRebusAnswer(opt)} disabled={wrongFlash || rebusCorrect} style={{
                      padding: '14px 8px', borderRadius: 12, border: `1.5px solid ${borderColor}`, background: bg,
                      color: 'var(--text-primary)', fontSize: 14, fontWeight: 500,
                      cursor: wrongFlash || rebusCorrect ? 'default' : 'pointer',
                      opacity: wrongFlash ? 0.5 : 1, transition: 'all 150ms', textAlign: 'center',
                    }}>
                      {opt}
                    </button>
                  )
                })}
              </div>

              {/* Skip confirm dialog */}
              {skipConfirm && rebusCorrect !== false && (
                <div style={{ textAlign: 'center', margin: '12px 0', padding: 12, background: 'var(--bg-raised)', borderRadius: 12 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Opravdu přeskočit? Získáš písmeno '?' místo správného.</p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button onClick={handleRebusSkip} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#f87171', color: '#fff', fontSize: 13, cursor: 'pointer' }}>Ano, přeskočit</button>
                    <button onClick={() => setSkipConfirm(false)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Ne, zkusím dál</button>
                  </div>
                </div>
              )}

              {/* Hint display */}
              {showHint && hintLevel > 0 && (
                <div style={{ background: 'var(--accent-dim)', borderRadius: 10, padding: '10px 14px', margin: '10px 0', borderLeft: '3px solid var(--accent)' }}>
                  <span style={{ fontSize: 13 }}>💡 {getCurrentHint()}</span>
                </div>
              )}

              {/* Bottom actions (when no answer yet) */}
              {!rebusAnswer && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <button onClick={handleRebusHint} disabled={hintLevel >= 3} style={{
                    padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-raised)',
                    color: 'var(--text)', fontSize: 13, cursor: hintLevel >= 3 ? 'default' : 'pointer', opacity: hintLevel >= 3 ? 0.4 : 1,
                  }}>💡 Nápověda ({hintLevel}/3)</button>
                  <button onClick={handleRebusSkip} style={{
                    padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-raised)',
                    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                  }}>⏭ Přeskočit</button>
                </div>
              )}
            </div>
          )}

          {/* ── PHASE: Result (correct) ───────── */}
          {rebusPhase === 'result' && (
            <div style={{ padding: '8px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Správně!</h3>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 16 }}>
                "{cj.correct_answer_text}"
              </p>

              {/* Letter reveal */}
              <div style={{ background: 'var(--bg-raised)', borderRadius: 16, padding: '20px', margin: '12px auto', maxWidth: 220 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Získáváš písmeno:</div>
                <div className={letterRevealed ? 'rebus-letter-reveal' : ''} style={{
                  fontSize: 48, fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace',
                  opacity: letterRevealed ? 1 : 0, transition: 'opacity 0.3s',
                }}>
                  {rebusLetter}
                </div>
              </div>

              {/* Updated progress */}
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.15em', fontFamily: 'monospace', margin: '12px 0' }}>
                Rébus: {rebusProgress ? rebusProgress.split('').map((c, i) => i === (rebusIndex - 1) * 2 ? rebusLetter : c).join('') : ''}
              </div>

              <button className="btn-primary challenge-submit-btn" onClick={handleRebusContinue}>
                Pokračovat →
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Standard challenge rendering (non-rebus) ──────────

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
        return
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
