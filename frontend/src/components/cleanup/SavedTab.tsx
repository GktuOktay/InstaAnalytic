import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import {
  cleanupApi, type CleanupStatus, type Inventory, type InventoryItem, type InventoryFilter, type PreviewSelection,
} from '../../api/cleanup'
import { useLang } from '../../contexts/LangContext'
import { extensionSupportsCleanup } from '../../lib/extension'
import type { useExtension } from '../../lib/extensionBridge'
import { fill } from '../../lib/text'
import { proxyImg } from '../../utils/imgProxy'
import ConfirmDialog from './ConfirmDialog'
import SelectionBar from './SelectionBar'
import { reasonText } from './format'

type Ext = ReturnType<typeof useExtension>

export interface SavedTabHandle { rescan: () => void; repreview: () => void }

interface Props {
  sessionId: string
  username: string
  status: CleanupStatus
  ext: Ext
  viewerUnknown: boolean
  maxItems: number
  pageDelayMax: number
  onStatusRefresh: () => void
}

const PAGE = 50
const MAX_EXCLUDE = 5000
const Q_RE = /^[a-z0-9._]{1,30}$/
const TYPES = ['image', 'video', 'carousel', 'ad'] as const

interface Sel { mode: 'refs' | 'filter'; refs: Set<string>; excluded: Set<string>; filter: InventoryFilter }
const emptySel = (): Sel => ({ mode: 'refs', refs: new Set(), excluded: new Set(), filter: {} })
const selCount = (s: Sel) => s.refs.size + s.excluded.size

const normQ = (raw: string) => raw.trim().replace(/^@/, '').toLowerCase()

