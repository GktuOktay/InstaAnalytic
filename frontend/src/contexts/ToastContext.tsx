import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

type Kind = 'error' | 'success' | 'info'
interface Toast { id: number; kind: Kind; text: string }

interface ToastApi {
  error: (text: string) => void
  success: (text: string) => void
  info: (text: string) => void
}

const noop = () => {}
const ToastContext = createContext<ToastApi>({ error: noop, success: noop, info: noop })

const LIFETIME_MS: Record<Kind, number> = { error: 8000, success: 4000, info: 5000 }
const MAX_VISIBLE = 4
const BAR: Record<Kind, string> = { error: '#E05B6A', success: '#3FAE7A', info: 'var(--accent)' }

export function ToastProvider({ children, dismissLabel = 'Kapat' }: { children: React.ReactNode; dismissLabel?: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), [])

  const show = useCallback((kind: Kind, text: string) => {
    if (!text) return
    const id = ++seq.current
    setToasts(t => {
      if (t.some(x => x.kind === kind && x.text === text)) return t        // aynı mesaj üst üste yığılmasın
      return [...t, { id, kind, text }].slice(-MAX_VISIBLE)
    })
    window.setTimeout(() => dismiss(id), LIFETIME_MS[kind])
  }, [dismiss])

  const api = useMemo<ToastApi>(() => ({
    error: t => show('error', t), success: t => show('success', t), info: t => show('info', t),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="toast" style={{ borderLeftColor: BAR[t.kind] }}>
            <p>{t.text}</p>
            <button type="button" aria-label={dismissLabel} onClick={() => dismiss(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
