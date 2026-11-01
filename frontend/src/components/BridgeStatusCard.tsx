import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Pause, Play, Plug } from 'lucide-react'
import { bridgeApi, BridgeStatus, BridgeTodo } from '../api/bridge'
import { useLang } from '../contexts/LangContext'
import { useToast } from '../contexts/ToastContext'
import { fill } from '../lib/text'
import ProblemNote from './ProblemNote'

const POLL_MS = 20_000

export default function BridgeStatusCard({ sessionId }: { sessionId: string }) {
  const { T, lang } = useLang()
  const L = T.bridge
  const toast = useToast()
  const locale = lang === 'en' ? 'en-US' : 'tr-TR'
  const [st, setSt] = useState<BridgeStatus | null>(null)
  const [todo, setTodo] = useState<BridgeTodo[]>([])
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    Promise.all([bridgeApi.status(sessionId), bridgeApi.todo(sessionId, 6)])
      .then(([s, t]) => { setSt(s); setTodo(t); setFailed(false) })
      .catch(() => setFailed(true))
  }, [sessionId])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const toggle = async () => {
    if (!st) return
    setBusy(true)
    try {
      await (st.stopped ? bridgeApi.resume(sessionId) : bridgeApi.stop(sessionId))
      load()
    } catch {
      toast.error(T.common.failed)
    } finally {
      setBusy(false)
    }
  }

  if (failed) return null
  if (!st) return <div className="h-20 rounded-xl bg-gray-900 border border-gray-800 animate-pulse mb-4" aria-hidden />

  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
  const dot = st.paused_until ? 'bg-red-500' : st.connected && !st.stopped ? 'bg-green-400' : 'bg-gray-600'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <Plug size={16} className="text-purple-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{L.title}</span>
            <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />
            <span className="text-xs text-gray-500">
              {st.last_seen ? (st.connected ? L.connected : `${L.lastSeen}: ${when(st.last_seen)}`) : L.neverSeen}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{L.desc}</p>

          {st.paused_until && (
            <div className="mt-2">
              <ProblemNote raw={st.paused_reason} extra={fill(L.paused, { at: when(st.paused_until) })} />
            </div>
          )}
          {st.stopped && <p className="text-xs text-gray-400 mt-2">{L.stopped}</p>}

          {st.posts === 0 ? (
            <p className="text-xs text-gray-400 mt-3">{L.noPosts}</p>
          ) : (
            <>
              <div className="h-1.5 bg-gray-800 rounded mt-3" role="progressbar" aria-valuemin={0}
                aria-valuemax={st.posts} aria-valuenow={st.likers_done}>
                <div className="h-1.5 bg-purple-500 rounded" style={{ width: `${(100 * st.likers_done) / st.posts}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
                <span>{fill(L.found, { n: st.posts })}</span>
                <span>{fill(L.progress, { done: st.likers_done, total: st.posts })}</span>
                <span>{fill(L.todayLine, { posts: st.today_posts, people: st.today_people })}</span>
                {st.last_saved && <span>{L.lastSaved}: {when(st.last_saved)}</span>}
              </div>
            </>
          )}

          {st.posts > 0 && (todo.length === 0 ? (
            <p className="text-xs text-green-400 mt-3">{L.allDone}</p>
          ) : !st.paused_until && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-300">{L.todoTitle}</p>
              <p className="text-xs text-gray-500 mb-2">{L.todoHint}</p>
              <ul className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {todo.map(p => (
                  <li key={p.id}>
                    <a href={`https://www.instagram.com/p/${p.shortcode}/`} target="_blank" rel="noreferrer noopener"
                      title={L.open} aria-label={`${L.open}: ${fill(L.likes, { n: p.like_count })}`}
                      className="group block rounded-lg overflow-hidden border border-gray-800 hover:border-purple-500">
                      <div className="aspect-square bg-gray-800">
                        {p.thumbnail_url && (
                          <img src={p.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer"
                            className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex items-center justify-between px-1.5 py-1 text-[11px] text-gray-400 group-hover:text-gray-200">
                        <span>{fill(L.likes, { n: p.like_count })}</span>
                        <ExternalLink size={11} />
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={toggle} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-xs">
            {st.stopped ? <><Play size={12} /> {L.resume}</> : <><Pause size={12} /> {L.stop}</>}
          </button>
          <Link to="/guide#kopru" className="text-xs text-gray-400 hover:text-gray-200 underline">{L.guide}</Link>
        </div>
      </div>
    </div>
  )
}
