import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { sessionsApi, Session } from '../api/sessions'
import { useSession } from '../contexts/SessionContext'
import { analysisApi, AnalysisSummary } from '../api/analysis'
import { useLang } from '../contexts/LangContext'
import {
  Users, Image, Network, History, FileBarChart2, CheckCircle,
  XCircle, RefreshCw, Wifi, WifiOff, ScanLine, Copy, Check,
  Terminal, Pencil, X, Trash2, ChevronDown, ChevronUp,
  Settings, AlertCircle, TrendingUp, UserCheck, UserX,
} from 'lucide-react'

interface HealthStatus { status: string; postgres: string; redis: string }
interface LogLine { text: string; type: 'info' | 'error' | 'done' }

const INSTALL_CMD = 'pip3 install -r scripts/requirements.txt'
const LAUNCH_CMD  = 'python3 scripts/host_agent.py --install-launchagent'
const AGENT_CMD   = 'python3 scripts/host_agent.py &'

export default function Dashboard() {
  const { T, lang } = useLang()
  const navigate    = useNavigate()
  const { sessions, loading: sessionsLoading, setSessionsDirectly: setSessions } = useSession()

  const [health,      setHealth]      = useState<HealthStatus | null>(null)
  const [summary,     setSummary]     = useState<AnalysisSummary | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [showSession, setShowSession] = useState(false)

  useEffect(() => {
    api.get('/health').then(r => setHealth(r.data)).catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    if (sessions.length > 0) {
      analysisApi.summary(sessions[0].id).then(setSummary).catch(() => {})
    }
    setLoading(sessionsLoading)
  }, [sessions, sessionsLoading])

  const hasSessions = sessions.length > 0

  return (
    <div style={{ width: '100%' }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 4 }}>
            {hasSessions ? (
              <>
                <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>@</span>
                {sessions[0].ig_username}
              </>
            ) : 'Dashboard'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {hasSessions
              ? (lang === 'tr' ? 'Instagram analitik paneli' : 'Instagram analytics overview')
              : 'InstaAnalytic'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Health indicators */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 14px', borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontSize: 12,
          }}>
            {(['API', 'DB', 'Redis'] as const).map((label, i) => {
              const ok = i === 0 ? health?.status === 'ok' : i === 1 ? health?.postgres === 'ok' : health?.redis === 'ok'
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: ok == null ? 'var(--text-3)' : ok ? '#22C55E' : '#EF4444',
                    boxShadow: ok ? '0 0 6px rgba(34,197,94,0.5)' : undefined,
                  }} />
                  <span style={{ color: 'var(--text-2)' }}>{label}</span>
                </div>
              )
            })}
          </div>

          {/* Session toggle */}
          <button
            onClick={() => setShowSession(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              background: showSession ? 'rgba(99,102,241,0.12)' : 'var(--surface)',
              border: showSession ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
              color: showSession ? '#A5B4FC' : 'var(--text-2)',
            }}
          >
            <Settings size={13} />
            {lang === 'tr' ? 'Oturum' : 'Session'}
            {showSession ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* ── Session Panel ── */}
      {showSession && (
        <SessionPanel sessions={sessions} setSessions={setSessions} lang={lang} T={T} onClose={() => setShowSession(false)} />
      )}

      {loading ? (
        <LoadingState />
      ) : !hasSessions ? (
        <OnboardingView lang={lang} T={T} setSessions={setSessions} />
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
            {summary ? (
              <>
                <StatCard icon={Users}     label={lang === 'tr' ? 'Takipçi' : 'Followers'}         value={summary.total_followers}    color="#60A5FA" glow="rgba(96,165,250,0.15)" />
                <StatCard icon={TrendingUp} label={lang === 'tr' ? 'Takip'   : 'Following'}         value={summary.total_following}    color="#A78BFA" glow="rgba(167,139,250,0.15)" />
                <StatCard icon={UserCheck} label={lang === 'tr' ? 'Karşılıklı' : 'Mutual'}         value={summary.mutual}             color="#34D399" glow="rgba(52,211,153,0.15)" />
                <StatCard icon={UserX}     label={lang === 'tr' ? 'Geri Takip Etmeyen' : 'Not Following Back'} value={summary.not_following_back} color="#FB923C" glow="rgba(251,146,60,0.15)" />
              </>
            ) : (
              <div style={{
                gridColumn: '1 / -1',
                padding: '16px 20px',
                borderRadius: 16,
                background: 'var(--surface)',
                border: '1px dashed var(--border-2)',
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 13, color: 'var(--text-2)',
              }}>
                <AlertCircle size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                {lang === 'tr'
                  ? 'İstatistik için önce Takipçi Analizi\'nden senkronizasyon yap.'
                  : 'Run a sync in Follower Analysis to populate stats.'}
                <button
                  onClick={() => navigate('/followers')}
                  style={{ marginLeft: 'auto', fontSize: 13, color: '#818CF8', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  {lang === 'tr' ? 'Analize git →' : 'Go to analysis →'}
                </button>
              </div>
            )}
          </div>

          {/* ── Quick actions ── */}
          <div style={{ marginBottom: 8 }}>
            <p className="label" style={{ marginBottom: 14 }}>{T.dashboard.quickAccess}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <ActionCard icon={Users}        title={T.dashboard.cards.followers} desc={T.dashboard.cards.followersDesc} accent="#818CF8" onClick={() => navigate('/followers')} />
              <ActionCard icon={Image}        title={T.dashboard.cards.posts}     desc={T.dashboard.cards.postsDesc}     accent="#60A5FA" onClick={() => navigate('/posts')} />
              <ActionCard icon={Network}      title={T.nav.users}                  desc={lang === 'tr' ? 'Etkileşim oranına göre sırala' : 'Ranked by engagement'} accent="#34D399" onClick={() => navigate('/users')} />
              <ActionCard icon={FileBarChart2} title={T.nav.report}               desc={lang === 'tr' ? 'Aylık trend & hayran listesi' : 'Monthly trends & top fans'} accent="#F472B6" onClick={() => navigate('/report')} />
              <ActionCard icon={History}      title={T.dashboard.cards.actions}   desc={T.dashboard.cards.actionsDesc}  accent="#FB923C" onClick={() => navigate('/actions')} />
            </div>
          </div>

          {/* ── Multiple sessions badge ── */}
          {sessions.length > 1 && (
            <div style={{ marginTop: 28 }}>
              <p className="label" style={{ marginBottom: 14 }}>{T.dashboard.activeSessions}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {sessions.map(s => (
                  <div key={s.id} style={{
                    padding: '14px 16px', borderRadius: 14,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                  }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>@{s.ig_username}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
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

/* ── Sub-components ──────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', fontSize: 14 }}>
      <RefreshCw size={16} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
      Yükleniyor…
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, glow }: {
  icon: React.ElementType; label: string; value: number; color: string; glow: string
}) {
  return (
    <div style={{
      padding: '20px 20px 18px',
      borderRadius: 18,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle glow behind icon */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 80, height: 80,
        borderRadius: '50%',
        background: glow,
        filter: 'blur(24px)',
        transform: 'translate(20px, -20px)',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon size={15} style={{ color }} />
        <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
      </div>
      <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color, lineHeight: 1 }}>
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function ActionCard({ icon: Icon, title, desc, accent, onClick }: {
  icon: React.ElementType; title: string; desc: string; accent: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '20px',
        borderRadius: 18,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.18s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.borderColor = `${accent}40`
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = `0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px ${accent}20`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--border)'
        el.style.transform = 'translateY(0)'
        el.style.boxShadow = 'none'
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${accent}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
      }}>
        <Icon size={17} style={{ color: accent }} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text)' }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{desc}</p>
    </button>
  )
}

/* ── Onboarding ── */
function OnboardingView({ lang, T, setSessions }: {
  lang: string; T: any; setSessions: (s: Session[]) => void
}) {
  return (
    <div style={{ maxWidth: 520, margin: '40px auto 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: '0 auto 20px',
          background: 'rgba(99,102,241,0.1)',
          border: '1px solid rgba(99,102,241,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertCircle size={26} style={{ color: '#818CF8' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {lang === 'tr' ? 'Henüz oturum yok' : 'No session yet'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {lang === 'tr'
            ? 'Instagram oturumunu taramak için aşağıdaki adımları takip et.'
            : 'Follow the steps below to scan your Instagram session.'}
        </p>
      </div>
      <AgentSetup lang={lang} T={T} setSessions={setSessions} agentConnected={null} />
    </div>
  )
}

/* ── Session Panel ── */
function SessionPanel({ sessions, setSessions, lang, T, onClose }: {
  sessions: Session[]; setSessions: (s: Session[]) => void
  lang: string; T: any; onClose: () => void
}) {
  const { refresh: refreshSessions } = useSession()
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<Record<string, 'loading' | boolean>>({})
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editValue,   setEditValue]   = useState('')
  const [editSaving,  setEditSaving]  = useState(false)

  const checkAgent = useCallback(async () => {
    try { setAgentConnected((await sessionsApi.hostAgentStatus()).connected) }
    catch { setAgentConnected(false) }
  }, [])

  useEffect(() => {
    checkAgent()
    const t = setInterval(checkAgent, 5000)
    return () => clearInterval(t)
  }, [checkAgent])

  const load = async () => { await refreshSessions() }
  const startEdit = (s: Session) => { setEditingId(s.id); setEditValue(s.ig_username) }
  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) return
    setEditSaving(true)
    try { await sessionsApi.updateUsername(editingId, editValue.trim().replace(/^@/, '')); await load(); setEditingId(null) }
    catch (e: any) { alert(e?.response?.data?.detail ?? T.session.saveError) }
    finally { setEditSaving(false) }
  }

  const handleVerify = async (id: string) => {
    setVerifyStatus(p => ({ ...p, [id]: 'loading' }))
    const r = await sessionsApi.verify(id)
    setVerifyStatus(p => ({ ...p, [id]: r.valid }))
  }

  return (
    <div style={{
      marginBottom: 24,
      padding: 20,
      borderRadius: 18,
      background: 'var(--surface)',
      border: '1px solid rgba(99,102,241,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{T.session.title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
          <X size={14} />
        </button>
      </div>

      <AgentSetup lang={lang} T={T} setSessions={setSessions} agentConnected={agentConnected} />

      {sessions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="label" style={{ marginBottom: 10 }}>{T.session.saved}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 12,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === s.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>@</span>
                      <input
                        autoFocus value={editValue}
                        onChange={e => setEditValue(e.target.value.replace(/^@/, ''))}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                        style={{ background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 8, padding: '3px 8px', fontSize: 13, color: 'var(--text)', width: 140 }}
                      />
                      <button onClick={saveEdit} disabled={editSaving} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#fff' }}>
                        {editSaving ? <RefreshCw size={11} /> : <Check size={11} />}
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={11} /></button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>@{s.ig_username}</span>
                        {s.plan_b_active && <span className="tag" style={{ background: 'rgba(234,179,8,0.15)', color: '#FDE047' }}>Plan B</span>}
                        {verifyStatus[s.id] === 'loading' && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-3)' }} />}
                        {verifyStatus[s.id] === true  && <CheckCircle size={12} style={{ color: '#22C55E' }} />}
                        {verifyStatus[s.id] === false && <XCircle size={12} style={{ color: '#EF4444' }} />}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                        {new Date(s.created_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                      </span>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { icon: <Pencil size={12} />, onClick: () => startEdit(s), title: T.session.editUsername },
                    { icon: <RefreshCw size={12} />, onClick: () => handleVerify(s.id), title: T.session.validate },
                    {
                      icon: <span style={{ fontSize: 11, fontWeight: 700 }}>B</span>,
                      onClick: async () => { const u = await sessionsApi.togglePlanB(s.id); setSessions(sessions.map(x => x.id === s.id ? u : x)) },
                      title: s.plan_b_active ? T.session.planBOff : T.session.planBOn,
                      active: s.plan_b_active,
                    },
                    { icon: <Trash2 size={12} />, onClick: async () => { await sessionsApi.delete(s.id); await load() }, danger: true },
                  ].map((btn, i) => (
                    <button
                      key={i}
                      onClick={btn.onClick}
                      title={btn.title}
                      style={{
                        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                        background: (btn as any).active ? 'rgba(234,179,8,0.2)' : 'transparent',
                        color: (btn as any).active ? '#FDE047' : (btn as any).danger ? 'var(--text-3)' : 'var(--text-2)',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget
                        if ((btn as any).danger) { el.style.color = '#F87171'; el.style.background = 'rgba(239,68,68,0.1)' }
                        else if (!(btn as any).active) { el.style.color = 'var(--text)'; el.style.background = 'var(--bg)' }
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget
                        el.style.color = (btn as any).active ? '#FDE047' : (btn as any).danger ? 'var(--text-3)' : 'var(--text-2)'
                        el.style.background = (btn as any).active ? 'rgba(234,179,8,0.2)' : 'transparent'
                      }}
                    >
                      {btn.icon}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Agent Setup ── */
function AgentSetup({ lang, T, setSessions, agentConnected: initialConnected }: {
  lang: string; T: any; setSessions: (s: Session[]) => void; agentConnected: boolean | null
}) {
  const [agentConnected, setAgentConnected] = useState<boolean | null>(initialConnected)
  const [scanning, setScanning] = useState(false)
  const [logs,     setLogs]     = useState<LogLine[]>([])
  const [copied,   setCopied]   = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const esRef     = useRef<EventSource | null>(null)

  useEffect(() => { setAgentConnected(initialConnected) }, [initialConnected])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const addLog = (text: string, type: LogLine['type'] = 'info') =>
    setLogs(p => [...p, { text, type }])

  const handleScan = () => {
    if (scanning) return
    setLogs([]); setScanning(true)
    esRef.current?.close()
    const es = new EventSource('/api/sessions/scan-browser/stream')
    esRef.current = es
    es.addEventListener('log',   e => { const d = JSON.parse(e.data); addLog(d.msg) })
    es.addEventListener('error', e => { const d = JSON.parse((e as MessageEvent).data); addLog(d.msg, 'error'); es.close(); setScanning(false) })
    es.addEventListener('done',  e => { const d = JSON.parse(e.data); addLog(lang === 'en' ? '─── Done ───' : '─── Tamamlandı ───', 'done'); setSessions(d.sessions); es.close(); setScanning(false) })
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) return; addLog(T.session.disconnected, 'error'); es.close(); setScanning(false) }
  }

  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000) }

  return (
    <div style={{
      borderRadius: 14,
      border: agentConnected ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)',
      background: agentConnected ? 'rgba(34,197,94,0.04)' : 'var(--surface-2)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: agentConnected === false ? 16 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {agentConnected === null
            ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-3)' }} />
            : agentConnected
              ? <Wifi size={13} style={{ color: '#22C55E' }} />
              : <WifiOff size={13} style={{ color: 'var(--text-3)' }} />
          }
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            Host Agent{' '}
            <span style={{ color: agentConnected ? '#22C55E' : agentConnected === false ? 'var(--text-3)' : 'var(--text-3)', fontWeight: 400 }}>
              {agentConnected === null ? (lang === 'tr' ? 'kontrol ediliyor…' : 'checking…')
                : agentConnected ? (lang === 'tr' ? 'çalışıyor' : 'running')
                : (lang === 'tr' ? 'çalışmıyor' : 'not running')}
            </span>
          </span>
        </div>
        {agentConnected && (
          <button
            onClick={handleScan}
            disabled={scanning}
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: 12 }}
          >
            <ScanLine size={13} style={scanning ? { animation: 'pulse 1s infinite' } : {}} />
            {scanning ? T.session.scanning : T.session.scan}
          </button>
        )}
      </div>

      {agentConnected === false && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
            {lang === 'tr' ? 'Bir kez kur, sonra otomatik başlar:' : 'Install once — starts automatically:'}
          </p>
          <CodeLine cmd={INSTALL_CMD} id="install" copied={copied} onCopy={copy} />
          <CodeLine cmd={LAUNCH_CMD}  id="la"      copied={copied} onCopy={copy} />
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0' }}>
            {lang === 'tr' ? '— Sadece bu oturum için:' : '— For this session only:'}
          </p>
          <CodeLine cmd={AGENT_CMD}   id="agent"   copied={copied} onCopy={copy} />
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ marginTop: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            <Terminal size={11} style={{ color: 'var(--text-3)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{T.session.scanOutput}</span>
            {scanning && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />}
          </div>
          <div style={{ padding: 12, fontFamily: 'monospace', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto', background: '#050508' }}>
            {logs.map((l, i) => (
              <div key={i} style={{
                color: l.type === 'error' ? '#F87171'
                  : l.type === 'done' ? '#A78BFA'
                  : l.text.startsWith('✓') ? '#34D399'
                  : l.text.startsWith('✗') ? '#F87171'
                  : 'var(--text-2)',
              }}>{l.text}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}

function CodeLine({ cmd, id, copied, onCopy }: {
  cmd: string; id: string; copied: string | null; onCopy: (t: string, i: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '7px 10px', fontFamily: 'monospace', fontSize: 11,
    }}>
      <span style={{ color: '#34D399', userSelect: 'none' }}>$</span>
      <span style={{ flex: 1, color: 'var(--text)', userSelect: 'all' }}>{cmd}</span>
      <button onClick={() => onCopy(cmd, id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}>
        {copied === id ? <Check size={11} style={{ color: '#34D399' }} /> : <Copy size={11} />}
      </button>
    </div>
  )
}
