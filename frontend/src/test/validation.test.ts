import { describe, expect, it } from 'vitest'
import { validateUsername } from '../lib/validation'

describe('validateUsername', () => {
  it.each(['john', '@john', '  john_doe.1  ', 'a'.repeat(30)])('accepts %j', raw => {
    expect(validateUsername(raw, 'tr').ok).toBe(true)
  })

  it('strips @ and trims', () => {
    expect(validateUsername(' @Jane.Doe ', 'en')).toEqual({ ok: true, value: 'Jane.Doe' })
  })

  it.each([['', 'Kullanıcı adını yaz.'], ['a b', 'harf, rakam'], ['x'.repeat(31), 'en fazla 30'], ['😀', 'harf, rakam']])(
    'rejects %j with a friendly Turkish message', (raw, fragment) => {
      const r = validateUsername(raw, 'tr')
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.message).toContain(fragment)
        expect(r.message).not.toMatch(/String must|Invalid|regex/i)   // ham teknik mesaj yok
      }
    })

  it('localises to English', () => {
    const r = validateUsername('a b', 'en')
    expect(!r.ok && r.message).toMatch(/letters, numbers/)
  })
})
