import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

function AvatarInitials({ username, size = 32 }) {
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'
  return (
    <div className="avatar-initials" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </div>
  )
}

const ACTIVITY_ICONS = { hiking: '🥾', cycling: '🚴', mtb: '🚵', crosscountry: '🏃', skitouring: '⛷️' }

function timeAgo(dateStr, t) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${t('social.ago')} ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${t('social.ago')} ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${t('social.ago')} ${days}d`
}

export default function SocialScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState('leaderboard')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [friendshipMap, setFriendshipMap] = useState({}) // userId → status
  const debounceRef = useRef(null)

  // Friends
  const [friends, setFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [pendingChallenges, setPendingChallenges] = useState([])
  const [removingId, setRemovingId] = useState(null) // friendship id for confirm dialog

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([])
  const [lbScope, setLbScope] = useState('global') // 'global' | 'friends'
  const [loading, setLoading] = useState(true)

  // Feed
  const [feed, setFeed] = useState([])

  // Friend profile
  const [viewingFriend, setViewingFriend] = useState(null)
  const [friendProfile, setFriendProfile] = useState(null)
  const [friendRuns, setFriendRuns] = useState([])
  const [friendBadges, setFriendBadges] = useState([])

  // ── Load all data ──────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    loadFriends()
    loadIncoming()
    loadLeaderboard()
    loadFeed()
    loadChallenges()
  }, [user])

  // Realtime friend request notifications
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('friend-requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships', filter: `user_id_2=eq.${user.id}` }, () => {
        loadIncoming()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_route_runs' }, () => {
        loadLeaderboard()
        loadFeed()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  async function loadFriends() {
    if (!user) return
    // Load accepted friendships in both directions
    const { data } = await supabase
      .from('friendships')
      .select('id, user_id_1, user_id_2, u1:user_id_1(id, username, total_km, total_routes), u2:user_id_2(id, username, total_km, total_routes)')
      .eq('status', 'accepted')
      .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)

    const list = (data ?? []).map((f) => ({
      friendshipId: f.id,
      ...(f.user_id_1 === user.id ? f.u2 : f.u1),
    }))
    setFriends(list)

    // Build friendship status map for search results
    const map = {}
    list.forEach((f) => { map[f.id] = 'accepted' })
    setFriendshipMap((prev) => ({ ...prev, ...map }))
  }

  async function loadIncoming() {
    if (!user) return
    const { data } = await supabase
      .from('friendships')
      .select('id, user_id_1, u1:user_id_1(id, username, total_km, total_routes)')
      .eq('user_id_2', user.id)
      .eq('status', 'pending')
    setIncomingRequests(data ?? [])

    // Update map
    const map = {}
    ;(data ?? []).forEach((r) => { map[r.user_id_1] = 'pending_received' })
    setFriendshipMap((prev) => ({ ...prev, ...map }))
  }

  async function loadLeaderboard() {
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('id, username, total_km, total_routes')
      .order('total_km', { ascending: false })
      .limit(100)
    setLeaderboard(data ?? [])
    setLoading(false)
  }

  async function loadFeed() {
    if (!user) return
    // Get friend IDs
    const friendIds = friends.map((f) => f.id)
    const allIds = [...friendIds, user.id]

    const { data } = await supabase
      .from('user_route_runs')
      .select('id, completed_at, user_id, users:user_id(username), routes:route_id(name, activity_type, distance_km)')
      .in('user_id', allIds.length > 0 ? allIds : [user.id])
      .eq('is_completed', true)
      .order('completed_at', { ascending: false })
      .limit(30)
    setFeed(data ?? [])
  }

  async function loadChallenges() {
    if (!user) return
    const { data } = await supabase
      .from('friend_challenges')
      .select('*, challenger:challenger_id(username), routes:route_id(name, distance_km)')
      .eq('challenged_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setPendingChallenges(data ?? [])
  }

  // ── Search with debounce ───────────────────────────────────

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setSearchResults([]); return }
    const { data } = await supabase
      .from('users')
      .select('id, username, total_km, total_routes')
      .ilike('username', `%${q}%`)
      .neq('id', user?.id)
      .limit(8)
    if (!data) { setSearchResults([]); return }

    // Check friendship status for each result
    const ids = data.map((u) => u.id)
    const { data: rels } = await supabase
      .from('friendships')
      .select('id, user_id_1, user_id_2, status')
      .or(ids.map((id) => `and(user_id_1.eq.${user.id},user_id_2.eq.${id}),and(user_id_1.eq.${id},user_id_2.eq.${user.id})`).join(','))

    const statusMap = { ...friendshipMap }
    for (const r of rels ?? []) {
      const otherId = r.user_id_1 === user.id ? r.user_id_2 : r.user_id_1
      if (r.status === 'accepted') statusMap[otherId] = 'accepted'
      else if (r.status === 'pending') {
        statusMap[otherId] = r.user_id_1 === user.id ? 'pending_sent' : 'pending_received'
      }
    }
    setFriendshipMap(statusMap)
    setSearchResults(data)
  }, [user, friendshipMap])

  function handleSearchChange(e) {
    const q = e.target.value
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 400)
  }

  // ── Friend actions ─────────────────────────────────────────

  async function sendRequest(targetId) {
    if (!user) return
    await supabase.from('friendships').insert({ user_id_1: user.id, user_id_2: targetId, status: 'pending' })
    setFriendshipMap((prev) => ({ ...prev, [targetId]: 'pending_sent' }))
  }

  async function acceptRequest(req) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', req.id)
    setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id))
    loadFriends()
  }

  async function declineRequest(id) {
    await supabase.from('friendships').delete().eq('id', id)
    setIncomingRequests((prev) => prev.filter((r) => r.id !== id))
  }

  async function removeFriend() {
    if (!removingId) return
    await supabase.from('friendships').delete().eq('id', removingId)
    setRemovingId(null)
    loadFriends()
  }

  async function acceptChallenge(c) {
    await supabase.from('friend_challenges').update({ status: 'accepted' }).eq('id', c.id)
    setPendingChallenges((prev) => prev.filter((x) => x.id !== c.id))
  }

  async function rejectChallenge(id) {
    await supabase.from('friend_challenges').update({ status: 'expired' }).eq('id', id)
    setPendingChallenges((prev) => prev.filter((x) => x.id !== id))
  }

  // ── View friend profile ────────────────────────────────────

  async function openFriendProfile(friendUser) {
    setViewingFriend(friendUser)
    const [runsRes, badgesRes] = await Promise.all([
      supabase.from('user_route_runs').select('id, completed_at, routes:route_id(name, activity_type, distance_km)')
        .eq('user_id', friendUser.id).eq('is_completed', true).order('completed_at', { ascending: false }).limit(5),
      supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', friendUser.id),
    ])
    setFriendRuns(runsRes.data ?? [])
    setFriendBadges(badgesRes.data ?? [])
    setFriendProfile(friendUser)
  }

  function getButtonForUser(userId) {
    const status = friendshipMap[userId]
    if (status === 'accepted') return <span className="friend-status-badge friend-status--accepted">✓ {t('social.alreadyFriends')}</span>
    if (status === 'pending_sent') return <span className="friend-status-badge friend-status--pending">⏳ {t('social.requestSent')}</span>
    if (status === 'pending_received') return <button className="btn-primary friend-add-btn" onClick={() => { const req = incomingRequests.find((r) => r.user_id_1 === userId); if (req) acceptRequest(req) }}>✓ {t('social.accept')}</button>
    return <button className="btn-primary friend-add-btn" onClick={() => sendRequest(userId)}>+ {t('social.addFriend')}</button>
  }

  // Filter leaderboard for friends scope
  const filteredLeaderboard = lbScope === 'friends'
    ? leaderboard.filter((e) => e.id === user?.id || friends.some((f) => f.id === e.id))
    : leaderboard

  const incomingCount = incomingRequests.length + pendingChallenges.length

  // ── Friend profile view ────────────────────────────────────

  if (viewingFriend) {
    return (
      <div className="screen social-screen">
        <div className="screen-header">
          <div className="routes-header-row">
            <h1 className="screen-title">{viewingFriend.username}</h1>
            <button className="wiz-back" onClick={() => setViewingFriend(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>
        <div className="friend-profile-body">
          <AvatarInitials username={viewingFriend.username} size={64} />
          <h2 className="friend-profile-name">@{viewingFriend.username}</h2>
          <div className="profile-stats-grid" style={{ maxWidth: 340 }}>
            <div className="stat-card"><div className="stat-value">{Math.round(viewingFriend.total_km ?? 0)}</div><div className="stat-label">km</div></div>
            <div className="stat-card"><div className="stat-value">{viewingFriend.total_routes ?? 0}</div><div className="stat-label">{t('social.routes')}</div></div>
          </div>
          {friendBadges.length > 0 && (
            <div className="friend-profile-section">
              <h3 className="profile-section-title">{t('profile.badges')} ({friendBadges.length})</h3>
              <div className="friend-badges-row">
                {friendBadges.map((b) => <span key={b.badge_id} className="summary-badge-chip">{b.badge_id}</span>)}
              </div>
            </div>
          )}
          {friendRuns.length > 0 && (
            <div className="friend-profile-section">
              <h3 className="profile-section-title">{t('profile.recentRoutes')}</h3>
              {friendRuns.map((run) => (
                <div key={run.id} className="recent-row">
                  <span className="recent-name">{ACTIVITY_ICONS[run.routes?.activity_type] ?? '🥾'} {run.routes?.name ?? '—'}</span>
                  <span className="recent-meta">{run.routes?.distance_km ? `${Number(run.routes.distance_km).toFixed(1)} km` : ''} · {timeAgo(run.completed_at, t)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────

  return (
    <div className="screen social-screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('social.title')}</h1>
        <div className="social-tabs">
          {['leaderboard', 'friends', 'feed'].map((id) => (
            <button key={id} className={`social-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {t(`social.${id}`)}
              {id === 'friends' && incomingCount > 0 && <span className="tab-badge">{incomingCount}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="social-content">

        {/* ── Leaderboard ─────────────────────────── */}
        {tab === 'leaderboard' && (
          <div className="leaderboard">
            <div className="leaderboard-period-row">
              <button className={`social-tab ${lbScope === 'global' ? 'active' : ''}`} onClick={() => setLbScope('global')}>{t('social.global')}</button>
              <button className={`social-tab ${lbScope === 'friends' ? 'active' : ''}`} onClick={() => setLbScope('friends')}>{t('social.friendsLb')}</button>
            </div>
            {loading ? <div className="loading-state">{t('profile.loading')}</div>
              : filteredLeaderboard.length === 0 ? <div className="empty-state">{t('social.noData')}</div>
              : (
                <div className="leaderboard-list">
                  {filteredLeaderboard.map((entry, i) => (
                    <div key={entry.id} className={`leaderboard-row ${entry.id === user?.id ? 'leaderboard-row--me' : ''}`}
                      onClick={() => entry.id !== user?.id && openFriendProfile(entry)}>
                      <span className={`leaderboard-rank ${i < 3 ? `rank-${i + 1}` : ''}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span>
                      <AvatarInitials username={entry.username} />
                      <div className="leaderboard-name">{entry.username ?? t('social.anonymous')}</div>
                      <div className="leaderboard-stats-row">
                        <span className="lb-stat">{Math.round(entry.total_km ?? 0)} km</span>
                        <span className="lb-stat">{entry.total_routes ?? 0} {t('social.routes')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* ── Friends ─────────────────────────────── */}
        {tab === 'friends' && (
          <div className="friends-section">
            {/* Search */}
            <div className="friend-search">
              <input className="form-input" type="text" placeholder={`🔍 ${t('social.searchPlaceholder')}`}
                value={searchQuery} onChange={handleSearchChange} />
            </div>

            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((u) => (
                  <div key={u.id} className="friend-row" onClick={() => openFriendProfile(u)}>
                    <AvatarInitials username={u.username} />
                    <div className="friend-info">
                      <span className="friend-name">{u.username}</span>
                      <span className="friend-meta">{Math.round(u.total_km ?? 0)} km · {u.total_routes ?? 0} {t('social.routes')}</span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>{getButtonForUser(u.id)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <div className="incoming-section">
                <h3 className="friends-list-title">👋 {t('social.incomingRequests')} ({incomingRequests.length})</h3>
                {incomingRequests.map((req) => (
                  <div key={req.id} className="friend-row friend-row--request">
                    <AvatarInitials username={req.u1?.username} />
                    <div className="friend-info">
                      <span className="friend-name">{req.u1?.username}</span>
                      <span className="friend-meta">{Math.round(req.u1?.total_km ?? 0)} km · {req.u1?.total_routes ?? 0} {t('social.routes')}</span>
                    </div>
                    <div className="friend-request-btns">
                      <button className="btn-primary friend-accept-btn" onClick={() => acceptRequest(req)}>✓</button>
                      <button className="btn-secondary friend-decline-btn" onClick={() => declineRequest(req.id)}>✗</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending challenges */}
            {pendingChallenges.length > 0 && (
              <div className="challenge-pending-list">
                <h3 className="friends-list-title">⚔️ {t('social.pendingChallenges')}</h3>
                {pendingChallenges.map((c) => (
                  <div key={c.id} className="challenge-pending-card">
                    <div className="challenge-pending-text">
                      ⚔️ <strong>{c.challenger?.username}</strong> {t('social.challengedYou')} <strong>{c.routes?.name}</strong>
                      {c.challenger_time_sec > 0 && <span className="challenge-pending-time"> ({Math.floor(c.challenger_time_sec / 60)} min)</span>}
                    </div>
                    {c.message && <p className="challenge-pending-msg">"{c.message}"</p>}
                    <div className="challenge-pending-actions">
                      <button className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => acceptChallenge(c)}>✓ {t('social.acceptChallenge')}</button>
                      <button className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => rejectChallenge(c.id)}>✗ {t('social.rejectChallenge')}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <h3 className="friends-list-title">{t('social.myFriends')} ({friends.length})</h3>
            {friends.length === 0 ? (
              <div className="empty-state">{t('social.noFriends')}</div>
            ) : (
              <div className="friends-list">
                {friends.map((f) => (
                  <div key={f.id} className="friend-row" onClick={() => openFriendProfile(f)}>
                    <AvatarInitials username={f.username} />
                    <div className="friend-info">
                      <span className="friend-name">{f.username}</span>
                      <span className="friend-meta">{Math.round(f.total_km ?? 0)} km · {f.total_routes ?? 0} {t('social.routes')}</span>
                    </div>
                    <button className="route-delete-btn" onClick={(e) => { e.stopPropagation(); setRemovingId(f.friendshipId) }} aria-label="Remove">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Feed ────────────────────────────────── */}
        {tab === 'feed' && (
          <div className="feed-section">
            {friends.length === 0 && feed.length === 0 ? (
              <div className="empty-state">
                <p>{t('social.noFriendsForFeed')}</p>
                <button className="btn-primary" style={{ maxWidth: 200, marginTop: 12 }} onClick={() => setTab('friends')}>
                  🔍 {t('social.findFriends')}
                </button>
              </div>
            ) : feed.length === 0 ? (
              <div className="empty-state">{t('social.noActivity')}</div>
            ) : (
              <div className="feed-list">
                {feed.map((item) => (
                  <div key={item.id} className="feed-item" onClick={() => item.users && openFriendProfile({ id: item.user_id, username: item.users.username })}>
                    <AvatarInitials username={item.users?.username} size={36} />
                    <div className="feed-body">
                      <div className="feed-user">{item.users?.username ?? t('social.anonymous')}</div>
                      <div className="feed-text">
                        {t('social.completedRoute')} <strong>{ACTIVITY_ICONS[item.routes?.activity_type] ?? '🥾'} {item.routes?.name}</strong>
                      </div>
                      <div className="feed-meta">
                        {item.routes?.distance_km ? `${Number(item.routes.distance_km).toFixed(1)} km` : ''}
                        <span> · {timeAgo(item.completed_at, t)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove friend confirm */}
      {removingId && (
        <div className="delete-overlay" onClick={() => setRemovingId(null)}>
          <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="delete-title">{t('social.removeFriend')}</h3>
            <p className="delete-desc">{t('social.removeFriendDesc')}</p>
            <div className="delete-btns">
              <button className="btn-secondary" onClick={() => setRemovingId(null)}>{t('social.cancel')}</button>
              <button className="btn-danger" onClick={removeFriend}>{t('social.remove')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
