import { useCallback, useEffect, useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cleanupApi, type CollectionRow, type Collections } from '../../api/cleanup'
import { useLang } from '../../contexts/LangContext'
import { fill } from '../../lib/text'
import Dialog from './Dialog'

interface Props {
  sessionId: string
  /** Yeni tarama bitince liste yeniden okunur (`id:status`). */
  scanKey: string
  /** Etkin parti varken altta R7 L5 notu gösterilir; anahtarlar yine de çalışır. */
  activeBatch: boolean
  /** Koruma değişince envanter (sunucuda hesaplanan koruma) yeniden okunur. */
  onChanged: () => void
}

type Load = { k: 'loading' } | { k: 'error' } | { k: 'ready'; data: Collections }

const label = (c: CollectionRow) => (c.id_suffix ? `${c.name} ·${c.id_suffix}` : c.name)

/** Korunan koleksiyonlar paneli (SPEC-001 §4.6, AC-U27) ve korumayı kaldırma diyaloğu (AC-U28, K-23). */
export default function CollectionsPanel({ sessionId, scanKey, activeBatch, onChanged }: Props) {
  const { T } = useLang()
  const C = T.cleanup.collections
  const [load, setLoad] = useState<Load>({ k: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const [asking, setAsking] = useState<CollectionRow | null>(null)

  useEffect(() => {
    let alive = true
    setLoad({ k: 'loading' })
    cleanupApi.collections(sessionId)
      .then(data => { if (alive) setLoad({ k: 'ready', data }) })
      .catch(() => { if (alive) setLoad({ k: 'error' }) })
    return () => { alive = false }
  }, [sessionId, scanKey, reloadKey])

  const save = useCallback(async (c: CollectionRow, next: boolean) => {
    setFailed(f => ({ ...f, [c.collection_id]: false }))
    setSaving(s => ({ ...s, [c.collection_id]: true }))
    try {
      const r = await cleanupApi.setCollectionProtected(sessionId, c.collection_id, next)
      setLoad(prev => prev.k !== 'ready' ? prev : {
        k: 'ready',
        data: { ...prev.data, items: prev.data.items.map(x => x.collection_id === r.collection_id ? { ...x, protected: r.protected } : x) },
      })
      onChanged()
    } catch {
      setFailed(f => ({ ...f, [c.collection_id]: true }))      // anahtar eski konumunda kalır
    } finally {
      setSaving(s => ({ ...s, [c.collection_id]: false }))
    }
  }, [sessionId, onChanged])

  const data = load.k === 'ready' ? load.data : null
  const fallback = data?.mode === 'all_protected'
  const items = data?.items ?? []
  const keptN = items.filter(c => c.protected).length

  return (
    <section className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
      <details open>
        <summary className="cursor-pointer font-medium text-sm">{C.title}</summary>
        <div className="mt-2 space-y-2">
          {load.k === 'loading' && (
            <div role="status" className="space-y-1.5">
              <span className="sr-only">{C.loading}</span>
              {[0, 1, 2].map(i => <div key={i} aria-hidden="true" className="h-5 rounded animate-pulse" style={{ background: 'var(--surface-2)' }} />)}
            </div>
          )}

          {load.k === 'error' && (
            <div role="alert" className="text-sm text-red-400 flex flex-wrap items-center gap-2">
              <span>{C.loadFailed}</span>
              <button type="button" className="btn-ghost" onClick={() => setReloadKey(k => k + 1)}>{T.cleanup.retry}</button>
            </div>
          )}

          {data && data.mode === null && <p className="text-sm">{C.neverScanned}</p>}

          {data && data.mode !== null && (
            <>
              {fallback && (
                <p role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300">{C.fallback}</p>
              )}
              {items.length === 0 ? (
                !fallback && <p className="text-sm">{C.empty}</p>
              ) : (
                <>
                  <div className="text-xs space-y-0.5" style={{ color: 'var(--text-2)' }}>
                    <p>{fill(C.summary, { n: items.length, k: keptN })}</p>
                    <p>{C.persistNote}</p>
                  </div>
                  <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {items.map(c => (
                      <Row
                        key={c.collection_id} c={c} disabled={fallback || saving[c.collection_id] === true}
                        saving={saving[c.collection_id] === true} failed={failed[c.collection_id] === true}
                        onToggle={() => { if (c.protected) setAsking(c); else void save(c, true) }}
                      />
                    ))}
                  </ul>
                </>
              )}
              {activeBatch && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{C.activeBatch}</p>}
            </>
          )}
        </div>
      </details>

      {asking && (
        <UnprotectDialog
          name={label(asking)} onCancel={() => setAsking(null)}
          onConfirm={() => { const c = asking; setAsking(null); void save(c, false) }}
        />
      )}
    </section>
  )
}

function Row({ c, disabled, saving, failed, onToggle }: {
  c: CollectionRow; disabled: boolean; saving: boolean; failed: boolean; onToggle: () => void
}) {
  const { T } = useLang()
  const C = T.cleanup.collections
  return (
    <li className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button" role="switch" aria-checked={c.protected} aria-label={fill(C.switchLabel, { name: label(c) })}
        disabled={disabled} onClick={onToggle}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border disabled:opacity-50"
        style={{ background: c.protected ? 'var(--accent, #6366f1)' : 'var(--surface-2)', borderColor: 'var(--border-2)' }}
      >
        <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform" style={{ transform: c.protected ? 'translateX(18px)' : 'translateX(2px)' }} />
      </button>
      <span className="text-sm font-medium break-all">{label(c)}</span>
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{fill(C.posts, { n: c.post_count })}</span>
      <span className="text-xs font-semibold">{c.protected ? C.on : C.off}</span>
      {c.is_new && <span className="tag" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)' }}>{C.isNew}</span>}
      {!c.in_last_scan && <span className="text-xs" style={{ color: 'var(--text-3)' }}>{C.notSeen}</span>}
      {saving && <span role="status" aria-label={C.saving}><Loader2 size={14} className="animate-spin" aria-hidden="true" /></span>}
      {failed && <span role="alert" className="text-xs text-red-400">{C.saveFailed}</span>}
    </li>
  )
}

function UnprotectDialog({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  const { T } = useLang()
  const C = T.cleanup.collections
  const [ack, setAck] = useState(false)
  const id = useId()
  return (
    <Dialog title={C.dlgTitle(name)} onClose={onCancel}>
      <div className="space-y-3 text-sm">
        <p>{C.dlgBody}</p>
        <p>{C.dlgShared}</p>
        <p>{C.dlgPersist}</p>
        <label htmlFor={id} className="flex items-start gap-2">
          <input id={id} type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5" />
          <span>{C.dlgAck}</span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>{C.dlgCancel}</button>
          <button type="button" className="btn-primary" disabled={!ack} onClick={onConfirm}>{C.dlgConfirm}</button>
        </div>
      </div>
    </Dialog>
  )
}
