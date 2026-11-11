import { useCallback, useEffect, useId, useState } from 'react'
import { cleanupApi, type BatchItems, type Preview, type PreviewSelection } from '../../api/cleanup'
import { useLang } from '../../contexts/LangContext'
import { fill } from '../../lib/text'
import Dialog from './Dialog'
import { errorText } from './format'

const PAGE = 50

interface Props {
  sessionId: string
  selection: PreviewSelection
  /** Parti tavanı `{max}` (ayar dosyasından, sabit 500 yazılmaz; R3 #16). */
  maxItems: number
  onClose: () => void
  /** Onay başarılı: parti "hazır" oldu. */
  onConfirmed: () => void
  /** `scan_mismatch`: envanter yenilendi, liste yeniden yüklensin. */
  onStale: () => void
}

type Phase =
  | { k: 'loading' }
  | { k: 'error'; code: string | null; text: string }
  | { k: 'ready'; preview: Preview }

/** Önizleme + sayı yazarak onay (§4.1 adım 4-5, AC-C6, U7, U13, U24). Liste yalnız sunucudaki plandan çizilir (S-14). */
export default function ConfirmDialog({ sessionId, selection, maxItems, onClose, onConfirmed, onStale }: Props) {
  const { T, lang } = useLang()
  const P = T.cleanup.preview
  const [phase, setPhase] = useState<Phase>({ k: 'loading' })
  const [page, setPage] = useState(0)
  const [list, setList] = useState<BatchItems | null>(null)
  const [listFailed, setListFailed] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const inputId = useId()

  const loadPreview = useCallback(() => {
    setPhase({ k: 'loading' }); setPage(0); setList(null); setTyped(''); setConfirmError(null)
    cleanupApi.preview(sessionId, selection)
      .then(p => setPhase({ k: 'ready', preview: p }))
      .catch(e => {
        const r = errorText(T, e, P.failed, lang)
        setPhase({ k: 'error', code: r.code, text: r.code ? r.text : P.failed })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- T/lang değişince yeniden önizleme açılmaz
  }, [sessionId, selection])
  useEffect(loadPreview, [loadPreview])

  const batchId = phase.k === 'ready' ? phase.preview.batch_id : null
  useEffect(() => {
    if (batchId == null) return
    let alive = true
    setListFailed(false)
    cleanupApi.batchItems(sessionId, batchId, PAGE, page * PAGE)
      .then(r => { if (alive) setList(r) })
      .catch(() => { if (alive) setListFailed(true) })
    return () => { alive = false }
  }, [sessionId, batchId, page])

  const preview = phase.k === 'ready' ? phase.preview : null
  const n = preview?.item_count ?? 0
  const matches = preview !== null && n > 0 && typed.trim() === String(n)      // §4.2: kırpılmış değer String(N) ile birebir

  const confirm = async () => {
    if (!preview || preview.batch_id == null || !matches) return
    setBusy(true); setConfirmError(null)
    try {
      await cleanupApi.confirm(sessionId, preview.batch_id, n)
      onConfirmed()
    } catch (e) {
      const r = errorText(T, e, T.cleanup.startError, lang)
      setConfirmError(r.code ? r.text : T.cleanup.reason.invalid)
    } finally {
      setBusy(false)
    }
  }

  const typeLabel = fill(P.typeCount, { n })
  const [before, bold, after] = (() => {
    const m = /^(.*)\*\*(.+?)\*\*(.*)$/.exec(typeLabel)
    return m ? [m[1], m[2], m[3]] : [typeLabel, '', '']
  })()
  const total = list?.total ?? n
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <Dialog title={P.title} onClose={onClose} busy={phase.k === 'loading'} wide>
      {phase.k === 'loading' && (
        <div role="status" className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>{P.loading}</p>
          {[0, 1, 2].map(i => <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'var(--surface-2)' }} />)}
        </div>
      )}

      {phase.k === 'error' && (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-red-400">{phase.text}</p>
          <div className="flex gap-2">
            {phase.code === 'scan_mismatch'
              ? <button type="button" className="btn-primary" onClick={onStale}>{P.reload}</button>
              : <button type="button" className="btn-primary" onClick={loadPreview}>{T.cleanup.retry}</button>}
            <button type="button" className="btn-ghost" onClick={onClose}>{P.cancel}</button>
          </div>
        </div>
      )}

      {preview && n === 0 && (
        <div className="space-y-3">
          <p className="text-sm">{fill(P.empty, { k: preview.excluded })}</p>
          <div className="flex justify-end"><button type="button" className="btn-ghost" onClick={onClose}>{P.cancel}</button></div>
        </div>
      )}

      {preview && n > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">{fill(P.summary, { n })}</p>
          <p className="text-sm">{fill(P.estimate, { days: preview.estimate.days, starts: preview.estimate.starts })}</p>
          {preview.in_unprotected_collections > 0 && (
            <p className="text-sm text-amber-400">{fill(P.unprotected, { k: preview.in_unprotected_collections })}</p>
          )}
          {preview.truncated && (
            <p className="text-sm text-amber-400" role="status">{fill(P.truncated, { max: preview.item_count || maxItems, rest: preview.remaining })}</p>
          )}
          <p className="text-sm font-semibold text-red-400">{P.irreversible}</p>

          <section aria-label={P.list}>
            {listFailed ? (
              <p role="alert" className="text-sm text-red-400">{P.failed}</p>
            ) : !list ? (
              <div className="space-y-1" aria-hidden="true">{[0, 1, 2].map(i => <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'var(--surface-2)' }} />)}</div>
            ) : (
              <ul className="text-sm divide-y" style={{ borderColor: 'var(--border)' }}>
                {list.items.map(it => (
                  <li key={it.ref} className="py-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium break-all">{it.label ?? it.shortcode ?? T.cleanup.history.itemFallback}</span>
                    {it.label && it.shortcode && <span className="text-xs" style={{ color: 'var(--text-3)' }}>{it.shortcode}</span>}
                    {it.collections.length > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                        {fill(P.collection, { name: it.collections.map(c => (c.id_suffix ? `${c.name} ·${c.id_suffix}` : c.name)).join(', ') })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {pages > 1 && (
              <div className="flex items-center gap-2 mt-2 text-xs">
                <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{T.common.prev}</button>
                <span aria-live="polite">{page + 1} / {pages}</span>
                <button type="button" className="btn-ghost" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>{T.common.next}</button>
              </div>
            )}
          </section>

          <div>
            <label htmlFor={inputId} className="text-sm block mb-1">{before}<strong>{bold}</strong>{after}</label>
            <input
              id={inputId} inputMode="numeric" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)}
              className="w-full sm:w-40 rounded-lg px-3 py-2 text-sm"
              onKeyDown={e => { if (e.key === 'Enter' && matches) confirm() }}
            />
          </div>
          {confirmError && <p role="alert" className="text-sm text-red-400">{confirmError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>{P.cancel}</button>
            <button type="button" className="btn-primary" onClick={confirm} disabled={!matches || busy}>{busy ? P.confirming : P.confirm}</button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
