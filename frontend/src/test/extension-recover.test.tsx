import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useExtension } from '../lib/extensionBridge'

const announce = () =>
  window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-ext', version: '2.6.5' }, origin: window.location.origin, source: window }))
const reply = (id: string, r: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-reply', id, reply: r }, origin: window.location.origin, source: window }))

let posted: any[] = []
let reload: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
  posted = []
  reload = vi.fn()
  vi.spyOn(window, 'postMessage').mockImplementation(((d: any) => { posted.push(d) }) as any)
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload, origin: window.location.origin } })
})
afterEach(() => { vi.restoreAllMocks() })

describe('useExtension — a page cut off by an extension reload heals itself', () => {
  it('"Sayfayı yenileyin" reply: reloads the page once and remembers the command', async () => {
    const { result } = renderHook(() => useExtension())
    act(() => announce())
    let out: any
    const p = act(async () => { out = result.current.run('actions') })
    await waitFor(() => expect(posted.some(m => m.type === 'ia-run')).toBe(true))
    act(() => reply(posted.find(m => m.type === 'ia-run').id, { ok: false, error: 'Eklentiye ulaşılamadı. Sayfayı yenileyin.' }))
    await p
    expect(await out).toEqual({ ok: false, error: 'reloading' })
    expect(reload).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sessionStorage.getItem('ia-pending-run')!)).toMatchObject({ kind: 'actions' })
  })

  it('does not reload again within a minute (no loop)', async () => {
    sessionStorage.setItem('ia-last-reload', String(Date.now()))
    const { result } = renderHook(() => useExtension())
    act(() => announce())
    const p = result.current.run('actions')
    await waitFor(() => expect(posted.some(m => m.type === 'ia-run')).toBe(true))
    act(() => reply(posted.find(m => m.type === 'ia-run').id, { ok: false, error: 'Eklentiye ulaşılamadı. Sayfayı yenileyin.' }))
    expect((await p).ok).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('on the reloaded page the remembered command runs by itself', async () => {
    sessionStorage.setItem('ia-pending-run', JSON.stringify({ kind: 'actions', opts: {}, at: Date.now() }))
    renderHook(() => useExtension())
    act(() => announce())
    await waitFor(() => expect(posted.filter(m => m.type === 'ia-run').length).toBe(1))
    expect(posted.find(m => m.type === 'ia-run').cmd).toEqual({ kind: 'actions' })
    expect(sessionStorage.getItem('ia-pending-run')).toBeNull()                    // bir kez çalışır
  })

  it('an old pending command is dropped', async () => {
    sessionStorage.setItem('ia-pending-run', JSON.stringify({ kind: 'actions', opts: {}, at: Date.now() - 120_000 }))
    renderHook(() => useExtension())
    act(() => announce())
    await new Promise(r => setTimeout(r, 50))
    expect(posted.some(m => m.type === 'ia-run')).toBe(false)
  })

  it('never reloads when the extension was never seen (not installed)', async () => {
    const { result } = renderHook(() => useExtension())
    vi.useFakeTimers()
    const p = result.current.run('posts')
    await vi.advanceTimersByTimeAsync(16_000)
    expect(await p).toEqual({ ok: false, error: 'timeout' })
    expect(reload).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
