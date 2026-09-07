import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { sessionsApi, Session } from '../api/sessions'
import { analysisApi, AnalysisSummary } from '../api/analysis'
import { useLang } from '../contexts/LangContext'
import {
  Users, Image, Network, History, FileBarChart2, CheckCircle,
  XCircle, RefreshCw, Wifi, WifiOff, ScanLine, Copy, Check,
  Terminal, Pencil, X, Trash2, ChevronDown, ChevronUp,
  Settings, AlertCircle,
} from 'lucide-react'

interface HealthStatus { status: string; postgres: string; redis: string }
interface LogLine { text: string; type: 'info' | 'error' | 'done' }

const INSTALL_CMD  = 'pip3 install -r scripts/requirements.txt'
const LAUNCH_CMD   = 'python3 scripts/host_agent.py --install-launchagent'
const AGENT_CMD    = 'python3 scripts/host_agent.py &'

export default function Dashboard() {
  const { T, lang } = useLang()
  const navigate = useNavigate()

  const [health,    setHealth]    = useState<HealthStatus | null>(null)
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [summary,   setSummary]   = useState<AnalysisSummary | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [showSession, setShowSession] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [, slist] = await Promise.allSettled([
      api.get('/health').then(r => setHealth(r.data)).catch(() => setHealth(null)),
      sessionsApi.list().then(setSessions).catch(() => []),
    ])
    setLoading(false)
    if (slist.status === 'fulfilled') {
      const list = await sessionsApi.list()
      if (list.length > 0) {
        analysisApi.summary(list[0].id).then(setSummary).catch(() => {})
      }
    }
  }, [])

  useEffect(() => { load() }, [load])

  const hasSessions = sessions.length > 0
  const allOk = health?.status === 'ok' && health?.postgres === 'ok' && health?.redis === 'ok'

  return (
    <div className="max-w-4xl">
      {/* ── Top bar: health dots + session toggle ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {hasSessions ? `@${sessions[0].ig_username}` : T.dashboard.title}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            InstaAnalytic
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Health dots */}
          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
            <HealthDot label="API" ok={health?.status === 'ok'} />
            <HealthDot label="DB" ok={health?.postgres === 'ok'} />
            <HealthDot label="Redis" ok={health?.redis === 'ok'} />
          </div>
          {/* Session toggle */}
          <button
            onClick={() => setShowSession(s => !s)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
              showSession
                ? 'bg-purple-900/40 border-purple-600 text-purple-300'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'
            }`}
          >
            <Settings size={14} />
            {lang === 'tr' ? 'Oturum' : 'Session'}
            {showSession ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Session Panel (collapsible) ── */}
      {showSession && (
        <SessionPanel
          sessions={sessions}
          setSessions={setSessions}
          lang={lang}
          T={T}
          onClose={() => setShowSession(false)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-600 text-sm">{T.common.loading}</div>
      ) : !hasSessions ? (
        <OnboardingView lang={lang} T={T} setSessions={setSessions} />
      ) : (
        <>
          {/* ── Stats row ── */}
          {summary ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard
                label={lang === 'tr' ? 'Takipçi' : 'Followers'}
                value={summary.total_followers}
                color="text-blue-400"
              />
              <StatCard
                label={lang === 'tr' ? 'Takip' : 'Following'}
                value={summary.total_following}
                color="text-purple-400"
              />
              <StatCard
                label={lang === 'tr' ? 'Karşılıklı' : 'Mutual'}
                value={summary.mutual}
                color="text-green-400"
              />
              <StatCard
                label={lang === 'tr' ? 'Geri Takip Etmeyen' : 'Not Following Back'}
                value={summary.not_following_back}
                color="text-amber-400"
              />
            </div>
          ) : (
            <div className="mb-6 bg-gray-900 border border-dashed border-gray-700 rounded-2xl p-4 text-center text-sm text-gray-500">
              {lang === 'tr'
                ? 'İstatistik için önce Takipçi Analizi sayfasından senkronizasyon yap.'
                : 'Sync followers & following first to see stats here.'}
              <button
                onClick={() => navigate('/followers')}
                className="ml-2 text-purple-400 hover:text-purple-300 underline underline-offset-2"
              >
                {lang === 'tr' ? 'Analiz sayfasına git →' : 'Go to analysis →'}
              </button>
            </div>
          )}

          {/* ── Quick actions ── */}
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {T.dashboard.quickAccess}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <ActionCard
              icon={Users}
              title={T.dashboard.cards.followers}
              desc={T.dashboard.cards.followersDesc}
              accent="purple"
              onClick={() => navigate('/followers')}
            />
            <ActionCard
              icon={Image}
              title={T.dashboard.cards.posts}
              desc={T.dashboard.cards.postsDesc}
              accent="blue"
              onClick={() => navigate('/posts')}
            />
            <ActionCard
              icon={Network}
              title={T.nav.users}
              desc={lang === 'tr' ? 'Etkileşim oranına göre sırala' : 'Ranked by engagement rate'}
              accent="cyan"
              onClick={() => navigate('/users')}
            />
            <ActionCard
              icon={FileBarChart2}
              title={T.nav.report}
              desc={lang === 'tr' ? 'Aylık trend ve hayran raporu' : 'Monthly trends & top fans'}
              accent="green"
              onClick={() => navigate('/report')}
            />
            <ActionCard
              icon={History}
              title={T.dashboard.cards.actions}
              desc={T.dashboard.cards.actionsDesc}
              accent="amber"
              onClick={() => navigate('/actions')}
            />
          </div>

          {/* ── Multiple sessions ── */}
          {sessions.length > 1 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {T.dashboard.activeSessions}
              </h2>
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
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Sub-components ────────────────────────────────────────────────── */

function HealthDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-500'}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function ActionCard({
  icon: Icon, title, desc, accent, onClick,
}: {
  icon: React.ElementType; title: string; desc: string; accent: string; onClick: () => void
}) {
  const accentMap: Record<string, string> = {
    purple: 'hover:border-purple-600 group-hover:text-purple-400',
    blue:   'hover:border-blue-600   group-hover:text-blue-400',
    cyan:   'hover:border-cyan-600   group-hover:text-cyan-400',
    green:  'hover:border-green-600  group-hover:text-green-400',
    amber:  'hover:border-amber-600  group-hover:text-amber-400',
  }
  const iconColor: Record<string, string> = {
    purple: 'text-purple-500',
    blue:   'text-blue-500',
    cyan:   'text-cyan-500',
    green:  'text-green-500',
    amber:  'text-amber-500',
  }
  return (
    <button
      onClick={onClick}
      className={`group bg-gray-900 border border-gray-800 ${accentMap[accent]} rounded-2xl p-5 text-left transition-all hover:shadow-lg hover:shadow-black/30`}
    >
      <Icon size={20} className={`${iconColor[accent]} mb-3`} />
      <p className="font-semibold text-sm mb-1">{title}</p>
      <p className="text-xs text-gray-500">{desc}</p>
    </button>
  )
}

/* ── Onboarding ── */
function OnboardingView({ lang, T, setSessions }: {
  lang: string; T: any; setSessions: (s: Session[]) => void
}) {
  return (
    <div className="max-w-xl mx-auto mt-8">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-900/40 border border-purple-700/50 mb-4">
          <AlertCircle size={28} className="text-purple-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">
          {lang === 'tr' ? 'Henüz oturum yok' : 'No session yet'}
        </h2>
        <p className="text-sm text-gray-500">
          {lang === 'tr'
            ? 'Instagram oturumunu taramak için Host Agent\'ı başlatman gerekiyor.'
            : 'Start the Host Agent to scan your Instagram session from the browser.'}
        </p>
      </div>
      <AgentSetup lang={lang} T={T} setSessions={setSessions} compact={false} />
    </div>
  )
}

/* ── Session Panel ── */
function SessionPanel({ sessions, setSessions, lang, T, onClose }: {
  sessions: Session[]; setSessions: (s: Session[]) => void
  lang: string; T: any; onClose: () => void
}) {
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<Record<string, 'loading' | boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const checkAgent = useCallback(async () => {
    try {
      const s = await sessionsApi.hostAgentStatus()
      setAgentConnected(s.connected)
    } catch { setAgentConnected(false) }
  }, [])

  useEffect(() => {
    checkAgent()
    const t = setInterval(checkAgent, 5000)
    return () => clearInterval(t)
  }, [checkAgent])

  const load = async () => {
    const list = await sessionsApi.list()
    setSessions(list)
  }

  const startEdit = (s: Session) => { setEditingId(s.id); setEditValue(s.ig_username) }

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) return
    setEditSaving(true)
    try {
      await sessionsApi.updateUsername(editingId, editValue.trim().replace(/^@/, ''))
      await load(); setEditingId(null)
    } catch (e: any) { alert(e?.response?.data?.detail ?? T.session.saveError) }
    finally { setEditSaving(false) }
  }

  const handleVerify = async (id: string) => {
    setVerifyStatus(p => ({ ...p, [id]: 'loading' }))
    const r = await sessionsApi.verify(id)
    setVerifyStatus(p => ({ ...p, [id]: r.valid }))
  }

  return (
    <div className="bg-gray-900 border border-purple-800/40 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm">{T.session.title}</h2>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded-lg">
          <X size={14} />
        </button>
      </div>

      <AgentSetup lang={lang} T={T} setSessions={setSessions} compact agentConnected={agentConnected} />

      {sessions.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500 mb-2">{T.session.saved}</p>
          {sessions.map(s => (
            <div key={s.id} className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                {editingId === s.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">@</span>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value.replace(/^@/, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      className="bg-gray-700 border border-purple-600 rounded-lg px-2 py-0.5 text-sm focus:outline-none w-36"
                    />
                    <button onClick={saveEdit} disabled={editSaving}
                      className="p-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50">
                      {editSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">@{s.ig_username}</span>
                    {s.plan_b_active && (
                      <span className="text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded-full">Plan B</span>
                    )}
                    {verifyStatus[s.id] === 'loading' && <RefreshCw size={12} className="animate-spin text-gray-500" />}
                    {verifyStatus[s.id] === true  && <CheckCircle size={12} className="text-green-400" />}
                    {verifyStatus[s.id] === false && <XCircle size={12} className="text-red-400" />}
                  </div>
                )}
                {editingId !== s.id && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-gray-700 rounded-lg">
                  <Pencil size={12} />
                </button>
                <button onClick={() => handleVerify(s.id)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
                  <RefreshCw size={12} />
                </button>
                <button
                  onClick={async () => {
                    const updated = await sessionsApi.togglePlanB(s.id)
                    setSessions(sessions.map(x => x.id === s.id ? updated : x))
                  }}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                    s.plan_b_active ? 'bg-yellow-700 text-yellow-100' : 'text-gray-500 hover:text-yellow-400 hover:bg-gray-700'
                  }`}
                >B</button>
                <button
                  onClick={async () => { await sessionsApi.delete(s.id); await load() }}
                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Agent Setup (shared by Onboarding + SessionPanel) ── */
