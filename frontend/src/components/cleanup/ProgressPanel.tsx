import { useEffect, useRef, useState } from 'react'
import { cleanupApi, cleanupError, type ActiveBatch, type CleanupStatus } from '../../api/cleanup'
import { useLang } from '../../contexts/LangContext'
import { cmpVersion, extensionSupportsCleanup } from '../../lib/extension'
import type { useExtension } from '../../lib/extensionBridge'
import { fill } from '../../lib/text'
import { errorText, formatAt, reasonText } from './format'

type Ext = ReturnType<typeof useExtension>

interface Props {
  sessionId: string
  status: CleanupStatus
  unreachable: boolean
  ext: Ext
  onRefresh: () => void
  onRescan: () => void
  onRepreview: () => void
  onFinished?: () => void
}

const START_REPLY_MS = 10_000

/** Parti paneli: hazır / çalışıyor / durduruluyor / durdu, Başlat-Durdur, ilerleme, şeritler, özet (§4.2). */
export default function ProgressPanel({ sessionId, status, unreachable, ext, onRefresh, onRescan, onRepreview, onFinished }: Props) {
  const { T, lang } = useLang()
  const C = T.cleanup
  const batch = status.active_batch
  const [starting, setStarting] = useState(false)
  const [startMsg, setStartMsg] = useState<string | null>(null)
  const [busyJob, setBusyJob] = useState<string | null>(null)       // Başlat'a basıldığında eklenti meşgulse işin adı
  const [stopFailed, setStopFailed] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [finished, setFinished] = useState<ActiveBatch | null>(null)
  const last = useRef<ActiveBatch | null>(null)

  useEffect(() => {
    if (batch) { last.current = batch; setFinished(null) }
    else if (last.current) { setFinished(last.current); last.current = null; onFinished?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız parti var/yok geçişi
  }, [batch])

  const job = ext.job?.state === 'running' ? ext.job : null
  const jobName = (k: string) => T.notifications.jobs[k] || k
  const otherBusy = job !== null && job.kind !== 'saved_unsave'
  const extRunning = job !== null && job.kind === 'saved_unsave'
  const extOk = extensionSupportsCleanup(ext.version)

  const paused = status.run_state === 'paused' || !!status.paused_until
  const until = formatAt(status.paused_until ?? status.next_allowed_at, T, lang)

  const reasonVars = { until, next_allowed_at: until, retry_after: '' }
  const stopReason = batch?.status === 'stopped' ? batch.last_stop_reason : null

  const requiresNewer = !!batch?.requires_ext_above && (!ext.version || cmpVersion(ext.version, batch.requires_ext_above) <= 0)
  const gateOpen = status.run_state === 'ready'

  const startDisabled = !batch || starting || !extOk || otherBusy || busyJob !== null || extRunning || requiresNewer || !gateOpen
  const whyNot = (() => {
    if (gateOpen) return null
    const why = C.why[status.run_state] ?? status.run_state
    if (status.run_state === 'off') return reasonText(T, 'off')
    const at = formatAt(status.next_allowed_at, T, lang)
    return at ? fill(C.startAfter, { at, why }) : reasonText(T, status.run_state, reasonVars)
  })()

  const refreshSoon = () => { onRefresh() }

  const start = async () => {
    if (!batch) return
    setStartMsg(null); setStarting(true)
    try {
      const current = await ext.currentJob()
      if (current?.state === 'running') { setBusyJob(current.kind); return }
      let reply
      try {
        reply = await cleanupApi.start(sessionId, batch.id, ext.version)
      } catch (e) {
        const r = errorText(T, e, C.startError, lang)
        const err = cleanupError(e)
        setStartMsg(r.code === 'not_now' && err.reason
          ? fill(C.startAfter, { at: formatAt(err.next_allowed_at, T, lang), why: C.why[err.reason] ?? err.reason })
          : r.text)
        return
      }
      const run = await ext.run('saved_unsave', { session_id: sessionId, batch_id: batch.id, run_seq: reply.run_seq }, START_REPLY_MS)
      if (!run.ok) {
        try { await cleanupApi.stop(sessionId, batch.id, { reason: 'start_failed', run_seq: reply.run_seq }) } catch { /* sunucu T_eff sonra durdurur */ }
        setStartMsg(C.startFailed)
      }
    } finally {
      setStarting(false)
      refreshSoon()
    }
  }

  const stop = async () => {
    if (!batch) return
    setStopFailed(false)
    void ext.stop()                                        // eklentiye her durumda gider (AC-U23)
    try { await cleanupApi.stop(sessionId, batch.id, { reason: 'user_stop' }) } catch { setStopFailed(true) }
    refreshSoon()
  }

  const cancel = async () => {
    if (!batch) return
    setActionError(false)
    try { await cleanupApi.cancel(sessionId, batch.id) } catch { setActionError(true) }
    refreshSoon()
  }

  const busyText = (otherBusy && job) || busyJob
    ? fill(C.busyExt, { job: jobName(String(job?.kind ?? busyJob)) }) : null

  return (
    <div className="space-y-3">
      {unreachable && <p role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300">{C.unreachable}</p>}

      {paused && (
        <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300">
          {reasonText(T, 'blocked')} {until && fill(C.pausedEnds, { at: until })}
        </p>
      )}

      {batch && (
        <section aria-label={C.progressLabel} className="card p-4 space-y-3">
          {batch.status === 'confirmed' && <p className="text-sm font-semibold">{fill(C.batchReady, { n: batch.total })}</p>}

          {(batch.status === 'running' || batch.status === 'stopped') && (
            <Progress batch={batch} delay={status.delay} showNext={batch.status === 'running'} />
          )}

          {batch.status === 'running' && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{C.stopNote}</p>}

          {batch.status === 'stopped' && extRunning && <p role="status" className="text-sm">{C.stopping}</p>}
          {batch.status === 'stopped' && !extRunning && (
            <StopStrip reason={stopReason} paused={paused} vars={reasonVars} onCancel={cancel} onRescan={onRescan} onRepreview={onRepreview} />
          )}

          {requiresNewer && batch.status !== 'running' && (
            <p role="status" className="text-sm text-amber-400">{fill(C.extUpdate, { v: ext.version ?? '-' })}</p>
          )}
          {busyText && batch.status !== 'running' && <p role="status" className="text-sm text-amber-400">{busyText}</p>}
          {batch.status !== 'running' && whyNot && !startMsg && <p className="text-sm" style={{ color: 'var(--text-2)' }}>{whyNot}</p>}
          {startMsg && <p role="alert" className="text-sm text-red-400">{startMsg}</p>}
          {stopFailed && (
            <div role="alert" className="text-sm text-red-400 flex flex-wrap items-center gap-2">
              <span>{C.stopFailed}</span>
              <button type="button" className="btn-ghost" onClick={stop}>{C.retry}</button>
            </div>
          )}
          {actionError && <p role="alert" className="text-sm text-red-400">{C.actionFailed}</p>}

          <div className="flex flex-wrap gap-2">
            {batch.status === 'running' && <button type="button" className="btn-primary" onClick={stop}>{C.stop}</button>}
            {batch.status !== 'running' && (
              <button type="button" className="btn-primary" disabled={startDisabled} onClick={start}>{starting ? C.starting : C.start}</button>
            )}
            {stopReason !== 'already_streak' && !(batch.status === 'stopped' && extRunning) && (
              <button type="button" className="btn-ghost" onClick={cancel}>{C.cancelRest}</button>
            )}
          </div>
        </section>
      )}

      {!batch && finished && (
        <section aria-label={C.summary.title} className="card p-4">
          <h3 className="font-semibold text-sm mb-2">{C.summary.title}</h3>
          <ul className="text-sm flex flex-wrap gap-x-4 gap-y-1 mb-2">
            <li>{C.summary.done}: {finished.done}</li>
            <li>{C.summary.already}: {finished.already}</li>
            <li>{C.summary.notFound}: {finished.not_found}</li>
            <li>{C.summary.protected}: {finished.protected}</li>
            <li>{C.summary.failed}: {finished.failed}</li>
            <li>{C.summary.cancelled}: {finished.cancelled}</li>
          </ul>
          <a href="#cleanup-history" className="text-sm underline" style={{ color: 'var(--accent)' }}>{C.summary.history}</a>
        </section>
      )}
    </div>
  )
}

function Progress({ batch, delay, showNext }: { batch: ActiveBatch; delay: number[]; showNext: boolean }) {
  const { T } = useLang()
  const C = T.cleanup
  const processed = Math.max(0, batch.total - batch.pending)
  const avg = delay.length >= 2 ? Math.round((delay[0] + delay[1]) / 2) : null
  return (
    <div aria-live="polite">
      <div
        role="progressbar" aria-label={C.progressLabel} aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={processed}
        className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--surface-2)' }}
      >
        <div className="h-full" style={{ width: `${batch.total ? (processed / batch.total) * 100 : 0}%`, background: 'var(--accent)' }} />
      </div>
      <p className="text-sm">
        {[
          fill(C.progress, { done: batch.done, total: batch.total }),
          fill(C.cAlready, { n: batch.already }),
          fill(C.cNotFound, { n: batch.not_found }),
          fill(C.cProtected, { n: batch.protected }),
          fill(C.cFailed, { n: batch.failed }),
          ...(batch.cancelled > 0 ? [fill(C.cCancelled, { n: batch.cancelled })] : []),
          ...(showNext && avg !== null ? [fill(C.nextIn, { n: avg })] : []),
        ].join(' · ')}
      </p>
    </div>
  )
}

function StopStrip({ reason, paused, vars, onCancel, onRescan, onRepreview }: {
  reason: string | null; paused: boolean; vars: Record<string, string | number>
  onCancel: () => void; onRescan: () => void; onRepreview: () => void
}) {
  const { T } = useLang()
  const C = T.cleanup
  if (reason === 'blocked' && paused) return null                // kırmızı duraklatma şeridi zaten aynı metni verir
  const text = reasonText(T, reason ?? 'stopped', vars)
  if (reason === 'mutation_unrecognised') {
    return <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300">{text}</p>
  }
  if (reason === 'blocked') {
    return <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300">{text}</p>
  }
  if (reason === 'rate_limited') {
    return <p role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300">{text}</p>
  }
  if (reason === 'already_streak') {
    return (
      <div role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300 space-y-2">
        <p>{text}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>{C.cancelRest}</button>
          <button type="button" className="btn-ghost" onClick={onRescan}>{C.rescan}</button>
          <button type="button" className="btn-ghost" onClick={onRepreview}>{C.repreview}</button>
        </div>
      </div>
    )
  }
  return <p role="status" className="text-sm">{fill(C.stoppedAs, { reason: text })}</p>
}
