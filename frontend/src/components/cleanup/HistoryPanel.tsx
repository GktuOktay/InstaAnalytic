import { useCallback, useEffect, useState } from 'react'
import { cleanupApi, type History } from '../../api/cleanup'
import { useLang } from '../../contexts/LangContext'

const PAGE = 50

/** Geçmiş: durum filtresiyle sayfalı liste; boş ve hata durumları (AC-U16). */
export default function HistoryPanel({ sessionId, refreshKey }: { sessionId: string; refreshKey?: unknown }) {
  const { T, lang } = useLang()
  const H = T.cleanup.history
  const [state, setState] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<History | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true); setFailed(false)
    cleanupApi.history(sessionId, { ...(state ? { state } : {}), limit: PAGE, offset })
      .then(setData).catch(() => setFailed(true)).finally(() => setLoading(false))
  }, [sessionId, state, offset])
  useEffect(load, [load, refreshKey])

  const total = state ? (data?.counts[state] ?? 0) : Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0)
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR'

  return (
    <section id="cleanup-history" aria-label={H.title} className="card p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-sm">{H.title}</h3>
        <label className="text-xs flex items-center gap-2">
          <span>{H.state}</span>
          <select value={state} onChange={e => { setState(e.target.value); setOffset(0) }} className="rounded-lg px-2 py-1 text-xs">
            <option value="">{T.common.all}</option>
            {Object.entries(H.states).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {failed ? (
        <div role="alert" className="text-sm text-red-400 flex flex-wrap items-center gap-2">
          <span>{H.failed}</span>
          <button type="button" className="btn-ghost" onClick={load}>{T.cleanup.retry}</button>
        </div>
      ) : loading && !data ? (
        <p role="status" className="text-sm" style={{ color: 'var(--text-3)' }}>{T.common.loading}</p>
      ) : data && data.items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{H.empty}</p>
      ) : (
        <>
          <ul className="text-sm divide-y" style={{ borderColor: 'var(--border)' }}>
            {data?.items.map(it => (
              <li key={it.id} className="py-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="break-all">{it.label ?? H.itemFallback}</span>
                <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                  {H.states[it.status] ?? it.status} · {new Date(it.created_at).toLocaleString(locale)}
                </span>
              </li>
            ))}
          </ul>
          {total > PAGE && (
            <div className="flex items-center gap-2 mt-2 text-xs">
              <button type="button" className="btn-ghost" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - PAGE))}>{T.common.prev}</button>
              <span aria-live="polite">{offset / PAGE + 1} / {Math.max(1, Math.ceil(total / PAGE))}</span>
              <button type="button" className="btn-ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(o => o + PAGE)}>{T.common.next}</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
