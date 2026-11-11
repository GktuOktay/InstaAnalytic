import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Uygulama sayfası ↔ Chrome eklentisi. Eklentinin bu sayfaya koyduğu app-bridge.js ile window.postMessage
 * üzerinden konuşur: eklenti kurulu mu, sürümü ne, iş başlat / durdur, çalışan işin durumu.
 */
export type JobKind = 'posts' | 'likers' | 'comments' | 'actions' | 'saved_scan' | 'saved_unsave'

/** Instagram'a yazan ya da profili tarayan temizleme türleri: asla kendiliğinden (yenilemeyle) yeniden oynatılmaz (AC-C21). */
export const CLEANUP_KINDS: readonly JobKind[] = ['saved_scan', 'saved_unsave']
export const isCleanupKind = (k: unknown): boolean => CLEANUP_KINDS.includes(k as JobKind)

export interface RunOpts {
  shortcodes?: string[]
  count?: number
  scope?: 'missing'
  /** Yalnız temizleme türleri (K-3): profil, parti ve çalıştırma kimliği. */
  session_id?: string
  batch_id?: number
  run_seq?: number
}

export interface ExtensionJob {
  id: string
  kind: JobKind
  state: 'running' | 'done' | 'stopped'
  index: number
  total: number
  message: string
  errors: { shortcode: string | null; error: string }[]
  queue: (string | null)[]
  startedAt: number
  finishedAt?: number
  outcome?: 'ok' | 'partial' | 'failed' | 'stopped'
  results?: { shortcode: string | null; saved: number; seen: number; ok: boolean; note: string | null }[]
}

export interface RunReply { ok: boolean; error?: string; code?: string; total?: number }

interface Msg { __ia?: unknown; type?: unknown; [k: string]: unknown }

const PENDING_KEY = 'ia-pending-run'
const RELOAD_KEY = 'ia-last-reload'
function canReload(): boolean {
  try { return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) > 60_000 } catch { return false }
}

export function useExtension() {
  const [version, setVersion] = useState<string | null>(null)
  const versionRef = useRef<string | null>(null)
  versionRef.current = version
  const [job, setJob] = useState<ExtensionJob | null>(null)
  const pending = useRef(new Map<string, (r: any) => void>())

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d = e.data as Msg
      if (!d || d.__ia !== true || typeof d.type !== 'string') return
      if (d.type === 'ia-ext' && typeof d.version === 'string') setVersion(d.version)
      else if (d.type === 'ia-job-update') setJob((d.job as ExtensionJob) ?? null)
      else if (d.type === 'ia-reply' && typeof d.id === 'string') {
        const done = pending.current.get(d.id)
        pending.current.delete(d.id)
        done?.(d.reply)
      }
    }
    window.addEventListener('message', onMessage)
    window.postMessage({ __ia: true, type: 'ia-ping' }, window.location.origin)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const call = useCallback((type: string, extra: Record<string, unknown> = {}, timeoutMs = 15000) =>
    new Promise<any>(resolve => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const timer = setTimeout(() => { pending.current.delete(id); resolve(null) }, timeoutMs)
      pending.current.set(id, r => { clearTimeout(timer); resolve(r) })
      window.postMessage({ __ia: true, type, id, ...extra }, window.location.origin)
    }), [])

  // Sürüm öğrenilince çalışan bir iş varsa onu da al
  useEffect(() => {
    if (version) call('ia-job').then(j => { if (j && typeof j === 'object' && 'kind' in j) setJob(j as ExtensionJob) })
  }, [version, call])

  // Eklenti yeniden yüklenince bu sayfadaki köprü kopar (yanıt gelmez ya da "Sayfayı yenileyin" gelir). Eklenti daha önce
  // görüldüyse sayfa bir kez kendini yeniler ve komut yeni sayfada otomatik tekrarlanır; sonsuz döngüye girmez.
  const run = useCallback(async (kind: JobKind, opts: RunOpts = {}, timeoutMs?: number): Promise<RunReply> => {
    const reply = await call('ia-run', { cmd: { kind, ...opts } }, timeoutMs)
    const stale = reply == null ? versionRef.current !== null : /Sayfayı yenileyin/.test(String(reply?.error ?? ''))
    if (stale && canReload() && !isCleanupKind(kind)) {     // temizleme komutu yenilemeyle tekrarlanmaz (AC-C21)
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind, opts, at: Date.now() })); sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* özel pencere */ }
      window.location.reload()
      return { ok: false, error: 'reloading' }
    }
    return reply ?? { ok: false, error: 'timeout' }
  }, [call])

  // Yenilenen sayfada bekleyen komutu bir kez çalıştır
  useEffect(() => {
    if (!version) return
    let pending: { kind: JobKind; opts: Record<string, unknown>; at: number } | null = null
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null'); sessionStorage.removeItem(PENDING_KEY) } catch { pending = null }
    if (pending && !isCleanupKind(pending.kind) && Date.now() - pending.at < 30_000) call('ia-run', { cmd: { kind: pending.kind, ...pending.opts } })
  }, [version, call])

  const stop = useCallback(() => call('ia-stop'), [call])
  const diag = useCallback(() => call('ia-diag'), [call])
  /** Eklentinin şu anki işini sorar (Başlat'tan önce boşta mı, AC-U21). Yanıt yoksa null. */
  const currentJob = useCallback(async (): Promise<ExtensionJob | null> => {
    const j = await call('ia-job', {}, 5000)
    return j && typeof j === 'object' && 'kind' in j ? (j as ExtensionJob) : null
  }, [call])

  return { available: version !== null, version, job, run, stop, diag, currentJob }
}
