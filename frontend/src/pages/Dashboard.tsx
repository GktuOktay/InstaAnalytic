import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { sessionsApi, Session } from '../api/sessions'
import { useLang } from '../contexts/LangContext'

interface HealthStatus {
  status: string
  postgres: string
  redis: string
}

export default function Dashboard() {
  const { T, lang } = useLang()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/health').then(r => setHealth(r.data)).catch(() => setHealth(null))
    sessionsApi.list().then(setSessions).catch(() => {})
  }, [])

  const allOk = health?.status === 'ok' && health?.postgres === 'ok' && health?.redis === 'ok'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{T.dashboard.title}</h1>

      {/* Servis durumu */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatusCard label="API" value={health?.status ?? '…'} ok={health?.status === 'ok'} />
        <StatusCard label="PostgreSQL" value={health?.postgres ?? '…'} ok={health?.postgres === 'ok'} />
        <StatusCard label="Redis" value={health?.redis ?? '…'} ok={health?.redis === 'ok'} />
      </div>

      {/* Kayıtlı sessionlar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{T.dashboard.activeSessions}</h2>
          <button onClick={() => navigate('/session')}
            className="text-xs text-purple-400 hover:text-purple-300">
            {lang === 'tr' ? 'Yönet →' : 'Manage →'}
          </button>
        </div>
        {sessions.length === 0 ? (
          <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-5 text-center">
            <p className="text-sm text-gray-500 mb-3">{T.dashboard.noSession}</p>
            <button onClick={() => navigate('/session')}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm font-medium">
              {T.session.scan}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sessions.map(s => (
              <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="font-semibold">@{s.ig_username}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(s.created_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">{T.dashboard.quickAccess}</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickCard title={T.dashboard.cards.followers} desc={T.dashboard.cards.followersDesc} onClick={() => navigate('/followers')} />
            <QuickCard title={T.dashboard.cards.posts} desc={T.dashboard.cards.postsDesc} onClick={() => navigate('/posts')} />
            <QuickCard title={T.dashboard.cards.actions} desc={T.dashboard.cards.actionsDesc} onClick={() => navigate('/actions')} />
          </div>
        </div>
      )}
    </div>
  )
}

function StatusCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${ok ? 'text-green-400' : 'text-red-400'}`}>{value}</p>
    </div>
  )
}

function QuickCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="bg-gray-900 border border-gray-800 hover:border-purple-700 rounded-xl p-4 text-left transition-colors">
      <p className="font-medium text-sm mb-0.5">{title}</p>
      <p className="text-xs text-gray-500">{desc}</p>
    </button>
  )
}
