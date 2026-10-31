import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, ShieldCheck, Clock } from 'lucide-react'
import { importApi, ImportSummary, ScanStatus } from '../api/imports'
import { useLang } from '../contexts/LangContext'

interface Props {
  sessionId: string
  refreshKey?: unknown      // değişince durum yeniden çekilir (ör. sync görevi bitince)
  onImported: () => void
}

const fmt = (epoch: number) => new Date(epoch * 1000).toLocaleString()

export default function ImportScanPanel({ sessionId, refreshKey, onImported }: Props) {
  const { T } = useLang()
  const L = T.importScan
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadStatus = useCallback(() => {
    if (!sessionId) return
    importApi.scanStatus(sessionId).then(setStatus).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    loadStatus()
    const iv = setInterval(loadStatus, 15000)
    return () => clearInterval(iv)
  }, [loadStatus, refreshKey])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try {
      setResult(await importApi.uploadZip(sessionId, file))
      onImported()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Hata')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const bar = (used: number, limit: number) => (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full ${used >= limit ? 'bg-red-500' : 'bg-purple-500'}`}
        style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
    </div>
  )

  const line = (label: string, r: ImportSummary['followers'], lostNames: string[]) =>
    r && (
      <p className="text-xs text-gray-300">
        {label}: <b>{r.count}</b> · +{r.gained} {L.gained} · −{r.lost} {L.lost}
        {lostNames.length > 0 && <span className="text-gray-500"> ({lostNames.slice(0, 8).map(n => '@' + n).join(', ')}{lostNames.length > 8 ? '…' : ''})</span>}
      </p>
    )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1 text-sm font-medium">
          <ShieldCheck size={15} className="text-green-400" /> {L.zipTitle}
        </div>
        <p className="text-xs text-gray-500 mb-3">{L.zipHint}</p>
        <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden"
          onChange={e => onFile(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy || !sessionId}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-xs">
          <Upload size={13} /> {busy ? L.zipUploading : L.zipButton}
        </button>
        <details className="mt-3 text-xs text-gray-400">
          <summary className="cursor-pointer text-purple-300">{T.zipGuide.title}</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            {T.zipGuide.steps.map((st: string) => <li key={st}>{st}</li>)}
          </ol>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-500">
            {T.zipGuide.notes.map((n: string) => <li key={n}>{n}</li>)}
          </ul>
        </details>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        {result && (
          <div className="mt-3 space-y-0.5">
            <p className="text-xs text-green-400">{L.zipDone}</p>
            {line(T.followers.followers, result.followers, result.followers_lost)}
            {line(T.followers.followingTab, result.following, result.following_lost)}
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium">
          <Clock size={15} className="text-amber-400" /> {L.scanTitle}
        </div>
        {status && (
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{L.hour}</span><span>{status.used_hour} / {status.limit_hour}</span>
              </div>
              {bar(status.used_hour, status.limit_hour)}
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{L.day}</span><span>{status.used_day} / {status.limit_day}</span>
              </div>
              {bar(status.used_day, status.limit_day)}
            </div>
            {status.running && <p className="text-xs text-purple-300">{L.running}</p>}
            {status.cooldown_until ? (
              <p className="text-xs text-red-400">{L.cooldown} {fmt(status.cooldown_until)}</p>
            ) : !status.can_scan && status.next_available_at ? (
              <p className="text-xs text-amber-400">{L.budgetFull} {fmt(status.next_available_at)}</p>
            ) : null}
            {(['followers', 'following'] as const).filter(k => status.paused[k]).map(k => (
              <p key={k} className="text-xs text-amber-300">
                {L.paused} {k === 'followers' ? T.followers.followersTab : T.followers.followingTab}{' '}
                <button className="underline" onClick={() => importApi.resetProgress(sessionId, k).then(loadStatus)}>
                  {L.discard}
                </button>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
