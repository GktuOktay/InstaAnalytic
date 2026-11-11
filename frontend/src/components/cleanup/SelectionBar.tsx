import { useLang } from '../../contexts/LangContext'
import { fill } from '../../lib/text'

export interface SelectionBarProps {
  mode: 'refs' | 'filter'
  selected: number
  inView: number
  matches: number            // filtreye uyan seçilebilir gönderi sayısı (M)
  excluded: number
  max: number
  atCap: boolean
  exclAtCap: boolean
  blockedReason: string | null   // etkin parti vb.: sebep metni
  staleScan: boolean
  notice: string | null
  onPage: () => void
  onAll: () => void
  onClear: () => void
  onPreview: () => void
}

const fmt = (n: number, lang: string) => n.toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR')

/** Yapışkan seçim çubuğu (§4.4): sayaç, iki modun metni, temizle, önizle; pasiflik sebepleri yazılıdır (AC-U19, U17). */
export default function SelectionBar(p: SelectionBarProps) {
  const { T, lang } = useLang()
  const S = T.cleanup.saved
  const disabled = p.blockedReason !== null
  const previewOff = p.selected === 0 || disabled || p.staleScan
  return (
    <div role="group" aria-label={S.selectionBar} className="sticky top-0 z-10 card p-3 mb-3 space-y-2" style={{ background: 'var(--surface)' }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{fill(S.count, { n: fmt(p.selected, lang) })}</span>
        {p.mode === 'refs'
          ? <span className="text-xs" style={{ color: 'var(--text-2)' }}>({fill(S.inView, { n: p.inView })})</span>
          : (
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
              {fill(S.filterAll, { m: fmt(p.matches, lang) })}{p.excluded > 0 && ` (${fill(S.excluded, { x: fmt(p.excluded, lang) })})`}
            </span>
          )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={p.onPage} disabled={disabled}>{S.pageBtn}</button>
        <button type="button" className="btn-ghost" onClick={p.onAll} disabled={disabled || p.mode === 'filter' || p.matches === 0}>
          {fill(S.allBtn, { m: fmt(p.matches, lang) })}
        </button>
        <button type="button" className="btn-ghost" onClick={p.onClear} disabled={p.selected === 0 && p.mode === 'refs'}>{S.clear}</button>
        <button type="button" className="btn-primary" onClick={p.onPreview} disabled={previewOff}>{fill(S.preview, { n: p.selected })}</button>
      </div>
      <div className="text-xs space-y-0.5" style={{ color: 'var(--text-2)' }}>
        {disabled && <p>{p.blockedReason}</p>}
        {!disabled && p.selected === 0 && <p>{S.needOne}</p>}
        {p.atCap && <p>{fill(S.cap, { max: p.max })}</p>}
        {p.exclAtCap && <p>{fill(S.exclCap, { n: 5000 })}</p>}
      </div>
      {p.notice && <p role="status" className="text-xs px-2 py-1 rounded bg-amber-950/30 text-amber-300">{p.notice}</p>}
    </div>
  )
}
