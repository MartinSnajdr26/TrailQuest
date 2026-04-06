export default function HikeProgressBar({ routeName, total, unlocked, onExit }) {
  return (
    <div className="hike-header">
      <button className="hike-exit-btn" onClick={onExit} aria-label="Ukončit trasu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="hike-header-center">
        <div className="hike-route-name">{routeName}</div>
        <div className="hike-progress-row">
          <div className="hike-seg-track">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className={`hike-seg-pip ${i < unlocked ? 'unlocked' : ''}`}
              />
            ))}
          </div>
          <span className="hike-progress-count">
            {unlocked}<span className="hike-progress-total">/{total}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
