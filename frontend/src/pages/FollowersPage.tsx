import { proxyImg } from '../utils/imgProxy'
import { useCallback, useEffect, useState } from 'react'
import { sessionsApi, Session } from '../api/sessions'
import { analysisApi, RelationshipUser, AnalysisSummary } from '../api/analysis'
import { actionsApi } from '../api/actions'
import { useTaskPoller } from '../hooks/useTaskPoller'
import { RefreshCw, Lock, BadgeCheck, Users, UserMinus, UserPlus, CheckSquare, Square } from 'lucide-react'

type Tab = 'not_following_back' | 'not_followed_back' | 'mutual' | 'followers' | 'following'

const TABS: { key: Tab; label: string }[] = [
  { key: 'not_following_back', label: 'Geri Takip Etmeyenler' },
  { key: 'not_followed_back',  label: 'Takip Etmediklerimiz'  },
  { key: 'mutual',             label: 'Karşılıklı'            },
  { key: 'followers',          label: 'Tüm Takipçiler'        },
  { key: 'following',          label: 'Tüm Takip Edilenler'   },
]

export default function FollowersPage() {
  const [sessions,      setSessions]      = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<string>('')
  const [tab,           setTab]           = useState<Tab>('not_following_back')
  const [summary,       setSummary]       = useState<AnalysisSummary | null>(null)
  const [users,         setUsers]         = useState<RelationshipUser[]>([])
  const [search,        setSearch]        = useState('')
  const [syncTaskId,    setSyncTaskId]    = useState<string | null>(null)
  const [bulkTaskId,    setBulkTaskId]    = useState<string | null>(null)
  const [syncing,       setSyncing]       = useState(false)
  const [bulkRunning,   setBulkRunning]   = useState(false)
  const [selected,      setSelected]      = useState<Set<number>>(new Set())
  const [actionLoading, setActionLoading] = useState<Set<number>>(new Set())
  const [queuedActions, setQueuedActions] = useState<Set<number>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkDelay,     setBulkDelay]     = useState({ min: 45, max: 90, limit: 50 })
  const [error,         setError]         = useState<string | null>(null)
  const [queueLength,   setQueueLength]   = useState(0)

  // ── fetchTab tanımı ────────────────────────────────────────────────────────
  const fetchTab = useCallback((): Promise<RelationshipUser[]> => {
    switch (tab) {
      case 'not_following_back': return analysisApi.notFollowingBack(activeSession)
      case 'not_followed_back':  return analysisApi.notFollowedBack(activeSession)
      case 'mutual':             return analysisApi.mutual(activeSession)
      case 'followers':          return analysisApi.followers(activeSession)
      case 'following':          return analysisApi.following(activeSession)
    }
  }, [tab, activeSession])

  // ── loadData — fetchTab'dan sonra ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!activeSession) return
    setError(null)
    try {
      const [sum, list] = await Promise.all([
        analysisApi.summary(activeSession),
        fetchTab(),
      ])
      setSummary(sum)
      setUsers(list)
      setSelected(new Set())
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Veri yüklenemedi')
    }
  }, [activeSession, fetchTab])

  // ── Poller callback'leri — loadData'dan sonra ────────────────────────────
  const onSyncDone = useCallback(() => {
    setSyncing(false)
    setSyncTaskId(null)
    loadData()
  }, [loadData])

  const onBulkDone = useCallback(() => {
    setBulkRunning(false)
    setBulkTaskId(null)
    loadData()
  }, [loadData])

  const syncStatus = useTaskPoller(syncTaskId, onSyncDone)
  const bulkStatus = useTaskPoller(bulkTaskId, onBulkDone)

  // ── İlk yükleme ────────────────────────────────────────────────────────────
  useEffect(() => {
    sessionsApi.list().then(s => {
      setSessions(s)
      if (s.length > 0) setActiveSession(s[0].id)
    }).catch(() => setError('Sessionlar yüklenemedi'))
  }, [])

  useEffect(() => {
    if (activeSession) loadData()
  }, [activeSession, loadData])

  // ── Aksiyon handler'lar ────────────────────────────────────────────────────
  const handleSync = async (type: 'followers' | 'following') => {
    setSyncing(true)
    const resp = type === 'followers'
      ? await analysisApi.syncFollowers(activeSession)
      : await analysisApi.syncFollowing(activeSession)
    setSyncTaskId(resp.task_id)
  }

  const handleSingleAction = async (uid: number, action: 'follow' | 'unfollow') => {
    setActionLoading(p => new Set(p).add(uid))
    try {
      const resp = action === 'follow'
        ? await actionsApi.follow(activeSession, uid)
        : await actionsApi.unfollow(activeSession, uid)
      if (resp.queued) {
        setQueuedActions(p => new Set(p).add(uid))
        setQueueLength(resp.queue_position ?? 0)
        // Kuyruğa alındı — veri yenilemeye gerek yok, optimistic UI yeterli
      } else {
        await loadData()
      }
    } finally {
      setActionLoading(p => { const n = new Set(p); n.delete(uid); return n })
    }
  }

  // Kuyruk uzunluğunu periyodik olarak güncelle
  useEffect(() => {
    if (!activeSession) return
    const poll = () => actionsApi.queueStatus(activeSession)
      .then(s => setQueueLength(s.queue_length))
      .catch(() => {})
    poll()
    const iv = setInterval(poll, 10000)
    return () => clearInterval(iv)
  }, [activeSession])

  const handleBulkUnfollow = async () => {
    if (selected.size === 0) return
    setBulkRunning(true)
    setShowBulkModal(false)
    const resp = await actionsApi.bulkUnfollow(
      activeSession, [...selected], bulkDelay.min, bulkDelay.max, bulkDelay.limit
    )
    setBulkTaskId(resp.task_id)
  }

  const toggleSelect = (uid: number) =>
    setSelected(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })

  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(u => u.id)))

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const syncProgress = syncStatus?.status === 'PROGRESS' ? syncStatus.progress : null
  const bulkProgress = bulkStatus?.status === 'PROGRESS' ? bulkStatus.progress : null

  // ── Render ─────────────────────────────────────────────────────────────────
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="mb-2">Kayıtlı session yok.</p>
        <a href="/session" className="text-purple-400 hover:underline text-sm">Session ekle →</a>
      </div>
    )
  }

  return (
    <div>
      {/* Başlık + session seçici + sync butonları */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Takipçi Analizi</h1>
        <div className="flex items-center gap-2">
          {queueLength > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/40 border border-amber-700 rounded-lg text-xs text-amber-300">
              <RefreshCw size={11} className="animate-spin" />
              <span>{queueLength} işlem kuyrukta</span>
            </div>
          )}
          {sessions.length > 1 && (
            <select value={activeSession} onChange={e => setActiveSession(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm">
              {sessions.map(s => <option key={s.id} value={s.id}>@{s.ig_username}</option>)}
            </select>
          )}
          <button onClick={() => handleSync('followers')} disabled={syncing || !activeSession}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Takipçi Sync
          </button>
          <button onClick={() => handleSync('following')} disabled={syncing || !activeSession}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Takip Sync
          </button>
        </div>
      </div>

      {/* Hata */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300 mb-4">
          {error}
        </div>
      )}

      {/* Sync ilerleme */}
      {syncing && (
        <div className="bg-gray-900 border border-purple-800 rounded-xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-purple-400">
              {syncProgress?.step === 'following' ? 'Takip edilenler' : 'Takipçiler'} çekiliyor…
            </span>
            {syncProgress && syncProgress.total > 0 && (
              <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
            )}
          </div>
          {syncProgress && syncProgress.total > 0 && (
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all"
                style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Bulk unfollow ilerleme */}
      {bulkRunning && (
        <div className="bg-gray-900 border border-amber-800 rounded-xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-amber-400">Toplu takipten çıkılıyor…</span>
            {bulkProgress && (
              <span>{bulkProgress.done ?? 0} / {bulkProgress.total} tamamlandı</span>
            )}
          </div>
          {bulkProgress && bulkProgress.total > 0 && (
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.round(((bulkProgress.done ?? 0) / bulkProgress.total) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Özet kartlar */}
      {summary && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Takipçi',              value: summary.total_followers  },
            { label: 'Takip Edilen',         value: summary.total_following  },
            { label: 'Karşılıklı',           value: summary.mutual           },
            { label: 'Geri Takip Etmeyen',   value: summary.not_following_back, warn: true },
            { label: 'Takip Etmediğimiz',    value: summary.not_followed_back },
          ].map(c => (
            <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
              <p className={`text-2xl font-bold ${c.warn ? 'text-amber-400' : ''}`}>{c.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sekme çubuğu */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Arama + toplu aksiyon */}
      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Kullanıcı ara…"
          className="w-64 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500" />
        {selected.size > 0 && (
          <button onClick={() => setShowBulkModal(true)} disabled={bulkRunning}
            className="flex items-center gap-2 px-4 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm font-medium">
            <UserMinus size={14} /> {selected.size} Kişiyi Takipten Çık
          </button>
        )}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-600 border border-dashed border-gray-800 rounded-xl">
          <p className="text-sm">Veri yok.</p>
          <p className="text-xs mt-1">Önce Sync butonuna bas.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-500 mb-1">
            <button onClick={toggleAll} className="flex items-center gap-1.5 hover:text-gray-300">
              {selected.size === filtered.length ? <CheckSquare size={14} /> : <Square size={14} />}
              Tümünü seç ({filtered.length})
            </button>
          </div>
          <div className="space-y-1.5">
            {filtered.map(u => {
              const isSelected = selected.has(u.id)
              const isLoading  = actionLoading.has(u.id)
              const isQueued   = queuedActions.has(u.id)
              return (
                <div key={u.id}
                  onClick={() => toggleSelect(u.id)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-gray-800 border-purple-700'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                  }`}>
                  <div onClick={e => e.stopPropagation()}>
                    {isSelected
                      ? <CheckSquare size={16} className="text-purple-400" />
                      : <Square size={16} className="text-gray-600" />}
                  </div>
                  {u.profile_pic_url
                    ? <img src={proxyImg(u.profile_pic_url)} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                    : <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400 shrink-0">
                        {u.username[0]?.toUpperCase()}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <a href={`https://www.instagram.com/${u.username}/`} target="_blank" rel="noreferrer" className="font-medium text-sm truncate hover:text-purple-400 transition-colors">@{u.username}</a>
                      {u.is_verified && <BadgeCheck size={13} className="text-blue-400 shrink-0" />}
                      {u.is_private  && <Lock        size={12} className="text-gray-500 shrink-0" />}
                    </div>
                    {u.full_name && <p className="text-xs text-gray-500 truncate">{u.full_name}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1 text-xs text-gray-600">
                      <Users size={11} />{u.follower_count?.toLocaleString() ?? '—'}
                    </span>
                    <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                      {isQueued
                        ? <span className="text-xs text-amber-400 px-2 py-1 bg-amber-900/30 rounded-lg flex items-center gap-1">
                            <RefreshCw size={10} className="animate-spin" /> Kuyrukta
                          </span>
                        : isLoading
                          ? <span className="p-1.5"><RefreshCw size={13} className="animate-spin text-gray-500" /></span>
                          : !u.we_follow
                            ? <button onClick={() => handleSingleAction(u.id, 'follow')}
                                className="p-1.5 rounded-lg bg-green-900 hover:bg-green-800 text-green-400" title="Takip Et (kuyruğa alınır)">
                                <UserPlus size={13} />
                              </button>
                            : <button onClick={() => handleSingleAction(u.id, 'unfollow')}
                                className="p-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-400" title="Takipten Çık (kuyruğa alınır)">
                                <UserMinus size={13} />
                              </button>
                      }
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Bulk unfollow modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setShowBulkModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-96"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Toplu Takipten Çık</h2>
            <p className="text-sm text-gray-500 mb-5">{selected.size} kullanıcı seçildi</p>
            <div className="space-y-4 mb-6">
              {[
                { label: 'Min Gecikme (sn)', key: 'min', min: 10 },
                { label: 'Max Gecikme (sn)', key: 'max', min: 10 },
                { label: 'Saatlik Limit',    key: 'limit', min: 1, max: 60 },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                  <input type="number" value={bulkDelay[f.key as keyof typeof bulkDelay]}
                    min={f.min} max={f.max}
                    onChange={e => setBulkDelay(p => ({ ...p, [f.key]: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
                </div>
              ))}
              <p className="text-xs text-gray-600">
                Tahmini süre: ~{Math.round((selected.size * ((bulkDelay.min + bulkDelay.max) / 2)) / 60)} dakika
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleBulkUnfollow}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium">
                Başlat
              </button>
              <button onClick={() => setShowBulkModal(false)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
