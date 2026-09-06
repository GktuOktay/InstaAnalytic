import { proxyImg } from '../utils/imgProxy'
import { useEffect, useState } from 'react'
import { sessionsApi, Session } from '../api/sessions'
import { postsApi, Post, PostLiker, PostComment, PostStats } from '../api/posts'
import { analysisApi } from '../api/analysis'
import { useLang } from '../contexts/LangContext'
import { useTaskPoller } from '../hooks/useTaskPoller'
import { RefreshCw, Heart, MessageCircle, Play, Image, Layers, X, Users, Download } from 'lucide-react'

const IG_URL = (shortcode: string) => `https://www.instagram.com/p/${shortcode}/`

const MEDIA_ICON: Record<string, React.ReactNode> = {
  '1': <Image size={11} />,
  '2': <Play size={11} />,
  '8': <Layers size={11} />,
  'PHOTO': <Image size={11} />,
  'VIDEO': <Play size={11} />,
  'ALBUM': <Layers size={11} />,
}

export default function PostsPage() {
  const { T, lang } = useLang()
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<string>('')
  const [posts, setPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<PostStats | null>(null)
  const [selected, setSelected] = useState<Post | null>(null)
  const [likers, setLikers] = useState<PostLiker[]>([])
  const [comments, setComments] = useState<PostComment[]>([])
  const [detailTab, setDetailTab] = useState<'likers' | 'comments'>('likers')
  const [syncTaskId, setSyncTaskId] = useState<string | null>(null)
  const [interactionTaskId, setInteractionTaskId] = useState<string | null>(null)
  const [bulkTaskId, setBulkTaskId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncingInteraction, setSyncingInteraction] = useState(false)
  const [syncingBulk, setSyncingBulk] = useState(false)

  const syncStatus = useTaskPoller(syncTaskId, () => {
    setSyncing(false); setSyncTaskId(null); loadData()
  })
  const interactionStatus = useTaskPoller(interactionTaskId, () => {
    setSyncingInteraction(false); setInteractionTaskId(null)
    if (selected) loadDetail(selected)
  })
  const bulkStatus = useTaskPoller(bulkTaskId, () => {
    setSyncingBulk(false); setBulkTaskId(null); loadData()
  })

  useEffect(() => {
    sessionsApi.list().then(s => {
      setSessions(s)
      if (s.length > 0) setActiveSession(s[0].id)
    })
  }, [])

  useEffect(() => { if (activeSession) loadData() }, [activeSession])

  const loadData = async () => {
    if (!activeSession) return
    const [list, st] = await Promise.all([
      postsApi.list(activeSession).catch(() => []),
      postsApi.stats(activeSession).catch(() => null),
    ])
    setPosts(list)
    setStats(st)
  }

  const loadDetail = async (post: Post) => {
    setSelected(post)
    const [l, c] = await Promise.all([
      postsApi.likers(activeSession, post.shortcode).catch(() => []),
      postsApi.comments(activeSession, post.shortcode).catch(() => []),
    ])
    setLikers(l)
    setComments(c)
  }

  const handleSync = async () => {
    setSyncing(true)
    const resp = await postsApi.syncPosts(activeSession)
    setSyncTaskId(resp.task_id)
  }

  const handleSyncInteractions = async (post: Post) => {
    setSyncingInteraction(true)
    const resp = await postsApi.syncInteractions(activeSession, post.shortcode)
    setInteractionTaskId(resp.task_id)
  }

  const handleSyncAllInteractions = async () => {
    setSyncingBulk(true)
    const resp = await postsApi.syncAllInteractions(activeSession)
    setBulkTaskId(resp.task_id)
  }

  const syncProgress = syncStatus?.status === 'PROGRESS' && syncStatus.progress
  const bulkProgress = bulkStatus?.status === 'PROGRESS' && bulkStatus.progress

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{T.posts.title}</h1>
        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <select value={activeSession} onChange={e => setActiveSession(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm">
              {sessions.map(s => <option key={s.id} value={s.id}>@{s.ig_username}</option>)}
            </select>
          )}
          <button onClick={handleSyncAllInteractions} disabled={syncingBulk || syncing || !activeSession || posts.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-sm">
            <Users size={13} className={syncingBulk ? 'animate-spin' : ''} /> {T.posts.scanAll}
          </button>
          <button onClick={handleSync} disabled={syncing || !activeSession}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-sm">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {T.posts.fetch}
          </button>
        </div>
      </div>

      {syncing && (
        <div className="bg-gray-900 border border-purple-800 rounded-xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-purple-400">{T.posts.fetching}</span>
            {syncProgress && <span>{syncProgress.current} / {syncProgress.total}</span>}
          </div>
          {syncProgress && (
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all"
                style={{ width: `${Math.round((syncProgress.current / (syncProgress.total || 1)) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {syncingBulk && (
        <div className="bg-gray-900 border border-blue-800 rounded-xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-blue-400">{T.posts.scanning}</span>
            {bulkProgress && <span>{bulkProgress.current} / {bulkProgress.total} {lang === 'en' ? 'posts' : 'gönderi'}</span>}
          </div>
          {bulkProgress && bulkProgress.total > 0 && (
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%` }} />
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">{T.posts.workerNote}</p>
        </div>
      )}

      {stats && stats.total_posts > 0 && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: T.posts.totalPosts,    value: stats.total_posts.toLocaleString() },
            { label: T.posts.totalLikes,    value: stats.total_likes.toLocaleString() },
            { label: T.posts.totalComments, value: stats.total_comments.toLocaleString() },
            { label: T.posts.avgLikes,      value: stats.avg_likes.toLocaleString() },
            { label: T.posts.avgComments,   value: stats.avg_comments.toLocaleString() },
          ].map(c => (
            <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-16">{T.posts.noPost}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {posts.map(post => (
            <div key={post.id}
              onClick={() => loadDetail(post)}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden cursor-pointer hover:border-gray-600 transition-colors group">
              <div className="relative aspect-square bg-gray-800">
                {post.thumbnail_url ? (
                  <img src={post.thumbnail_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    {MEDIA_ICON[post.media_type ?? ''] ?? <Image size={24} />}
                  </div>
                )}
                <div className="absolute top-2 right-2 text-gray-400">
                  {MEDIA_ICON[post.media_type ?? '']}
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-3 text-sm mb-1">
                  <span className="flex items-center gap-1 text-red-400"><Heart size={13} />{post.like_count.toLocaleString()}</span>
                  <span className="flex items-center gap-1 text-blue-400"><MessageCircle size={13} />{post.comment_count.toLocaleString()}</span>
                </div>
                {post.taken_at && (
                  <p className="text-xs text-gray-600">{new Date(post.taken_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gönderi detay paneli */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-red-400"><Heart size={14} />{selected.like_count.toLocaleString()}</span>
                  <span className="flex items-center gap-1 text-blue-400"><MessageCircle size={14} />{selected.comment_count.toLocaleString()}</span>
                </div>
                <a href={IG_URL(selected.shortcode)} target="_blank" rel="noreferrer"
                  className="text-xs text-purple-400 hover:underline">
                  {lang === 'en' ? 'Open on Instagram' : 'Instagram\'da aç'}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSyncInteractions(selected)}
                  disabled={syncingInteraction}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs">
                  <RefreshCw size={12} className={syncingInteraction ? 'animate-spin' : ''} />
                  {lang === 'en' ? 'Fetch Likes/Comments' : 'Like/Yorum Çek'}
                </button>
                <button onClick={() => setSelected(null)} className="p-1.5 text-gray-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>
            </div>

            {selected.caption && (
              <p className="text-sm text-gray-400 px-4 py-3 border-b border-gray-800 line-clamp-3">
                {selected.caption}
              </p>
            )}

            {syncingInteraction && (
              <div className="px-4 py-2 text-xs text-purple-400 border-b border-gray-800">
                {lang === 'en' ? 'Fetching interactions...' : 'Etkileşimler çekiliyor...'}
              </div>
            )}

            <div className="flex gap-0 border-b border-gray-800">
              {(['likers', 'comments'] as const).map(t => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    detailTab === t ? 'border-purple-500 text-white' : 'border-transparent text-gray-500'
                  }`}>
                  {t === 'likers'
                    ? `${lang === 'en' ? 'Likes' : 'Likelar'} (${likers.length})`
                    : `${lang === 'en' ? 'Comments' : 'Yorumlar'} (${comments.length})`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {detailTab === 'likers' ? (
                likers.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-8">{T.posts.noLikes}</p>
                ) : (
                  <div className="space-y-1">
                    {likers.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800">
                        {u.profile_pic_url ? (
                          <img src={proxyImg(u.profile_pic_url)} className="w-8 h-8 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                            {u.username[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <a href={`https://www.instagram.com/${u.username}/`} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-purple-400 transition-colors">@{u.username}</a>
                          {u.full_name && <p className="text-xs text-gray-500">{u.full_name}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                comments.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-8">{T.posts.noComments}</p>
                ) : (
                  <div className="space-y-2 p-2">
                    {comments.map((c, i) => (
                      <div key={i} className="bg-gray-800 rounded-xl px-3 py-2">
                        {c.username
                          ? <a href={`https://www.instagram.com/${c.username}/`} target="_blank" rel="noreferrer" className="text-xs font-medium text-purple-400 mb-1 hover:text-purple-300 transition-colors block">@{c.username}</a>
                          : <p className="text-xs font-medium text-purple-400 mb-1">{c.ig_user_id}</p>
                        }
                        <p className="text-sm text-gray-300">{c.content}</p>
                        {c.interacted_at && (
                          <p className="text-xs text-gray-600 mt-1">{new Date(c.interacted_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
