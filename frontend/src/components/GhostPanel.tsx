import { useCallback, useEffect, useRef, useState } from 'react'
import { Ghost, Square } from 'lucide-react'
import { ghostsApi, GhostStatus } from '../api/ghosts'
import { formatMinutes } from '../lib/duration'
import { useLang } from '../contexts/LangContext'
import { apiErrorMessage } from '../lib/problems'
import { useToast } from '../contexts/ToastContext'

interface Props { sessionId: string; onChanged: () => void }

const ACTIVE = ['running', 'cooldown']

export default function GhostPanel({ sessionId, onChanged }: Props) {
  const { T, lang } = useLang()
  const G = T.ghosts
  const toast = useToast()
  const [st, setSt] = useState<GhostStatus | null>(null)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const prevState = useRef<string | null>(null)

  const load = useCallback(async () => {
    try { setSt(await ghostsApi.status(sessionId)) } catch { /* panel boş kalır, sayfa çalışmaya devam eder */ }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const active = !!st && ACTIVE.includes(st.job.state)
  useEffect(() => {
    if (!active) return
    const iv = setInterval(load, 2000)
    return () => clearInterval(iv)
  }, [active, load])

  // Durum değişince kısa bildirim ve liste yenileme
  useEffect(() => {
    if (!st) return
    const now = st.job.state, before = prevState.current
    prevState.current = now
    if (!before || before === now) return
    if (now === 'done') { toast.success(G.doneMsg.replace('{n}', String(st.counts.unreachable))); onChanged() }
    if (now === 'blocked') { toast.error(G.blockedMsg); onChanged() }
    if (now === 'stopped') onChanged()
  }, [st, G, toast, onChanged])

  const start = async () => {
    setBusy(true)
    try { await ghostsApi.start(sessionId); await load() }
    catch (e: any) { toast.error(apiErrorMessage(e, T, G.startFailed)) }
    finally { setBusy(false) }
  }
  const stop = async () => {
    try { await ghostsApi.stop(sessionId); await load() }
    catch (e: any) { toast.error(apiErrorMessage(e, T, G.startFailed)) }
  }

  if (!st) return <div className="h-28 rounded-lg bg-gray-900 border border-gray-800 animate-pulse mb-4" aria-hidden />

  const { job, pace, counts } = st
  const pending = counts.unchecked + counts.unknown
  const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0
  const etaMin = pace.per_hour ? ((job.total - job.done) / pace.per_hour) * 60 : 0
  const resumeAt = job.resume_at ? new Date(job.resume_at * 1000) : null
  const locale = lang === 'en' ? 'en-US' : 'tr-TR'

  return (
    <section className="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-4" aria-label={G.title}>
      <div className="flex items-center gap-2 mb-1 text-sm font-medium"><Ghost size={15} className="text-purple-400" /> {G.title}</div>

      {!active ? (
        <>
          <p className="text-sm text-gray-400 mb-2">{G.intro}</p>
          <p className="text-xs text-gray-500 mb-2">{G.how}</p>
          <p className="text-xs text-gray-500 mb-3">{G.speed.replace('{n}', String(pace.per_hour))}</p>
          {job.state === 'blocked' && <p className="text-xs text-amber-300 mb-3">{G.blockedMsg}</p>}
          {job.state === 'done' && <p className="text-xs text-green-400 mb-3">{G.doneMsg.replace('{n}', String(counts.unreachable))}</p>}
          {counts.unknown > 0 && <p className="text-xs text-gray-500 mb-3">{G.unsureNote.replace('{n}', String(counts.unknown))}</p>}
          {pending > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer max-w-md">
                <input type="checkbox" className="mt-0.5" checked={ack} onChange={e => setAck(e.target.checked)} /> {G.ack}
              </label>
              <button onClick={start} disabled={!ack || busy}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-semibold">
                {G.startN.replace('{n}', String(pending))}
              </button>
            </div>
          ) : <p className="text-xs text-gray-500">{G.nothing}</p>}
        </>
      ) : (
        <div aria-live="polite">
          <div className="flex justify-between text-xs text-gray-300 mb-1">
            <span>{G.progress.replace('{done}', String(job.done)).replace('{total}', String(job.total))}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-purple-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            <b className="text-gray-200">{job.unreachable}</b> {G.found} · <b className="text-gray-200">{job.ok}</b> {G.alive} · {job.unknown} {G.unsure}
          </p>
          {job.state === 'cooldown' ? (
            <p className="text-xs text-amber-300 mt-1">
              {G.cooldownMsg.replace('{time}', resumeAt ? resumeAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '')}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              {G.perHour.replace('{n}', String(pace.per_hour))}
              {etaMin > 0 && ` · ${G.eta.replace('{t}', formatMinutes(etaMin, lang))}`}
            </p>
          )}
          <button onClick={stop} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-700 hover:border-gray-500 rounded-lg text-xs">
            <Square size={12} /> {G.stop}
          </button>
        </div>
      )}
    </section>
  )
}
