import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'
import { useSession } from '../contexts/SessionContext'

/** Kenar çubuğunda hesabın o an ne kadar "dokunulur" olduğunu gösterir. */
export default function SafetyBadge() {
  const { lang } = useLang()
  const { sessions } = useSession()
  const en = lang === 'en'
  const active = sessions.filter(s => s.allow_actions)
  const paused = sessions.some(s => s.paused_until && new Date(s.paused_until) > new Date())
  const safe = active.length === 0
  const label = paused ? (en ? 'Actions paused' : 'İşlemler durduruldu')
    : safe ? (en ? 'Safe mode: read-only' : 'Güvenli mod: salt okunur')
    : (en ? `Actions ON (${active.length})` : `İşlemler AÇIK (${active.length})`)
  const Icon = safe && !paused ? ShieldCheck : ShieldAlert
  return (
    <Link to="/session" title={label} aria-label={label}
      style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 10px 10px', padding: '7px 10px', borderRadius: 10,
        fontSize: 11, border: `1px solid ${safe && !paused ? 'rgba(34,197,94,.35)' : 'rgba(245,158,11,.45)'}`,
        color: safe && !paused ? '#86EFAC' : '#FCD34D', textDecoration: 'none' }}>
      <Icon size={13} /> {label}
    </Link>
  )
}
