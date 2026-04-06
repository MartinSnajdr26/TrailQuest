import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const ACTIVITY_ICONS = { hiking: '🥾', cycling: '🚴', mtb: '🚵', crosscountry: '🏃', skitouring: '⛷️', skiing: '⛷' }

function formatKm(km) { return km ? `${Number(km).toFixed(1)} km` : '—' }
function formatDate(d) { return d ? new Date(d).toLocaleDateString() : '' }

export default function RoutesScreen({ onStartRoute }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState('mine')
  const [myRoutes, setMyRoutes] = useState([])
  const [completedRuns, setCompletedRuns] = useState([])
  const [loading, setLoading] = useState(true)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null) // route object
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState(null) // { text, type: 'ok' | 'err' }

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  async function loadData() {
    setLoading(true)
    const [routesRes, runsRes] = await Promise.all([
      supabase
        .from('routes')
        .select('id, name, activity_type, distance_km, difficulty, created_at, region')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('user_route_runs')
        .select('id, started_at, completed_at, is_completed, routes(id, name, activity_type, distance_km, difficulty, gpx_data, region, elevation_gain_m, start_lat, start_lng)')
        .eq('user_id', user.id)
        .eq('is_completed', true)
        .order('completed_at', { ascending: false })
        .limit(50),
    ])
    setMyRoutes(routesRes.data ?? [])
    setCompletedRuns(runsRes.data ?? [])
    setLoading(false)
  }

  function elapsed(start, end) {
    if (!start || !end) return ''
    const ms = new Date(end) - new Date(start)
    const mins = Math.floor(ms / 60000)
    const hrs = Math.floor(mins / 60)
    const m = mins % 60
    return hrs > 0 ? `${hrs}h ${m}m` : `${m}m`
  }

  function showToast(text, type = 'ok') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete() {
    if (!deleteTarget || !user) return
    const routeId = deleteTarget.id
    setDeleting(true)

    // Optimistic: remove from list immediately
    setMyRoutes((prev) => prev.filter((r) => r.id !== routeId))
    setDeleteTarget(null)

    try {
      // 1. Get runs for this route
      const { data: runs } = await supabase
        .from('user_route_runs')
        .select('id')
        .eq('route_id', routeId)

      // 2. Delete challenge completions for those runs
      if (runs && runs.length > 0) {
        const runIds = runs.map((r) => r.id)
        await supabase
          .from('user_challenge_completions')
          .delete()
          .in('run_id', runIds)
      }

      // 3. Delete route runs
      await supabase
        .from('user_route_runs')
        .delete()
        .eq('route_id', routeId)

      // 4. Delete challenges
      await supabase
        .from('challenges')
        .delete()
        .eq('route_id', routeId)

      // 5. Delete route ratings
      await supabase
        .from('route_ratings')
        .delete()
        .eq('route_id', routeId)

      // 6. Delete route (safety: only own routes)
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId)
        .eq('created_by', user.id)

      if (error) throw error

      showToast(t('myRoutes.deleted'), 'ok')
    } catch (e) {
      console.warn('Delete route failed:', e)
      // Restore: re-fetch data
      showToast(t('myRoutes.deleteFailed'), 'err')
      loadData()
    }
    setDeleting(false)
  }

  return (
    <div className="screen routes-screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('myRoutes.title')}</h1>
        <div className="social-tabs">
          <button className={`social-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
            {t('myRoutes.myRoutes')}
          </button>
          <button className={`social-tab ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>
            {t('myRoutes.completed')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">{t('profile.loading')}</div>
      ) : tab === 'mine' ? (
        myRoutes.length === 0 ? (
          <div className="empty-state">{t('myRoutes.emptyMine')}</div>
        ) : (
          <div className="routes-list">
            {myRoutes.map((r) => (
              <div key={r.id} className="route-card">
                <div className="route-card-top" onClick={() => onStartRoute?.(r)}>
                  <span className="route-card-icon">{ACTIVITY_ICONS[r.activity_type] ?? '🥾'}</span>
                  <div className="route-card-name">{r.name}</div>
                  <button
                    className="route-delete-btn"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(r) }}
                    aria-label={t('myRoutes.delete')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
                <div className="route-card-meta" onClick={() => onStartRoute?.(r)}>
                  <span>{formatKm(r.distance_km)}</span>
                  {r.difficulty && <span className="route-card-tag">{r.difficulty}</span>}
                  <span>{formatDate(r.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : completedRuns.length === 0 ? (
        <div className="empty-state">{t('myRoutes.emptyCompleted')}</div>
      ) : (
        <div className="routes-list">
          {completedRuns.map((run) => (
            <div key={run.id} className="route-card" onClick={() => run.routes && onStartRoute?.(run.routes)}>
              <div className="route-card-top">
                <span className="route-card-icon">{ACTIVITY_ICONS[run.routes?.activity_type] ?? '🥾'}</span>
                <div className="route-card-name">{run.routes?.name ?? '—'}</div>
              </div>
              <div className="route-card-meta">
                <span>{formatKm(run.routes?.distance_km)}</span>
                <span>{elapsed(run.started_at, run.completed_at)}</span>
                <span>{formatDate(run.completed_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="delete-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="delete-title">{t('myRoutes.deleteTitle')}</h3>
            <p className="delete-desc">{t('myRoutes.deleteDesc')}</p>
            <div className="delete-btns">
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                {t('myRoutes.deleteCancel')}
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : `🗑 ${t('myRoutes.deleteConfirm')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === 'err' ? 'toast--err' : ''}`}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
