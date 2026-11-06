import { proxyImg } from '../utils/imgProxy'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Session } from '../api/sessions'
import { useSession } from '../contexts/SessionContext'
import { actionsApi } from '../api/actions'
import { bridgeApi, ActionQueue } from '../api/bridge'
import { useExtension } from '../lib/extensionBridge'
import { sessionsApi } from '../api/sessions'
import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'
import api from '../api/client'
import { apiErrorMessage } from '../lib/problems'
import {
  BadgeCheck, Lock, Download, RefreshCw, Heart, MessageSquare,
  TrendingUp, UserPlus, UserMinus, UserX, ChevronLeft, ChevronRight, CheckSquare, Square
} from 'lucide-react'

type SortCol = 'username' | 'like_count' | 'comment_count' | 'engagement_score' | 'they_follow' | 'we_follow'
type SortDir = 'asc' | 'desc'
// ghosts: silinmiş/dondurulmuş hesap (hayalet). silent: takip/takipçi ama hiç etkileşim yok (etkileşimsiz).
type FilterTab = 'all' | 'following' | 'followers' | 'notBack' | 'oneWaySilent' | 'mutualSilent' | 'silent' | 'ghosts'

interface UserPoolItem {
  id: number
  username: string
  full_name: string | null
  profile_pic_url: string | null
  is_private: boolean
  is_verified: boolean
  follower_count: number | null
  following_count: number | null
  reach_status?: string | null
  we_follow: boolean | null
  they_follow: boolean | null
  like_count: number
  comment_count: number
  engagement_score: number
  first_seen_at: string | null
}

const FILTER_KEYS: FilterTab[] = ['all', 'following', 'followers', 'notBack', 'oneWaySilent', 'mutualSilent', 'silent', 'ghosts']

const isGhost  = (u: UserPoolItem) => u.reach_status === 'unreachable'
const noTouch = (u: UserPoolItem) => u.like_count === 0 && u.comment_count === 0 && !isGhost(u)   // beğeni ve yorum yok, hesap duruyor
const isSilent = (u: UserPoolItem) => u.engagement_score === 0 && !isGhost(u) && !!(u.we_follow || u.they_follow)

