import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useLang } from '../contexts/LangContext'
import { useSession } from '../contexts/SessionContext'

/** İlk kullanım rehberi: ne yapacağını 3 adımda söyler. Tüm adımlar bitince kendini gizler. */
export default function SetupGuide({ hasData }: { hasData: boolean }) {
  const { lang } = useLang()
  const { sessions } = useSession()
  const en = lang === 'en'
  const connected = sessions.length > 0
  if (connected && hasData) return null

  const steps = [
    { done: connected, to: '/session',
      title: en ? '1. Connect your profile' : '1. Profilini bağla',
      text: en ? 'Just your username. Nothing is sent to Instagram.' : 'Yalnızca kullanıcı adın yeter. Instagram\'a hiçbir şey gitmez.' },
    { done: hasData, to: '/followers',
      title: en ? '2. Upload your Instagram ZIP' : '2. Instagram ZIP\'ini yükle',
      text: en ? 'Followers and following, straight from Instagram\'s own download.' : 'Takipçi ve takip listen, Instagram\'ın kendi indirmesinden.' },
    { done: false, to: '/fans',
      title: en ? '3. See who engages' : '3. Kimin ilgili olduğunu gör',
      text: en ? 'Follower scores, best posting hours, who does not follow back.' : 'Takipçi skorları, en iyi saatler, seni takip etmeyenler.' },
  ]
  const current = steps.findIndex(s => !s.done)

  return (
    <section aria-label={en ? 'Getting started' : 'Başlangıç'} className="mb-6 rounded-2xl border border-purple-800/50 bg-purple-950/20 p-5">
      <h2 className="font-semibold mb-3">{en ? 'Get started in 3 steps' : '3 adımda başla'}</h2>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.to}>
            <Link to={s.to}
              className={`block h-full rounded-xl border p-3 text-sm ${
                s.done ? 'border-green-800/60 bg-green-950/20'
                : i === current ? 'border-purple-500 bg-gray-900 ring-1 ring-purple-500/40' : 'border-gray-800 bg-gray-900/50 opacity-70'}`}>
              <span className="flex items-center gap-2 font-medium mb-1">
                {s.done && <Check size={14} className="text-green-400" />} {s.title}
              </span>
              <span className="text-xs text-gray-400">{s.text}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
