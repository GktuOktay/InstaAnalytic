import { useEffect, useRef, useState } from 'react'
import { reportApi, InteractionReport } from '../api/report'
import { useLang } from '../contexts/LangContext'

interface Props { sessionId: string }

export default function DashboardCharts({ sessionId }: Props) {
  const { lang } = useLang()
  const [report, setReport] = useState<InteractionReport | null>(null)

  useEffect(() => {
    reportApi.interactions(sessionId).then(setReport).catch(() => {})
  }, [sessionId])

  if (!report) return null

  const { monthly, follower_breakdown, top_fans, kpi } = report
  const hasMonthly   = monthly.length > 1 && monthly.some(m => m.total_likes > 0)
  const hasBreakdown = follower_breakdown.follower_likes + follower_breakdown.outsider_likes > 0
  const hasFans      = top_fans.length > 0

  if (!hasMonthly && !hasBreakdown && !hasFans) return null

  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(hasMonthly || hasBreakdown) && (
        <div style={{ display: 'grid', gridTemplateColumns: hasMonthly && hasBreakdown ? '1fr 220px' : '1fr', gap: 12 }}>
          {hasMonthly   && <MonthlyArea monthly={monthly} lang={lang} />}
          {hasBreakdown && <FollowerDonut breakdown={follower_breakdown} lang={lang} />}
        </div>
      )}
      {hasFans && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TopFansCard fans={top_fans.slice(0, 5)} lang={lang} />
          <KpiMini kpi={kpi} lang={lang} />
        </div>
      )}
    </div>
  )
}

