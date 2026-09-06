import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'
import { sessionsApi, Session } from '../api/sessions'
import { actionsApi, QueueStatus } from '../api/actions'
import {
  Activity, Clock, CheckCircle2, XCircle, Loader2,
  RefreshCw, Trash2
} from 'lucide-react'

interface SyncJob {
  id: string
  session_id: string
  task_id: string | null
  job_type: string
  status: string
  total_items: number | null
  processed_items: number | null
  error_msg: string | null
  created_at: string | null
  finished_at: string | null
}

interface ActiveTask {
  task_id: string
  name: string
  state: string
  worker: string
  started: number | null
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'text-yellow-400 bg-yellow-900/30',
  running:    'text-blue-400 bg-blue-900/30',
  completed:  'text-green-400 bg-green-900/30',
  failed:     'text-red-400 bg-red-900/30',
  ACTIVE:     'text-blue-400 bg-blue-900/30',
  RESERVED:   'text-yellow-400 bg-yellow-900/30',
  SUCCESS:    'text-green-400 bg-green-900/30',
  FAILURE:    'text-red-400 bg-red-900/30',
  PROGRESS:   'text-purple-400 bg-purple-900/30',
}

const JOB_LABELS: Record<string, string> = {
  sync_followers:         'Takipçi Sync',
  sync_following:         'Takip Sync',
  sync_posts:             'Gönderi Sync',
  sync_post_interactions: 'Etkileşim Sync',
}

function elapsed(created: string | null, finished: string | null) {
  if (!created) return null
  const end = finished ? new Date(finished) : new Date()
  const sec = Math.round((end.getTime() - new Date(created).getTime()) / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}d ${sec % 60}s`
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'text-gray-400 bg-gray-800'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  )
}

export default function MonitorPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<string>('')
  const [jobs, setJobs] = useState<SyncJob[]>([])
  const [active, setActive] = useState<ActiveTask[]>([])
  const [queue, setQueue] = useState<QueueStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    sessionsApi.list().then(ss => {
      setSessions(ss)
      if (ss.length > 0 && !activeSession) setActiveSession(ss[0].id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [jobsRes, activeRes] = await Promise.all([
        api.get<SyncJob[]>('/tasks/jobs?limit=50').then(r => r.data),
        api.get<ActiveTask[]>('/tasks/active').then(r => r.data),
      ])
      setJobs(jobsRes)
      setActive(activeRes)

      if (activeSession) {
        const q = await actionsApi.queueStatus(activeSession)
        setQueue(q)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [activeSession])

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  const handleClearQueue = async () => {
    if (!activeSession) return
    await actionsApi.clearQueue(activeSession)
    load()
  }

  const runningJobs  = jobs.filter(j => j.status === 'running' || j.status === 'pending')
  const finishedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Kuyruk Monitörü</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Aktif ve tamamlanan işlemler · {lastRefresh ? `Son güncelleme: ${lastRefresh.toLocaleTimeString('tr-TR')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <select
              value={activeSession}
              onChange={e => setActiveSession(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>@{s.ig_username}</option>
              ))}
            </select>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {/* Action Queue */}
      {queue && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Activity size={15} className="text-purple-400" />
              Takip/Takipten Çıkma Kuyruğu
            </h2>
            {queue.queue_length > 0 && (
              <button
                onClick={handleClearQueue}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 size={12} /> Temizle
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Kuyrukta',    value: queue.queue_length, color: queue.queue_length > 0 ? 'text-amber-400' : 'text-gray-400' },
              { label: 'İşleniyor',  value: queue.processing ? 'Evet' : 'Hayır', color: queue.processing ? 'text-blue-400' : 'text-gray-500' },
              { label: 'Bu Saat',    value: `${queue.hour_count}/${queue.hourly_limit}`, color: queue.hour_count >= queue.hourly_limit ? 'text-red-400' : 'text-green-400' },
              { label: 'Bu Gün',     value: `${queue.day_count}/${queue.daily_limit}`,  color: queue.day_count  >= queue.daily_limit  ? 'text-red-400' : 'text-green-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3 text-center">
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {queue.items.length > 0 && (
            <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
              {queue.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-xs bg-gray-800 rounded-lg px-3 py-2">
                  <span className={`font-semibold ${item.action === 'follow' ? 'text-green-400' : 'text-red-400'}`}>
                    {item.action === 'follow' ? 'Takip' : 'Çıkart'}
                  </span>
                  <span className="text-gray-400">ID: {item.ig_user_id}</span>
                  <span className="text-gray-600 ml-auto">
                    {new Date(item.queued_at * 1000).toLocaleTimeString('tr-TR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Celery Tasks */}
      {active.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Loader2 size={15} className="text-blue-400 animate-spin" />
            Worker'da Çalışan Task'lar ({active.length})
          </h2>
          <div className="space-y-2">
            {active.map(t => (
              <div key={t.task_id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2 text-sm">
                <StatusBadge status={t.state} />
                <span className="font-mono text-xs text-purple-300 truncate max-w-xs">{t.name}</span>
                <span className="text-gray-600 text-xs ml-auto truncate">{t.worker.split('@')[1] ?? t.worker}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Running / Pending Sync Jobs */}
      {runningJobs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Clock size={15} className="text-yellow-400" />
            Aktif Sync İşlemleri ({runningJobs.length})
          </h2>
          <div className="space-y-2">
            {runningJobs.map(j => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        </div>
      )}

      {/* Finished Jobs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <CheckCircle2 size={15} className="text-gray-500" />
          Tamamlanan İşlemler ({finishedJobs.length})
        </h2>
        {finishedJobs.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">Henüz tamamlanan işlem yok</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {finishedJobs.map(j => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function JobRow({ job }: { job: SyncJob }) {
  const pct = job.total_items && job.processed_items != null
    ? Math.round((job.processed_items / job.total_items) * 100)
    : null

  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-3">
        <StatusBadge status={job.status} />
        <span className="text-sm font-medium">{JOB_LABELS[job.job_type] ?? job.job_type}</span>
        {pct !== null && (
          <span className="text-xs text-gray-500 ml-1">%{pct}</span>
        )}
        <span className="text-xs text-gray-600 ml-auto">
          {elapsed(job.created_at, job.finished_at)}
        </span>
      </div>

      {/* Progress bar */}
      {job.total_items && job.total_items > 0 && (
        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${job.status === 'failed' ? 'bg-red-500' : 'bg-purple-500'}`}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-600">
        {job.processed_items != null && (
          <span>{job.processed_items}{job.total_items ? `/${job.total_items}` : ''} işlem</span>
        )}
        {job.created_at && (
          <span>{new Date(job.created_at).toLocaleString('tr-TR')}</span>
        )}
        {job.error_msg && (
          <span className="text-red-400 truncate max-w-xs" title={job.error_msg}>
            <XCircle size={10} className="inline mr-1" />{job.error_msg.slice(0, 60)}
          </span>
        )}
      </div>
    </div>
  )
}
