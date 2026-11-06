import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Plus, Settings as SettingsIcon } from 'lucide-react'
import { useSession } from '../contexts/SessionContext'
import { useLang } from '../contexts/LangContext'
import { useOutsideClose } from '../lib/useOutsideClose'

/** Üst çubuktaki hesap menüsü: etkin profil, profil değiştirme, ayarlar. */
export default function ProfileMenu() {
  const { T } = useLang()
  const { sessions, active, activeId, setActiveId } = useSession()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutsideClose<HTMLDivElement>(open, close)
  const name = active?.ig_username ?? ''

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={T.topbar.menu}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px 0 4px', borderRadius: 16, cursor: 'pointer',
          background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
        <span aria-hidden style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(name[0] ?? '?').toUpperCase()}</span>
        <span style={{ fontSize: 12, fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name ? `@${name}` : T.topbar.noProfile}
        </span>
        <ChevronDown size={13} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 40, minWidth: 230, zIndex: 60, padding: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
          {sessions.length > 0 && (
            <>
              <p style={{ padding: '6px 10px', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{T.topbar.switchProfile}</p>
              {sessions.map(s => (
                <button key={s.id} role="menuitemradio" aria-checked={s.id === activeId} onClick={() => { setActiveId(s.id); setOpen(false) }}
                  style={{ ...row, background: s.id === activeId ? 'var(--surface-2)' : 'transparent' }}>
                  <span style={{ flex: 1, textAlign: 'left' }}>@{s.ig_username}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.source === 'zip' ? T.topbar.zipTag : T.topbar.browserTag}</span>
                  {s.id === activeId && <Check size={13} />}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            </>
          )}
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)} style={{ ...row, textDecoration: 'none' }}>
            <Plus size={13} /> <span style={{ flex: 1 }}>{T.topbar.addProfile}</span>
          </Link>
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)} style={{ ...row, textDecoration: 'none' }}>
            <SettingsIcon size={13} /> <span style={{ flex: 1 }}>{T.topbar.settings}</span>
          </Link>
        </div>
      )}
    </div>
  )
}

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 13, color: 'var(--text)',
}
