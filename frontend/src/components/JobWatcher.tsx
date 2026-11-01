import { useEffect, useRef } from 'react'
import { useExtension } from '../lib/extensionBridge'
import { useToast } from '../contexts/ToastContext'
import { useLang } from '../contexts/LangContext'

const RESULT_TOAST_MS = 20_000

/** Eklentinin işleri başlayınca ve bitince, uygulamanın hangi sayfasında olursan ol bildirim gösterir. */
export default function JobWatcher() {
  const { job } = useExtension()
  const toast = useToast()
  const { T } = useLang()
  const seen = useRef(new Map<string, string>())   // iş kimliği → son gösterilen durum

  useEffect(() => {
    if (!job) return
    const prev = seen.current.get(job.id)
    if (prev === job.state) return
    seen.current.set(job.id, job.state)
    if (job.state === 'running') {
      if (!prev) toast.info(`${T.jobs.started} ${job.message}`)
      return
    }
    // Sayfa açılırken eski bir işin sonucu tekrar gösterilmesin
    const fresh = !!job.finishedAt && Date.now() - job.finishedAt < 30_000
    if (!fresh && !prev) return
    const text = job.message
    if (job.outcome === 'ok') toast.success(text, RESULT_TOAST_MS)
    else if (job.outcome === 'partial' || job.outcome === 'stopped') toast.info(text, RESULT_TOAST_MS)
    else toast.error(text, RESULT_TOAST_MS)
  }, [job, toast, T])

  return null
}
