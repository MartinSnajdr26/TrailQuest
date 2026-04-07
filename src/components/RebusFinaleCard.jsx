import { useState, useEffect, useRef } from 'react'

export default function RebusFinaleCard({ challenge, onComplete }) {
  const cj = challenge.content_json ?? {}
  const letters = cj.letters ?? []
  const correctWord = cj.correct_answer ?? ''
  const storyTitle = cj.story_title
  const storyFinale = cj.story_finale

  const [phase, setPhase] = useState('scramble') // 'scramble' | 'input' | 'success'
  const [shuffled, setShuffled] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [wrongAttempts, setWrongAttempts] = useState(0)
  const [shake, setShake] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => setVisible(true), 16) }, [])

  // Scramble letters on mount
  useEffect(() => {
    const s = [...letters].sort(() => Math.random() - 0.5)
    setShuffled(s)
    // Auto-unscramble after 2s
    const t = setTimeout(() => { setShuffled(letters); setTimeout(() => setPhase('input'), 800) }, 2000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (phase === 'input' && inputRef.current) inputRef.current.focus()
  }, [phase])

  function handleSubmit() {
    if (inputValue.trim().toUpperCase() === correctWord.toUpperCase()) {
      setPhase('success')
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 4000)
    } else {
      setWrongAttempts(prev => prev + 1)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      if (wrongAttempts >= 2) {
        // After 3 wrong attempts, show correct answer
        setInputValue(correctWord)
        setTimeout(() => { setPhase('success'); setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000) }, 1000)
      }
    }
  }

  function handleFinish() {
    onComplete(challenge, correctWord, true)
  }

  return (
    <div className="challenge-overlay">
      <div className={`challenge-card ${visible ? 'challenge-card--visible' : ''}`} style={{ maxHeight: '85vh', overflow: 'auto' }}>
        <div className="challenge-card-handle" />

        {/* Confetti */}
        {showConfetti && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 100 }}>
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} className="confetti-piece" style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                backgroundColor: ['#4ade80', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#fb923c'][i % 6],
              }} />
            ))}
          </div>
        )}

        {/* Header */}
        <div className="challenge-card-header">
          <div className="challenge-type-badge">
            <span className="challenge-type-icon">🏁</span>
            <span className="challenge-type-label">Finále rébusu</span>
          </div>
        </div>

        {/* ── SCRAMBLE PHASE ─────────────── */}
        {phase === 'scramble' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Máš všechna písmena!</h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              {shuffled.map((letter, i) => (
                <div key={i} style={{
                  width: 44, height: 52, borderRadius: 10, background: 'var(--accent-dim)', border: '2px solid var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, fontFamily: 'monospace',
                  color: 'var(--accent)', transition: 'all 0.6s ease',
                }}>
                  {letter}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>Seřaď je do správného slova...</p>
          </div>
        )}

        {/* ── INPUT PHASE ────────────────── */}
        {phase === 'input' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>🏁 Finále rébusu!</h3>

            {/* Show letters */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {letters.map((letter, i) => (
                <div key={i} style={{
                  width: 44, height: 52, borderRadius: 10, background: 'var(--accent-dim)', border: '2px solid var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, fontFamily: 'monospace',
                  color: 'var(--accent)',
                }}>
                  {letter}
                </div>
              ))}
            </div>

            <div style={{ maxWidth: 280, margin: '0 auto' }}>
              <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6 }}>Zadej tajné slovo:</label>
              <input
                ref={inputRef}
                className={`form-input ${shake ? 'rebus-shake' : ''}`}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}
                autoComplete="off"
              />
            </div>

            {wrongAttempts > 0 && wrongAttempts < 3 && (
              <p style={{ fontSize: 13, color: '#f87171', marginTop: 8 }}>
                Hmm, zkus to znovu. Podívej se na písmena. ({wrongAttempts}/3)
              </p>
            )}

            <button className="btn-primary challenge-submit-btn" onClick={handleSubmit} disabled={!inputValue.trim()} style={{ marginTop: 16 }}>
              ✓ Potvrdit
            </button>
          </div>
        )}

        {/* ── SUCCESS PHASE ──────────────── */}
        {phase === 'success' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{correctWord}</h3>
            <p style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600, marginBottom: 16 }}>{cj.celebration}</p>

            {/* Story finale text */}
            {storyFinale && (
              <div style={{ background: 'var(--bg-raised)', borderRadius: 12, padding: '14px 16px', margin: '12px 0', textAlign: 'left' }}>
                {storyTitle && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>📖 {storyTitle}</div>}
                <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>"{storyFinale}"</p>
              </div>
            )}

            <button className="btn-primary challenge-submit-btn" onClick={handleFinish} style={{ marginTop: 16 }}>
              Dokončit →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