function applyFilter(items: UserPoolItem[], tab: FilterTab, ghostsInNotBack = true): UserPoolItem[] {
  switch (tab) {
    case 'following': return items.filter(u => u.we_follow)
    case 'followers': return items.filter(u => u.they_follow)
    case 'notBack':   return items.filter(u => u.we_follow && !u.they_follow && (ghostsInNotBack || !isGhost(u)))   // ben takip ediyorum, o etmiyor
    case 'oneWaySilent':  return items.filter(u => u.we_follow && !u.they_follow && noTouch(u))   // ben takip ediyorum, o etmiyor, hiç etkileşimi yok
    case 'mutualSilent':  return items.filter(u => u.we_follow && u.they_follow && noTouch(u))    // karşılıklı ama sessiz
    case 'silent':    return items.filter(isSilent)
    case 'ghosts':    return items.filter(isGhost)
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

  const FILTER_TABS = FILTER_KEYS.map(key => ({
    key,
    label: T.users.tabs[key],
    hint:  key === 'oneWaySilent' ? T.users.oneWaySilentHint : key === 'mutualSilent' ? T.users.mutualSilentHint : key === 'notBack' ? T.users.notBackHint : key === 'silent' ? T.users.silent.hint : key === 'ghosts' ? T.users.ghost.hint : undefined,
  }))

  const { activeId, sessions, loading: sessionLoading, refresh: refreshSessions } = useSession()
  const sid = activeId
  const [allItems,      setAllItems]      = useState<UserPoolItem[]>([])   // tüm veri (client-side filter)
  const [total,         setTotal]         = useState(0)
  const [page,          setPage]          = useState(1)
  const [sort,          setSort]          = useState<{ col: SortCol; dir: SortDir }>({ col: 'engagement_score', dir: 'desc' })
  const [search,        setSearch]        = useState('')
  const [tab,           setTab]           = useState<FilterTab>('all')
  const [withGhosts,    setWithGhosts]    = useState(true)    // "Beni takip etmeyenler" listesinde hayaletler (silinmiş/dondurulmuş hesaplar) olsun mu
  const [loading,       setLoading]       = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({})  // id → 'follow'|'unfollow'
  const [selected,      setSelected]      = useState<Set<number>>(new Set())
  const [bulkLoading,   setBulkLoading]   = useState(false)
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const LIMIT = 50

  const profile = sessions.find(x => x.id === sid)
  // ZIP profilinde işlemleri eklenti yapar: butonlar anında işlem yapmaz, her zaman kalıcı kuyruğa ekler.
  // İşlemlerin açık olması, sınırlar ve sessiz saat yalnızca eklenti kuyruktan işlem isteyince uygulanır.
  const viaExt = profile?.source === 'zip'
  // Sunucunun kendi kuyruğunu kullanan (ZIP olmayan) profilde ise işlemler açık ve duraklatılmamış olmalı
  const blockedReason: string | null = !profile || viaExt ? null
    : !profile.allow_actions ? (profile.source === 'zip' ? T.users.actionsOff.zip : T.users.actionsOff.disabled)
    : profile.paused_until && new Date(profile.paused_until) > new Date() ? T.users.actionsOff.paused
    : null
  const canAct = !blockedReason
  const ext = useExtension()
  const [queue, setQueue] = useState<ActionQueue | null>(null)
  const queuedById = new Map((queue?.pending ?? []).map(q => [q.ig_user_id, q.action]))
  const extRunning = ext.job?.kind === 'actions' && ext.job.state === 'running'

  const loadQueue = useCallback(async () => {
    if (!sid || !viaExt) { setQueue(null); return }
    setQueue(await bridgeApi.actions(sid).catch(() => null))
  }, [sid, viaExt])

  // Sunucu iletileri yalnızca Türkçe: nedenini durum koduna göre seçili dilde göster
  const errMsg = (e: unknown) => {
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status === 400) return T.users.actionsOff.zip
    if (status === 403) return T.users.actionsOff.disabled
    if (status === 423) return T.users.actionsOff.paused
    return apiErrorMessage(e, T, T.users.toast.failed)
  }

  const load = useCallback(async (p = 1, q = search) => {
    if (!sid) return
    setLoading(true)
    try {
      const r = await api.get(`/sessions/${sid}/users`, { params: { page: p, limit: 2000, sort: 'engagement', search: q } })
      setAllItems(r.data.items)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }, [sid, search])

  useEffect(() => { if (sid) load(1, '') }, [sid])
  useEffect(() => { loadQueue() }, [loadQueue])
  // Kuyrukta iş varken ya da eklenti çalışırken durumu tazele; iş bitince listedeki takip durumları da güncellensin
  useEffect(() => {
    if (!viaExt || (!queue?.pending_count && !extRunning)) return
    const t = setInterval(() => { loadQueue(); if (extRunning) load(1, search) }, 15_000)
    return () => clearInterval(t)
  }, [viaExt, queue?.pending_count, extRunning])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ext.job?.kind === 'actions' && ext.job.state !== 'running') { loadQueue(); load(1, search) }
  }, [ext.job?.state])                              // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { if (sid) load(1, search) }, 380)
  }, [search])

  // Tüm sütunlarda istemci tarafı sıralama; eşitlikte kullanıcı adına göre
  const sortedItems = (() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const val = (u: UserPoolItem): string | number =>
      sort.col === 'username' ? u.username.toLowerCase()
      : sort.col === 'they_follow' || sort.col === 'we_follow' ? (u[sort.col] ? 1 : 0)
      : u[sort.col]
    return [...allItems].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return c * dir || a.username.localeCompare(b.username)
    })
  })()

  const toggleSort = (col: SortCol) => {
    setSort(p => p.col === col ? { col, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'username' ? 'asc' : 'desc' })
    setPage(1)
  }

  // Filtrelenmiş + sayfalanmış liste
  const filtered = applyFilter(sortedItems, tab, withGhosts)
  const totalPages = Math.ceil(filtered.length / LIMIT)
  const pageItems  = filtered.slice((page - 1) * LIMIT, page * LIMIT)


  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const enqueueActions = async (action: 'follow' | 'unfollow', ids: number[]) => {
    try {
      const r = await bridgeApi.enqueueActions(sid, action, ids)
      showToast(r.added ? T.users.queue.added(r.added, r.duplicate, r.skipped) : T.users.queue.nothingAdded, r.added > 0)
      await loadQueue()
      return true
    } catch (e) {
      showToast(errMsg(e), false)
      return false
    }
  }

  // İşlemler varsayılan kapalıdır; kullanıcı bilinçli olarak, burada tek tıkla açabilir
  const enableActions = async () => {
    if (!profile || !window.confirm(T.users.actionsOff.confirm)) return
    try {
      await sessionsApi.setAllowActions(profile.id, true)
      await refreshSessions()
      showToast(T.users.actionsOff.enabled)
    } catch (e) { showToast(errMsg(e), false) }
  }

  const runQueue = async () => {
    const r = await ext.run('actions')
    if (!r.ok) showToast(r.error === 'timeout' ? T.users.queue.needExt : (r.error ?? T.users.toast.failed), false)
  }

  const clearQueue = async () => {
    try {
      const r = await bridgeApi.clearActions(sid)
      showToast(T.users.queue.cleared(r.removed))
      await loadQueue()
    } catch (e) { showToast(errMsg(e), false) }
  }

  const handleFollow = async (u: UserPoolItem) => {
    if (!canAct) { showToast(blockedReason ?? T.users.toast.failed, false); return }
    if (viaExt) { await enqueueActions('follow', [u.id]); return }
    setActionLoading(p => ({ ...p, [u.id]: 'follow' }))
    try {
      const r = await actionsApi.follow(sid, u.id)
      if (r.success || r.queued) {
        setAllItems(prev => prev.map(x => x.id === u.id ? { ...x, we_follow: true } : x))
        showToast(T.users.toast.followed(u.username))
      } else {
        showToast(r.error ?? T.common.error, false)
      }
    } catch (e) { showToast(errMsg(e), false) }
    finally { setActionLoading(p => { const n = { ...p }; delete n[u.id]; return n }) }
  }

  const handleUnfollow = async (u: UserPoolItem) => {
    if (!canAct) { showToast(blockedReason ?? T.users.toast.failed, false); return }
    if (viaExt) { await enqueueActions('unfollow', [u.id]); return }
    setActionLoading(p => ({ ...p, [u.id]: 'unfollow' }))
    try {
      const r = await actionsApi.unfollow(sid, u.id)
      if (r.success || r.queued) {
        setAllItems(prev => prev.map(x => x.id === u.id ? { ...x, we_follow: false } : x))
        showToast(T.users.toast.unfollowed(u.username))
      } else {
        showToast(r.error ?? T.common.error, false)
      }
    } catch (e) { showToast(errMsg(e), false) }
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
    } catch (e) { showToast(errMsg(e), false) }
    finally { setActionLoading(p => { const n = { ...p }; delete n[u.id]; return n }) }
  }

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleSelectAll = () => {
    if (selected.size === pageItems.length) setSelected(new Set())
    else setSelected(new Set(pageItems.map(u => u.id)))
  }

  const handleBulkUnfollow = async () => {
    if (!canAct) { showToast(blockedReason ?? T.users.toast.failed, false); return }
    const ids = [...selected]
    if (viaExt) { if (await enqueueActions('unfollow', ids)) setSelected(new Set()); return }
    setBulkLoading(true)
    try {
      const r = await actionsApi.bulkUnfollow(sid, ids)
      showToast(T.users.bulkUnfollowed(ids.length, r.estimated_duration_minutes))
      setAllItems(prev => prev.map(x => ids.includes(x.id) ? { ...x, we_follow: false } : x))
      setSelected(new Set())
    } catch { showToast(T.users.bulkFailed, false) }
    finally { setBulkLoading(false) }
  }

  const handleBulkFollow = async () => {
    if (!canAct) { showToast(blockedReason ?? T.users.toast.failed, false); return }
    const ids = [...selected]
    if (viaExt) { if (await enqueueActions('follow', ids)) setSelected(new Set()); return }
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
    showToast(T.users.bulkFollowed(ok))
    setSelected(new Set())
    setBulkLoading(false)
  }

  const handleExport = async () => {
    const r = await api.get(`/sessions/${sid}/users/export/csv`, { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a'); a.href = url; a.download = 'instapp_users.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const SortHead = ({ col, label, icon, right }: { col: SortCol; label: string; icon?: React.ReactNode; right?: boolean }) => {
    const active = sort.col === col
    return (
      <button onClick={() => toggleSort(col)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        title={T.users.sortBy}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
          color: active ? 'var(--text)' : 'inherit', display: 'flex', alignItems: 'center', gap: 2, justifyContent: right ? 'flex-end' : 'flex-start' }}>
        {icon}{label}{active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    )
  }

  if (sessionLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, color: 'var(--text-3)' }}>
        <RefreshCw size={18} className="animate-spin" style={{ marginRight: 10 }} />
        <span style={{ fontSize: 14 }}>{T.users.loading}</span>
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
            {T.users.peopleCount(allItems.length.toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR'), filtered.length.toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR'))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs">
            <Download size={13} /> {T.users.exportCsv}
          </button>
          <button onClick={() => load(1, search)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {blockedReason && (
        <p role="note" className="text-xs text-amber-200 bg-amber-950/40 border border-amber-800 rounded-xl px-3 py-2 mb-4">
          {blockedReason} {T.users.actionsOff.manual}{' '}
          {profile && !profile.allow_actions && (
            <button onClick={enableActions} className="ml-1 px-2 py-0.5 rounded-md bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold">
              {T.users.actionsOff.enable}
            </button>
          )}
        </p>
      )}

      {viaExt && queue && (
        <div role="region" aria-label={T.users.queue.title} className="bg-gray-900 border border-purple-900 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium">{T.users.queue.title}
                <span className="text-gray-400 font-normal"> · {T.users.queue.pending(queue.pending_count)}</span>
              </p>
              <p className="text-xs text-gray-500">
                {T.users.queue.limits(queue.done_hour, queue.hourly_limit, queue.done_day, queue.daily_limit, queue.delay[0], queue.delay[1])}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={runQueue} disabled={!ext.available || extRunning || !queue.pending_count || queue.quiet_hours || !!queue.blocked}
                className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-xs font-medium">
                {extRunning ? T.users.queue.running : T.users.queue.run}
              </button>
              <button onClick={clearQueue} disabled={extRunning || !queue.pending_count}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-xs">
                {T.users.queue.clear}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{T.users.queue.hint}</p>
          {queue.blocked === 'off' && (
            <p className="text-xs text-amber-300 mt-1">
              {T.users.queue.offNote}{' '}
              <button onClick={enableActions} className="ml-1 px-2 py-0.5 rounded-md bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold">
                {T.users.actionsOff.enable}
              </button>
            </p>
          )}
          {queue.blocked === 'paused' && <p className="text-xs text-amber-300 mt-1">{T.users.queue.pausedNote}</p>}
          {queue.quiet_hours && <p className="text-xs text-amber-300 mt-1">{T.users.queue.quiet}</p>}
          {!ext.available && <p className="text-xs text-amber-300 mt-1">{T.users.queue.needExt}</p>}
          {extRunning && ext.job && <p className="text-xs text-purple-300 mt-1 whitespace-pre-line">{ext.job.message}</p>}
        </div>
      )}

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
              {applyFilter(allItems, f.key, withGhosts).length}
            </span>
          </button>
        ))}
      </div>

      {tab === 'notBack' && (
        <label className="inline-flex items-center gap-2 text-xs text-gray-300 mb-3 cursor-pointer select-none">
          <input type="checkbox" checked={withGhosts} onChange={e => { setWithGhosts(e.target.checked); setPage(1); setSelected(new Set()) }} />
          {T.users.includeGhosts}
          <span className="text-gray-500">({allItems.filter(u => u.we_follow && !u.they_follow && isGhost(u)).length})</span>
        </label>
      )}

      {/* Toolbar: search + sort + bulk */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={T.common.search}
          className="w-52 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500" />

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">{T.users.selectedN(selected.size)}</span>
            <button onClick={handleBulkFollow} disabled={bulkLoading} aria-disabled={!canAct} title={blockedReason ?? undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900 hover:bg-green-800 disabled:opacity-50 rounded-lg text-xs text-green-300">
              <UserPlus size={12} /> {T.users.action.bulkFollow}
            </button>
            <button onClick={handleBulkUnfollow} disabled={bulkLoading} aria-disabled={!canAct} title={blockedReason ?? undefined}
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
            gridTemplateColumns: '20px 32px minmax(140px,1fr) 52px 78px 62px 66px 78px 66px',
            gap: '0 10px',
            minWidth: 720,
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
            <SortHead col="username" label={T.users.col.user} />
            <SortHead col="like_count" label={T.users.col.likes} icon={<Heart size={8} />} right />
            <SortHead col="comment_count" label={T.users.col.comments} icon={<MessageSquare size={8} />} right />
            <SortHead col="engagement_score" label={T.users.col.engagement} icon={<TrendingUp size={8} />} right />
            <SortHead col="they_follow" label={T.users.col.followers} right />
            <SortHead col="we_follow" label={T.users.col.following} right />
            <span style={{ textAlign: 'center' }}>{T.users.col.action}</span>
          </div>
        )}

        {/* Liste */}
        {pageItems.length === 0 && !loading ? (
          <div className="text-center py-14 text-gray-600 border border-dashed border-gray-800 rounded-xl text-sm">
            <p>{T.users.noneInFilter}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {pageItems.map(u => {
              const isSelected = selected.has(u.id)
              const actLoad = actionLoading[u.id]
              const ghost = isGhost(u)
              const silent = isSilent(u)
              return (
                <div key={u.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 32px minmax(140px,1fr) 52px 78px 62px 66px 78px 66px',
                  gap: '0 10px',
                  minWidth: 720,
                  alignItems: 'center',
                  background: isSelected ? 'rgba(232,97,58,0.08)' : 'var(--surface)',
                  border: `1px solid ${isSelected ? 'rgba(232,97,58,0.35)' : ghost ? 'rgba(210,70,31,0.35)' : silent ? 'rgba(210,70,31,0.2)' : 'var(--border)'}`,
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
                      {ghost && <span title={T.users.ghost.hint} style={{ fontSize: 9, background: 'rgba(157,106,208,0.15)', color: '#9d6ad0', padding: '1px 6px', borderRadius: 20 }}>👻 {T.users.ghost.badge}</span>}
                      {silent && <span title={T.users.silent.hint} style={{ fontSize: 9, background: 'rgba(224,149,53,0.15)', color: '#e09535', padding: '1px 6px', borderRadius: 20 }}>{T.users.silent.badge}</span>}
                      {queuedById.has(u.id) && <span style={{ fontSize: 9, background: 'rgba(155,143,224,0.18)', color: '#b9aef0', padding: '1px 6px', borderRadius: 20 }}>⏳ {T.users.queue.queuedBadge}</span>}
                      {u.we_follow   && <span style={{ fontSize: 9, background: 'rgba(78,202,138,0.15)', color: '#4eca8a', padding: '1px 6px', borderRadius: 20 }}>{T.followers.following}</span>}
                      {u.they_follow && <span style={{ fontSize: 9, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: 20 }}>{T.followers.followers}</span>}
                    </div>
                    {u.full_name && <p style={{ fontSize: 11, color: 'var(--text-2)' }}>{u.full_name}</p>}
                  </div>

                  {/* Like */}
                  <span style={{ fontSize: 13, color: u.like_count > 0 ? '#e07070' : 'var(--text-3)', textAlign: 'right', fontWeight: u.like_count > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {u.like_count || '-'}
                  </span>

                  {/* Yorum */}
                  <span style={{ fontSize: 13, color: u.comment_count > 0 ? '#5b8fe0' : 'var(--text-3)', textAlign: 'right', fontWeight: u.comment_count > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {u.comment_count || '-'}
                  </span>

                  {/* Skor */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: u.engagement_score >= 50 ? '#e09535' : u.engagement_score > 0 ? 'var(--accent)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      {u.engagement_score > 0 ? `%${u.engagement_score.toFixed(1)}` : '-'}
                    </span>
                    {u.engagement_score > 0 && <EngagementBar val={u.engagement_score} />}
                  </div>

                  {/* Takipçi / Takip Edilen */}
                  <span style={{ fontSize: 12, textAlign: 'right', color: u.they_follow ? '#60a5fa' : 'var(--text-3)' }}>
                    {u.they_follow ? T.users.yes : '-'}
                  </span>
                  <span style={{ fontSize: 12, textAlign: 'right', color: u.we_follow ? '#4eca8a' : 'var(--text-3)' }}>
                    {u.we_follow ? T.users.yes : '-'}
                  </span>

                  {/* Aksiyon */}
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                    {u.we_follow ? (
                      <button onClick={() => handleUnfollow(u)} disabled={!!actLoad} aria-disabled={!canAct}
                        title={blockedReason ?? T.users.action.unfollow}
                        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer', background: 'rgba(224,112,112,0.15)', border: '1px solid rgba(224,112,112,0.3)', color: '#e07070', opacity: actLoad || !canAct ? 0.4 : 1 }}>
                        {actLoad === 'unfollow' ? <RefreshCw size={11} className="animate-spin" /> : <UserMinus size={11} />}
                      </button>
                    ) : (
                      <button onClick={() => handleFollow(u)} disabled={!!actLoad} aria-disabled={!canAct}
                        title={blockedReason ?? T.users.action.follow}
                        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer', background: 'rgba(78,202,138,0.15)', border: '1px solid rgba(78,202,138,0.3)', color: '#4eca8a', opacity: actLoad || !canAct ? 0.4 : 1 }}>
                        {actLoad === 'follow' ? <RefreshCw size={11} className="animate-spin" /> : <UserPlus size={11} />}
                      </button>
                    )}
                    <button onClick={() => u.they_follow ? handleRemoveFollower(u) : undefined}
                      disabled={!!actLoad || !u.they_follow || !canAct || viaExt}
                      title={viaExt ? T.users.queue.removeZip : (blockedReason ?? T.users.action.removeFollower)}
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
            <ChevronLeft size={14} /> {T.users.prev}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{page} / {totalPages} · {filtered.length}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
            {T.users.next} <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
