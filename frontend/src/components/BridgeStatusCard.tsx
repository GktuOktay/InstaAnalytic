import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pause, Play, Plug } from 'lucide-react'
import { bridgeApi, BridgeStatus } from '../api/bridge'
import { useLang } from '../contexts/LangContext'
import { useToast } from '../contexts/ToastContext'
import { fill } from '../lib/text'

const POLL_MS = 30_000

export default function BridgeStatusCard({ sessionId, onChange }: { sessionId: string; onChange?: (s: BridgeStatus) => void }) {
  const { T, lang } = useLang()
  const L = T.bridge
  const toast = useToast()
  const locale = lang === 'en' ? 'en-US' : 'tr-TR'
  const [st, setSt] = useState<BridgeStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    bridgeApi.status(sessionId)
      .then(s => { setSt(s); setFailed(false); onChange?.(s) })
      .catch(() => setFailed(true))
  }, [sessionId, onChange])

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
  const dot = st.paused_until ? 'bg-red-500' : st.wrong_account ? 'bg-amber-400' : st.connected && !st.stopped ? 'bg-green-400' : 'bg-gray-600'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <Plug size={16} className="text-purple-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{L.title}</span>
            <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />
            <span className="text-xs text-gray-500">
              {st.last_seen ? (st.connected ? L.connected : `${L.lastSeen}: ${when(st.last_seen)}`) : L.neverSeen}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{L.desc}</p>

          {st.paused_until && (
            <div role="alert" className="text-xs text-red-100 bg-red-950/60 border border-red-700 rounded-lg px-3 py-2 mt-2">
              <p className="font-semibold">{fill(L.paused, { at: when(st.paused_until) })}</p>
              {st.paused_reason && <p className="text-red-200/80">{st.paused_reason}</p>}
            </div>
          )}
          {st.wrong_account && <p className="text-xs text-amber-300 mt-2">{fill(L.wrongAccount, { name: st.wrong_account })}</p>}
          {st.stopped && <p className="text-xs text-gray-400 mt-2">{L.stopped}</p>}

          {st.posts > 0 && (
            <>
              <div className="h-1.5 bg-gray-800 rounded mt-3" role="progressbar" aria-valuemin={0}
                aria-valuemax={st.posts} aria-valuenow={st.likers_done}>
                <div className="h-1.5 bg-purple-500 rounded" style={{ width: `${(100 * st.likers_done) / st.posts}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
                <span>{fill(L.progress, { done: st.likers_done, total: st.posts })}</span>
                <span>{fill(L.today, { n: st.today, cap: st.daily_cap })}</span>
                {st.next_at && <span>{L.nextAt}: {when(st.next_at)}</span>}
              </div>
            </>
          )}
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
