import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, ShieldCheck, Clock } from 'lucide-react'
import { importApi, ImportJob, ImportSummary, ScanStatus } from '../api/imports'
import { useLang } from '../contexts/LangContext'
import { apiErrorMessage } from '../lib/problems'
import { useToast } from '../contexts/ToastContext'
import { extractExportJson } from '../lib/zipExtract'

interface Props {
  sessionId: string
  refreshKey?: unknown      // değişince durum yeniden çekilir (ör. sync görevi bitince)
  show?: 'both' | 'zip' | 'budget'     // Ayarlar sayfası iki yarıyı ayrı bölümlerde gösterir
  onImported: () => void
}

const fmt = (epoch: number) => new Date(epoch * 1000).toLocaleString()
const FALLBACK_MAX_BYTES = 1024 * 1024 * 1024     // tarayıcıda açılamayan ZIP'i sunucuya göndermenin üst sınırı
const mb = (b: number) => (b / 1024 / 1024).toFixed(b > 1024 ** 3 ? 0 : 1)

interface Phase { stage: 'extract' | 'upload' | 'read' | 'save' | 'done'; pct: number; label: string; detail: string }

export default function ImportScanPanel({ sessionId, refreshKey, onImported, show = 'both' }: Props) {
  const showZip = show !== 'budget'
  const showBudget = show !== 'zip'
  const { T } = useLang()
  const L = T.importScan
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const toast = useToast()
  const [extract, setExtract] = useState<{ phase: 'index' | 'extract'; done: number; total: number; name: string } | null>(null)
  const [upload, setUpload] = useState<{ loaded: number; total: number } | null>(null)
  const [job, setJob] = useState<ImportJob | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])   // StrictMode çift mount'a dayanıklı

  const loadStatus = useCallback(() => {
    if (!sessionId || !showBudget) return
    importApi.scanStatus(sessionId).then(setStatus).catch(() => {})
  }, [sessionId, showBudget])

  useEffect(() => {
    loadStatus()
    const iv = setInterval(loadStatus, 15000)
    return () => clearInterval(iv)
  }, [loadStatus, refreshKey])

  /** İş bitene kadar 700 ms'de bir ilerlemeyi çeker (canlı sayaç). */
  const follow = useCallback(async (jobId: string) => {
    setBusy(true)
    try {
      for (;;) {
        const j = await importApi.job(sessionId, jobId)
        if (!alive.current) return
        setJob(j)
        if (j.stage === 'done') { setResult(j.result); onImported(); return }
        if (j.stage === 'error') { toast.error(j.error || L.pFailed); return }
        await new Promise(r => setTimeout(r, 700))
      }
    } catch (e: any) {
      if (alive.current) toast.error(apiErrorMessage(e, T, 'Hata'))
    } finally {
      if (alive.current) { setBusy(false); setUpload(null) }
    }
  }, [sessionId, onImported, L.pFailed, toast])

  // Sayfa yenilense / başka sekmeden dönülse bile süren işe bağlan
  useEffect(() => {
    if (!sessionId) return
    importApi.activeJob(sessionId).then(id => { if (id && alive.current) follow(id) }).catch(() => {})
  }, [sessionId, follow])

  /** ZIP'leri tarayıcıda açıp yalnızca JSON'ları ayıklar; açılamazsa (ve makul boyuttaysa) tam dosyayı gönderir. */
  const prepare = async (picked: File[]): Promise<File[]> => {
    const out: File[] = []
    for (const f of picked) {
      if (!/\.zip$/i.test(f.name)) { out.push(f); continue }
      try {
        setExtract({ phase: 'index', done: 0, total: 0, name: f.name })
        const { files } = await extractExportJson(f, p => setExtract({ ...p, name: f.name }))
        if (files.length === 0) throw new Error(L.pNoJson)
        out.push(...files)
      } catch (e: any) {
        if (f.size > FALLBACK_MAX_BYTES) throw new Error(`${f.name}: ${e?.message ?? L.pFailed}`)
        out.push(f)                       // sunucu ayıklasın
      }
    }
    setExtract(null)
    return out
  }

  const onFiles = async (list: FileList | File[] | null | undefined) => {
    const picked = Array.from(list ?? [])
    if (picked.length === 0) return
    setBusy(true); setResult(null); setJob(null)
    try {
      const toSend = await prepare(picked)
      const total = toSend.reduce((a, f) => a + f.size, 0)
      setUpload({ loaded: 0, total })
      const jobId = await importApi.uploadFiles(sessionId, toSend, (loaded, t) => setUpload({ loaded, total: t }))
      setUpload(null)
      await follow(jobId)
    } catch (e: any) {
      toast.error(apiErrorMessage(e, T, 'Hata'))
      setBusy(false); setUpload(null)
    } finally {
      setExtract(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const phase: Phase | null = extract
    ? { stage: 'extract', pct: extract.phase === 'index' ? 0 : (extract.done / Math.max(1, extract.total)) * 100,
        label: L.pExtract,
        detail: extract.phase === 'index' ? `${extract.name}, ${L.pIndexing}` : `${extract.done} / ${extract.total} ${L.pJsonFiles}` }
    : upload
    ? { stage: 'upload', pct: (upload.loaded / Math.max(1, upload.total)) * 100, label: L.pUpload,
        detail: `${mb(upload.loaded)} / ${mb(upload.total)} MB` }
    : job && job.stage === 'reading'
    ? { stage: 'read', pct: (job.scanned / Math.max(1, job.total)) * 100, label: L.pRead,
        detail: `${job.scanned.toLocaleString()} / ${job.total.toLocaleString()} ${L.pFiles} · ${job.followers_found.toLocaleString()} ${L.pFollowers}, ${job.following_found.toLocaleString()} ${L.pFollowing} ${L.pFound}` }
    : job && job.stage.startsWith('saving')
    ? { stage: 'save', pct: 100, label: job.stage === 'saving:followers' ? L.pStepFollowers
        : job.stage === 'saving:following' ? L.pStepFollowing
        : job.stage === 'saving:finalize' ? L.pStepFinalize : L.pSave,
        detail: `${job.followers_found.toLocaleString()} ${L.pFollowers} · ${job.following_found.toLocaleString()} ${L.pFollowing}` }
    : null

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
    <div className={`grid grid-cols-1 gap-3 ${show === 'both' ? 'md:grid-cols-2 mb-6' : ''}`}>
      {showZip && (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1 text-sm font-medium">
          <ShieldCheck size={15} className="text-green-400" /> {L.zipTitle}
        </div>
        <p className="text-xs text-gray-500 mb-3">{L.zipHint}</p>
        <input ref={fileRef} type="file" multiple accept=".zip,.json,application/zip,application/json" className="hidden"
          onChange={e => onFiles(e.target.files)} />
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (!busy && sessionId) onFiles(e.dataTransfer.files) }}
          className={`rounded-lg border border-dashed p-3 text-center transition-colors ${drag ? 'border-purple-400 bg-purple-950/30' : 'border-gray-700'}`}
        >
          <button onClick={() => fileRef.current?.click()} disabled={busy || !sessionId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-xs">
            <Upload size={13} /> {busy ? L.zipUploading : L.zipButton}
          </button>
          <p className="text-[11px] text-gray-500 mt-2">{L.dropHint}</p>
          <p className="text-[11px] text-gray-600 mt-1">{L.privacyNote}</p>
        </div>
        <details className="mt-3 text-xs text-gray-400">
          <summary className="cursor-pointer text-purple-300">{T.zipGuide.title}</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            {T.zipGuide.steps.map((st: string) => <li key={st}>{st}</li>)}
          </ol>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-500">
            {T.zipGuide.notes.map((n: string) => <li key={n}>{n}</li>)}
          </ul>
        </details>
        {phase && (
          <div className="mt-3" role="status" aria-live="polite">
            <div className="flex justify-between text-xs text-gray-300 mb-1">
              <span className="font-medium">{phase.label}…</span>
              <span>{phase.stage === 'save' ? '' : `${Math.floor(phase.pct)}%`}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full bg-purple-500 transition-[width] duration-300 ${phase.stage === 'save' ? 'animate-pulse' : ''}`}
                style={{ width: `${Math.min(100, phase.pct)}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{phase.detail}</p>
            <p className="text-[11px] text-gray-600 mt-1">
              {job ? `${L.pElapsed}: ${Math.round(job.elapsed_s)} sn · ` : ''}{L.pKeepOpen}
            </p>
          </div>
        )}
        {result && (
          <div className="mt-3 space-y-0.5">
            <p className="text-xs text-green-400">{L.zipDone}</p>
            {line(T.followers.followers, result.followers, result.followers_lost)}
            {line(T.followers.followingTab, result.following, result.following_lost)}
          </div>
        )}
      </div>
      )}

      {showBudget && (
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
      )}
    </div>
  )
}
