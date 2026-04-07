import { useEffect, useRef, useState } from 'react'

export default function ElevationProfile({ geometry, color = '#22c55e', height = 80 }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return
    const coords = geometry?.geometry?.coordinates ?? geometry?.coordinates ?? []
    const elevs = coords.map((c) => c[2]).filter((e) => e != null && !isNaN(e) && e > 0)

    if (elevs.length < 3) { setStats(null); return }

    const min = Math.min(...elevs), max = Math.max(...elevs)
    const gain = elevs.reduce((a, e, i) => i === 0 ? 0 : a + Math.max(0, e - elevs[i - 1]), 0)
    setStats({ min: Math.round(min), max: Math.round(max), gain: Math.round(gain) })

    const canvas = canvasRef.current, w = wrapRef.current.offsetWidth, h = height
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr; canvas.height = h * dpr
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h)

    const range = max - min || 1, pad = { t: 6, b: 16, l: 28, r: 4 }
    const dW = w - pad.l - pad.r, dH = h - pad.t - pad.b

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1
    ;[0, 0.5, 1].forEach((t) => { const y = pad.t + dH * (1 - t); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke() })

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '9px system-ui'; ctx.textAlign = 'right'
    ctx.fillText(Math.round(max) + 'm', pad.l - 3, pad.t + 9)
    ctx.fillText(Math.round(min) + 'm', pad.l - 3, h - pad.b + 2)

    // Area
    ctx.beginPath()
    elevs.forEach((e, i) => { const x = pad.l + (i / (elevs.length - 1)) * dW, y = pad.t + dH - ((e - min) / range) * dH; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.lineTo(pad.l + dW, h - pad.b); ctx.lineTo(pad.l, h - pad.b); ctx.closePath()
    const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b)
    grad.addColorStop(0, color + '99'); grad.addColorStop(1, color + '08')
    ctx.fillStyle = grad; ctx.fill()

    // Line
    ctx.beginPath()
    elevs.forEach((e, i) => { const x = pad.l + (i / (elevs.length - 1)) * dW, y = pad.t + dH - ((e - min) / range) * dH; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke()
  }, [geometry, color, height])

  if (!stats) return null

  return (
    <div ref={wrapRef} style={{ width: '100%', padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, padding: '0 2px' }}>
        <span>Výškový profil</span>
        <span>↗ {stats.gain} m</span>
      </div>
      <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 6 }} />
    </div>
  )
}
