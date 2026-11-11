import { describe, it, expect } from 'vitest'
import tr from '../i18n/tr'
import en from '../i18n/en'
import { CLEANUP_CODES } from '../api/cleanup'

type Dict = Record<string, unknown>

function flatten(o: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else if (typeof v === 'function') out[key] = String((v as (...a: any[]) => unknown)(...Array(4).fill(1)))   // şablon fonksiyonu: örnek değerle
    else if (Array.isArray(v)) v.forEach((x, i) => Object.assign(out, flatten({ [i]: x } as Dict, key)))
    else if (v && typeof v === 'object') Object.assign(out, flatten(v as Dict, key))
  }
  return out
}

const TR = flatten(tr as unknown as Dict)
const EN = flatten(en as unknown as Dict)

describe('i18n: Turkish mode is fully Turkish, English mode fully English', () => {
  it('both dictionaries have exactly the same keys', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(TR).sort())
  })

  it('English strings contain no Turkish letters', () => {
    // Dil seçici etiketleri kendi dilinde yazılır (Türkçe / English)
    const allowed = new Set(['lang.tr'])
    const bad = Object.entries(EN).filter(([k, v]) => !allowed.has(k) && /[çğıöşüÇĞİÖŞÜ]/.test(v))
    expect(bad.map(([k]) => k)).toEqual([])
  })

  it('no English entry is left identical to Turkish for ordinary sentences', () => {
    // Çevrilmemiş bırakılmış cümleleri yakalar (tek kelimeler, markalar ve sayılar hariç)
    const brands = new Set(['session.planB', 'goldenHour.title'])   // özel adlar iki dilde aynıdır
    const same = Object.keys(TR).filter(k => !brands.has(k) && TR[k] === EN[k] && /\s/.test(TR[k]) && /[a-zA-Z]{4,}/.test(TR[k]))
    expect(same).toEqual([])
  })
})

describe('i18n: cleanup reason codes (SPEC-001 §7.9.5)', () => {
  it('U26 cleanup reason codes defined in tr and en: every code of §7.9 has a non-empty text in both languages', () => {
    expect(CLEANUP_CODES.length).toBeGreaterThan(40)
    const missing = CLEANUP_CODES.filter(c => !TR[`cleanup.reason.${c}`] || !EN[`cleanup.reason.${c}`])
    expect(missing).toEqual([])
  })

  it('U26 both languages use the same placeholders for every reason text', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    const diff = CLEANUP_CODES.filter(c => ph(TR[`cleanup.reason.${c}`] ?? '') !== ph(EN[`cleanup.reason.${c}`] ?? ''))
    expect(diff).toEqual([])
  })

  it('U26 no reason text mixes languages: the English reason table has no Turkish letters', () => {
    const badEn = CLEANUP_CODES.filter(c => /[çğıöşüÇĞİÖŞÜ]/.test(EN[`cleanup.reason.${c}`] ?? ''))
    expect(badEn).toEqual([])
  })
})
