import { proxyImg } from '../utils/imgProxy'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sessionsApi, Session } from '../api/sessions'
import { actionsApi } from '../api/actions'
import api from '../api/client'
import {
  BadgeCheck, Lock, Download, RefreshCw, Heart, MessageSquare,
  TrendingUp, UserPlus, UserMinus, ChevronLeft, ChevronRight, CheckSquare, Square
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

const SORT_OPTIONS: { key: SortKey; label: string; apiSort: string; apiDir: 'asc'|'desc' }[] = [
  { key: 'engagement_desc', label: 'Etkileşim ↓ (Yüksekten)',  apiSort: 'engagement', apiDir: 'desc' },
  { key: 'engagement_asc',  label: 'Etkileşim ↑ (Düşükten)',   apiSort: 'engagement', apiDir: 'asc'  },
  { key: 'username_asc',    label: 'Kullanıcı adı A → Z',       apiSort: 'username',   apiDir: 'asc'  },
  { key: 'username_desc',   label: 'Kullanıcı adı Z → A',       apiSort: 'username',   apiDir: 'desc' },
]

const FILTER_TABS: { key: FilterTab; label: string; hint: string }[] = [
  { key: 'all',       label: 'Tümü',            hint: 'Havuzdaki herkes'                            },
  { key: 'following', label: 'Takip Ettiklerim', hint: 'Benim takip ettiğim hesaplar'               },
  { key: 'followers', label: 'Takipçilerim',     hint: 'Beni takip eden hesaplar'                   },
  { key: 'ghosts',    label: '👻 Hayaletler',   hint: 'Takipçi/takip ama hiç etkileşim yok'        },
]

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
    <div style={{ width: 60, height: 4, background: '#1e2230', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: val >= 50 ? '#e09535' : val >= 10 ? '#5b8fe0' : '#3a3f55',
        borderRadius: 2,
        transition: 'width 0.3s',
      }} />
    </div>
  )
}

