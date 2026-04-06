import { useEffect, useRef } from 'react'

export default function ElevationProfile({ geometry, color = '#4ade80' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !geometry) return

    const coords = geometry?.geometry?.coordinates ?? geometry?.coordinates ?? []
    const elevations = coords.filter((c) => c.length >= 3 && !isNaN(c[2])).map((c) => c[2])

    if (elevations.length < 2) { drawPlaceholder(canvas); return }
    drawProfile(canvas, elevations, color)
  }, [geometry, color])

  return (
    <div className="elev-wrap">
      <canvas ref={canvasRef} className="elev-canvas" />
    </div>
  )
}

function drawProfile(canvas, elevations, color) {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.offsetWidth || 300
  const height = 80
  canvas.width = width * dpr; canvas.height = height * dpr
  canvas.style.width = width + 'px'; canvas.style.height = height + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const min = Math.min(...elevations), max = Math.max(...elevations)
  const range = max - min || 1

  // Fill area
  ctx.beginPath()
  ctx.moveTo(0, height)
  elevations.forEach((e, i) => {
    const x = (i / (elevations.length - 1)) * width
    const y = height - ((e - min) / range) * (height - 12) - 6
    ctx.lineTo(x, y)
  })
  ctx.lineTo(width, height); ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, height)
  grad.addColorStop(0, color + 'aa'); grad.addColorStop(1, color + '11')
  ctx.fillStyle = grad; ctx.fill()

  // Stroke line
  ctx.beginPath()
  elevations.forEach((e, i) => {
    const x = (i / (elevations.length - 1)) * width
    const y = height - ((e - min) / range) * (height - 12) - 6
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '10px sans-serif'
  ctx.fillText(Math.round(min) + ' m', 4, height - 4)
  ctx.fillText(Math.round(max) + ' m', 4, 12)
  ctx.textAlign = 'right'
  ctx.fillText(`↗ ${Math.round(max - min)} m`, width - 4, 12)
}

function drawPlaceholder(canvas) {
  const width = canvas.offsetWidth || 300
  canvas.width = width; canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, 0, width, 80)
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'; ctx.fillText('Výškový profil nedostupný', width / 2, 44)
}
