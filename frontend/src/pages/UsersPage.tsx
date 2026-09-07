import { proxyImg } from '../utils/imgProxy'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Session } from '../api/sessions'
import { useSession } from '../contexts/SessionContext'
import { actionsApi } from '../api/actions'
import { useLang } from '../contexts/LangContext'
import api from '../api/client'
import {
  BadgeCheck, Lock, Download, RefreshCw, Heart, MessageSquare,
  TrendingUp, UserPlus, UserMinus, UserX, ChevronLeft, ChevronRight, CheckSquare, Square
} from 'lucide-react'

type SortKey = 'engagement_desc' | 'engagement_asc' | 'username_asc' | 'username_desc'
type FilterTab = 'all' | 'following' | 'followers' | 'ghosts'

interface UserPoolItem {
  id: number
  username: string
  full_name: string | null
  profile_pic_url: string | null
  is_private: boolean
  is_verified: boolean
  follower_count: number | null
  following_count: number | null
  we_follow: boolean | null
  they_follow: boolean | null
  like_count: number
  comment_count: number
  engagement_score: number
  first_seen_at: string | null
}

const SORT_META: { key: SortKey; apiSort: string; apiDir: 'asc'|'desc' }[] = [
  { key: 'engagement_desc', apiSort: 'engagement', apiDir: 'desc' },
  { key: 'engagement_asc',  apiSort: 'engagement', apiDir: 'asc'  },
  { key: 'username_asc',    apiSort: 'username',   apiDir: 'asc'  },
  { key: 'username_desc',   apiSort: 'username',   apiDir: 'desc' },
]

const FILTER_KEYS: FilterTab[] = ['all', 'following', 'followers', 'ghosts']

function applyFilter(items: UserPoolItem[], tab: FilterTab): UserPoolItem[] {
  switch (tab) {
    case 'following': return items.filter(u => u.we_follow)
    case 'followers': return items.filter(u => u.they_follow)
    case 'ghosts':    return items.filter(u => u.engagement_score === 0 && (u.we_follow || u.they_follow))
    default:          return items
  }
}

function EngagementBar({ val }: { val: number }) {
  const pct = Math.min(val, 100)
  return (
    <div style={{ width: 60, height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: val >= 50 ? '#e09535' : val >= 10 ? '#5b8fe0' : 'var(--text-3)',
        borderRadius: 2,
        transition: 'width 0.3s',
      }} />
    </div>
  )
}