function AgentSetup({ lang, T, setSessions, compact, agentConnected: externalAgentConnected }: {
  lang: string; T: any; setSessions: (s: Session[]) => void
  compact: boolean; agentConnected?: boolean | null
}) {
  const [agentConnected, setAgentConnected] = useState<boolean | null>(externalAgentConnected ?? null)
  const [scanning,  setScanning]  = useState(false)
  const [logs,      setLogs]      = useState<LogLine[]>([])
  const [copied,    setCopied]    = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const esRef     = useRef<EventSource | null>(null)

  useEffect(() => {
    if (externalAgentConnected !== undefined) {
      setAgentConnected(externalAgentConnected ?? null)
    }
  }, [externalAgentConnected])

  useEffect(() => {
    if (externalAgentConnected !== undefined) return
    const check = async () => {
      try { setAgentConnected((await sessionsApi.hostAgentStatus()).connected) }
      catch { setAgentConnected(false) }
    }
    check()
    const t = setInterval(check, 5000)
    return () => clearInterval(t)
  }, [externalAgentConnected])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const addLog = (text: string, type: LogLine['type'] = 'info') =>
    setLogs(p => [...p, { text, type }])

  const handleScan = () => {
    if (scanning) return
    setLogs([])
    setScanning(true)
    esRef.current?.close()
    const es = new EventSource('/api/sessions/scan-browser/stream')
    esRef.current = es

    es.addEventListener('log', e => { const d = JSON.parse(e.data); addLog(d.msg, 'info') })
    es.addEventListener('error', e => {
      const d = JSON.parse((e as MessageEvent).data); addLog(d.msg, 'error')
      es.close(); setScanning(false)
    })
    es.addEventListener('done', e => {
      const d = JSON.parse(e.data)
      addLog(lang === 'en' ? '─── Done ───' : '─── Tamamlandı ───', 'done')
      setSessions(d.sessions)
      es.close(); setScanning(false)
    })
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      addLog(T.session.disconnected, 'error'); es.close(); setScanning(false)
    }
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      {/* Agent status + scan button */}
      <div className={`rounded-xl border p-4 ${agentConnected ? 'bg-green-950/20 border-green-800/40' : 'bg-gray-800/40 border-gray-700'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {agentConnected === null
              ? <RefreshCw size={14} className="animate-spin text-gray-400" />
              : agentConnected
                ? <Wifi size={14} className="text-green-400" />
                : <WifiOff size={14} className="text-gray-500" />
            }
            <span className="text-sm font-medium">
              Host Agent{' '}
              <span className={agentConnected ? 'text-green-400' : agentConnected === false ? 'text-gray-500' : 'text-gray-600'}>
                {agentConnected === null
                  ? (lang === 'tr' ? 'kontrol ediliyor…' : 'checking…')
                  : agentConnected
                    ? (lang === 'tr' ? 'çalışıyor' : 'running')
                    : (lang === 'tr' ? 'çalışmıyor' : 'not running')
                }
              </span>
            </span>
          </div>
          {agentConnected && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 rounded-lg text-sm font-semibold transition-colors"
            >
              <ScanLine size={14} className={scanning ? 'animate-pulse' : ''} />
              {scanning ? T.session.scanning : T.session.scan}
            </button>
          )}
        </div>

        {/* Install steps */}
        {agentConnected === false && (
          <div className="space-y-2 mt-1">
            <p className="text-xs text-gray-500">
              {lang === 'tr' ? 'Bir kez kur — sonra otomatik başlar:' : 'Install once — starts automatically:'}
            </p>
            <CodeLine cmd={INSTALL_CMD}  id="install" copied={copied} onCopy={copy} />
            <CodeLine cmd={LAUNCH_CMD}   id="la"      copied={copied} onCopy={copy} />
            <p className="text-xs text-gray-600">{lang === 'tr' ? '— Sadece bu oturum için:' : '— For this session only:'}</p>
            <CodeLine cmd={AGENT_CMD}    id="agent"   copied={copied} onCopy={copy} />
          </div>
        )}

        {/* Live log */}
        {logs.length > 0 && (
          <div className="mt-3 bg-black rounded-xl border border-gray-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900">
              <Terminal size={11} className="text-gray-500" />
              <span className="text-xs text-gray-500 font-mono">{T.session.scanOutput}</span>
              {scanning && <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            </div>
            <div className="p-3 font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto">
              {logs.map((l, i) => (
                <div key={i} className={
                  l.type === 'error' ? 'text-red-400'
                  : l.type === 'done' ? 'text-purple-400 font-semibold'
                  : l.text.startsWith('✓') ? 'text-green-400'
                  : l.text.startsWith('✗') ? 'text-red-400'
                  : 'text-gray-300'
                }>{l.text}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CodeLine({ cmd, id, copied, onCopy }: {
  cmd: string; id: string; copied: string | null; onCopy: (t: string, i: string) => void
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 font-mono text-xs">
      <span className="text-green-400 select-none">$</span>
      <span className="flex-1 text-gray-300 select-all">{cmd}</span>
      <button onClick={() => onCopy(cmd, id)} className="text-gray-500 hover:text-gray-300 shrink-0">
        {copied === id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      </button>
    </div>
  )
}
