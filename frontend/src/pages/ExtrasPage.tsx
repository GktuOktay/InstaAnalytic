import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cleanupApi, type CleanupSettings } from '../api/cleanup'
import HistoryPanel from '../components/cleanup/HistoryPanel'
import SavedTab, { type SavedTabHandle } from '../components/cleanup/SavedTab'
import ProgressPanel from '../components/cleanup/ProgressPanel'
import { useCleanupStatus } from '../components/cleanup/useCleanupStatus'
import { useLang } from '../contexts/LangContext'
import { useSession } from '../contexts/SessionContext'
import { extensionSupportsCleanup } from '../lib/extension'
import { useExtension } from '../lib/extensionBridge'

/** Eklentinin kendini bildirmesi için tanınan süre; dolunca "eklenti gerekli" gösterilir (yanıp sönme olmasın). */
const EXT_GRACE_MS = 1200

/** Ek İşler (/extras): Faz 1'de tek sekme "Kaydedilenler" (SPEC-001 §4). */
export default function ExtrasPage() {
  const { T } = useLang()
  const C = T.cleanup
  const { active, loading } = useSession()
  const sessionId = active?.id ?? ''
  const ext = useExtension()

  const [settings, setSettings] = useState<CleanupSettings | null>(null)
  const [failed, setFailed] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [graceOver, setGraceOver] = useState(false)

  const loadSettings = useCallback(() => {
    if (!sessionId) return
    setFailed(false)
    cleanupApi.settings(sessionId).then(setSettings).catch(() => setFailed(true))
  }, [sessionId])
  useEffect(() => { setSettings(null); loadSettings() }, [loadSettings])

  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), EXT_GRACE_MS)
    return () => clearTimeout(t)
  }, [])

  const enabled = settings?.saved.enabled === true
  const { status, unreachable, refresh } = useCleanupStatus(sessionId, enabled)

  const tab = useRef<SavedTabHandle>(null)

  // Parti tavanı `{max}` ve tarama sayfa gecikmesi ayar dosyasından gelir; okunamazsa güvenli varsayılan (500 / 6 sn)
  const [caps, setCaps] = useState({ maxItems: 500, pageDelayMax: 6 })
  useEffect(() => {
    cleanupApi.limits().then(l => {
      const eff = l.effective as { batch?: { max_items?: unknown }; scan?: { page_delay_max?: unknown } }
      const mx = eff.batch?.max_items, pd = eff.scan?.page_delay_max
      setCaps({
        maxItems: typeof mx === 'number' && mx >= 1 ? mx : 500,
        pageDelayMax: typeof pd === 'number' && pd >= 1 ? pd : 6,
      })
    }).catch(() => {})
  }, [])

  const extOk = extensionSupportsCleanup(ext.version)
  const viewerUnknown = !!active && !(active.ig_user_id > 0)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{C.title}</h1>
      <div role="tablist" aria-label={C.title} className="flex gap-2 mb-5">
        <button type="button" role="tab" aria-selected="true" className="px-3 py-1.5 rounded-lg text-sm border"
          style={{ background: 'var(--accent-glow)', borderColor: 'var(--accent)' }}>{C.tabSaved}</button>
      </div>

      {(loading && !active) || (active && !settings && !failed) ? (
        <p role="status" className="text-sm" style={{ color: 'var(--text-3)' }}>{T.common.loading}</p>
      ) : !active ? (
        <p className="text-sm">{C.noProfile} <Link to="/settings" className="underline" style={{ color: 'var(--accent)' }}>{C.openSettings}</Link></p>
      ) : failed && !settings ? (
        <div role="alert" className="text-sm text-red-400 flex flex-wrap items-center gap-2">
          <span>{C.settingsFailed}</span>
          <button type="button" className="btn-ghost" onClick={loadSettings}>{C.retry}</button>
        </div>
      ) : !enabled ? (
        <div className="card p-4 text-sm" role="status">
          <p className="mb-2">{C.off}</p>
          <Link to="/settings" className="underline" style={{ color: 'var(--accent)' }}>{C.openSettings}</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {!extOk && (ext.version !== null || graceOver) && (
            <div role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300">
              {C.extRequired} <Link to="/guide" className="underline">{C.openGuide}</Link>
            </div>
          )}
          {viewerUnknown && (
            <p role="status" className="text-sm px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50 text-amber-300">{C.viewerUnknown}</p>
          )}
          {status && (
            <ProgressPanel
              sessionId={sessionId} status={status} unreachable={unreachable} ext={ext} onRefresh={refresh}
              onRescan={() => tab.current?.rescan()} onRepreview={() => tab.current?.repreview()}
              onFinished={() => setHistoryKey(k => k + 1)}
            />
          )}
          {!status && unreachable && <p role="status" className="text-sm text-amber-300">{C.unreachable}</p>}
          {status && (
            <SavedTab
              ref={tab} sessionId={sessionId} username={active.ig_username} status={status} ext={ext} viewerUnknown={viewerUnknown}
              maxItems={caps.maxItems} pageDelayMax={caps.pageDelayMax} onStatusRefresh={refresh}
            />
          )}
          <HistoryPanel sessionId={sessionId} refreshKey={historyKey} />
        </div>
      )}
    </div>
  )
}
