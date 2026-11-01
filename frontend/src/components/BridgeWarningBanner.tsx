import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon } from 'lucide-react'
import { bridgeApi } from '../api/bridge'
import { useSession } from '../contexts/SessionContext'
import { useLang } from '../contexts/LangContext'
import { fill } from '../lib/text'
import { explainProblem } from '../lib/problems'

const POLL_MS = 60_000

interface Pause { username: string; until: string; reason: string | null }

/** Instagram uyarı verdiyse her sayfanın üstünde kırmızı bant. Kritik: gözden kaçmamalı. */
export default function BridgeWarningBanner() {
  const { T, lang } = useLang()
  const L = T.bridge
  const { sessions } = useSession()
  const [pauses, setPauses] = useState<Pause[]>([])

  useEffect(() => {
    if (!sessions.length) { setPauses([]); return }
    let live = true
    const load = () => Promise.all(sessions.map(s =>
      bridgeApi.status(s.id)
        .then(st => (st.paused_until ? { username: s.ig_username, until: st.paused_until, reason: st.paused_reason } : null))
        .catch(() => null),
    )).then(list => { if (live) setPauses(list.filter((p): p is Pause => p !== null)) })
    load()
    const t = setInterval(load, POLL_MS)
    return () => { live = false; clearInterval(t) }
  }, [sessions])

  if (!pauses.length) return null
  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div role="alert" className="mb-5 rounded-xl border border-red-700 bg-red-950/60 px-4 py-3 text-sm text-red-100">
      {pauses.map(p => (
        <div key={p.username} className="flex items-start gap-3">
          <AlertOctagon size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{fill(L.bannerTitle, { name: p.username, at: when(p.until) })}</p>
            {p.reason ? <Explained raw={p.reason} /> : <p className="text-xs mt-1">{L.bannerTodo}</p>}
            <p className="text-xs mt-1">
              <Link to="/guide#uyari" className="underline font-medium">{L.bannerMore}</Link>
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Explained({ raw }: { raw: string }) {
  const { T } = useLang()
  const p = explainProblem(raw, T)
  return (
    <div className="text-xs mt-1">
      <p className="font-medium">{p.title}</p>
      <p className="text-red-200/90">{p.body} {p.todo.join(' ')}</p>
      <details className="mt-1 text-red-200/70">
        <summary className="cursor-pointer select-none">{T.problems.detail}</summary>
        <code className="block mt-1 break-all">{p.detail}</code>
      </details>
    </div>
  )
}