export default function UsersPage() {
  const [sessions,      setSessions]      = useState<Session[]>([])
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
    sessionsApi.list().then(s => { setSessions(s); if (s.length) setSid(s[0].id) })
  }, [])

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
        showToast(`@${u.username} takip edildi`)
      } else {
        showToast(r.error ?? 'Hata', false)
      }
    } catch { showToast('İstek başarısız', false) }
    finally { setActionLoading(p => { const n = { ...p }; delete n[u.id]; return n }) }
  }

  const handleUnfollow = async (u: UserPoolItem) => {
    setActionLoading(p => ({ ...p, [u.id]: 'unfollow' }))
    try {
      const r = await actionsApi.unfollow(sid, u.id)
      if (r.success || r.queued) {
        setAllItems(prev => prev.map(x => x.id === u.id ? { ...x, we_follow: false } : x))
        showToast(`@${u.username} takipten çıkıldı`)
      } else {
        showToast(r.error ?? 'Hata', false)
      }
    } catch { showToast('İstek başarısız', false) }
    finally { setActionLoading(p => { const n = { ...p }; delete n[u.id]; return n }) }
  }

  const handleRemoveFollower = async (u: UserPoolItem) => {
    setActionLoading(p => ({ ...p, [u.id]: 'remove_follower' }))
    try {
      const r = await actionsApi.removeFollower(sid, u.id)
      if (r.success || r.queued) {
        setAllItems(prev => prev.map(x => x.id === u.id ? { ...x, they_follow: false } : x))
        showToast(`@${u.username} takipçilerden çıkartıldı`)
      } else {
        showToast(r.error ?? 'Hata', false)
      }
    } catch { showToast('İstek başarısız', false) }
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

  return (
    <div style={{ position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          background: toast.ok ? '#1a3a2a' : '#3a1a1a',
          border: `1px solid ${toast.ok ? '#2d6a4a' : '#6a2d2d'}`,
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
          <h1 className="text-2xl font-bold">Kişi Havuzu & Etkileşim</h1>
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
            <Download size={13} /> CSV
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
          placeholder="Kullanıcı ara…"
          className="w-52 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500" />
        <select value={sort} onChange={e => { setSort(e.target.value as SortKey); setPage(1) }}
          style={{ background: '#1a1e2b', border: '1px solid #252a3a', borderRadius: 8, color: '#c8ccf0', padding: '5px 10px', fontSize: 12 }}>
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">{selected.size} seçili</span>
            <button onClick={handleBulkFollow} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900 hover:bg-green-800 disabled:opacity-50 rounded-lg text-xs text-green-300">
              <UserPlus size={12} /> Toplu Takip
            </button>
            <button onClick={handleBulkUnfollow} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg text-xs text-red-300">
              <UserMinus size={12} /> Toplu Çıkar
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
            gridTemplateColumns: '20px 32px minmax(140px,1fr) 44px 44px 56px 130px',
            gap: '0 10px',
            minWidth: 480,
            padding: '5px 10px',
            fontSize: 10,
            color: '#4a5070',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            borderBottom: '1px solid #1e2230',
            marginBottom: 4,
          }}>
            <button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', color: '#4a5070', cursor: 'pointer', padding: 0 }}>
              {selected.size === pageItems.length && pageItems.length > 0 ? <CheckSquare size={12} /> : <Square size={12} />}
            </button>
            <span />
            <span>Kullanıcı</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}><Heart size={8} />Like</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}><MessageSquare size={8} />Yorum</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}><TrendingUp size={8} />Skor</span>
            <span style={{ textAlign: 'center' }}>İşlem</span>
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
                  gridTemplateColumns: '20px 32px minmax(140px,1fr) 44px 44px 56px 130px',
                  gap: '0 10px',
                  minWidth: 480,
                  alignItems: 'center',
                  background: isSelected ? '#1a1f35' : '#0f1119',
                  border: `1px solid ${isSelected ? '#3a4470' : isGhost ? '#2a1a3a' : '#1e2230'}`,
                  borderRadius: 10,
                  padding: '7px 10px',
                  transition: 'border-color 0.15s',
                }}>
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isSelected ? '#7c8fe0' : '#2a3050', padding: 0 }}>
                    {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>

                  {/* Avatar */}
                  {u.profile_pic_url
                    ? <img src={proxyImg(u.profile_pic_url)} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                    : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1e2230', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#5d6585' }}>
                        {u.username[0]?.toUpperCase()}
                      </div>
                  }

                  {/* İsim */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <a href={`https://www.instagram.com/${u.username}/`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 500, color: '#c8ccf0', textDecoration: 'none' }}>
                        @{u.username}
                      </a>
                      {u.is_verified && <BadgeCheck size={12} style={{ color: '#60a5fa' }} />}
                      {u.is_private  && <Lock size={11} style={{ color: '#5d6585' }} />}
                      {isGhost && <span style={{ fontSize: 9, background: '#2a1a3a', color: '#9d6ad0', padding: '1px 6px', borderRadius: 20 }}>👻 hayalet</span>}
                      {u.we_follow   && <span style={{ fontSize: 9, background: '#1a3a2a', color: '#4eca8a', padding: '1px 6px', borderRadius: 20 }}>Takip</span>}
                      {u.they_follow && <span style={{ fontSize: 9, background: '#1a2a3a', color: '#60a5fa', padding: '1px 6px', borderRadius: 20 }}>Takipçi</span>}
                    </div>
                    {u.full_name && <p style={{ fontSize: 11, color: '#5d6585' }}>{u.full_name}</p>}
                  </div>

                  {/* Like */}
                  <span style={{ fontSize: 13, color: u.like_count > 0 ? '#e07070' : '#2a3050', textAlign: 'right', fontWeight: u.like_count > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {u.like_count || '—'}
                  </span>

                  {/* Yorum */}
                  <span style={{ fontSize: 13, color: u.comment_count > 0 ? '#5b8fe0' : '#2a3050', textAlign: 'right', fontWeight: u.comment_count > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {u.comment_count || '—'}
                  </span>

                  {/* Skor */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: u.engagement_score >= 50 ? '#e09535' : u.engagement_score > 0 ? '#7c8fe0' : '#2a3050', fontVariantNumeric: 'tabular-nums' }}>
                      {u.engagement_score > 0 ? `%${u.engagement_score.toFixed(1)}` : '—'}
                    </span>
                    {u.engagement_score > 0 && <EngagementBar val={u.engagement_score} />}
                  </div>

                  {/* Aksiyon */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    {/* Biz takip ediyorsak: Çıkar butonu */}
                    {u.we_follow ? (
                      <button onClick={() => handleUnfollow(u)} disabled={!!actLoad} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: '#2a1a1a', border: '1px solid #4a2a2a', color: '#e07070',
                        opacity: actLoad ? 0.5 : 1, whiteSpace: 'nowrap',
                      }}>
                        {actLoad === 'unfollow' ? <RefreshCw size={10} className="animate-spin" /> : <UserMinus size={10} />}
                        Takipten çık
                      </button>
                    ) : (
                      <button onClick={() => handleFollow(u)} disabled={!!actLoad} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: '#1a2a1a', border: '1px solid #2a4a2a', color: '#4eca8a',
                        opacity: actLoad ? 0.5 : 1, whiteSpace: 'nowrap',
                      }}>
                        {actLoad === 'follow' ? <RefreshCw size={10} className="animate-spin" /> : <UserPlus size={10} />}
                        Takip et
                      </button>
                    )}
                    {/* Bizi takip ediyorsa: Takipçiden çıkart */}
                    {u.they_follow && (
                      <button onClick={() => handleRemoveFollower(u)} disabled={!!actLoad} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: '#1a1a2a', border: '1px solid #2a2a4a', color: '#9b8fe0',
                        opacity: actLoad ? 0.5 : 1, whiteSpace: 'nowrap',
                      }}>
                        {actLoad === 'remove_follower' ? <RefreshCw size={10} className="animate-spin" /> : <UserMinus size={10} />}
                        Takipçiden çıkart
                      </button>
                    )}
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
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: '#13161f', border: '1px solid #252a3a', borderRadius: 8, color: '#8a93b8', fontSize: 13, cursor: 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
            <ChevronLeft size={14} /> Önceki
          </button>
          <span style={{ fontSize: 13, color: '#5d6585' }}>{page} / {totalPages} · {filtered.length} kişi</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: '#13161f', border: '1px solid #252a3a', borderRadius: 8, color: '#8a93b8', fontSize: 13, cursor: 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
            Sonraki <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
