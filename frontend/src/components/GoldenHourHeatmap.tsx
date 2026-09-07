import { useEffect, useState } from 'react'
import { analysisApi, GoldenHourSlot } from '../api/analysis'
import { useLang } from '../contexts/LangContext'

interface Props { sessionId: string }

function buildGrid(slots: GoldenHourSlot[]) {
  const grid: Record<string, GoldenHourSlot> = {}
  for (const s of slots) grid[`${s.day_of_week}-${s.hour}`] = s
  return grid
}

function cellStyle(ratio: number): React.CSSProperties {
  if (ratio <= 0) return { background: 'var(--surface-2)', border: '1px solid var(--border)' }
  if (ratio >= 0.8) return { background: '#6366F1', border: '1px solid #818CF8' }
  if (ratio >= 0.55) return { background: '#3730A3', border: '1px solid #4338CA' }
  if (ratio >= 0.3)  return { background: '#1E1B4B', border: '1px solid #312E81' }
  return { background: 'var(--surface-2)', border: '1px solid var(--border)', opacity: 0.6 }
}

export default function GoldenHourHeatmap({ sessionId }: Props) {
  const { T } = useLang()
  const t = T.goldenHour
  const [slots, setSlots] = useState<GoldenHourSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ slot: GoldenHourSlot; x: number; y: number } | null>(null)

  useEffect(() => {
    setLoading(true)
    analysisApi.goldenHour(sessionId)
      .then(r => setSlots(r.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return null
  if (slots.length === 0) return null

  const maxEng = Math.max(...slots.map(s => s.avg_engagement), 1)
  const grid = buildGrid(slots)
  const top3 = [...slots].sort((a, b) => b.avg_engagement - a.avg_engagement).slice(0, 3)
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const days = [0, 1, 2, 3, 4, 5, 6]
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

  return (
    <div style={{
      marginTop: 12,
      padding: '16px 18px',
      borderRadius: 16,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
            {t.title}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: 'var(--text-3)' }}>
          {[['#6366F1', t.best], ['#3730A3', t.good], ['var(--surface-2)', t.low]].map(([c, l]) => (
            <span key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c as string, border: '1px solid var(--border-2)', display: 'inline-block' }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Top 3 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {top3.map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: '9px 12px', borderRadius: 10,
            background: i === 0 ? 'rgba(99,102,241,0.08)' : 'var(--surface-2)',
            border: `1px solid ${i === 0 ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
          }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>
              {['🥇', '🥈', '🥉'][i]} {t.days[s.day_of_week]} {hourLabel(s.hour)}
            </p>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em' }}>
              {s.avg_engagement.toFixed(1)}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
              {t.avgEng} · {s.post_count} {t.posts}
            </p>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 640 }}>
          {/* Hour labels */}
          <div style={{ display: 'flex', marginLeft: 32, marginBottom: 4, gap: 2 }}>
            {hours.filter(h => h % 3 === 0).map(h => (
              <div key={h} style={{ flex: 3, fontSize: 9, color: 'var(--text-3)' }}>
                {String(h).padStart(2, '0')}
              </div>
            ))}
          </div>

          {days.map(d => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
              <div style={{ width: 30, fontSize: 10, color: 'var(--text-3)', flexShrink: 0, textAlign: 'right', paddingRight: 6 }}>
                {t.days[d]}
              </div>
              {hours.map(h => {
                const slot = grid[`${d}-${h}`]
                const ratio = slot ? slot.avg_engagement / maxEng : 0
                return (
                  <div
                    key={h}
                    style={{
                      flex: 1, height: 20, borderRadius: 3,
                      cursor: slot ? 'default' : undefined,
                      transition: 'opacity 0.1s',
                      ...cellStyle(ratio),
                    }}
                    onMouseEnter={e => { if (slot) setTooltip({ slot, x: e.clientX, y: e.clientY }) }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed', zIndex: 50, pointerEvents: 'none',
          left: tooltip.x + 10, top: tooltip.y - 56,
          background: 'var(--surface-2)', border: '1px solid var(--border-2)',
          borderRadius: 8, padding: '7px 10px', fontSize: 11,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
            {t.days[tooltip.slot.day_of_week]} {hourLabel(tooltip.slot.hour)}
          </p>
          <p style={{ color: '#A5B4FC' }}>
            {t.avgEng}: <strong>{tooltip.slot.avg_engagement.toFixed(1)}</strong>
          </p>
          <p style={{ color: 'var(--text-3)' }}>{tooltip.slot.post_count} {t.posts}</p>
        </div>
      )}
    </div>
  )
}
