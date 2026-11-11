import { useCallback, useEffect, useState } from 'react'
import { cleanupApi, type CleanupSettings } from '../../api/cleanup'
import { useLang } from '../../contexts/LangContext'
import EnableDialog from './EnableDialog'
import LimitsPanel from './LimitsPanel'
import { errorText } from './format'
import { Loader2 } from 'lucide-react'

/** Ayarlar sayfasındaki "Kaydedilen temizleme" anahtarı + salt okunur sınırlar paneli (AC-C3, U12, L6, U28). */
export default function CleanupSettingsCard({ sessionId }: { sessionId: string }) {
  const { T, lang } = useLang()
  const E = T.cleanup.enable
  const [settings, setSettings] = useState<CleanupSettings | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [worst, setWorst] = useState<{ hourly: number; daily: number } | null>(null)
  const [pending, setPending] = useState<boolean | null>(null)      // kayıt sürerken gösterilen konum
  const [dialog, setDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadFailed(false)
    cleanupApi.settings(sessionId).then(s => {
      setSettings(s)
      setWorst(s.account?.worst_case ?? null)
    }).catch(() => setLoadFailed(true))
  }, [sessionId])
  useEffect(() => { setSettings(null); load() }, [load])

  const save = async (enabled: boolean, ack?: boolean) => {
    setPending(enabled); setError(null)
    try {
      const s = await cleanupApi.setEnabled(sessionId, enabled, ack)
      setSettings(s)
      setDialog(false)
    } catch (e) {
      setError(errorText(T, e, E.saveFailed, lang).code === 'ack_required' ? T.cleanup.reason.ack_required : E.saveFailed)
    } finally {
      setPending(null)
    }
  }

  const enabled = settings?.saved.enabled ?? false
  const shown = pending ?? enabled
  const saving = pending !== null

  return (
    <div>
      <div className="card p-4">
        {loadFailed && !settings ? (
          <div role="alert" className="text-sm text-red-400 flex flex-wrap items-center gap-2">
            <span>{T.cleanup.settingsFailed}</span>
            <button type="button" className="btn-ghost" onClick={load}>{T.cleanup.retry}</button>
          </div>
        ) : !settings ? (
          <p role="status" className="text-sm" style={{ color: 'var(--text-3)' }}>{T.common.loading}</p>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p id="cleanup-switch-label" className="text-sm font-medium">{E.switchLabel}</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>{E.switchDesc}</p>
              {saving && <p role="status" className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--text-2)' }}><Loader2 size={12} className="animate-spin" /> {E.saving}</p>}
              {error && !dialog && <p role="alert" className="text-xs mt-1 text-red-400">{error}</p>}
            </div>
            <button
              type="button" role="switch" aria-checked={shown} aria-labelledby="cleanup-switch-label"
              disabled={saving}
              onClick={() => { if (!enabled) { setError(null); setDialog(true) } else save(false) }}
              className="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition-colors disabled:opacity-50"
              style={{ background: shown ? 'var(--accent)' : 'var(--surface-2)', borderColor: 'var(--border-2)' }}
            >
              <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: shown ? 'translateX(24px)' : 'translateX(4px)' }} />
            </button>
          </div>
        )}
      </div>

      {dialog && settings && (
        <EnableDialog
          collectionChoice={settings.saved.collection_choice_available} busy={saving} error={error}
          onCancel={() => { setDialog(false); setError(null) }} onConfirm={() => save(true, true)}
        />
      )}

      <LimitsPanel sessionId={sessionId} worstCase={worst} />
    </div>
  )
}
