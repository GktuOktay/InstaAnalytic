import { ReactNode, useEffect, useId, useRef } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  busy?: boolean
  wide?: boolean
}

/** Erişilebilir modal: role=dialog, aria-modal, Escape ile kapanır, odak içeride kalır, kapanınca eski öğeye döner. */
export default function Dialog({ title, onClose, children, busy, wide }: Props) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'))
          .filter(x => !x.hasAttribute('disabled'))
        if (f.length === 0) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} aria-busy={busy || undefined} tabIndex={-1}
        className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto p-4 sm:p-5`}
        style={{ background: 'var(--surface)', color: 'var(--text)' }}
      >
        <h2 id={id} className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  )
}
