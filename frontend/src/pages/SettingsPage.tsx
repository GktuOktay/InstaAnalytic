import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ImportScanPanel from '../components/ImportScanPanel'
import RiskProfilePicker from '../components/RiskProfilePicker'
import DataStatusCard from '../components/DataStatusCard'
import BridgeStatusCard from '../components/BridgeStatusCard'
import ProblemNote from '../components/ProblemNote'
import { apiErrorMessage } from '../lib/problems'
import { sessionsApi, Session, BrowserCandidate } from '../api/sessions'
import { downloadCsv } from '../api/insights'
import { validateUsername } from '../lib/validation'
import { useSession } from '../contexts/SessionContext'
import { useLang } from '../contexts/LangContext'
import { useToast } from '../contexts/ToastContext'
import {
  ShieldCheck, Globe, Check, Copy, Trash2, Download, AlertTriangle, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'

const AGENT_CMD = 'bash start.sh'


function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="text-xs text-gray-500 mb-3">{desc}</p>}
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const { T } = useLang()
  const L = T.connect
  const S = T.safety
  const ST = T.settings
  const { sessions, loading, refresh } = useSession()
  const [showBrowser, setShowBrowser] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)          // içe aktarma / profil değişince durum kartı yenilensin

  const sel = sessions.find(s => s.id === selId) ?? sessions[0]
  const adding = showAdd || (!loading && sessions.length === 0)

  const onCreated = async (created?: Session) => {
    await refresh()
    if (created) setSelId(created.id)
    setShowAdd(false)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">{ST.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {ST.subtitle} <Link to="/start" className="text-purple-400 hover:underline">{T.wizard.openWizard}</Link>
      </p>

      {loading && sessions.length === 0 ? (
        <p className="text-gray-600 text-sm">{T.common.loading}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mb-6" role="tablist" aria-label={ST.profile}>
          {sessions.map(s => (
            <button key={s.id} role="tab" aria-selected={s.id === sel?.id} onClick={() => setSelId(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                s.id === sel?.id ? 'bg-purple-900/40 border-purple-500 text-purple-100' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
              @{s.ig_username}
            </button>
          ))}
          {sessions.length > 0 && (
            <button onClick={() => setShowAdd(v => !v)} aria-expanded={showAdd}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800">
              + {ST.addProfile}
            </button>
          )}
        </div>
      )}

      {adding && (
        <>
          <ZipCard onCreated={onCreated} />
          <div className="rounded-xl border border-gray-800 bg-gray-900 mb-8">
            <button onClick={() => setShowBrowser(v => !v)} aria-expanded={showBrowser}
              className="w-full flex items-center justify-between p-5 text-left">
              <span className="flex items-center gap-2 font-semibold text-sm">
                <Globe size={16} className="text-gray-400" /> {L.browserTitle}
              </span>
              {showBrowser ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showBrowser && <BrowserFlow onConnected={() => onCreated()} />}
          </div>
        </>
      )}

      {sel && (
        <>
          <Section title={ST.sectionData} desc={ST.sectionDataDesc}>
            <DataStatusCard sessionId={sel.id} refreshKey={tick} />
            <BridgeStatusCard sessionId={sel.id} />
            <ImportScanPanel sessionId={sel.id} show="zip" onImported={() => setTick(t => t + 1)} />
          </Section>

          <Section title={ST.sectionScan} desc={ST.sectionScanDesc}>
            {sel.source === 'zip' ? (
              <p className="text-sm text-gray-400 bg-gray-900 border border-gray-800 rounded-xl p-4">{ST.zipNoScan}</p>
            ) : (
              <>
                <ImportScanPanel sessionId={sel.id} show="budget" onImported={() => {}} />
                <RiskProfilePicker sessionId={sel.id} onChanged={() => setTick(t => t + 1)} />
              </>
            )}
          </Section>

          <Section title={ST.sectionSafety} desc={ST.sectionSafetyDesc}>
            <SessionCard s={sel} onChanged={async () => { await refresh(); setTick(t => t + 1) }} S={S} />
          </Section>
        </>
      )}
    </div>
  )
}

/* ── ZIP (önerilen) ─────────────────────────────────────────────────────── */

function ZipCard({ onCreated }: { onCreated: (s: Session) => Promise<void> }) {
  const { T, lang } = useLang()
  const L = T.connect
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)        // yalnızca alan doğrulaması
  const toast = useToast()
  const [done, setDone] = useState(false)

  const create = async () => {
    if (busy) return
    const v = validateUsername(username, lang)
    if (!v.ok) { setError(v.message); return }
    const u = v.value
    setBusy(true); setError(null)
    try {
      const created = await sessionsApi.createZipOnly(u)
      setDone(true)
      await onCreated(created)
    } catch (e: any) {
      toast.error(apiErrorMessage(e, T, T.session.saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-green-800/50 bg-green-950/20 p-5 mb-3">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-green-400" />
        <h2 className="font-semibold">{L.zipTitle}</h2>
        <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">{L.zipBadge}</span>
      </div>
      <p className="text-sm text-gray-400 mb-4">{L.zipDesc}</p>

      {done ? (
        <div className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3">
          <span className="text-sm text-green-300 flex items-center gap-2"><Check size={15} /> {L.zipNext}</span>
          <Link to="/followers" className="shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-semibold">
            {T.nav.followers} →
          </Link>
        </div>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-semibold">
          {L.zipCta}
        </button>
      ) : (
        <div>
          <label className="text-xs text-gray-400 block mb-1" htmlFor="ig-user">{L.zipUser}</label>
          <div className="flex gap-2">
            <div className="flex items-center flex-1 bg-gray-950 border border-gray-700 focus-within:border-purple-500 rounded-xl px-3">
              <span className="text-gray-500">@</span>
              <input
                id="ig-user" autoFocus value={username} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={e => setUsername(e.target.value.replace(/^@/, ''))}
                onKeyDown={e => e.key === 'Enter' && create()}
                className="flex-1 bg-transparent border-0 focus-visible:shadow-none py-2.5 px-1 text-sm focus:outline-none"
              />
            </div>
            <button onClick={create} disabled={busy || !username.trim()}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl text-sm font-semibold">
              {busy ? <RefreshCw size={15} className="animate-spin" /> : L.zipCreate}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-400 mt-2">{error}</p>}
        </div>
      )}
      <ZipHowTo />
    </div>
  )
}

function ZipHowTo() {
  const { T, lang } = useLang()
  const [open, setOpen] = useState(false)
  const steps = lang === 'en'
    ? ['Instagram → Profile → ☰ → Accounts Center', 'Your information and permissions → Download your information', 'Choose "Some of your information" → tick only "Followers and following"', 'Download to device · Date range: All time · Format: JSON', 'When the email arrives, download the ZIP and upload it as is (do not unzip)']
    : ['Instagram → Profil → ☰ → Hesap merkezi', 'Bilgilerin ve izinlerin → Bilgilerini indir', '"Bilgilerinin bir kısmı" → yalnızca "Takipçiler ve takip edilenler"', 'Cihaza indir · Tarih aralığı: Tüm zamanlar · Biçim: JSON', 'E-posta gelince ZIP\'i indir ve olduğu gibi yükle (açma)']
  return (
    <div className="mt-4">
      <button onClick={() => setOpen(v => !v)} className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2">
        {T.connect.zipHow}
      </button>
      {open && (
        <ol className="mt-2 text-sm text-gray-300 list-decimal pl-5 space-y-1">
          {steps.map(x => <li key={x}>{x}</li>)}
        </ol>
      )}
    </div>
  )
}

/* ── Tarayıcıdan bağlan (gelişmiş) ──────────────────────────────────────── */

function BrowserFlow({ onConnected }: { onConnected: () => Promise<void> }) {
  const { T } = useLang()
  const L = T.connect
  const [agent, setAgent] = useState<'checking' | 'off' | 'old' | 'ok'>('checking')
  const [browsers, setBrowsers] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [cands, setCands] = useState<BrowserCandidate[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const check = useCallback(async () => {
    try {
      setBrowsers(await sessionsApi.browsers())
      setAgent('ok')
    } catch (e: any) {
      setAgent(e?.response?.status === 409 ? 'old' : 'off')
    }
  }, [])

  useEffect(() => {
    check()
    const iv = setInterval(() => agent !== 'ok' && check(), 4000)
    return () => clearInterval(iv)
  }, [check, agent])

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const find = async () => {
    setBusy(true); setCands(null)
    try {
      const r = await sessionsApi.scanBrowsers(picked)
      setCands(r.candidates)
      setChosen(r.candidates.filter(c => !c.already_saved).map(c => c.candidate_id))
      setNotes(r.errors)
    } catch (e: any) {
      toast.error(apiErrorMessage(e, T, T.session.saveError))
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    setBusy(true)
    try {
      await sessionsApi.confirmBrowser(chosen)
      setCands(null); setPicked([])
      await onConnected()
    } catch (e: any) {
      toast.error(apiErrorMessage(e, T, T.session.saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-5 pb-5 border-t border-gray-800 pt-4">
      <p className="text-sm text-gray-400 mb-3">{L.browserDesc}</p>
      <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2 mb-4 flex gap-2">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {L.browserWarn}
      </p>

      {agent !== 'ok' ? (
        <div className="text-sm">
          <p className="text-gray-300 mb-2">{agent === 'old' ? L.agentOld : `${L.agentOff} ${L.agentOffHint}`}</p>
          <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 font-mono text-xs">
            <span className="text-green-400">$</span>
            <span className="flex-1 select-all">{AGENT_CMD}</span>
            <button
              aria-label="copy"
              onClick={() => { navigator.clipboard.writeText(AGENT_CMD); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="text-gray-500 hover:text-gray-300"
            >
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      ) : !cands ? (
        <>
          <p className="text-sm font-medium mb-2">{L.pickBrowsers}</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {browsers.map(b => (
              <label key={b} className={`cursor-pointer select-none px-3 py-1.5 rounded-lg border text-sm ${
                picked.includes(b) ? 'bg-purple-900/40 border-purple-500 text-purple-200' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                <input type="checkbox" className="sr-only" checked={picked.includes(b)} onChange={() => toggle(picked, setPicked, b)} />
                {b}
              </label>
            ))}
          </div>
          <button onClick={find} disabled={busy || picked.length === 0}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl text-sm font-semibold flex items-center gap-2">
            {busy && <RefreshCw size={14} className="animate-spin" />} {busy ? L.finding : L.find}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium mb-2">{L.foundTitle}</p>
          {cands.length === 0 && <p className="text-sm text-gray-400 mb-3">{L.noneFound}</p>}
          <div className="space-y-2 mb-3">
            {cands.map(c => (
              <label key={c.candidate_id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                c.already_saved ? 'border-gray-800 opacity-60' : 'border-gray-700 cursor-pointer hover:border-gray-500'}`}>
                <input type="checkbox" disabled={c.already_saved} checked={chosen.includes(c.candidate_id)}
                  onChange={() => toggle(chosen, setChosen, c.candidate_id)} />
                <span className="font-semibold">@{c.ig_username}</span>
                {c.full_name && <span className="text-sm text-gray-500">{c.full_name}</span>}
                <span className="ml-auto text-xs text-gray-500">{c.already_saved ? L.alreadySaved : c.browser}</span>
              </label>
            ))}
          </div>
          {notes.map(n => <p key={n} className="text-xs text-amber-400 mb-1 whitespace-pre-line">⚠ {n}</p>)}
          <p className="text-xs text-gray-500 mb-3">{L.expiresNote}</p>
          <div className="flex gap-2">
            <button onClick={connect} disabled={busy || chosen.length === 0}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl text-sm font-semibold">
              {L.connectSel}
            </button>
            <button onClick={() => setCands(null)} className="px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-gray-800">
              {T.common.cancel ?? '✕'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Kayıtlı profil kartı + güvenlik paneli ─────────────────────────────── */

function SessionCard({ s, onChanged, S }: { s: Session; onChanged: () => Promise<void>; S: any }) {
  const { T, lang } = useLang()
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const locale = lang === 'en' ? 'en-US' : 'tr-TR'
  const paused = s.paused_until && new Date(s.paused_until) > new Date()
  const isZip = s.source === 'zip'

  const run = async (fn: () => Promise<unknown>, after?: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); await (after ?? onChanged)() } catch (e: any) { toast.error(apiErrorMessage(e, T, T.problems.unknown.title)) } finally { setBusy(false) }
  }

  const toggleActions = () => {
    if (!s.allow_actions && !confirm(S.actionsConfirm)) return
    run(() => sessionsApi.setAllowActions(s.id, !s.allow_actions))
  }
  const purge = () => confirm(S.purgeConfirm) && run(() => sessionsApi.purge(s.id))
  const remove = () => run(() => sessionsApi.delete(s.id))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold">@{s.ig_username}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${isZip ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-300'}`}>
          {isZip ? 'ZIP' : (lang === 'en' ? 'Browser' : 'Tarayıcı')}
        </span>
        <button onClick={remove} disabled={busy} title={S.remove} aria-label={S.remove}
          className="ml-auto p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg">
          <Trash2 size={14} />
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {lang === 'en' ? 'Added' : 'Eklendi'}: {new Date(s.created_at).toLocaleDateString(locale)}
      </p>

      {paused && (
        <div className="mb-3">
          <ProblemNote raw={s.paused_reason}
            extra={`${S.paused} ${S.pausedUntil}: ${new Date(s.paused_until!).toLocaleString(locale)}`} />
        </div>
      )}

      <div className="border-t border-gray-800 pt-3">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">{S.title}</p>

        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-medium">{S.actionsLabel}</p>
            <p className="text-xs text-gray-500">{isZip ? S.zipOnly : s.allow_actions ? S.actionsOn : S.actionsOff}</p>
          </div>
          {!isZip && (
            <button onClick={toggleActions} disabled={busy} role="switch" aria-checked={s.allow_actions}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                s.allow_actions ? 'bg-amber-700 hover:bg-amber-600 text-amber-50' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'}`}>
              {s.allow_actions ? S.turnOff : S.turnOn}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => run(() => downloadCsv(`/sessions/${s.id}/export/relationships.csv`, 'takip-durumu.csv'))}
            disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs">
            <Download size={13} /> {S.exportCsv}
          </button>
          <button onClick={purge} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-300 hover:bg-red-950/40 border border-red-900/50">
            <Trash2 size={13} /> {S.purge}
          </button>
        </div>
      </div>
    </div>
  )
}