/** Kaydedilenler sekmesi: tarama, envanter, iki seçim modu, önizleme (§4.1-4.4). */
const SavedTab = forwardRef<SavedTabHandle, Props>(function SavedTab(
  { sessionId, username, status, ext, viewerUnknown, maxItems, pageDelayMax, onStatusRefresh }, handle,
) {
  const { T, lang } = useLang()
  const S = T.cleanup.saved
  const lastScan = status.last_scan
  const activeBatch = status.active_batch !== null
  const extOk = extensionSupportsCleanup(ext.version)

  /* ── tarama ─────────────────────────────────────────────────────────── */
  const [starting, setStarting] = useState(false)
  const [startMsg, setStartMsg] = useState<string | null>(null)
  const scanJob = ext.job?.state === 'running' && ext.job.kind === 'saved_scan' ? ext.job : null
  const scanning = lastScan?.status === 'running' || scanJob !== null || starting
  const otherBusy = ext.job?.state === 'running' && ext.job.kind !== 'saved_scan'
  const scanDisabled = !extOk || viewerUnknown || otherBusy || starting

  const lastProgress = useRef<number>(0)
  const [now, setNow] = useState(() => Date.now())
  const items = lastScan?.items
  useEffect(() => { lastProgress.current = Date.now() }, [items, scanJob?.index, scanJob?.id, scanning])
  useEffect(() => {
    if (!scanning) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [scanning])
  const unresponsive = scanning && lastScan?.status === 'running' && now - lastProgress.current > (pageDelayMax + 60) * 1000

  const startScan = useCallback(async () => {
    setStartMsg(null); setStarting(true)
    try {
      const r = await ext.run('saved_scan', { session_id: sessionId }, 10_000)
      if (!r.ok) {
        const known = r.code && Object.prototype.hasOwnProperty.call(T.cleanup.reason, r.code)
        setStartMsg(known ? reasonText(T, r.code) : S.scanStartFailed)
      }
    } finally {
      setStarting(false)
      onStatusRefresh()
    }
  }, [ext, sessionId, T, S.scanStartFailed, onStatusRefresh])

  const scanError = useMemo(() => {
    if (!lastScan || scanning) return null
    if (lastScan.status !== 'failed' && lastScan.status !== 'blocked') return null
    const note = lastScan.status === 'blocked' ? 'blocked' : lastScan.note_code ?? ''
    if (note === 'account_mismatch') return S.scanMismatchUser(username)
    return Object.prototype.hasOwnProperty.call(T.cleanup.reason, note) ? reasonText(T, note) : S.scanFailed
  }, [lastScan, scanning, S, T, username])

  /* ── filtre ve envanter ────────────────────────────────────────────── */
  const [qRaw, setQRaw] = useState('')
  const [qApplied, setQApplied] = useState('')
  const [mediaType, setMediaType] = useState('')
  const [offset, setOffset] = useState(0)
  const [inv, setInv] = useState<Inventory | null>(null)
  const [invLoading, setInvLoading] = useState(true)
  const [invFailed, setInvFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [sel, setSel] = useState<Sel>(emptySel)
  const selRef = useRef(sel)
  selRef.current = sel
  const [notice, setNotice] = useState<string | null>(null)
  const prevScanId = useRef<number | null>(null)

  const nq = normQ(qRaw)
  const qValid = nq === '' || Q_RE.test(nq)

  const filterChanged = useCallback(() => {
    setOffset(0)
    if (selRef.current.mode === 'filter') { setSel(emptySel()); setNotice(S.noticeFilter) }   // §4.4: filtre değişince seçim temizlenir
  }, [S.noticeFilter])

  // Geçerli q değeri 300 ms bekleyip uygulanır
  useEffect(() => {
    if (!qValid || nq === qApplied) return
    const t = setTimeout(() => { setQApplied(nq); filterChanged() }, 300)
    return () => clearTimeout(t)
  }, [nq, qValid, qApplied, filterChanged])

  const scanKey = lastScan ? `${lastScan.id}:${lastScan.status}` : 'none'
  useEffect(() => {
    let alive = true
    setInvLoading(true); setInvFailed(false)
    cleanupApi.inventory(sessionId, {
      ...(qApplied ? { q: qApplied } : {}), ...(mediaType ? { media_type: mediaType } : {}), limit: PAGE, offset,
    }).then(r => {
      if (!alive) return
      setInv(r)
      const id = r.scan?.id ?? null
      if (prevScanId.current !== null && id !== null && id !== prevScanId.current && selCount(selRef.current) > 0) {
        setSel(emptySel()); setNotice(S.noticeRescan)                  // yeni tarama: seçim temizlenir (R4 M-3)
      } else if (prevScanId.current !== null && id !== null && id !== prevScanId.current) {
        setSel(emptySel())
      }
      if (id !== null) prevScanId.current = id
    }).catch(() => { if (alive) setInvFailed(true) })
      .finally(() => { if (alive) setInvLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- S yalnız metin
  }, [sessionId, qApplied, mediaType, offset, reloadKey, scanKey])

  /* ── seçim ───────────────────────────────────────────────────────── */
  const rows = inv?.items ?? []
  const selectable = rows.filter(r => r.state === 'available')
  const matches = inv ? Math.max(0, inv.total - inv.protected_total) : 0
  const selected = sel.mode === 'refs' ? sel.refs.size : Math.max(0, matches - sel.excluded.size)
  const isChecked = (r: InventoryItem) =>
    r.state === 'available' && (sel.mode === 'refs' ? sel.refs.has(r.ref) : !sel.excluded.has(r.ref))
  const atCap = sel.mode === 'refs' && sel.refs.size >= maxItems
  const exclAtCap = sel.mode === 'filter' && sel.excluded.size >= MAX_EXCLUDE

  const toggle = (r: InventoryItem) => {
    setNotice(null)
    setSel(prev => {
      const next: Sel = { ...prev, refs: new Set(prev.refs), excluded: new Set(prev.excluded) }
      if (prev.mode === 'refs') {
        if (next.refs.has(r.ref)) next.refs.delete(r.ref)
        else if (next.refs.size < maxItems) next.refs.add(r.ref)
      } else if (next.excluded.has(r.ref)) next.excluded.delete(r.ref)
      else if (next.excluded.size < MAX_EXCLUDE) next.excluded.add(r.ref)
      return next
    })
  }
  const selectPage = () => {
    setNotice(null)
    setSel(prev => {
      const next: Sel = { ...prev, refs: new Set(prev.refs), excluded: new Set(prev.excluded) }
      for (const r of selectable) {
        if (prev.mode === 'refs') { if (next.refs.size < maxItems) next.refs.add(r.ref) } else next.excluded.delete(r.ref)
      }
      return next
    })
  }
  const allOnPage = selectable.length > 0 && selectable.every(isChecked)
  const toggleHeader = () => {
    if (!allOnPage) return selectPage()
    setNotice(null)
    setSel(prev => {
      const next: Sel = { ...prev, refs: new Set(prev.refs), excluded: new Set(prev.excluded) }
      for (const r of selectable) {
        if (prev.mode === 'refs') next.refs.delete(r.ref)
        else if (next.excluded.size < MAX_EXCLUDE) next.excluded.add(r.ref)
      }
      return next
    })
  }
  const selectAllMatching = () => {
    const hadRefs = sel.refs.size > 0
    setSel({ mode: 'filter', refs: new Set(), excluded: new Set(), filter: { ...(qApplied ? { q: qApplied } : {}), ...(mediaType ? { media_type: mediaType as InventoryFilter['media_type'] } : {}) } })
    setNotice(hadRefs ? S.noticeReplaced : null)
  }
  const clearSel = () => { setSel(emptySel()); setNotice(null) }

  /* ── önizleme ─────────────────────────────────────────────────────── */
  const [previewBody, setPreviewBody] = useState<PreviewSelection | null>(null)
  const openPreview = useCallback(() => {
    const s = selRef.current
    const scanId = inv?.scan?.id
    if (scanId == null || selCount(s) === 0 && s.mode === 'refs') return
    setPreviewBody(s.mode === 'refs'
      ? { scan_id: scanId, select: 'refs', refs: Array.from(s.refs) }
      : { scan_id: scanId, select: 'filter', filter: s.filter, exclude_refs: Array.from(s.excluded) })
  }, [inv])

  useImperativeHandle(handle, () => ({ rescan: () => { if (!scanDisabled) startScan() }, repreview: openPreview }), [scanDisabled, startScan, openPreview])

  /* ── görünüm ────────────────────────────────────────────────────── */
  const filtersApplied = qApplied !== '' || mediaType !== ''
  const emptyInventory = !!inv?.scan && inv.total === 0 && !filtersApplied
  const neverScanned = !invLoading && !invFailed && (!inv || !inv.scan) && !scanning
  const showList = !!inv?.scan && !emptyInventory
  const protectedNames = useMemo(() => {
    const byName = new Map<string, Set<string>>()
    for (const r of rows) for (const c of r.collections) if (c.name) {
      const set = byName.get(c.name) ?? new Set<string>(); set.add(c.collection_id); byName.set(c.name, set)
    }
    return (name: string, id: string) => ((byName.get(name)?.size ?? 0) > 1 ? `${name} ·${id.slice(-4)}` : name)
  }, [rows])

  const blockedReason = activeBatch ? reasonText(T, 'batch_active') : null
  const pages = inv ? Math.max(1, Math.ceil(inv.total / PAGE)) : 1
  const F = inv?.scan?.collections_mode === 'all_protected'

  const protectedBadge = (r: InventoryItem): string => {
    if (F) return S.protectedF
    if (r.collections.length === 0) return S.protectedUnreadable
    const prot = r.collections.filter(c => c.protected)
    const first = prot[0]
    if (!first || !first.name) return S.protectedUnknown
    return fill(S.protectedIn, { name: `${protectedNames(first.name, first.collection_id)}${prot.length > 1 ? ` +${prot.length - 1}` : ''}` })
  }

  return (
    <section aria-label={S.invTitle} className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{S.invTitle}</h2>
        {!scanning && (
          <button type="button" className="btn-primary" disabled={scanDisabled} onClick={startScan}>{S.scan}</button>
        )}
      </div>

      {startMsg && <p role="alert" className="text-sm text-red-400">{startMsg}</p>}

      {scanning && (
        <div className="space-y-2">
          <div aria-live="polite" className="text-sm">
            {scanJob && scanJob.index > 0 ? fill(S.scanning, { page: scanJob.index, n: lastScan?.items ?? 0 }) : fill(S.scanningNoPage, { n: lastScan?.items ?? 0 })}
          </div>
          {unresponsive && <p role="status" className="text-sm text-amber-400">{S.unresponsive}</p>}
          <button type="button" className="btn-ghost" onClick={() => { void ext.stop() }}>{T.cleanup.stop}</button>
        </div>
      )}

      {scanError && (
        <div role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300 flex flex-wrap items-center gap-2">
          <span>{scanError}</span>
          <button type="button" className="btn-ghost" disabled={scanDisabled} onClick={startScan}>{T.cleanup.retry}</button>
        </div>
      )}

      {inv?.scan?.partial && (
        <p role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300">{fill(S.partial, { n: inv.scan.items })}</p>
      )}
      {inv?.scan?.stale && (
        <p role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300">{S.staleScan}</p>
      )}

      {invFailed && (
        <div role="alert" className="text-sm text-red-400 flex flex-wrap items-center gap-2">
          <span>{S.invFailed}</span>
          <button type="button" className="btn-ghost" onClick={() => setReloadKey(k => k + 1)}>{T.cleanup.retry}</button>
        </div>
      )}
      {invLoading && !inv && !invFailed && <p role="status" className="text-sm" style={{ color: 'var(--text-3)' }}>{T.common.loading}</p>}

      {neverScanned && !scanError && <p className="text-sm">{S.neverScanned}</p>}
      {emptyInventory && <p className="text-sm">{S.emptyInv}</p>}

      {showList && inv && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs flex flex-col gap-1">
              <span>{S.searchLabel}</span>
              <input
                type="search" value={qRaw} onChange={e => setQRaw(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="rounded-lg px-3 py-1.5 text-sm w-full sm:w-56"
              />
            </label>
            <label className="text-xs flex flex-col gap-1">
              <span>{S.typeLabel}</span>
              <select value={mediaType} onChange={e => { setMediaType(e.target.value); filterChanged() }} className="rounded-lg px-3 py-1.5 text-sm">
                <option value="">{S.types.all}</option>
                {TYPES.map(t => <option key={t} value={t}>{S.types[t]}</option>)}
              </select>
            </label>
          </div>
          {!qValid && <p role="status" className="text-xs text-amber-400">{S.badQ}</p>}

          <div className="text-xs space-y-0.5" style={{ color: 'var(--text-2)' }}>
            {inv.protected_total > 0 && <p>{fill(S.protectedCount, { k: inv.protected_total })}</p>}
            {F && <p>{S.fNote}</p>}
          </div>

          <SelectionBar
            mode={sel.mode} selected={selected} inView={rows.filter(isChecked).length} matches={matches} excluded={sel.excluded.size}
            max={maxItems} atCap={atCap} exclAtCap={exclAtCap} blockedReason={blockedReason} staleScan={inv.scan?.stale ?? false}
            notice={notice} onPage={selectPage} onAll={selectAllMatching} onClear={clearSel} onPreview={openPreview}
          />

          {rows.length === 0 ? (
            <p className="text-sm">{S.noMatch}</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" aria-label={S.headerCheck} checked={allOnPage} disabled={activeBatch || selectable.length === 0} onChange={toggleHeader} />
              </label>
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {rows.map(r => (
                  <Row
                    key={r.ref} r={r} checked={isChecked(r)} blocked={activeBatch}
                    capped={(sel.mode === 'refs' && atCap && !sel.refs.has(r.ref)) || (sel.mode === 'filter' && exclAtCap && !sel.excluded.has(r.ref))}
                    protectedBadge={protectedBadge(r)} nameOf={protectedNames} onToggle={() => toggle(r)}
                  />
                ))}
              </ul>
            </>
          )}

          {inv.total > PAGE && (
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="btn-ghost" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - PAGE))}>{T.common.prev}</button>
              <span aria-live="polite">{offset / PAGE + 1} / {pages}</span>
              <button type="button" className="btn-ghost" disabled={offset + PAGE >= inv.total} onClick={() => setOffset(o => o + PAGE)}>{T.common.next}</button>
            </div>
          )}
        </>
      )}

      {previewBody && (
        <ConfirmDialog
          sessionId={sessionId} selection={previewBody} maxItems={maxItems}
          onClose={() => setPreviewBody(null)}
          onConfirmed={() => { setPreviewBody(null); clearSel(); setReloadKey(k => k + 1); onStatusRefresh() }}
          onStale={() => { setPreviewBody(null); setSel(emptySel()); setNotice(S.noticeRescan); setReloadKey(k => k + 1) }}
        />
      )}
    </section>
  )
})

export default SavedTab

function Row({ r, checked, blocked, capped, protectedBadge, nameOf, onToggle }: {
  r: InventoryItem; checked: boolean; blocked: boolean; capped: boolean; protectedBadge: string
  nameOf: (name: string, id: string) => string; onToggle: () => void
}) {
  const { T } = useLang()
  const S = T.cleanup.saved
  const [imgFailed, setImgFailed] = useState(false)
  const src = proxyImg(r.thumbnail_url)
  const label = r.owner_username ? fill(S.selectRow, { owner: r.owner_username, code: r.shortcode }) : fill(S.selectRowNoOwner, { code: r.shortcode })
  const isProtected = r.state === 'protected'
  const free = r.collections.filter(c => !c.protected && c.name)
  const typeLabel = r.media_type ? (S.types[r.media_type] ?? S.typeUnknown) : S.typeUnknown
  return (
    <li className="py-2 flex items-center gap-3">
      <div className="w-5 shrink-0">
        {r.state === 'available' && (
          <input type="checkbox" aria-label={label} checked={checked} disabled={blocked || (capped && !checked)} onChange={onToggle} />
        )}
      </div>
      {src && !imgFailed ? (
        <img src={src} alt="" loading="lazy" width={44} height={44} className="w-11 h-11 rounded object-cover shrink-0" onError={() => setImgFailed(true)} />
      ) : (
        <div data-testid={`thumb-placeholder-${r.ref}`} className="w-11 h-11 rounded shrink-0 flex items-center justify-center text-[10px] overflow-hidden"
          style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>{r.shortcode}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium break-all">{r.owner_username ? `@${r.owner_username}` : r.shortcode}</span>
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>{typeLabel}</span>
          {r.is_ad && <span className="tag" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)' }}>{S.sponsored}</span>}
          {!isProtected && r.state !== 'available' && <span className="tag" style={{ background: 'var(--surface-2)' }}>{S.states[r.state] ?? r.state}</span>}
        </div>
        {isProtected && (
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-2)' }}><Lock size={12} aria-hidden="true" /> <span>{protectedBadge}</span></p>
        )}
        {!isProtected && free.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--text-2)' }}>{fill(S.inCollection, { name: free.map(c => nameOf(c.name as string, c.collection_id)).join(', ') })}</p>
        )}
      </div>
    </li>
  )
}
