import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Uygulama sayfası ↔ Chrome eklentisi. Eklentinin bu sayfaya koyduğu app-bridge.js ile window.postMessage
 * üzerinden konuşur: eklenti kurulu mu, sürümü ne, iş başlat / durdur, çalışan işin durumu.
 */
export type JobKind = 'posts' | 'likers' | 'comments'

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
}

export interface RunReply { ok: boolean; error?: string; total?: number }

interface Msg { __ia?: unknown; type?: unknown; [k: string]: unknown }

export function useExtension() {
  const [version, setVersion] = useState<string | null>(null)
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

  const run = useCallback(async (kind: JobKind, opts: { shortcodes?: string[]; count?: number } = {}): Promise<RunReply> =>
    (await call('ia-run', { cmd: { kind, ...opts } })) ?? { ok: false, error: 'timeout' }, [call])

  const stop = useCallback(() => call('ia-stop'), [call])

  return { available: version !== null, version, job, run, stop }
}
