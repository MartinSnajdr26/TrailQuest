import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getCategoryEmoji } from '../lib/routeGenerator.js'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY
const TYPE_ICONS = { quiz: '🧠', count: '🔢', observe: '👁', photo: '📸', find: '🔍', checkin: '✅' }

export default function AdminScreen({ onBack }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState('questions')
  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [pendingPois, setPendingPois] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editQuestion, setEditQuestion] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [pRes, aRes, poiRes, partnerRes] = await Promise.all([
      supabase.from('poi_questions').select('*, users(username)').eq('is_approved', false).order('created_at', { ascending: true }),
      supabase.from('poi_questions').select('*').eq('is_approved', true).order('created_at', { ascending: false }).limit(100),
      supabase.from('custom_pois').select('*, users:submitted_by(username)').eq('is_approved', false).order('created_at', { ascending: true }),
      supabase.from('custom_pois').select('*').eq('is_partner', true).order('name'),
    ])
    setPending(pRes.data ?? [])
    setApproved(aRes.data ?? [])
    setPendingPois(poiRes.data ?? [])
    setPartners(partnerRes.data ?? [])
    setLoading(false)
  }

  async function approve(id) {
    await supabase.from('poi_questions').update({ is_approved: true, reviewed_at: new Date().toISOString(), reviewed_by: user?.id }).eq('id', id)
    load()
  }
  async function reject(id) {
    await supabase.from('poi_questions').delete().eq('id', id)
    load()
  }
  async function deleteApproved(id) {
    await supabase.from('poi_questions').delete().eq('id', id)
    setApproved((prev) => prev.filter((q) => q.id !== id))
  }
  async function saveEdit(id) {
    if (!editQuestion.trim()) return
    await supabase.from('poi_questions').update({ question: editQuestion.trim(), is_approved: true, reviewed_at: new Date().toISOString(), reviewed_by: user?.id }).eq('id', id)
    setEditingId(null); load()
  }

  // POI moderation
  async function approvePoi(id, quality) {
    await supabase.from('custom_pois').update({ is_approved: true, is_verified: true, quality_score: quality ?? 7 }).eq('id', id)
    load()
  }
  async function rejectPoi(id) {
    await supabase.from('custom_pois').delete().eq('id', id)
    load()
  }

  async function togglePartner(poi) {
    const newVal = !poi.is_partner
    await supabase.from('custom_pois').update({ is_partner: newVal }).eq('id', poi.id)
    load()
  }

  async function updatePartnerDiscount(id, discount) {
    await supabase.from('custom_pois').update({ partner_discount: discount }).eq('id', id)
  }

  return (
    <div className="screen admin-screen">
      <div className="screen-header">
        <div className="routes-header-row">
          <h1 className="screen-title">{t('admin.title')}</h1>
          <button className="wiz-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="social-tabs">
          <button className={`social-tab ${tab === 'questions' ? 'active' : ''}`} onClick={() => setTab('questions')}>
            {t('admin.pendingQ')} ({pending.length})
          </button>
          <button className={`social-tab ${tab === 'pois' ? 'active' : ''}`} onClick={() => setTab('pois')}>
            {t('admin.pendingPoi')} ({pendingPois.length})
          </button>
          <button className={`social-tab ${tab === 'partners' ? 'active' : ''}`} onClick={() => setTab('partners')}>
            {t('admin.partners')} ({partners.length})
          </button>
          <button className={`social-tab ${tab === 'approved' ? 'active' : ''}`} onClick={() => setTab('approved')}>
            {t('admin.approved')}
          </button>
        </div>
      </div>

      {loading ? <div className="loading-state">{t('profile.loading')}</div> : (
        <div className="admin-list">
          {/* Questions tab */}
          {tab === 'questions' && (pending.length === 0 ? <div className="empty-state">{t('admin.noPending')}</div> : pending.map((q) => (
            <div key={q.id} className="admin-card">
              <div className="admin-card-top">
                <span className="admin-type-badge">{TYPE_ICONS[q.question_type] ?? '❓'} {q.question_type}</span>
                <span className="admin-poi-name">{q.poi_name}</span>
                <span className="admin-poi-type">{q.poi_type}</span>
              </div>
              {editingId === q.id ? (
                <div className="admin-edit">
                  <textarea className="challenge-textarea" value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} rows={3} />
                  <div className="admin-edit-btns">
                    <button className="btn-primary" onClick={() => saveEdit(q.id)}>{t('admin.saveApprove')}</button>
                    <button className="btn-secondary" onClick={() => setEditingId(null)}>{t('username.cancel')}</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="admin-question">{q.question}</p>
                  {q.options && <div className="admin-options">{(Array.isArray(q.options) ? q.options : []).map((o, i) => (
                    <span key={i} className={`admin-opt ${o === q.correct_answer ? 'correct' : ''}`}>{o}</span>
                  ))}</div>}
                  {q.correct_answer && <p className="admin-correct">✓ {q.correct_answer}</p>}
                  {q.fun_fact && <p className="admin-funfact">💡 {q.fun_fact}</p>}
                  <p className="admin-meta">{q.users?.username ?? '?'} · {q.difficulty} · {new Date(q.created_at).toLocaleDateString()}</p>
                  <div className="admin-actions">
                    <button className="btn-primary admin-action-btn" onClick={() => approve(q.id)}>✓ {t('admin.approve')}</button>
                    <button className="btn-secondary admin-action-btn" onClick={() => { setEditingId(q.id); setEditQuestion(q.question) }}>✏ {t('admin.edit')}</button>
                    <button className="btn-danger admin-action-btn" onClick={() => reject(q.id)}>✗ {t('admin.reject')}</button>
                  </div>
                </>
              )}
            </div>
          )))}

          {/* POI moderation tab */}
          {tab === 'pois' && (pendingPois.length === 0 ? <div className="empty-state">{t('admin.noPendingPoi')}</div> : pendingPois.map((p) => (
            <div key={p.id} className="admin-card">
              <div className="admin-card-top">
                <span className="admin-type-badge">{getCategoryEmoji(p.poi_category)} {p.poi_category}</span>
                <span className="admin-poi-name">{p.name}</span>
                {p.region && <span className="admin-poi-type">{p.region}</span>}
              </div>
              {p.description && <p className="admin-question">{p.description}</p>}
              {p.gps_lat && p.gps_lng && (
                <img className="admin-map-preview" src={`https://api.mapy.cz/v1/static?lat=${p.gps_lat}&lon=${p.gps_lng}&zoom=14&width=300&height=150&apikey=${API_KEY}`} alt="Map" />
              )}
              <p className="admin-meta">{p.users?.username ?? '?'} · {p.gps_lat?.toFixed(4)}, {p.gps_lng?.toFixed(4)} · {new Date(p.created_at).toLocaleDateString()}</p>
              <div className="admin-actions">
                <button className="btn-primary admin-action-btn" onClick={() => approvePoi(p.id, 7)}>✓ {t('admin.approve')}</button>
                <button className="btn-danger admin-action-btn" onClick={() => rejectPoi(p.id)}>✗ {t('admin.reject')}</button>
              </div>
            </div>
          )))}

          {/* Approved questions tab */}
          {/* Partners tab */}
          {tab === 'partners' && (
            <div className="admin-table">
              {partners.map((p) => (
                <div key={p.id} className="admin-card">
                  <div className="admin-card-top">
                    <span className="admin-type-badge">{getCategoryEmoji(p.poi_category)} {p.name}</span>
                    <span className="admin-poi-type">{p.region}</span>
                  </div>
                  <div className="admin-partner-stats">
                    <span>{t('admin.visits')}: {p.visit_count ?? 0}</span>
                    <span>{t('admin.discount')}: {p.partner_discount ?? '—'}</span>
                  </div>
                  <div className="admin-actions">
                    <button className="btn-danger admin-action-btn" onClick={() => togglePartner(p)}>
                      {t('admin.removePartner')}
                    </button>
                  </div>
                </div>
              ))}
              {partners.length === 0 && <div className="empty-state">{t('admin.noPartners')}</div>}
            </div>
          )}

          {/* Approved questions tab */}
          {tab === 'approved' && (approved.length === 0 ? <div className="empty-state">{t('admin.noApproved')}</div> : (
            <div className="admin-table">
              {approved.map((q) => (
                <div key={q.id} className="admin-table-row">
                  <span className="admin-table-name">{q.poi_name}</span>
                  <span className="admin-table-type">{TYPE_ICONS[q.question_type] ?? '?'}</span>
                  <span className="admin-table-q">{q.question?.slice(0, 50)}{q.question?.length > 50 ? '…' : ''}</span>
                  <span className="admin-table-used">×{q.times_used ?? 0}</span>
                  <button className="route-delete-btn" onClick={() => deleteApproved(q.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
