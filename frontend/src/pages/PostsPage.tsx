import { proxyImg } from '../utils/imgProxy'
import { useEffect, useState } from 'react'
import { Session } from '../api/sessions'
import { useSession } from '../contexts/SessionContext'
import { postsApi, Post, PostLiker, PostComment, PostStats } from '../api/posts'
import { analysisApi } from '../api/analysis'
import { useLang } from '../contexts/LangContext'
import { Link } from 'react-router-dom'
import BridgeStatusCard from '../components/BridgeStatusCard'
import { useExtension, JobKind } from '../lib/extensionBridge'
import { useToast } from '../contexts/ToastContext'
import { fill } from '../lib/text'
import { RefreshCw, Heart, MessageCircle, Play, Image, Images, Layers, X, Users, Download, Info } from 'lucide-react'

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
  const { sessions } = useSession()
  const [activeSession, setActiveSession] = useState<string>('')
  const [posts, setPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<PostStats | null>(null)
  const [selected, setSelected] = useState<Post | null>(null)
  const [likers, setLikers] = useState<PostLiker[]>([])
  const [comments, setComments] = useState<PostComment[]>([])
  const [detailTab, setDetailTab] = useState<'likers' | 'comments'>('likers')
  const ext = useExtension()
  const toast = useToast()
  const [runError, setRunError] = useState<string | null>(null)

  useEffect(() => {
    if (sessions.length > 0 && !activeSession) setActiveSession(sessions[0].id)
  }, [sessions, activeSession])

  useEffect(() => { if (activeSession) loadData() }, [activeSession])

  // Gönderiler, beğenenler ve yorumlar eklentiyle gelir: kayıt aktıkça listeyi tazele
  const profile = sessions.find(s => s.id === activeSession)
  const jobRunning = ext.job?.state === 'running'
  useEffect(() => {
    if (!activeSession) return
    const t = setInterval(loadData, jobRunning ? 6_000 : 20_000)
    return () => clearInterval(t)
  }, [activeSession, jobRunning])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ext.job && ext.job.state !== 'running') { loadData(); if (selected) loadDetail(selected) }
  }, [ext.job?.state])             // eslint-disable-line react-hooks/exhaustive-deps

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

  // İşi eklenti yapar: Instagram sekmesini açar, kaydırır / tıklar, bitince kapatır
  const start = async (kind: JobKind, shortcodes?: string[]) => {
    setRunError(null)
    const r = await ext.run(kind, shortcodes ? { shortcodes } : {})
    if (!r.ok) {
      const msg = r.error === 'timeout' ? T.posts.extNoAnswer : (r.error ?? T.problems.unknown.title)
      setRunError(msg)
      toast.error(msg)
    }
  }

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
          {([
            ['posts', T.posts.runPosts, Images],
            ['likers', T.posts.runLikers, Heart],
            ['comments', T.posts.runComments, MessageCircle],
          ] as const).map(([kind, label, Icon]) => (
            <button key={kind} onClick={() => start(kind)} disabled={!ext.available || jobRunning || !activeSession}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-sm">
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {!ext.available && (
        <p className="flex gap-2 text-xs text-amber-200 bg-amber-950/40 border border-amber-800 rounded-xl px-3 py-2 mb-4">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>{T.posts.extMissing} <Link to="/guide#kopru" className="underline">{T.posts.extHow}</Link></span>
        </p>
      )}

      {runError && (
        <div role="alert" className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300 mb-4">{runError}</div>
      )}

      {ext.job && (jobRunning || (ext.job.finishedAt && Date.now() - ext.job.finishedAt < 10 * 60_000)) && (
        <div className="bg-gray-900 border border-purple-800 rounded-xl p-4 mb-4" role="status">
          <div className="flex items-center justify-between gap-3 text-sm mb-2">
            <span className="flex items-start gap-2 text-purple-300 whitespace-pre-line">
              {jobRunning && <RefreshCw size={13} className="animate-spin mt-0.5 shrink-0" />} {ext.job.message}
            </span>
            {jobRunning && (
              <button onClick={() => ext.stop()} className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs">{T.posts.stop}</button>
            )}
          </div>
          {ext.job.total > 1 && (
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all"
                style={{ width: `${Math.round((Math.min(ext.job.index, ext.job.total) / ext.job.total) * 100)}%` }} />
            </div>
          )}
          {jobRunning && <p className="text-xs text-gray-500 mt-2">{T.posts.jobNote}</p>}
          {!!ext.job.results?.length && ext.job.kind !== 'posts' && (
            <details className="mt-3" open={!jobRunning && ext.job.outcome !== 'ok'}>
              <summary className="text-xs text-gray-400 cursor-pointer select-none">{T.jobs.results}</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {ext.job.results.map((x, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${x.ok ? 'bg-green-400' : 'bg-amber-400'}`} aria-hidden />
                    <span className="min-w-0">
                      {x.shortcode && (
                        <a href={`https://www.instagram.com/p/${x.shortcode}/`} target="_blank" rel="noreferrer noopener"
                          className="font-mono text-gray-300 hover:underline mr-2">{x.shortcode}</a>
                      )}
                      <span className="text-gray-300">{fill(T.jobs.saved, { n: x.saved })}</span>
                      {x.seen > 0 && <span className="text-gray-500"> · {fill(T.jobs.seen, { n: x.seen })}</span>}
                      {x.note && <span className="block text-gray-400">{x.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
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

      {activeSession && <BridgeStatusCard sessionId={activeSession} />}

      {posts.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-16">{T.posts.emptyRun}</p>
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
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
                {/* Yalnızca bu gönderi için */}
                <button onClick={() => start('likers', [selected.shortcode])} disabled={!ext.available || jobRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs">
                  <Heart size={12} /> {T.posts.runLikersOne}
                </button>
                <button onClick={() => start('comments', [selected.shortcode])} disabled={!ext.available || jobRunning || !selected.comment_count}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs">
                  <MessageCircle size={12} /> {T.posts.runCommentsOne}
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
