import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Gauge, Flame } from 'lucide-react'
import { riskApi, RiskKey, RiskProfileState } from '../api/risk'
import { useLang } from '../contexts/LangContext'
import { apiErrorMessage } from '../lib/problems'
import { useToast } from '../contexts/ToastContext'

interface Props {
  sessionId: string
  onChanged?: () => void
}

const STYLE: Record<RiskKey, { border: string; text: string; Icon: typeof Gauge }> = {
  safe:       { border: 'border-green-700', text: 'text-green-400', Icon: ShieldCheck },
  balanced:   { border: 'border-amber-600', text: 'text-amber-400', Icon: Gauge },
  aggressive: { border: 'border-red-700',   text: 'text-red-400',   Icon: Flame },
}

export default function RiskProfilePicker({ sessionId, onChanged }: Props) {
  const { T } = useLang()
  const R = T.riskProfile
  const [state, setState] = useState<RiskProfileState | null>(null)
  const [pending, setPending] = useState<RiskKey | null>(null)   // onay bekleyen agresif seçim
  const [ack, setAck] = useState(false)
  const toast = useToast()

  const load = useCallback(() => {
    if (sessionId) riskApi.get(sessionId).then(setState).catch(() => {})
  }, [sessionId])
  useEffect(load, [load])

  const apply = async (key: RiskKey, acknowledge = false) => {
    try {
      await riskApi.set(sessionId, key, acknowledge)
      setPending(null); setAck(false)
      load(); onChanged?.()
    } catch (e: any) {
      toast.error(apiErrorMessage(e, T, R.saveError))
    }
  }

  const choose = (key: RiskKey) => {
    if (state?.profile === key) return
    if (key === 'aggressive') { setPending(key); return }
    setPending(null); apply(key)
  }

  if (!state) return null
  return (
    <div className="mb-6">
      <div className="mb-2">
        <h2 className="text-sm font-medium">{R.title}</h2>
        <p className="text-xs text-gray-500">{R.intro}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {state.profiles.map(p => {
          const st = STYLE[p.key]
          const txt = R[p.key]
          const active = state.profile === p.key
          return (
            <button key={p.key} onClick={() => choose(p.key)}
              className={`text-left bg-gray-900 rounded-xl p-4 border transition-colors ${
                active ? st.border : 'border-gray-800 hover:border-gray-700'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${st.text}`}>
                  <st.Icon size={15} /> {txt.name}
                </span>
                {active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{R.active}</span>}
              </div>
              <p className="text-xs text-gray-400 mb-2">{txt.tagline}</p>
              <ul className="text-xs text-gray-300 space-y-0.5 mb-2">
                <li>{R.scan}: {p.scan_pages_per_hour} {R.pagesHour} · {p.scan_pages_per_day} {R.pagesDay} (~{p.scan_users_per_day.toLocaleString()} {R.usersDay})</li>
                <li>{R.delay}: {p.scan_delay[0]}-{p.scan_delay[1]} sn</li>
                <li>{R.cooldown}: {p.cooldown_minutes[0]} dk</li>
                <li>{R.actions}: {p.action_hourly}{R.perHour} · {p.action_daily}{R.perDay}</li>
                <li>{R.actionDelay}: {p.action_delay[0]}-{p.action_delay[1]} sn</li>
                <li>{R.interactions}: {p.interactions_max_posts}</li>
              </ul>
              <p className={`text-xs mb-1 ${p.key === 'aggressive' ? 'text-red-300' : 'text-gray-400'}`}>{txt.risk}</p>
              <p className="text-xs text-gray-500">{txt.best}</p>
            </button>
          )
        })}
      </div>

      {pending === 'aggressive' && (
        <div className="mt-3 bg-red-950/40 border border-red-800 rounded-xl p-4">
          <label className="flex items-start gap-2 text-xs text-red-200 cursor-pointer">
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5" />
            {R.ack}
          </label>
          <button disabled={!ack} onClick={() => apply('aggressive', true)}
            className="mt-3 px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 rounded-lg text-xs">
            {R.useAggressive}
          </button>
        </div>
      )}
    </div>
  )
}