/* ─── Monthly area chart ───────────────────────────────── */
function MonthlyArea({ monthly, lang }: { monthly: InteractionReport['monthly']; lang: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const last  = monthly.slice(-8)
  const vals  = last.map(m => m.total_likes)
  const max   = Math.max(...vals, 1)

  const VW = 500, VH = 100, PB = 22, PX = 8
  const chartH = VH - PB

  const x = (i: number) => PX + (i / (last.length - 1)) * (VW - PX * 2)
  const y = (v: number) => PB + (1 - v / max) * (chartH - PB)

  const pts = last.map((m, i) => ({ x: x(i), y: y(m.total_likes) }))

  const linePath = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`
    const prev = pts[i - 1]
    const cx   = (prev.x + p.x) / 2
    return `${acc} C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`
  }, '')

  const areaPath = `${linePath} L${pts[pts.length - 1].x},${VH - PB} L${pts[0].x},${VH - PB} Z`

  const fmtM = (s: string) =>
    new Date(s + '-01').toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' })

  const tickEvery = last.length > 5 ? 2 : 1

  return (
    <Card title={lang === 'tr' ? 'Aylık Like Trendi' : 'Monthly Likes'} accent="#818CF8">
      <div ref={containerRef}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', pointerEvents: 'all' }}
        >
          <defs>
            <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#818CF8" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#818CF8" stopOpacity="0"   />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75, 1].map(t => (
            <line key={t}
              x1={PX} y1={PB + (1 - t) * (chartH - PB)}
              x2={VW - PX} y2={PB + (1 - t) * (chartH - PB)}
              stroke="var(--border)" strokeWidth={0.7}
            />
          ))}

          <path d={areaPath} fill="url(#ag)" />
          <path d={linePath} fill="none" stroke="#818CF8" strokeWidth={1.6}
            strokeLinecap="round" strokeLinejoin="round" />

          {pts.map((p, i) => {
            const isHov = hovered === i
            const isLast = i === pts.length - 1
            const labelVal = vals[i].toLocaleString()
            const labelW = Math.max(labelVal.length * 6 + 14, 34)
            const labelX = Math.min(Math.max(p.x, labelW / 2 + 2), VW - labelW / 2 - 2)
            const labelY = p.y > 28 ? p.y - 18 : p.y + 22

            return (
              <g key={i}>
                {/* Invisible hit area */}
                <rect
                  x={p.x - 20} y={0} width={40} height={VH - PB}
                  fill="transparent"
                  style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
                <circle cx={p.x} cy={p.y}
                  r={isHov ? 4 : isLast ? 3 : 2.5}
                  fill={isHov || isLast ? '#818CF8' : 'var(--surface)'}
                  stroke="#818CF8" strokeWidth={1.4}
                  style={{ transition: 'r 0.1s' }}
                />
                {/* Vertical guide on hover */}
                {isHov && (
                  <line x1={p.x} y1={PB} x2={p.x} y2={VH - PB}
                    stroke="#818CF8" strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.4} />
                )}
                {i % tickEvery === 0 && (
                  <text x={p.x} y={VH - 4} textAnchor="middle"
                    fontSize={9} fill={isHov ? '#818CF8' : 'var(--text-3)'}>
                    {fmtM(last[i].month)}
                  </text>
                )}
                {/* Tooltip badge on hover or last point */}
                {(isHov || isLast) && (
                  <g>
                    <rect
                      x={labelX - labelW / 2} y={labelY - 11} width={labelW} height={14}
                      rx={4}
                      fill={isHov ? '#818CF8' : '#818CF8'}
                      fillOpacity={isHov ? 0.9 : 0.15}
                    />
                    <text x={labelX} y={labelY - 1} textAnchor="middle"
                      fontSize={9} fontWeight="700"
                      fill={isHov ? '#fff' : '#818CF8'}>
                      {labelVal}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </Card>
  )
}

/* ─── Follower donut ───────────────────────────────────── */
function FollowerDonut({ breakdown, lang }: { breakdown: InteractionReport['follower_breakdown']; lang: string }) {
  const total = breakdown.follower_likes + breakdown.outsider_likes
  const pct   = total ? breakdown.follower_likes / total : 0
  const R = 40, CX = 52, CY = 52, SW = 10
  const C = 2 * Math.PI * R

  return (
    <Card title={lang === 'tr' ? 'Like Kaynağı' : 'Audience'} accent="#6366F1">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <svg viewBox="0 0 104 104" style={{ width: '100%', maxWidth: 120, display: 'block' }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border-2)" strokeWidth={SW} />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#818CF8"
            strokeWidth={SW}
            strokeDasharray={`${pct * C} ${C}`}
            transform={`rotate(-90 ${CX} ${CY})`}
            strokeLinecap="round" />
          <text x={CX} y={CY - 5} textAnchor="middle"
            fontSize={16} fontWeight="700" fill="var(--text)">
            {Math.round(pct * 100)}%
          </text>
          <text x={CX} y={CY + 12} textAnchor="middle"
            fontSize={8} fill="var(--text-3)">
            {lang === 'tr' ? 'takipçi' : 'followers'}
          </text>
        </svg>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MiniBar color="#818CF8" label={lang === 'tr' ? 'Takipçi'   : 'Follower'}     value={breakdown.follower_likes}  total={total} />
          <MiniBar color="#4F46E5" label={lang === 'tr' ? 'Dışarıdan' : 'Non-follower'} value={breakdown.outsider_likes} total={total} />
        </div>
      </div>
    </Card>
  )
}

function MiniBar({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total ? (value / total) * 100 : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }} />
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{value.toLocaleString()}</span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: 'var(--border-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

/* ─── Top fans ─────────────────────────────────────────── */
function TopFansCard({ fans, lang }: { fans: InteractionReport['top_fans']; lang: string }) {
  const max = fans[0]?.total ?? 1
  return (
    <Card title={lang === 'tr' ? 'En İyi Hayranlar' : 'Top Fans'} accent="#FBBF24">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fans.map((f, i) => (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i === 0 ? 'rgba(251,191,36,0.15)' : 'var(--surface-2)',
                fontSize: 9, fontWeight: 700,
                color: i === 0 ? '#FBBF24' : 'var(--text-3)',
              }}>
                {i + 1}
              </div>
              <a href={`https://www.instagram.com/${f.username}/`} target="_blank" rel="noreferrer"
                style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                @{f.username}
              </a>
              <span style={{ fontSize: 11, fontWeight: 600, color: i === 0 ? '#FBBF24' : 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {f.total.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 3, background: 'var(--border-2)', overflow: 'hidden', marginLeft: 30 }}>
              <div style={{
                height: '100%', width: `${(f.total / max) * 100}%`, borderRadius: 3,
                background: i === 0 ? 'linear-gradient(90deg, #F59E0B, #FBBF24)' : 'linear-gradient(90deg, #4F46E5, #818CF8)',
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ─── KPI mini ─────────────────────────────────────────── */
function KpiMini({ kpi, lang }: { kpi: InteractionReport['kpi']; lang: string }) {
  const items = [
    { label: lang === 'tr' ? 'Ort. Like'    : 'Avg Likes',    value: kpi.avg_likes.toFixed(1),    color: '#818CF8' },
    { label: lang === 'tr' ? 'Ort. Yorum'   : 'Avg Comments', value: kpi.avg_comments.toFixed(1), color: '#34D399' },
    { label: lang === 'tr' ? 'Benzersiz Kişi': 'Unique',       value: kpi.unique_interactors.toLocaleString(), color: '#60A5FA' },
    { label: lang === 'tr' ? 'En Yüksek'    : 'Peak Likes',   value: kpi.max_likes.toLocaleString(), color: '#FBBF24' },
  ]
  return (
    <Card title={lang === 'tr' ? 'İçerik Metrikleri' : 'Metrics'} accent="#34D399">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {items.map(it => (
          <div key={it.label} style={{
            padding: '14px 14px', borderRadius: 12,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', bottom: -12, right: -12,
              width: 44, height: 44, borderRadius: '50%',
              background: `${it.color}10`, pointerEvents: 'none',
            }} />
            <p style={{ fontSize: 20, fontWeight: 700, color: it.color, lineHeight: 1, letterSpacing: '-0.03em' }}>
              {it.value}
            </p>
            <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{it.label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ─── Card wrapper ─────────────────────────────────────── */
function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      padding: '20px 22px',
      borderRadius: 18,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      transition: 'box-shadow 0.2s, border-color 0.2s',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)'
      if (accent) (e.currentTarget as HTMLElement).style.borderColor = `${accent}33`
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'
      ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        {accent && <span style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />}
        <p style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {title}
        </p>
      </div>
      {children}
    </div>
  )
}
