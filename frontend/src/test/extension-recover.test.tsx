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

  it('C21 cleanup kinds are not replayed after reload: a stored saved_unsave command is dropped, never run', async () => {
    sessionStorage.setItem('ia-pending-run', JSON.stringify({ kind: 'saved_unsave', opts: { session_id: 's1', batch_id: 7, run_seq: 1 }, at: Date.now() }))
    renderHook(() => useExtension())
    act(() => announce())
    await new Promise(r => setTimeout(r, 50))
    expect(posted.some(m => m.type === 'ia-run')).toBe(false)
  })

  it('C21 a cut-off bridge never reloads or stores a cleanup command (saved_scan, saved_unsave)', async () => {
    for (const kind of ['saved_scan', 'saved_unsave'] as const) {
      posted = []
      const { result, unmount } = renderHook(() => useExtension())
      act(() => announce())
      const p = result.current.run(kind, { session_id: 's1', batch_id: 7, run_seq: 2 })
      await waitFor(() => expect(posted.some(m => m.type === 'ia-run')).toBe(true))
      act(() => reply(posted.find(m => m.type === 'ia-run').id, { ok: false, error: 'Eklentiye ulaşılamadı. Sayfayı yenileyin.' }))
      expect((await p).ok).toBe(false)
      expect(reload).not.toHaveBeenCalled()
      expect(sessionStorage.getItem('ia-pending-run')).toBeNull()
      unmount()
    }
  })

  it('cleanup run carries session_id, batch_id and run_seq to the extension', async () => {
    const { result } = renderHook(() => useExtension())
    act(() => announce())
    const p = result.current.run('saved_unsave', { session_id: 's1', batch_id: 7, run_seq: 3 }, 2000)
    await waitFor(() => expect(posted.some(m => m.type === 'ia-run')).toBe(true))
    const m = posted.find(x => x.type === 'ia-run')
    expect(m.cmd).toEqual({ kind: 'saved_unsave', session_id: 's1', batch_id: 7, run_seq: 3 })
    act(() => reply(m.id, { ok: true }))
    expect((await p).ok).toBe(true)
  })

  it('currentJob asks the extension (ia-job) and returns the running job, or null when idle', async () => {
    const { result } = renderHook(() => useExtension())
    act(() => announce())
    const p = result.current.currentJob()
    await waitFor(() => expect(posted.filter(m => m.type === 'ia-job').length).toBeGreaterThan(0))
    const last = posted.filter(m => m.type === 'ia-job').pop()
    act(() => reply(last.id, { id: 'j', kind: 'actions', state: 'running' }))
    expect(await p).toMatchObject({ kind: 'actions', state: 'running' })
    const q = result.current.currentJob()
    await waitFor(() => expect(posted.filter(m => m.type === 'ia-job').length).toBeGreaterThan(1))
    act(() => reply(posted.filter(m => m.type === 'ia-job').pop().id, null))
    expect(await q).toBeNull()
  })
})