export default function UsersPage() {
  const { T, lang } = useLang()

  const SORT_OPTIONS = SORT_META.map((m, i) => ({
    ...m,
    label: [T.users.sort.engDesc, T.users.sort.engAsc, T.users.sort.nameAsc, T.users.sort.nameDesc][i],
  }))

  const FILTER_TABS = FILTER_KEYS.map(key => ({
    key,
    label: T.users.tabs[key],
    hint:  T.users.ghost.hint,
  }))

  const { sessions, loading: sessionLoading } = useSession()
  const [sid,           setSid]           = useState('')
  const [allItems,      setAllItems]      = useState<UserPoolItem[]>([])   // tüm veri (client-side filter)
  const [total,         setTotal]         = useState(0)
  const [page,          setPage]          = useState(1)
  const [sort,          setSort]          = useState<SortKey>('engagement_desc')
  const [search,        setSearch]        = useState('')
  const [tab,           setTab]           = useState<FilterTab>('all')
  const [loading,       setLoading]       = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({})  // id → 'follow'|'unfollow'
  const [selected,      setSelected]      = useState<Set<number>>(new Set())
  const [bulkLoading,   setBulkLoading]   = useState(false)
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const LIMIT = 50

  useEffect(() => {
    if (sessions.length > 0 && !sid) setSid(sessions[0].id)
  }, [sessions, sid])

  const load = useCallback(async (p = 1, s = sort, q = search) => {
    if (!sid) return
    setLoading(true)
    try {
      const opt = SORT_OPTIONS.find(o => o.key === s) ?? SORT_OPTIONS[0]
      const r = await api.get(`/sessions/${sid}/users`, { params: { page: p, limit: 2000, sort: opt.apiSort, search: q } })
      setAllItems(r.data.items)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }, [sid, sort, search])

  useEffect(() => { if (sid) load(1, sort, '') }, [sid, sort])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { if (sid) load(1, sort, search) }, 380)
  }, [search])

  // Client-side sıralama (backend desc döner, asc için ters çevir)
  const sortedItems = (() => {
    const items = [...allItems]
    if (sort === 'engagement_asc') items.sort((a, b) => a.engagement_score - b.engagement_score)
    else if (sort === 'username_asc') items.sort((a, b) => a.username.localeCompare(b.username))
    else if (sort === 'username_desc') items.sort((a, b) => b.username.localeCompare(a.username))
    // engagement_desc: backend zaten bu sırayla döndürüyor
    return items
  })()

  // Filtrelenmiş + sayfalanmış liste
  const filtered = applyFilter(sortedItems, tab)
  const totalPages = Math.ceil(filtered.length / LIMIT)
  const pageItems  = filtered.slice((page - 1) * LIMIT, page * LIMIT)


  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const handleFollow = async (u: UserPoolItem) => {
    setActionLoading(p => ({ ...p, [u.id]: 'follow' }))
    try {
      const r = await actionsApi.follow(sid, u.id)
      if (r.success || r.queued) {
        setAllItems(prev => prev.map(x => x.id === u.id ? { ...x, we_follow: true } : x))
        showToast(T.users.toast.followed(u.username))
      } else {
        showToast(r.error ?? T.common.error, false)
      }
    } catch { showToast(T.users.toast.failed, false) }
    finally { setActionLoading(p => { const n = { ...p }; delete n[u.id]; return n }) }
  }

  const handleUnfollow = async (u: UserPoolItem) => {
    setActionLoading(p => ({ ...p, [u.id]: 'unfollow' }))
    try {
      const r = await actionsApi.unfollow(sid, u.id)
      if (r.success || r.queued) {
        setAllItems(prev => prev.map(x => x.id === u.id ? { ...x, we_follow: false } : x))
        showToast(T.users.toast.unfollowed(u.username))
      } else {
        showToast(r.error ?? T.common.error, false)
      }
    } catch { showToast(T.users.toast.failed, false) }
    finally { setActionLoading(p => { const n = { ...p }; delete n[u.id]; return n }) }
  }

  const handleRemoveFollower = async (u: UserPoolItem) => {
    setActionLoading(p => ({ ...p, [u.id]: 'remove_follower' }))
    try {
      const r = await actionsApi.removeFollower(sid, u.id)
      if (r.success || r.queued) {
        setAllItems(prev => prev.map(x => x.id === u.id ? { ...x, they_follow: false } : x))
        showToast(T.users.toast.removed(u.username))
      } else {
        showToast(r.error ?? T.common.error, false)
      }
    } catch { showToast(T.users.toast.failed, false) }
    finally { setActionLoading(p => { const n = { ...p }; delete n[u.id]; return n }) }
  }

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleSelectAll = () => {
    if (selected.size === pageItems.length) setSelected(new Set())
    else setSelected(new Set(pageItems.map(u => u.id)))
  }

  const handleBulkUnfollow = async () => {
    const ids = [...selected]
    setBulkLoading(true)
    try {
      const r = await actionsApi.bulkUnfollow(sid, ids)
      showToast(`${ids.length} hesap takipten çıkarma kuyruğuna eklendi (~${r.estimated_duration_minutes} dk)`)
      setAllItems(prev => prev.map(x => ids.includes(x.id) ? { ...x, we_follow: false } : x))
      setSelected(new Set())
    } catch { showToast('Toplu işlem başarısız', false) }
    finally { setBulkLoading(false) }
  }

  const handleBulkFollow = async () => {
    const ids = [...selected]
    setBulkLoading(true)
    let ok = 0
    for (const id of ids) {
      try {
        const u = allItems.find(x => x.id === id)
        if (!u) continue
        const r = await actionsApi.follow(sid, id)
        if (r.success || r.queued) {
          setAllItems(prev => prev.map(x => x.id === id ? { ...x, we_follow: true } : x))
          ok++
        }
      } catch {}
    }
    showToast(`${ok} hesap takip edildi`)
    setSelected(new Set())
    setBulkLoading(false)
  }

  const handleExport = async () => {
    const r = await api.get(`/sessions/${sid}/users/export/csv`, { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a'); a.href = url; a.download = 'instapp_users.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (sessionLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, color: 'var(--text-3)' }}>
        <RefreshCw size={18} className="animate-spin" style={{ marginRight: 10 }} />
        <span style={{ fontSize: 14 }}>Yükleniyor…</span>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          background: toast.ok ? 'rgba(78,202,138,0.15)' : 'rgba(224,96,96,0.15)',
          border: `1px solid ${toast.ok ? 'rgba(78,202,138,0.4)' : 'rgba(224,96,96,0.4)'}`,
          color: toast.ok ? '#4eca8a' : '#e06060',
          borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">{T.users.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {allItems.length.toLocaleString('tr-TR')} kişi · {filtered.length.toLocaleString('tr-TR')} filtreli
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <select value={sid} onChange={e => setSid(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm">
              {sessions.map(s => <option key={s.id} value={s.id}>@{s.ig_username}</option>)}
            </select>
          )}
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs">
            <Download size={13} /> {T.users.exportCsv}
          </button>
          <button onClick={() => load(1, sort, search)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {FILTER_TABS.map(f => (
          <button key={f.key} title={f.hint}
            onClick={() => { setTab(f.key); setPage(1); setSelected(new Set()) }}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === f.key
                ? 'bg-purple-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}>
            {f.label}
            <span className="ml-1.5 opacity-60">
              {applyFilter(allItems, f.key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar: search + sort + bulk */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={T.common.search}
          className="w-52 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500" />
        <select value={sort} onChange={e => { setSort(e.target.value as SortKey); setPage(1) }}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text)', padding: '5px 10px', fontSize: 12 }}>
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">{selected.size} seçili</span>
            <button onClick={handleBulkFollow} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900 hover:bg-green-800 disabled:opacity-50 rounded-lg text-xs text-green-300">
              <UserPlus size={12} /> {T.users.action.bulkFollow}
            </button>
            <button onClick={handleBulkUnfollow} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg text-xs text-red-300">
              <UserMinus size={12} /> {T.users.action.bulkUnfollow}
            </button>
          </div>
        )}
      </div>

      {/* Liste wrapper — yatay scroll */}
      <div style={{ overflowX: 'auto' }}>

        {/* Tablo başlık */}
        {pageItems.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '20px 32px minmax(140px,1fr) 44px 44px 56px 66px',
            gap: '0 10px',
            minWidth: 480,
            padding: '5px 10px',
            fontSize: 10,
            color: 'var(--text-3)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            borderBottom: '1px solid var(--border)',
            marginBottom: 4,
          }}>
            <button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', color: '#4a5070', cursor: 'pointer', padding: 0 }}>
              {selected.size === pageItems.length && pageItems.length > 0 ? <CheckSquare size={12} /> : <Square size={12} />}
            </button>
            <span />
            <span>{T.users.col.user}</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}><Heart size={8} />{T.users.col.likes}</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}><MessageSquare size={8} />{T.users.col.comments}</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}><TrendingUp size={8} />{T.users.col.engagement}</span>
            <span style={{ textAlign: 'center' }}>{T.users.col.action}</span>
          </div>
        )}

        {/* Liste */}
        {pageItems.length === 0 && !loading ? (
          <div className="text-center py-14 text-gray-600 border border-dashed border-gray-800 rounded-xl text-sm">
            <p>Bu filtre için kullanıcı yok.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {pageItems.map(u => {
              const isSelected = selected.has(u.id)
              const actLoad = actionLoading[u.id]
              const isGhost = u.engagement_score === 0 && (u.we_follow || u.they_follow)
              return (
                <div key={u.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 32px minmax(140px,1fr) 44px 44px 56px 66px',
                  gap: '0 10px',
                  minWidth: 480,
                  alignItems: 'center',
                  background: isSelected ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
                  border: `1px solid ${isSelected ? 'rgba(99,102,241,0.35)' : isGhost ? 'rgba(139,92,246,0.2)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '7px 10px',
                  transition: 'border-color 0.15s',
                }}>
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isSelected ? 'var(--accent)' : 'var(--text-3)', padding: 0 }}>
                    {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>

                  {/* Avatar */}
                  {u.profile_pic_url
                    ? <img src={proxyImg(u.profile_pic_url)} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                    : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-2)' }}>
                        {u.username[0]?.toUpperCase()}
                      </div>
                  }

                  {/* İsim */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <a href={`https://www.instagram.com/${u.username}/`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textDecoration: 'none' }}>
                        @{u.username}
                      </a>
                      {u.is_verified && <BadgeCheck size={12} style={{ color: '#60a5fa' }} />}
                      {u.is_private  && <Lock size={11} style={{ color: '#5d6585' }} />}
                      {isGhost && <span style={{ fontSize: 9, background: 'rgba(157,106,208,0.15)', color: '#9d6ad0', padding: '1px 6px', borderRadius: 20 }}>👻 {T.users.ghost.badge}</span>}
                      {u.we_follow   && <span style={{ fontSize: 9, background: 'rgba(78,202,138,0.15)', color: '#4eca8a', padding: '1px 6px', borderRadius: 20 }}>{T.followers.following}</span>}
                      {u.they_follow && <span style={{ fontSize: 9, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: 20 }}>{T.followers.followers}</span>}
                    </div>
                    {u.full_name && <p style={{ fontSize: 11, color: 'var(--text-2)' }}>{u.full_name}</p>}
                  </div>

                  {/* Like */}
                  <span style={{ fontSize: 13, color: u.like_count > 0 ? '#e07070' : 'var(--text-3)', textAlign: 'right', fontWeight: u.like_count > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {u.like_count || '—'}
                  </span>

                  {/* Yorum */}
                  <span style={{ fontSize: 13, color: u.comment_count > 0 ? '#5b8fe0' : 'var(--text-3)', textAlign: 'right', fontWeight: u.comment_count > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {u.comment_count || '—'}
                  </span>

                  {/* Skor */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: u.engagement_score >= 50 ? '#e09535' : u.engagement_score > 0 ? 'var(--accent)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      {u.engagement_score > 0 ? `%${u.engagement_score.toFixed(1)}` : '—'}
                    </span>
                    {u.engagement_score > 0 && <EngagementBar val={u.engagement_score} />}
                  </div>

                  {/* Aksiyon */}
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                    {u.we_follow ? (
                      <button onClick={() => handleUnfollow(u)} disabled={!!actLoad}
                        title={T.users.action.unfollow}
                        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer', background: 'rgba(224,112,112,0.15)', border: '1px solid rgba(224,112,112,0.3)', color: '#e07070', opacity: actLoad ? 0.5 : 1 }}>
                        {actLoad === 'unfollow' ? <RefreshCw size={11} className="animate-spin" /> : <UserMinus size={11} />}
                      </button>
                    ) : (
                      <button onClick={() => handleFollow(u)} disabled={!!actLoad}
                        title={T.users.action.follow}
                        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer', background: 'rgba(78,202,138,0.15)', border: '1px solid rgba(78,202,138,0.3)', color: '#4eca8a', opacity: actLoad ? 0.5 : 1 }}>
                        {actLoad === 'follow' ? <RefreshCw size={11} className="animate-spin" /> : <UserPlus size={11} />}
                      </button>
                    )}
                    <button onClick={() => u.they_follow ? handleRemoveFollower(u) : undefined}
                      disabled={!!actLoad || !u.they_follow}
                      title={T.users.action.removeFollower}
                      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: u.they_follow ? 'pointer' : 'default', background: 'rgba(155,143,224,0.15)', border: '1px solid rgba(155,143,224,0.3)', color: u.they_follow ? '#9b8fe0' : 'var(--text-3)', opacity: actLoad ? 0.5 : 1 }}>
                      {actLoad === 'remove_follower' ? <RefreshCw size={11} className="animate-spin" /> : <UserX size={11} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
            <ChevronLeft size={14} /> {lang === 'tr' ? 'Önceki' : 'Prev'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{page} / {totalPages} · {filtered.length}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
            {lang === 'tr' ? 'Sonraki' : 'Next'} <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
