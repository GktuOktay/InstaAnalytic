import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { notificationsApi, AppNotification } from '../api/notifications'
import { useLang } from '../contexts/LangContext'
import { useOutsideClose } from '../lib/useOutsideClose'

const ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info }
const COLOR = { success: '#4eca8a', warning: '#e09535', error: '#e06060', info: '#60a5fa' }
const POLL_MS = 30_000

function ago(T: ReturnType<typeof useLang>['T'], iso: string | null): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return T.notifications.justNow
  if (s < 3600) return T.notifications.minutesAgo(Math.floor(s / 60))
  if (s < 86400) return T.notifications.hoursAgo(Math.floor(s / 3600))
  return T.notifications.daysAgo(Math.floor(s / 86400))
}

/** Bildirim metni sunucuda değil burada, seçili dilde yazılır (sunucu tür + parametre saklar). */
export function describe(T: ReturnType<typeof useLang>['T'], n: AppNotification): { title: string; body: string } {
  const N = T.notifications
  const k = N.kinds[n.kind]
  if (!k) return { title: N.unknown, body: '' }
  const label = n.kind.startsWith('sync_')
    ? (N.sync[String(n.params.job_type)] ?? String(n.params.job_type ?? ''))
    : (N.jobs[String(n.params.job)] ?? String(n.params.job ?? ''))
  return { title: k.title(label), body: k.body(n.params as Record<string, number>) }
}

export default function NotificationBell() {
  const { T } = useLang()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<AppNotification[]>([])
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutsideClose<HTMLDivElement>(open, close)

  const refreshCount = useCallback(() => { notificationsApi.unread().then(setUnread).catch(() => {}) }, [])
  const refreshList = useCallback(() => {
    notificationsApi.list(20).then(r => { setItems(r.items); setUnread(r.unread) }).catch(() => {})
  }, [])

  useEffect(() => {
    refreshCount()
    const t = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(t)
  }, [refreshCount])
  useEffect(() => { if (open) refreshList() }, [open, refreshList])

  const openItem = async (n: AppNotification) => {
    if (!n.read) { await notificationsApi.read(n.id).catch(() => {}); refreshList() }
    if (n.link) { setOpen(false); navigate(n.link) }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}
        aria-label={unread ? T.notifications.unread(unread) : T.notifications.open} title={T.notifications.title}
        style={iconBtn}>
        <Bell size={15} />
        {unread > 0 && (
          <span aria-hidden style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
            background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" aria-label={T.notifications.title}
          style={{ position: 'absolute', right: 0, top: 40, width: 340, maxHeight: 440, overflowY: 'auto', zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 13 }}>{T.notifications.title}</strong>
            <span style={{ display: 'flex', gap: 10 }}>
              <button onClick={async () => { await notificationsApi.readAll().catch(() => {}); refreshList() }} disabled={!unread}
                style={linkBtn}>{T.notifications.markAll}</button>
              <button onClick={async () => { await notificationsApi.clear().catch(() => {}); refreshList() }} disabled={!items.length}
                style={linkBtn}>{T.notifications.clear}</button>
            </span>
          </div>
          {items.length === 0 ? (
            <p style={{ padding: '22px 16px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{T.notifications.empty}</p>
          ) : items.map(n => {
            const Icon = ICON[n.level] ?? Info
            const d = describe(T, n)
            return (
              <button key={n.id} role="menuitem" onClick={() => openItem(n)}
                style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)', background: n.read ? 'transparent' : 'var(--surface-2)', color: 'var(--text)' }}>
                <Icon size={15} style={{ color: COLOR[n.level], flexShrink: 0, marginTop: 2 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{d.title}</span>
                  {d.body && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{d.body}</span>}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{ago(T, n.created_at)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const iconBtn: React.CSSProperties = {
  position: 'relative', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer',
}
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }
