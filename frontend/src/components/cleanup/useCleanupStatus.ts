import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanupApi, type CleanupStatus } from '../../api/cleanup'

/** Durum yoklama aralığı (AC-U8: 5 sn'de bir). */
export const POLL_MS = 5000

/**
 * `GET …/cleanup/status`'ı 5 sn'de bir yoklar. Yoklama başarısız olursa son bilinen durum korunur ve
 * `unreachable=true` olur (AC-U15); ekran boşalmaz.
 */
export function useCleanupStatus(sessionId: string, active: boolean) {
  const [status, setStatus] = useState<CleanupStatus | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    if (!sessionId) return
    try {
      const s = await cleanupApi.status(sessionId)
      if (!alive.current) return
      setStatus(s); setUnreachable(false)
    } catch {
      if (alive.current) setUnreachable(true)
    }
  }, [sessionId])

  useEffect(() => {
    alive.current = true
    setStatus(null); setUnreachable(false)
    if (!sessionId || !active) return () => { alive.current = false }
    refresh()
    const iv = setInterval(refresh, POLL_MS)
    return () => { alive.current = false; clearInterval(iv) }
  }, [sessionId, active, refresh])

  return { status, unreachable, refresh }
}
