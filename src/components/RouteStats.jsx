export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hod`
  return `${h} hod ${m} min`
}

export default function RouteStats({ distanceKm, durationSec, ascentM }) {
  return (
    <div className="route-stats-row">
      {distanceKm > 0 && <span className="route-stat">📏 {Number(distanceKm).toFixed(1)} km</span>}
      {ascentM > 0 && <span className="route-stat">↗ {Math.round(ascentM)} m</span>}
      {durationSec > 0 && <span className="route-stat">⏱ {formatDuration(durationSec)}</span>}
    </div>
  )
}
