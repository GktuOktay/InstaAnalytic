import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LangContext'
import { useSession } from '../contexts/SessionContext'

/** Veri yokken Kurulum sihirbazına götüren kısa bant. Veri gelince kendini gizler. */
export default function SetupGuide({ hasData }: { hasData: boolean }) {
  const { T, lang } = useLang()
  const { sessions } = useSession()
  if (sessions.length > 0 && hasData) return null
  const en = lang === 'en'
  const text = sessions.length === 0
    ? (en ? 'Add your account to get started.' : 'Başlamak için hesabını ekle.')
    : (en ? 'No data yet. Upload the file you downloaded from Instagram and the charts will fill in.'
          : "Henüz veri yok. Instagram'dan indirdiğin dosyayı yükleyince grafikler dolacak.")
  return (
    <section aria-label={T.wizard.title}
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-sm text-gray-300">{text}</p>
      <Link to="/start" className="shrink-0 rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-sm font-semibold text-white">
        {sessions.length === 0 ? T.wizard.start : T.wizard.resume}
      </Link>
    </section>
  )
}
