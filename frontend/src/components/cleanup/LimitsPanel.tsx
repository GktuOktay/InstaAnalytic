import { useCallback, useEffect, useState } from 'react'
import { cleanupApi, type CleanupLimits } from '../../api/cleanup'
import { riskApi } from '../../api/risk'
import { useLang } from '../../contexts/LangContext'
import { fill } from '../../lib/text'

interface Props {
  sessionId: string
  /** Hesap toplamı en kötü durum (ayar yanıtından, sabit 95 / 460; AC-C25, CK-11). */
  worstCase?: { hourly: number; daily: number } | null
}

function at(o: unknown, path: string): unknown {
  let cur: unknown = o
  for (const k of path.split('.')) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[k]
    else return undefined
  }
  return cur
}
const num = (o: unknown, p: string): number | null => { const v = at(o, p); return typeof v === 'number' && Number.isFinite(v) ? v : null }
const show = (v: number | null): string => (v === null ? '-' : String(v))

/** Ek iş sınırları: salt okunur (AC-L6). Hiçbir giriş alanı yoktur; değerler ayar dosyasından gelir (§4.5). */
export default function LimitsPanel({ sessionId, worstCase }: Props) {
  const { T, lang } = useLang()
  const L = T.cleanup.limits
  const [limits, setLimits] = useState<CleanupLimits | null>(null)
  const [failed, setFailed] = useState(false)
  const [profile, setProfile] = useState<string | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    cleanupApi.limits().then(setLimits).catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    let alive = true
    riskApi.get(sessionId).then(r => { if (alive) setProfile(r.profile) }).catch(() => {})
    return () => { alive = false }
  }, [sessionId])

  const locale = lang === 'en' ? 'en-GB' : 'tr-TR'
  const clock = (iso: string | null) => {
    const d = iso ? new Date(iso) : null
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString(locale, { hour12: false }) : L.never
  }

  return (
    <section aria-label={L.title} className="card p-4 mt-4">
      <h3 className="font-semibold text-sm mb-1">{L.title}</h3>
      <p className="text-xs mb-3 font-semibold">{L.followNote}</p>
      {failed && !limits && (
        <div role="alert" className="text-sm text-red-400 flex flex-wrap items-center gap-2">
          <span>{L.loadFailed}</span>
          <button type="button" className="btn-ghost" onClick={load}>{T.cleanup.retry}</button>
        </div>
      )}
      {!limits && !failed && <p role="status" className="text-sm" style={{ color: 'var(--text-3)' }}>{T.common.loading}</p>}
      {limits && <LimitsBody limits={limits} worstCase={worstCase} profile={profile} clock={clock} />}
    </section>
  )
}

