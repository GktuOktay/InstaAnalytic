import { useEffect, useState, useRef } from 'react'
import { sessionsApi, Session } from '../api/sessions'
import { reportApi, InteractionReport } from '../api/report'
import { useLang } from '../contexts/LangContext'
import { Heart, MessageCircle, Users, TrendingUp, Star, Award, Loader2 } from 'lucide-react'

const IG = (sc: string) => `https://www.instagram.com/p/${sc}/`

/* ── Bar chart (SVG) ──────────────────────────────────────────── */
function BarChart({ data, lang }: { data: { month: string; total_likes: number; avg_likes: number; post_count: number }[]; lang: string }) {
  if (!data.length) return null
  const maxTotal = Math.max(...data.map(d => d.total_likes), 1)
  const maxAvg   = Math.max(...data.map(d => d.avg_likes), 1)
  const W = 720, H = 160, PAD_L = 40, PAD_B = 30, chartH = H - PAD_B
  const colW = (W - PAD_L) / data.length

  const MONTH_TR: Record<string, string> = {
    '01':'Oca','02':'Şub','03':'Mar','04':'Nis','05':'May','06':'Haz',
    '07':'Tem','08':'Ağu','09':'Eyl','10':'Eki','11':'Kas','12':'Ara',
  }
  const MONTH_EN: Record<string, string> = {
    '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
    '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec',
  }
  const label = (m: string) => {
    const [y, mo] = m.split('-')
    const map = lang === 'en' ? MONTH_EN : MONTH_TR
    return `${map[mo] ?? mo} ${y.slice(2)}`
  }

  // y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(t * maxTotal))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
      {/* grid */}
      {ticks.map(t => {
        const y = chartH - (t / maxTotal) * chartH
        return (
          <g key={t}>
            <line x1={PAD_L} x2={W} y1={y} y2={y} stroke="var(--c-border)" strokeWidth={0.5} />
            <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--c-muted)" fontFamily="inherit">
              {t > 999 ? `${(t/1000).toFixed(1)}k` : t}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const x = PAD_L + i * colW
        const bw = colW * 0.35
        const totalH = (d.total_likes / maxTotal) * chartH
        const avgH   = (d.avg_likes   / maxAvg)   * chartH * 0.7 // scale avg to 70% max for visual separation
        return (
          <g key={d.month}>
            {/* total bar */}
            <rect x={x + colW * 0.05} y={chartH - totalH} width={bw} height={totalH}
              rx={2} fill="var(--c-amber)" opacity={0.8} />
            {/* avg bar */}
            <rect x={x + colW * 0.05 + bw + 2} y={chartH - avgH} width={bw} height={avgH}
              rx={2} fill="var(--c-blue)" opacity={0.8} />
            {/* label */}
            {i % 2 === 0 || data.length <= 12 ? (
              <text x={x + colW / 2} y={H - 4} textAnchor="middle" fontSize={8.5}
                fill="var(--c-muted)" fontFamily="inherit">
                {label(d.month)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

/* ── Donut ──────────────────────────────────────────────────────── */
function Donut({ follower, outsider, label }: { follower: number; outsider: number; label: string }) {
  const total = follower + outsider || 1
  const pct = follower / total
  const R = 48, C = 60
  const circ = 2 * Math.PI * R
  const dash = pct * circ
  return (
    <svg width={120} height={120} viewBox={`0 0 ${C * 2} ${C * 2}`}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--c-surface2)" strokeWidth={14} />
      <circle cx={C} cy={C} r={R} fill="none"
        stroke="var(--c-teal)" strokeWidth={14}
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round" />
      <text x={C} y={C - 5} textAnchor="middle" fontSize={15} fontWeight="700"
        fill="var(--c-text)" fontFamily="inherit">
        %{Math.round(pct * 100)}
      </text>
      <text x={C} y={C + 11} textAnchor="middle" fontSize={8} fill="var(--c-muted)" fontFamily="inherit">
        {label}
      </text>
    </svg>
  )
}

/* ── Fan bar ────────────────────────────────────────────────────── */
function FanBar({ val, max }: { val: number; max: number }) {
  return (
    <div style={{ flex: 1, height: 4, background: 'var(--c-surface2)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${(val / max) * 100}%`, background: 'var(--c-amber)', borderRadius: 2 }} />
    </div>
  )
}

export default function ReportPage() {
  const { T, lang } = useLang()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sid, setSid] = useState('')
  const [report, setReport] = useState<InteractionReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    sessionsApi.list().then(s => {
      setSessions(s)
      if (s.length) setSid(s[0].id)
    })
  }, [])

  useEffect(() => {
    if (!sid) return
    setLoading(true); setError('')
    reportApi.interactions(sid)
      .then(setReport)
      .catch(() => setError(T.report.loadError))
      .finally(() => setLoading(false))
  }, [sid])

  const maxFanTotal = Math.max(...(report?.top_fans.map(f => f.total) ?? [1]))

  return (
    <div style={{ fontFamily: 'inherit',
      '--c-bg':       'transparent',
      '--c-surface':  'var(--surface)',
      '--c-surface2': 'var(--surface-2)',
      '--c-border':   'var(--border-2)',
      '--c-text':     'var(--text)',
      '--c-muted':    'var(--text-2)',
      '--c-soft':     'var(--text-3)',
      '--c-amber':    '#E09535',
      '--c-blue':     '#5B8FE0',
      '--c-teal':     '#3CC9A0',
    } as React.CSSProperties}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>
            {T.report.title}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>
            {T.report.subtitle}
          </p>
        </div>
        {sessions.length > 1 && (
          <select value={sid} onChange={e => setSid(e.target.value)}
            style={{ background: '#1A1E2B', border: '1px solid var(--c-border)', borderRadius: 8,
              color: 'var(--c-text)', padding: '6px 12px', fontSize: 13 }}>
            {sessions.map(s => <option key={s.id} value={s.id}>@{s.ig_username}</option>)}
          </select>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--c-muted)', padding: '40px 0' }}>
          <Loader2 size={18} className="animate-spin" /> {T.report.calculating}
        </div>
      )}
      {error && <p style={{ color: '#E05B6A' }}>{error}</p>}

      {report && (() => {
        const { kpi, monthly, follower_breakdown: fb, top_fans, top_posts, top_commenters } = report
        const totalFbLikes = fb.follower_likes + fb.outsider_likes || 1

        return (
          <>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              {[
                { label: T.report.kpi.likes,       val: kpi.total_likes.toLocaleString(),       sub: `${lang === 'en' ? 'Avg' : 'Ort'} ${kpi.avg_likes} / ${lang === 'en' ? 'post' : 'gönderi'}`, icon: <Heart size={14} color="var(--c-amber)" /> },
                { label: T.report.kpi.comments,    val: kpi.total_comments.toLocaleString(),    sub: `${lang === 'en' ? 'Avg' : 'Ort'} ${kpi.avg_comments} / ${lang === 'en' ? 'post' : 'gönderi'}`, icon: <MessageCircle size={14} color="var(--c-blue)" /> },
                { label: T.report.kpi.uniqueUsers, val: kpi.unique_interactors.toLocaleString(), sub: T.report.differentAccounts, icon: <Users size={14} color="var(--c-teal)" /> },
                { label: T.report.sections.topPosts, val: kpi.max_likes.toLocaleString(),       sub: T.report.maxLike, icon: <Star size={14} color="var(--c-amber)" /> },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    {c.icon}
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{c.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-soft)', marginTop: 5 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* Chart + Follower breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 10, marginBottom: 10 }}>
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 16 }}>
                  {T.report.sections.monthly}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <BarChart data={monthly} lang={lang} />
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                  {[['var(--c-amber)', T.report.kpi.likes], ['var(--c-blue)', T.report.kpi.avgLikes]].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-soft)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 16 }}>
                  {T.report.sections.breakdown}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <Donut follower={fb.follower_likes} outsider={fb.outsider_likes} label={T.report.follower} />
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: T.report.follower,    likes: fb.follower_likes, users: fb.follower_users, color: 'var(--c-teal)' },
                      { label: T.report.nonFollower, likes: fb.outsider_likes, users: fb.outsider_users, color: 'var(--c-amber)' },
                    ].map(r => (
                      <div key={r.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--c-soft)' }}>{r.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
                            {r.likes.toLocaleString()} like
                          </span>
                        </div>
                        <div style={{ height: 4, background: 'var(--c-surface2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(r.likes / totalFbLikes) * 100}%`, background: r.color, borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 3 }}>{r.users} {lang === 'en' ? 'people' : 'kişi'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Top fans + Top posts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {/* Fans */}
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Award size={13} color="var(--c-amber)" />
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
                    {T.report.sections.topFans}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {top_fans.map((f, i) => (
                    <div key={f.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: i < top_fans.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: i < 3 ? 'var(--c-amber)' : 'var(--c-muted)',
                        background: i < 3 ? 'rgba(224,149,53,.12)' : 'var(--c-surface2)',
                        width: 20, height: 20, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={`https://www.instagram.com/${f.username}/`} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)', textDecoration: 'none' }}>
                          @{f.username}
                        </a>
                        {f.full_name && <div style={{ fontSize: 11, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.full_name}</div>}
                      </div>
                      <FanBar val={f.total} max={maxFanTotal} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right' }}>{f.total}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Posts */}
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <TrendingUp size={13} color="var(--c-blue)" />
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
                    {T.report.sections.topPosts}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
                      <th style={{ textAlign: 'left', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>#</th>
                      <th style={{ textAlign: 'left', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>{T.report.date}</th>
                      <th style={{ textAlign: 'right', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>{T.report.like}</th>
                      <th style={{ textAlign: 'right', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>{T.report.comment}</th>
                      <th style={{ textAlign: 'right', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>{T.report.sync}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top_posts.map((p, i) => (
                      <tr key={p.shortcode} style={{ borderBottom: i < top_posts.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                        <td style={{ padding: '8px 0', color: i < 3 ? 'var(--c-amber)' : 'var(--c-muted)', fontWeight: 700, fontSize: 11 }}>{i + 1}</td>
                        <td style={{ padding: '8px 6px', color: 'var(--c-soft)', fontSize: 12 }}>
                          <a href={IG(p.shortcode)} target="_blank" rel="noreferrer"
                            style={{ color: 'var(--c-soft)', textDecoration: 'none' }}>
                            {p.taken_at ?? '—'}
                          </a>
                        </td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-text)', fontWeight: 600 }}>{p.like_count}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-soft)' }}>{p.comment_count || '—'}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right' }}>
                          <span style={{ fontSize: 11, color: 'var(--c-teal)', fontWeight: 600 }}>
                            %{p.like_count ? Math.round(p.synced_likes / p.like_count * 100) : 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Commenters */}
            {top_commenters.length > 0 && (
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 16 }}>
                  {T.report.sections.topCommenters}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {top_commenters.map(c => (
                    <div key={c.username} style={{ background: 'var(--c-surface2)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <a href={`https://www.instagram.com/${c.username}/`} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-blue)', textDecoration: 'none' }}>
                          @{c.username}
                        </a>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-amber)' }}>{c.comment_count}</span>
                      </div>
                      {c.sample_comments.slice(0, 2).map((s, i) => (
                        <p key={i} style={{ fontSize: 11, color: 'var(--c-muted)', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          "{s}"
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom insight bar */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 10,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '14px 20px' }}>
              {[
                { label: T.report.kpi.posts,   val: `${kpi.total_posts}${lang === 'en' ? '' : ' adet'}` },
                { label: T.report.kpi.synced,  val: `${kpi.synced_interactions.toLocaleString()}${lang === 'en' ? ' records' : ' kayıt'}` },
                { label: T.report.followerRate, val: `%${Math.round(fb.follower_likes / totalFbLikes * 100)}` },
                { label: T.report.commentRate,  val: `%${((kpi.total_comments / (kpi.total_likes || 1)) * 100).toFixed(2)}` },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginTop: 2 }}>{item.val}</div>
                </div>
              ))}
            </div>
          </>
        )
      })()}
    </div>
  )
}
