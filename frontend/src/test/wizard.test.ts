import { describe, expect, it } from 'vitest'
import { compareCount, parseCount } from '../lib/wizard'

describe('compareCount', () => {
  it('accepts small differences (deleted accounts)', () => {
    expect(compareCount(94, 94)).toEqual({ kind: 'ok' })
    expect(compareCount(830, 840)).toEqual({ kind: 'ok' })
    expect(compareCount(10, 12)).toEqual({ kind: 'ok' })
  })
  it('flags a file that is missing many followers', () => {
    expect(compareCount(94, 858)).toEqual({ kind: 'missing', n: 764 })
  })
  it('flags extra entries', () => {
    expect(compareCount(947, 830)).toEqual({ kind: 'extra', n: 117 })
  })
  it('stays quiet without a number', () => {
    expect(compareCount(94, null)).toEqual({ kind: 'unknown' })
  })
})

describe('parseCount', () => {
  it('reads thousands separators and rejects junk', () => {
    expect(parseCount('1.234')).toBe(1234)
    expect(parseCount('1,234')).toBe(1234)
    expect(parseCount(' 858 ')).toBe(858)
    expect(parseCount('')).toBeNull()
    expect(parseCount('12 bin')).toBeNull()
  })
})
