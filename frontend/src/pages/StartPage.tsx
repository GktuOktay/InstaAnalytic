import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, ArrowLeft } from 'lucide-react'
import { sessionsApi } from '../api/sessions'
import { importApi, DataStatus } from '../api/imports'
import { validateUsername } from '../lib/validation'
import { compareCount, parseCount, loadWizard, saveWizard } from '../lib/wizard'
import { useSession } from '../contexts/SessionContext'
import { useLang } from '../contexts/LangContext'
import { apiErrorMessage } from '../lib/problems'
import { useToast } from '../contexts/ToastContext'
import ImportScanPanel from '../components/ImportScanPanel'

const INSTAGRAM_EXPORT_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/'

export default function StartPage() {
  const { T, lang } = useLang()
  const W = T.wizard
  const { sessions, loading, refresh } = useSession()
  const [{ step, sessionId }, setState] = useState(loadWizard)
  const go = (s: number, id: string | null = sessionId) => { setState({ step: s, sessionId: id }); saveWizard({ step: s, sessionId: id }) }

  const profile = sessions.find(s => s.id === sessionId) ?? null

  // Kayıtlı hesap varsa ve hiçbiri seçilmediyse ilkini seç, ilk adımı atla.
  useEffect(() => {
    if (!loading && !profile && sessions.length > 0 && step > 0) go(step, sessions[0].id)
    if (!loading && !profile && sessions.length === 0 && step > 0) go(0, null)
  }, [loading, profile, sessions, step]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">{W.title}</h1>
      <ol className="flex flex-wrap gap-x-5 gap-y-1 text-sm mb-8" aria-label={W.title}>
        {W.stepNames.map((n: string, i: number) => (
          <li key={n} aria-current={i === step ? 'step' : undefined}
            className={i === step ? 'font-semibold text-white' : i < step ? 'text-gray-400' : 'text-gray-600'}>
            {i < step ? <Check size={13} className="inline mr-1 -mt-0.5" /> : <span className="mr-1">{i + 1}.</span>}
            {n}
          </li>
        ))}
      </ol>

      {step === 0 && <StepAccount onDone={async s => { await refresh(); go(1, s) }} onPick={id => go(1, id)} />}
      {step === 1 && <StepRequest onReady={() => go(2)} onBack={() => go(0)} />}
      {step === 2 && profile && (
        <StepUpload sessionId={profile.id} onBack={() => go(1)} onDone={() => go(3)} />
      )}
      {step === 3 && profile && <StepVerify sessionId={profile.id} onRedo={() => go(1)} onBack={() => go(2)} />}

      <p className="text-xs text-gray-600 mt-10">
        <Link to="/settings" className="hover:underline">{T.nav.settings}</Link>
        {' · '}
        {lang === 'en' ? 'You can leave and come back; this page remembers where you were.' : 'İstediğin zaman çıkabilirsin, kaldığın yeri hatırlarım.'}
      </p>
    </div>
  )
}

/* 1. Hesap */
function StepAccount({ onDone, onPick }: { onDone: (id: string) => Promise<void>; onPick: (id: string) => void }) {
  const { T, lang } = useLang()
  const W = T.wizard
  const { sessions } = useSession()
  const [adding, setAdding] = useState(sessions.length === 0)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)        // yalnızca alan doğrulaması
  const toast = useToast()

  const create = async () => {
    if (busy) return
    const v = validateUsername(name, lang)
    if (!v.ok) { setError(v.message); return }
    setBusy(true); setError(null)
    try {
      const s = await sessionsApi.createZipOnly(v.value)
      await onDone(s.id)
    } catch (e: any) {
      toast.error(apiErrorMessage(e, T, T.session.saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{W.s1Title}</h2>
      <p className="text-sm text-gray-400 mb-5">{W.s1Text}</p>

      {sessions.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-gray-500 mb-2">{W.s1Existing}</p>
          <div className="flex flex-wrap gap-2">
            {sessions.map(s => (
              <button key={s.id} onClick={() => onPick(s.id)}
                className="px-3 py-1.5 rounded-lg border border-gray-700 hover:border-purple-500 text-sm">@{s.ig_username}</button>
            ))}
            {!adding && (
              <button onClick={() => setAdding(true)} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800">
                + {W.s1New}
              </button>
            )}
          </div>
        </div>
      )}

      {adding && (
        <div>
          <label htmlFor="wiz-user" className="text-xs text-gray-400 block mb-1">{W.s1Label}</label>
          <div className="flex gap-2">
            <div className="flex items-center flex-1 bg-gray-950 border border-gray-700 focus-within:border-purple-500 rounded-lg px-3">
              <span className="text-gray-500">@</span>
              <input id="wiz-user" autoFocus value={name} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={e => setName(e.target.value.replace(/^@/, ''))}
                onKeyDown={e => e.key === 'Enter' && create()}
                className="flex-1 bg-transparent border-0 focus-visible:shadow-none py-2.5 px-1 text-sm focus:outline-none" />
            </div>
            <button onClick={create} disabled={busy || !name.trim()}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-semibold">
              {W.s1Create}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-400 mt-2">{error}</p>}
        </div>
      )}
    </section>
  )
}

/* 2. Instagram'dan iste */
function StepRequest({ onReady, onBack }: { onReady: () => void; onBack: () => void }) {
  const { T } = useLang()
  const W = T.wizard
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{W.s2Title}</h2>
      <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-300 mb-4">
        {W.s2Steps.map((x: string) => <li key={x}>{x}</li>)}
      </ol>
      <p className="text-sm text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2 mb-5">{W.s2Warn}</p>
      <div className="flex flex-wrap items-center gap-3">
        <a href={INSTAGRAM_EXPORT_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-gray-700 hover:border-purple-500 rounded-lg text-sm">
          {W.s2Open} <ExternalLink size={13} />
        </a>
        <button onClick={onReady} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-semibold">{W.s2Ready}</button>
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 inline-flex items-center gap-1"><ArrowLeft size={13} /> {W.back}</button>
      </div>
      <p className="text-xs text-gray-500 mt-4">{W.s2Later}</p>
    </section>
  )
}

/* 3. Yükle */
function StepUpload({ sessionId, onDone, onBack }: { sessionId: string; onDone: () => void; onBack: () => void }) {
  const { T } = useLang()
  const W = T.wizard
  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{W.s3Title}</h2>
      <p className="text-sm text-gray-400 mb-4">{W.s3Text}</p>
      <ImportScanPanel sessionId={sessionId} show="zip" onImported={onDone} />
      <button onClick={onBack} className="mt-4 text-sm text-gray-500 hover:text-gray-300 inline-flex items-center gap-1"><ArrowLeft size={13} /> {W.back}</button>
    </section>
  )
}

