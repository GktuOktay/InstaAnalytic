import { useEffect, useRef, useState } from 'react'
import { analysisApi, TaskStatus } from '../api/analysis'

export function useTaskPoller(taskId: string | null, onComplete?: () => void) {
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Stale closure önlemi — her render'da güncel callback'i tut
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (!taskId) {
      setStatus(null)
      return
    }

    const poll = async () => {
      try {
        const s = await analysisApi.taskStatus(taskId)
        setStatus(s)
        if (s.status === 'SUCCESS' || s.status === 'FAILURE') {
          clearInterval(intervalRef.current!)
          onCompleteRef.current?.()
        }
      } catch {
        // Geçici ağ hatası — sonraki poll'da tekrar dene
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 2000)
    return () => clearInterval(intervalRef.current!)
  }, [taskId])

  return status
}
