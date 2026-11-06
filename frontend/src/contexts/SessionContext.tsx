import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { sessionsApi, Session } from '../api/sessions'

interface SessionContextValue {
  sessions: Session[]
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
  setSessionsDirectly: (s: Session[]) => void
  /** Üst çubukta seçilen profil: tüm sayfalar bunu kullanır. */
  activeId: string
  active: Session | null
  setActiveId: (id: string) => void
}

const SessionContext = createContext<SessionContextValue>({
  sessions: [],
  loading: true,
  error: false,
  refresh: async () => {},
  setSessionsDirectly: () => {},
  activeId: '',
  active: null,
  setActiveId: () => {},
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [stored, setStored] = useState<string>(() => { try { return localStorage.getItem('activeSession') ?? '' } catch { return '' } })
  const list = Array.isArray(sessions) ? sessions : []        // API yanıtı bozuksa boş say
  const activeId = list.some(s => s.id === stored) ? stored : (list[0]?.id ?? '')
  const active = list.find(s => s.id === activeId) ?? null
  const setActiveId = useCallback((id: string) => {
    setStored(id)
    try { localStorage.setItem('activeSession', id) } catch { /* özel pencere */ }
  }, [])
  const fetchedOnce = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const list = await sessionsApi.list()
      setSessions(list)
    } catch {
      // keep stale data on failure
      setError(true)
      // auto-retry once after 3 seconds if we have no data yet
      retryTimer.current = setTimeout(async () => {
        try {
          const list = await sessionsApi.list()
          setSessions(list)
          setError(false)
        } catch {}
      }, 3000)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (fetchedOnce.current) return
    fetchedOnce.current = true
    refresh()
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current) }
  }, [refresh])

  return (
    <SessionContext.Provider value={{ sessions, loading, error, refresh, setSessionsDirectly: setSessions, activeId, active, setActiveId }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
