import { describe, it, expect } from 'vitest'
import tr from '../i18n/tr'
import en from '../i18n/en'

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
