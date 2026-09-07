import { useEffect, useRef, useState, useCallback } from 'react'
import { sessionsApi, Session } from '../api/sessions'
import { useSession } from '../contexts/SessionContext'
import { useLang } from '../contexts/LangContext'
import {
  CheckCircle, XCircle, Trash2, RefreshCw, Wifi, WifiOff,
  ScanLine, Copy, Check, Terminal, Pencil, X,
} from 'lucide-react'

const INSTALL_CMD = 'pip3 install -r scripts/requirements.txt'
const LAUNCHAGENT_CMD = 'python3 scripts/host_agent.py --install-launchagent'
const AGENT_CMD = 'python3 scripts/host_agent.py &'

interface LogLine {
  text: string
  type: 'info' | 'error' | 'done'
}

export default function SessionPage() {
  const { T, lang } = useLang()
  const { sessions, loading, refresh: refreshContext, setSessionsDirectly: setSessions } = useSession()
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null)
  const [scanning, setScanning] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [verifyStatus, setVerifyStatus] = useState<Record<string, 'loading' | boolean>>({})
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editValue,   setEditValue]   = useState('')
  const [editSaving,  setEditSaving]  = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const agentPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const load = useCallback(async () => {
    await refreshContext()
  }, [refreshContext])

  const checkAgent = useCallback(async () => {
    try {
      const s = await sessionsApi.hostAgentStatus()
      setAgentConnected(s.connected)
    } catch {
      setAgentConnected(false)
    }
  }, [])

  useEffect(() => {
    checkAgent()
    agentPollRef.current = setInterval(checkAgent, 5000)
    return () => {
      if (agentPollRef.current) clearInterval(agentPollRef.current)
      esRef.current?.close()
    }
  }, [load, checkAgent])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (text: string, type: LogLine['type'] = 'info') =>
    setLogs(p => [...p, { text, type }])

  const handleScan = () => {
    if (scanning) return
    setLogs([])
    setScanning(true)

    esRef.current?.close()
    const es = new EventSource('/api/sessions/scan-browser/stream')
    esRef.current = es

    es.addEventListener('log', e => {
      const d = JSON.parse(e.data)
      addLog(d.msg, 'info')
    })

    es.addEventListener('error', e => {
      const d = JSON.parse((e as MessageEvent).data)
      addLog(d.msg, 'error')
      es.close()
      setScanning(false)
    })

    es.addEventListener('done', e => {
      const d = JSON.parse(e.data)
      addLog(lang === 'en' ? '─── Done ───' : '─── Tamamlandı ───', 'done')
      setSessions(d.sessions)
      setLoading(false)
      es.close()
      setScanning(false)
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      addLog(T.session.disconnected, 'error')
      es.close()
      setScanning(false)
    }
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const startEdit = (s: Session) => {
    setEditingId(s.id)
    setEditValue(s.ig_username)
  }

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) return
    setEditSaving(true)
    try {
      await sessionsApi.updateUsername(editingId, editValue.trim().replace(/^@/, ''))
      await load()
      setEditingId(null)
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? T.session.saveError)
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await sessionsApi.delete(id)
    await load()
  }

  const handleVerify = async (id: string) => {
    setVerifyStatus(p => ({ ...p, [id]: 'loading' }))
    const result = await sessionsApi.verify(id)
    setVerifyStatus(p => ({ ...p, [id]: result.valid }))
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">{T.session.title}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {lang === 'en' ? 'Scan your Instagram session from the browser in one click.' : 'Tarayıcıdan Instagram oturumunu tek tıkla tara.'}
      </p>

      {/* Host Agent durumu + Tara butonu */}
      <div className={`rounded-2xl border p-5 mb-5 ${agentConnected ? 'bg-green-950/20 border-green-800/50' : 'bg-gray-900 border-gray-800'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {agentConnected === null
              ? <RefreshCw size={15} className="animate-spin text-gray-400" />
              : agentConnected
                ? <Wifi size={15} className="text-green-400" />
                : <WifiOff size={15} className="text-red-400" />
            }
            <span className="font-semibold text-sm">
              Host Agent{' '}
              <span className={agentConnected ? 'text-green-400' : agentConnected === false ? 'text-red-400' : 'text-gray-500'}>
                {agentConnected === null
                ? (lang === 'en' ? 'checking…' : 'kontrol ediliyor…')
                : agentConnected
                  ? (lang === 'en' ? 'running' : 'çalışıyor')
                  : (lang === 'en' ? 'not running' : 'çalışmıyor')
              }
              </span>
            </span>
          </div>

          {agentConnected && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 rounded-xl text-sm font-semibold transition-colors"
            >
              <ScanLine size={15} className={scanning ? 'animate-pulse' : ''} />
              {scanning ? T.session.scanning : T.session.scan}
            </button>
          )}
        </div>

        {/* Kurulum adımları — agent yoksa */}
        {agentConnected === false && (
          <div className="space-y-3 mt-2">
            <p className="text-xs text-gray-400">
              {lang === 'en' ? 'Install once — starts automatically on every login.' : 'Bir kez kur — sonra her login\'de otomatik başlar.'}
            </p>
            <CodeLine cmd={INSTALL_CMD} id="install" copied={copied} onCopy={copy} />
            <CodeLine cmd={LAUNCHAGENT_CMD} id="la" copied={copied} onCopy={copy} />
            <p className="text-xs text-gray-600">{lang === 'en' ? '— For this session only:' : '— Sadece bu oturum için:'}</p>
            <CodeLine cmd={AGENT_CMD} id="agent" copied={copied} onCopy={copy} />
            <p className="text-xs text-gray-600 mt-1">{T.session.autoUpdate}</p>
          </div>
        )}

        {/* Canlı konsol */}
        {logs.length > 0 && (
          <div className="mt-4 bg-black rounded-xl border border-gray-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900">
              <Terminal size={12} className="text-gray-500" />
              <span className="text-xs text-gray-500 font-mono">{T.session.scanOutput}</span>
              {scanning && <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            </div>
            <div className="p-3 font-mono text-xs space-y-0.5 max-h-64 overflow-y-auto">
              {logs.map((l, i) => (
                <div key={i} className={
                  l.type === 'error' ? 'text-red-400'
                  : l.type === 'done' ? 'text-purple-400 font-semibold'
                  : l.text.startsWith('✓') ? 'text-green-400'
                  : l.text.startsWith('✗') ? 'text-red-400'
                  : l.text.startsWith('  →') ? 'text-yellow-400'
                  : 'text-gray-300'
                }>
                  {l.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Session listesi */}
      <h2 className="font-semibold mb-3">{T.session.saved}</h2>
      {loading ? (
        <p className="text-gray-600 text-sm">{T.common.loading}</p>
      ) : sessions.length === 0 ? (
        <div className="text-center py-10 text-gray-600 border border-dashed border-gray-800 rounded-xl text-sm">
          {lang === 'en' ? 'No sessions yet — scan above' : 'Henüz session yok — yukarıdan tara'}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                {editingId === s.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">@</span>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value.replace(/^@/, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      className="bg-gray-800 border border-purple-600 rounded-lg px-2 py-0.5 text-sm focus:outline-none w-40"
                    />
                    <button onClick={saveEdit} disabled={editSaving}
                      className="p-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-xs disabled:opacity-50">
                      {editSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">@{s.ig_username}</span>
                    {s.ig_username.startsWith('user_') && (
                      <span className="text-xs bg-amber-900 text-amber-400 px-2 py-0.5 rounded-full">
                        {lang === 'en' ? 'Username unknown' : 'Kullanıcı adı bilinmiyor'}
                      </span>
                    )}
                    {s.plan_b_active && (
                      <span className="text-xs bg-yellow-900 text-yellow-400 px-2 py-0.5 rounded-full">Plan B</span>
                    )}
                    {verifyStatus[s.id] === 'loading' && <RefreshCw size={14} className="animate-spin text-gray-500" />}
                    {verifyStatus[s.id] === true  && <CheckCircle size={14} className="text-green-400" />}
                    {verifyStatus[s.id] === false && <XCircle size={14} className="text-red-400" />}
                  </div>
                )}
                {editingId !== s.id && (
                  <p className="text-xs text-gray-500">
                    {lang === 'en' ? 'Added' : 'Eklendi'}: {new Date(s.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR')}
                    {s.last_verified_at && ` · ${lang === 'en' ? 'Verified' : 'Doğrulandı'}: ${new Date(s.last_verified_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR')}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(s)} title={T.session.editUsername}
                  className="p-2 text-gray-400 hover:text-purple-400 hover:bg-gray-800 rounded-lg">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleVerify(s.id)} title={T.session.validate}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={async () => {
                    const updated = await sessionsApi.togglePlanB(s.id)
                    setSessions(prev => prev.map(x => x.id === s.id ? updated : x))
                  }}
                  title={s.plan_b_active ? T.session.planBOff : T.session.planBOn}
                  className={`p-2 rounded-lg text-xs font-semibold transition-colors ${
                    s.plan_b_active
                      ? 'bg-yellow-700 hover:bg-yellow-600 text-yellow-100'
                      : 'text-gray-500 hover:text-yellow-400 hover:bg-gray-800'
                  }`}>
                  B
                </button>
                <button onClick={() => handleDelete(s.id)} title="Sil"
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CodeLine({ cmd, id, copied, onCopy }: {
  cmd: string; id: string; copied: string | null
  onCopy: (text: string, id: string) => void
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 font-mono text-xs">
      <span className="text-green-400 select-none">$</span>
      <span className="flex-1 text-gray-300 select-all">{cmd}</span>
      <button onClick={() => onCopy(cmd, id)} className="text-gray-500 hover:text-gray-300 shrink-0">
        {copied === id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      </button>
    </div>
  )
}
