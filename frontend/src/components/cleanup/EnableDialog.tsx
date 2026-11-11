import { useState } from 'react'
import Dialog from './Dialog'
import { useLang } from '../../contexts/LangContext'

interface Props {
  /** `settings.saved.collection_choice_available`: true -> W metni, false -> F metni (§4.3). */
  collectionChoice: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

/** Açma diyaloğu (CK-10, §4.3): onay kutusu işaretlenmeden "Aç" pasiftir (AC-C3). */
export default function EnableDialog({ collectionChoice, busy, error, onCancel, onConfirm }: Props) {
  const { T } = useLang()
  const E = T.cleanup.enable
  const [ack, setAck] = useState(false)
  return (
    <Dialog title={E.title} onClose={onCancel} busy={busy}>
      <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>{E.intro}</p>
      <ul className="list-disc pl-5 space-y-2 text-sm mb-4">
        <li>{collectionChoice ? E.bulletW : E.bulletF}</li>
        <li>{E.bulletUndo}</li>
        <li>{E.bulletConfirm}</li>
        <li>{E.bulletRisk}</li>
      </ul>
      <label className="flex items-start gap-2 text-sm mb-4 cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={ack} onChange={e => setAck(e.target.checked)} />
        <span>{E.ack}</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>{E.cancel}</button>
        <button type="button" className="btn-primary" onClick={onConfirm} disabled={!ack || busy}>{E.turnOn}</button>
      </div>
    </Dialog>
  )
}
