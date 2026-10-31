import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, RefreshCw, Search, TrendingDown, TrendingUp, Minus, Sparkles } from 'lucide-react'
import { insightsApi, downloadCsv, FansResponse, FanRow } from '../api/insights'
import { useSession } from '../contexts/SessionContext'
import { useLang } from '../contexts/LangContext'

const PAGE = 50
type Tier = 'all' | FanRow['tier']

const TREND_ICON = { warming: TrendingUp, cooling: TrendingDown, steady: Minus, new: Sparkles }
const TREND_COLOR = { warming: 'text-green-400', cooling: 'text-red-400', steady: 'text-gray-500', new: 'text-purple-300' }

export default function FansPage() {
  const { T } = useLang()
  const L = T.fans
  const { sessions } = useSession()
  const [sid, setSid] = useState('')
  const [data, setData] = useState<FansResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tier, setTier] = useState<Tier>('all')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    if (!sid) setSid(sessions.find(s => s.source === 'browser')?.id ?? sessions[0]?.id ?? '')
  }, [sessions, sid])

  const load = () => {
    if (!sid) return
    setLoading(true); setFailed(false)
    insightsApi.fans(sid).then(setData).catch(() => setFailed(true)).finally(() => setLoading(false))
  }
  useEffect(load, [sid])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [tier, q, sid])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.fans ?? []).filter(f => (tier === 'all' || f.tier === tier) && (!needle || f.username.toLowerCase().includes(needle)))
  }, [data, tier, q])

  if (sessions.length === 0) {
    return <Empty text={T.followers.noSession} cta={T.followers.addSession} />
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">{L.title}</h1>
          <p className="text-sm text-gray-500">{L.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <select value={sid} onChange={e => setSid(e.target.value)} aria-label="profil"
              className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm">
              {sessions.map(s => <option key={s.id} value={s.id}>@{s.ig_username}</option>)}
            </select>
          )}
          <button onClick={() => downloadCsv(`/sessions/${sid}/insights/fans.csv`, 'etkilesim-skorlari.csv')}
            disabled={!data?.fans.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm">
            <Download size={14} /> {L.export}
          </button>
        </div>
      </div>

      {!data && !failed ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-12 rounded-xl bg-gray-900 animate-pulse" />)}
        </div>
      ) : failed ? (
        <div className="text-center py-10 border border-dashed border-gray-800 rounded-xl text-sm text-gray-400">
          {T.followers.sessionError}{' '}
          <button onClick={load} className="underline inline-flex items-center gap-1"><RefreshCw size={12} /> ↻</button>
        </div>
      ) : !data ? null : data.scanned_posts === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-800 rounded-xl text-sm text-gray-400">
          <p className="mb-3">{L.needScan}</p>
          <Link to="/posts" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-semibold">{T.nav.posts} →</Link>
        </div>
      ) : (
        <>
          {!data.enough_data && (
            <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2 mb-3">{L.fewPosts}</p>
          )}
          <p className="text-xs text-gray-500 mb-3">{data.scanned_posts} / {data.total_posts} {L.scanned}</p>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {(['all', 'super', 'active', 'occasional', 'silent'] as Tier[]).map(t => (
              <button key={t} onClick={() => setTier(t)} aria-pressed={tier === t}
                className={`px-3 py-1.5 rounded-lg text-sm border ${tier === t ? 'bg-purple-900/40 border-purple-500 text-purple-100' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                {L.tiers[t]}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-2">
              <Search size={14} className="text-gray-500" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={L.search} aria-label={L.search}
                className="bg-transparent py-1.5 text-sm focus:outline-none w-36" />
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{L.empty}</p>
          ) : (
            <div className="space-y-1.5">
              {rows.slice(0, shown).map(f => <FanLine key={f.ig_user_id} f={f} />)}
              {shown < rows.length && (
                <button onClick={() => setShown(n => n + PAGE)}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-900 rounded-lg">
                  +{Math.min(PAGE, rows.length - shown)} / {rows.length - shown}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FanLine({ f }: { f: FanRow }) {
  const { T } = useLang()
  const L = T.fans
  const Trend = TREND_ICON[f.trend]
  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5">
      <div className="w-10 text-center">
        <span className="text-lg font-bold leading-none">{f.score}</span>
        <div className="h-1 bg-gray-800 rounded mt-1"><div className="h-1 bg-purple-500 rounded" style={{ width: `${f.score}%` }} /></div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">@{f.username}</p>
        <p className="text-xs text-gray-500">
          {f.likes} {L.likes} · {f.comments} {L.comments} · %{f.engagement_rate} {L.colRate.toLowerCase()}
        </p>
      </div>
      <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{L.tiers[f.tier]}</span>
      <span className={`flex items-center gap-1 text-xs w-24 ${TREND_COLOR[f.trend]}`}><Trend size={13} /> {L.trends[f.trend]}</span>
      <span className="text-xs w-16 text-right text-gray-500">{f.follows_me ? L.yes : L.no}</span>
    </div>
  )
}

function Empty({ text, cta }: { text: string; cta: string }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <p className="mb-3">{text}</p>
      <Link to="/session" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-semibold text-sm">{cta}</Link>
    </div>
  )
}
