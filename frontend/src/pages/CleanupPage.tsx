import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, RefreshCw, Search } from 'lucide-react'
import { insightsApi, downloadCsv, CleanupGroup, CleanupResponse, CleanupRow } from '../api/insights'
import BridgeStatusCard from '../components/BridgeStatusCard'
import { useSession } from '../contexts/SessionContext'
import { useLang } from '../contexts/LangContext'
import { fill } from '../lib/text'

const PAGE = 50
const GROUPS: CleanupGroup[] = ['ghost', 'one_way_silent', 'mutual_silent', 'silent_follower', 'one_way_engaged', 'occasional', 'loyal']

export default function CleanupPage() {
  const { T } = useLang()
  const L = T.cleanup
  const { sessions } = useSession()
  const [sid, setSid] = useState('')
  const [group, setGroup] = useState<CleanupGroup>('one_way_silent')
  const [q, setQ] = useState('')
  const [needle, setNeedle] = useState('')
  const [data, setData] = useState<CleanupResponse | null>(null)
  const [rows, setRows] = useState<CleanupRow[]>([])
  const [page, setPage] = useState(1)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const req = useRef(0)

  useEffect(() => {
    if (!sid) setSid(sessions[0]?.id ?? '')
  }, [sessions, sid])

  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = (p: number) => {
    if (!sid) return
    const my = ++req.current
    setLoading(true); setFailed(false)
    insightsApi.cleanup(sid, { group, q: needle || undefined, page: p, limit: PAGE })
      .then(res => {
        if (my !== req.current) return
        setData(res)
        setRows(prev => (p === 1 ? res.rows : [...prev, ...res.rows]))
        setPage(p)
      })
      .catch(() => { if (my === req.current) setFailed(true) })
      .finally(() => { if (my === req.current) setLoading(false) })
  }
  useEffect(() => load(1), [sid, group, needle])   // eslint-disable-line react-hooks/exhaustive-deps

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="mb-3">{T.followers.noSession}</p>
        <Link to="/settings" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-semibold text-sm">
          {T.followers.addSession}
        </Link>
      </div>
    )
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
          <button onClick={() => downloadCsv(`/sessions/${sid}/insights/cleanup.csv?group=${group}`, `gozden-cikar-${group}.csv`)}
            disabled={!data?.total_rows}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm">
            <Download size={14} /> {L.export}
          </button>
        </div>
      </div>

      {sid && <BridgeStatusCard sessionId={sid} />}

      {failed ? (
        <div className="text-center py-10 border border-dashed border-gray-800 rounded-xl text-sm text-gray-400">
          {T.followers.sessionError}{' '}
          <button onClick={() => load(1)} className="underline inline-flex items-center gap-1"><RefreshCw size={12} /> ↻</button>
        </div>
      ) : !data ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-12 rounded-xl bg-gray-900 animate-pulse" />)}
        </div>
      ) : data.scanned_posts === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-800 rounded-xl text-sm text-gray-400">
          <p className="mb-3 max-w-md mx-auto">{L.needData}</p>
          <Link to="/guide#kopru" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-semibold">{L.howTo} →</Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2">{fill(L.scanned, { n: data.scanned_posts, total: data.total_posts })}</p>
          {!data.enough_data && (
            <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2 mb-2">
              {fill(L.fewPosts, { n: data.scanned_posts, min: data.min_posts })}
            </p>
          )}
          <p className="text-xs text-gray-500 mb-4">
            {fill(L.listWarn, { n: data.followers_known })}{' '}
            <Link to="/settings" className="underline">{T.nav.settings}</Link>
          </p>

          <div className="flex flex-wrap gap-2 mb-2" role="tablist">
            {GROUPS.map(g => (
              <button key={g} role="tab" aria-selected={group === g} onClick={() => setGroup(g)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${group === g ? 'bg-purple-900/40 border-purple-500 text-purple-100' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                {L.groups[g]} <span className="text-xs opacity-70">{data.counts[g] ?? 0}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-400 mb-1">{L.groupHelp[group]}</p>
          <p className="text-xs text-gray-500 mb-3">{L.reviewNote}</p>

          <label className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-2 mb-3 max-w-xs">
            <Search size={14} className="text-gray-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={L.search} aria-label={L.search}
              className="bg-transparent py-1.5 text-sm focus:outline-none w-full" />
          </label>

          {rows.length === 0 && !loading ? (
            <p className="text-sm text-gray-500 py-8 text-center">{L.empty}</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(r => <Line key={r.ig_user_id} r={r} />)}
              {rows.length < data.total_rows && (
                <button onClick={() => load(page + 1)} disabled={loading}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-900 rounded-lg disabled:opacity-40">
                  {L.more} ({data.total_rows - rows.length})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Line({ r }: { r: CleanupRow }) {
  const { T, lang } = useLang()
  const L = T.cleanup
  const last = r.last_engaged_at ? new Date(r.last_engaged_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR') : null
  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <a href={`https://www.instagram.com/${r.username}/`} target="_blank" rel="noreferrer noopener"
          className="font-medium truncate hover:underline">@{r.username}</a>
        {r.full_name && <span className="text-xs text-gray-500 ml-2 truncate">{r.full_name}</span>}
        <p className="text-xs text-gray-500">
          {r.posts_engaged ? fill(L.engaged, { n: r.posts_engaged }) : L.never}
          {r.posts_engaged > 0 && ` · ${r.likes} ${T.fans.likes} · ${r.comments} ${T.fans.comments}`}
          {last && ` · ${L.lastAt} ${last}`}
        </p>
      </div>
      <div className="hidden sm:flex gap-1.5 text-xs">
        {r.i_follow && <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{L.iFollow}</span>}
        {r.follows_me && <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{L.follows}</span>}
      </div>
    </div>
  )
}
