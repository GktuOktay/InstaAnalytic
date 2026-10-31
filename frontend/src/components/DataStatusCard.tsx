import { useEffect, useState } from 'react'
import { AlertTriangle, Database } from 'lucide-react'
import { importApi, DataStatus, DimStatus, SnapshotRow } from '../api/imports'
import { useLang } from '../contexts/LangContext'

interface Props { sessionId: string; refreshKey?: unknown }

export default function DataStatusCard({ sessionId, refreshKey }: Props) {
  const { T, lang } = useLang()
  const L = T.settings
  const locale = lang === 'en' ? 'en-US' : 'tr-TR'
  const [st, setSt] = useState<DataStatus | null>(null)
  const [hist, setHist] = useState<SnapshotRow[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setFailed(false)
    Promise.all([importApi.dataStatus(sessionId), importApi.snapshots(sessionId, 5)])
      .then(([s, h]) => { if (live) { setSt(s); setHist(h) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [sessionId, refreshKey])

  const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : '-')
  const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : L.never)
  const range = (x: DimStatus) => (x.oldest ? `${d(x.oldest)} → ${d(x.newest)}` : L.noDates)

  if (failed) return <p className="text-xs text-gray-500">{L.statusFailed}</p>
  if (!st) return <div className="h-24 rounded-xl bg-gray-900 border border-gray-800 animate-pulse" aria-hidden />

  const empty = st.followers.count === 0 && st.following.count === 0
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium">
        <Database size={15} className="text-purple-400" /> {L.statusTitle}
      </div>
      {empty ? (
        <p className="text-sm text-gray-400">{L.statusEmpty}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {([['followers', st.followers], ['following', st.following]] as const).map(([k, x]) => (
            <div key={k} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{k === 'followers' ? T.followers.followers : T.followers.followingTab}</p>
              <p className="text-xl font-bold">{x.count.toLocaleString(locale)}</p>
              <p className="text-[11px] text-gray-500">{L.dateRange}: {range(x)}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500">
        {L.lastImport}: {dt(st.last_import_at)} · {L.lastScan}: {dt(st.last_scan_at)}
      </p>

      {st.warnings.includes('followers_range_short') && (
        <div role="alert" className="mt-3 flex gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            {L.warnRange
              .replace('{followers}', d(st.followers.oldest))
              .replace('{following}', d(st.following.oldest))}
          </p>
        </div>
      )}

      {hist.length > 0 && (
        <details className="mt-3 text-xs text-gray-400">
          <summary className="cursor-pointer text-purple-300">{L.history} ({st.imports})</summary>
          <ul className="mt-2 space-y-1">
            {hist.map(h => (
              <li key={h.id}>
                {dt(h.created_at)}: {h.followers_count ?? '-'} / {h.following_count ?? '-'}
                {' '}(+{h.followers_gained.length + h.following_gained.length} −{h.followers_lost.length + h.following_lost.length})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
