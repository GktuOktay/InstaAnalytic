import { useEffect, useState } from 'react'
import { sessionsApi, Session } from '../api/sessions'
import { actionsApi, ActionLogEntry } from '../api/actions'
import { useLang } from '../contexts/LangContext'
import { CheckCircle, XCircle, Clock, SkipForward } from 'lucide-react'

const STATUS_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle size={14} className="text-green-400" />,
  failed: <XCircle size={14} className="text-red-400" />,
  pending: <Clock size={14} className="text-gray-400" />,
  skipped: <SkipForward size={14} className="text-yellow-400" />,
}

export default function ActionLogPage() {
  const { T, lang } = useLang()
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<string>('')
  const [logs, setLogs] = useState<ActionLogEntry[]>([])
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    sessionsApi.list().then(s => {
      setSessions(s)
      if (s.length > 0) setActiveSession(s[0].id)
    })
  }, [])

  useEffect(() => {
    if (activeSession) actionsApi.log(activeSession).then(setLogs)
  }, [activeSession])

  const filtered = filter === 'all' ? logs : logs.filter(l => l.status === filter || l.action_type === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{T.actionLog.title}</h1>
        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <select value={activeSession} onChange={e => setActiveSession(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm">
              {sessions.map(s => <option key={s.id} value={s.id}>@{s.ig_username}</option>)}
            </select>
          )}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm">
            <option value="all">{T.common.all}</option>
            <option value="unfollow">{T.actionLog.unfollow}</option>
            <option value="follow">{T.actionLog.follow}</option>
            <option value="remove_follower">{T.actionLog.removeFollower}</option>
            <option value="success">{T.actionLog.status.success}</option>
            <option value="failed">{T.actionLog.status.failed}</option>
            <option value="skipped">{T.actionLog.status.skipped}</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-16">{T.actionLog.noActions}</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(entry => (
            <div key={entry.id} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="shrink-0">{STATUS_ICON[entry.status] ?? STATUS_ICON.pending}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    @{entry.ig_username ?? entry.ig_user_id}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    entry.action_type === 'unfollow' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'
                  }`}>
                    {entry.action_type === 'unfollow' ? T.actionLog.unfollow : entry.action_type === 'remove_follower' ? T.actionLog.removeFollower : T.actionLog.follow}
                  </span>
                </div>
                {entry.error_msg && <p className="text-xs text-red-400 mt-0.5 truncate">{entry.error_msg}</p>}
              </div>
              <div className="text-xs text-gray-600 shrink-0">
                {entry.executed_at
                  ? new Date(entry.executed_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
                  : new Date(entry.created_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