function LimitsBody({ limits, worstCase, profile, clock }: {
  limits: CleanupLimits; worstCase?: Props['worstCase']; profile: string | null; clock: (iso: string | null) => string
}) {
  const { T } = useLang()
  const L = T.cleanup.limits
  const eff = limits.effective
  const cap = (k: string) => { const c = limits.hard_caps[k]; return c && c.length > 1 ? fill(L.capMax, { n: c[1] }) : null }
  const profiles = Object.entries((at(eff, 'profiles') as Record<string, unknown>) ?? {})
  const isDefaults = limits.source !== 'file'
  const warnText = (w: CleanupLimits['warnings'][number]): string => {
    const vars = { key: w.key, value: w.value ?? '', used: w.used === undefined ? '' : String(w.used), code: w.code }
    switch (w.code) {
      case 'clamped': return fill(L.warnClamped, vars)
      case 'invalid': return fill(L.warnInvalid, vars)
      case 'missing': return fill(L.warnMissing, vars)
      case 'relational': return fill(L.warnRelational, vars)
      case 'ramp_disabled': return fill(L.warnRampOff, { ...vars, value: String(w.used ?? false) })
      default: return fill(L.warnOther, vars)
    }
  }

  return (
    <div className="text-sm space-y-3">
      {isDefaults ? (
        <p className="text-xs px-2 py-1 rounded-md inline-block bg-red-950/40 text-red-300 border border-red-900/60">{L.sourceDefaults}</p>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>{fill(L.sourceFile, { path: limits.path })}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left" style={{ color: 'var(--text-3)' }}>
              <th scope="col" className="py-1 pr-3 font-medium">{L.profile}</th>
              <th scope="col" className="py-1 pr-3 font-medium">{L.hourly}</th>
              <th scope="col" className="py-1 pr-3 font-medium">{L.daily}</th>
              <th scope="col" className="py-1 font-medium">{L.delay}</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(([name, v]) => {
              const sel = name === profile
              return (
                <tr key={name} className={sel ? 'font-semibold' : ''} style={sel ? { background: 'var(--accent-glow)' } : undefined}>
                  <th scope="row" className="py-1 pr-3 text-left font-inherit">{name}{sel && <span className="ml-1 font-normal" style={{ color: 'var(--text-3)' }}>({L.selected})</span>}</th>
                  <td className="py-1 pr-3">{show(num(v, 'unsave.hourly'))} <span style={{ color: 'var(--text-3)' }}>({cap('profiles.*.unsave.hourly')})</span></td>
                  <td className="py-1 pr-3">{show(num(v, 'unsave.daily'))} <span style={{ color: 'var(--text-3)' }}>({cap('profiles.*.unsave.daily')})</span></td>
                  <td className="py-1">{show(num(v, 'unsave.delay_min'))}-{show(num(v, 'unsave.delay_max'))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <dt className="font-medium">{L.accountTitle}</dt>
        <dd>{show(num(eff, 'account.hourly'))} / {show(num(eff, 'account.daily'))} <span style={{ color: 'var(--text-3)' }}>({cap('account.hourly')}, {cap('account.daily')})</span></dd>
        <dt className="font-medium">{L.rampTitle}</dt>
        <dd>
          {at(eff, 'ramp.enabled') === false ? L.rampOff : L.rampOn}
          {at(eff, 'ramp.enabled') !== false && (
            <> · {fill(L.rampLine, {
              h1: show(num(eff, 'ramp.first_hours')), f1: Math.round((num(eff, 'ramp.first_fraction') ?? 0) * 100),
              h2: show(num(eff, 'ramp.second_hours')), f2: Math.round((num(eff, 'ramp.second_fraction') ?? 0) * 100),
            })}</>
          )}
        </dd>
        <dt className="font-medium">{L.batchTitle}</dt>
        <dd>{fill(L.batchLine, { n: show(num(eff, 'batch.max_items')) })} <span style={{ color: 'var(--text-3)' }}>({cap('batch.max_items')})</span></dd>
        <dt className="font-medium">{L.scanTitle}</dt>
        <dd>{fill(L.scanLine, {
          a: show(num(eff, 'scan.page_delay_min')), b: show(num(eff, 'scan.page_delay_max')),
          pages: show(num(eff, 'scan.saved_max_pages')), per: show(num(eff, 'scan.max_per_hour')),
        })}</dd>
      </dl>

      {worstCase && <p className="text-xs">{fill(L.worstNote, { h: worstCase.hourly, d: worstCase.daily })}</p>}

      {(limits.warnings.length > 0 || (limits.unknown_count ?? 0) > 0) && (
        <div>
          <h4 className="text-xs font-semibold mb-1">{L.warnTitle}</h4>
          <ul className="list-disc pl-5 text-xs space-y-0.5 text-amber-400">
            {limits.warnings.map((w, i) => <li key={`${w.key}-${i}`}>{warnText(w)}</li>)}
            {(limits.unknown_count ?? 0) > 0 && <li>{fill(L.unknownKeys, { n: limits.unknown_count ?? 0 })}</li>}
          </ul>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        {fill(L.info, { read: clock(limits.loaded_at), changed: clock(limits.changed_at), hash: limits.sha256 ? limits.sha256.slice(0, 12) : L.never })}
      </p>
    </div>
  )
}