/* 4. Sayıları karşılaştır */
function StepVerify({ sessionId, onRedo, onBack }: { sessionId: string; onRedo: () => void; onBack: () => void }) {
  const { T } = useLang()
  const W = T.wizard
  const [st, setSt] = useState<DataStatus | null>(null)
  const [fo, setFo] = useState('')
  const [fi, setFi] = useState('')

  useEffect(() => { importApi.dataStatus(sessionId).then(setSt).catch(() => {}) }, [sessionId])

  const vFo = useMemo(() => st ? compareCount(st.followers.count, parseCount(fo)) : { kind: 'unknown' as const }, [st, fo])
  const vFi = useMemo(() => st ? compareCount(st.following.count, parseCount(fi)) : { kind: 'unknown' as const }, [st, fi])
  const typed = parseCount(fo) !== null || parseCount(fi) !== null
  const bad = vFo.kind === 'missing'

  const msg = (v: typeof vFo, label: string) =>
    v.kind === 'ok' ? `${label}: ${W.okShort}`
    : v.kind === 'missing' ? W.missingMsg.replace('{n}', String(v.n))
    : v.kind === 'extra' ? W.extraMsg.replace('{n}', String(v.n)) : null

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{W.s4Title}</h2>
      <p className="text-sm text-gray-400 mb-4">{W.s4Text}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {([
          ['wiz-fo', W.followers, st?.followers.count, fo, setFo],
          ['wiz-fi', W.following, st?.following.count, fi, setFi],
        ] as const).map(([id, label, inFile, val, set]) => (
          <div key={id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <label htmlFor={id} className="text-xs text-gray-400 block mb-1">{label}</label>
            <p className="text-xs text-gray-500 mb-2">{W.inFile}: <b className="text-gray-300">{inFile ?? '…'}</b></p>
            <input id={id} inputMode="numeric" value={val} onChange={e => set(e.target.value)} placeholder={W.onInstagram}
              className="w-full rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>

      <div aria-live="polite" className="space-y-2 mb-5">
        {!typed && <p className="text-sm text-gray-500">{W.unknown}</p>}
        {[msg(vFo, W.followers), msg(vFi, W.following)].filter(Boolean).map(m => (
          <p key={m} className={`text-sm ${bad && m === msg(vFo, W.followers) ? 'text-amber-300' : 'text-gray-300'}`}>{m}</p>
        ))}
        {typed && vFo.kind !== 'missing' && vFi.kind !== 'extra' && vFo.kind !== 'unknown' && vFi.kind !== 'unknown' && (
          <p className="text-sm text-green-400">{W.okMsg}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {bad && (
          <button onClick={onRedo} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-semibold">{W.reRequest}</button>
        )}
        <Link to="/followers"
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold ${bad ? 'border border-gray-700 hover:border-gray-500' : 'bg-purple-600 hover:bg-purple-500'}`}>
          {W.finish}
        </Link>
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 inline-flex items-center gap-1"><ArrowLeft size={13} /> {W.back}</button>
      </div>
    </section>
  )
}
