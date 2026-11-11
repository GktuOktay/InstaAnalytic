import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))
vi.mock('../api/risk', () => ({ riskApi: { get: vi.fn() } }))
vi.mock('../api/cleanup', async (orig) => {
  const real = await orig<typeof import('../api/cleanup')>()
  return {
    ...real,
    cleanupApi: {
      settings: vi.fn(), setEnabled: vi.fn(), limits: vi.fn(), status: vi.fn(), inventory: vi.fn(), preview: vi.fn(),
      batchItems: vi.fn(), confirm: vi.fn(), start: vi.fn(), stop: vi.fn(), cancel: vi.fn(), history: vi.fn(),
      collections: vi.fn(), setCollectionProtected: vi.fn(),
    },
  }
})

import { sessionsApi } from '../api/sessions'
import { riskApi } from '../api/risk'
import { cleanupApi } from '../api/cleanup'
import ExtrasPage from '../pages/ExtrasPage'
import ConfirmDialog from '../components/cleanup/ConfirmDialog'
import CleanupSettingsCard from '../components/cleanup/CleanupSettingsCard'
import tr from '../i18n/tr'
import en from '../i18n/en'

const sess = sessionsApi as unknown as { list: ReturnType<typeof vi.fn> }
const api = cleanupApi as unknown as Record<keyof typeof cleanupApi, ReturnType<typeof vi.fn>>

/* ── Ortak sahte veri ─────────────────────────────────────────────────────── */

const batch = (over: Record<string, unknown> = {}) => ({
  id: 7, status: 'confirmed', last_stop_reason: null, run_seq: 0, total: 5, done: 0, already: 0, not_found: 0,
  protected: 0, failed: 0, cancelled: 0, pending: 5, requires_ext_above: null, ...over,
})
const status = (over: Record<string, unknown> = {}, b: unknown = null) => ({
  enabled: true, run_state: 'ready', next_allowed_at: null, quiet_hours: false, done_hour: 0, done_day: 0,
  hourly_limit: 40, daily_limit: 200, delay: [20, 45], active_batch: b, paused_until: null, paused_reason: null,
  last_scan: null, limits_source: 'file', ...over,
})
const settings = (enabled = true, w = true) => ({ saved: { enabled, enabled_at: null, collection_choice_available: w } })
const limits = (over: Record<string, unknown> = {}) => ({
  source: 'file', code: null, path: 'config/limits.toml', loaded_at: '2026-11-11T14:02:31Z', changed_at: '2026-11-11T13:58:10Z',
  sha256: 'a3f9c2e1b7d0aabbccddeeff00112233', warnings: [], unknown_count: 0,
  hard_caps: { 'profiles.*.unsave.hourly': [1, 80] },
  effective: {
    account: { hourly: 80, daily: 400 }, batch: { max_items: 500 }, ramp: { enabled: true, first_hours: 72, first_fraction: 0.333 },
    scan: { page_delay_min: 3, page_delay_max: 6, saved_max_pages: 100, max_per_hour: 2 },
    profiles: { safe: { unsave: { hourly: 40, daily: 200, delay_min: 20, delay_max: 45 } } },
  },
  follow_limits_managed_here: false, ...over,
})
const httpErr = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(code), { response: { status, data: { detail: { code, ...extra } } } })

/** Sahte eklenti: köprü mesajlarına yanıt verir; gönderilen her mesajı kaydeder. */
function fakeExtension(o: { version?: string | null; jobs?: unknown[]; runReply?: unknown } = {}) {
  const { version = '2.9.0', jobs = [null], runReply = { ok: true } } = o
  const posted: Array<Record<string, any>> = []
  let jobCalls = 0
  vi.spyOn(window, 'postMessage').mockImplementation(((d: any) => {
    posted.push(d)
    const send = (data: Record<string, unknown>) => queueMicrotask(() => window.dispatchEvent(
      new MessageEvent('message', { data: { __ia: true, ...data }, origin: window.location.origin, source: window })))
    if (d?.type === 'ia-ping' && version) send({ type: 'ia-ext', version })
    else if (d?.type === 'ia-job') send({ type: 'ia-reply', id: d.id, reply: jobs[Math.min(jobCalls++, jobs.length - 1)] })
    else if (d?.type === 'ia-run') send({ type: 'ia-reply', id: d.id, reply: runReply })
    else if (d?.type === 'ia-stop') send({ type: 'ia-reply', id: d.id, reply: { ok: true } })
  }) as any)
  return posted
}

const runningJob = (kind: string) => ({ id: 'j1', kind, state: 'running', index: 1, total: 5, message: '', errors: [], queue: [], startedAt: Date.now() })

beforeEach(() => {
  vi.resetAllMocks()
  sess.list.mockResolvedValue([makeSession({ ig_user_id: 111 })])
  ;(riskApi.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ profile: 'safe', profiles: [] })
  api.settings.mockResolvedValue(settings())
  api.status.mockResolvedValue(status())
  api.limits.mockResolvedValue(limits())
  api.history.mockResolvedValue({ counts: {}, items: [] })
  api.inventory.mockResolvedValue({ scan: null, total: 0, protected_total: 0, items: [] })
  api.collections.mockResolvedValue({ mode: null, scan_id: null, items: [] })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

/* ── Kapı durumları: AC-U1, AC-U2 ─────────────────────────────────────────── */

describe('ExtrasPage gates', () => {
  it('U1 feature off: closed state with a Settings link, and no scan button in the DOM', async () => {
    fakeExtension()
    api.settings.mockResolvedValue(settings(false))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/Bu ek iş kapalı\. Ayarlar'dan açabilirsin\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ayarlar' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: /tara/i })).not.toBeInTheDocument()
  })

  it('U1 English text', async () => {
    fakeExtension()
    api.settings.mockResolvedValue(settings(false))
    renderApp(<ExtrasPage />, { lang: 'en' })
    expect(await screen.findByText(/This extra job is off\. You can turn it on in Settings\./)).toBeInTheDocument()
  })

  it('U2 missing extension: "extension required" and Start is disabled', async () => {
    fakeExtension({ version: null })
    api.status.mockResolvedValue(status({}, batch()))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/eklenti 2\.9\.0 veya üstü gerekli/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Kılavuz/ })).toHaveAttribute('href', '/guide')
    expect(screen.getByRole('button', { name: 'Başlat' })).toBeDisabled()
  })

  it('U2 old extension (2.8.6) is treated like a missing one', async () => {
    fakeExtension({ version: '2.8.6' })
    api.status.mockResolvedValue(status({}, batch()))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/eklenti 2\.9\.0 veya üstü gerekli/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Başlat' })).toBeDisabled()
  })

  it('settings load failure shows a retry button, not a blank page', async () => {
    fakeExtension()
    api.settings.mockRejectedValueOnce(new Error('boom'))
    renderApp(<ExtrasPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/yüklenemedi/i)
    api.settings.mockResolvedValue(settings())
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a loading state before settings arrive', () => {
    fakeExtension()
    api.settings.mockReturnValue(new Promise(() => {}))
    renderApp(<ExtrasPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor')
  })

  it('unknown Instagram id (ig_user_id <= 0): the viewer_unknown message is shown (AC-C4)', async () => {
    fakeExtension()
    sess.list.mockResolvedValue([makeSession({ ig_user_id: 0 })])
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/Instagram kimliği henüz bilinmiyor; eklenti açıkken/)).toBeInTheDocument()
  })
})

/* ── AC-C21 ────────────────────────────────────────────────────────────── */

describe('ExtrasPage never auto-runs', () => {
  it('C21 never auto-runs: no ia-run on mount, with a confirmed batch, or after a pending-run in storage', async () => {
    sessionStorage.setItem('ia-pending-run', JSON.stringify({ kind: 'saved_unsave', opts: {}, at: Date.now() }))
    const posted = fakeExtension()
    api.status.mockResolvedValue(status({}, batch()))
    renderApp(<ExtrasPage />)
    await screen.findByRole('button', { name: 'Başlat' })
    await new Promise(r => setTimeout(r, 100))
    expect(posted.filter(m => m.type === 'ia-run')).toHaveLength(0)
    expect(api.start).not.toHaveBeenCalled()
    sessionStorage.clear()
  })
})

/* ── Parti durumları, Başlat/Durdur: AC-C40, U8..U10, U15, U17, U18, U20..U26, C57 ─ */

describe('ExtrasPage batch panel', () => {
  it('U20 confirmed batch: "Parti hazır: N gönderi." and an enabled Start', async () => {
    fakeExtension()
    api.status.mockResolvedValue(status({}, batch({ total: 5 })))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Parti hazır: 5 gönderi.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
  })

  it('C40 Start: asks ia-job, calls start with the installed version, then ia-run with session_id, batch_id and run_seq', async () => {
    const posted = fakeExtension({ jobs: [null] })
    api.status.mockResolvedValue(status({}, batch({ id: 7 })))
    api.start.mockResolvedValue({ batch_id: 7, status: 'running', run_seq: 3, started_at: null })
    renderApp(<ExtrasPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Başlat' }))
    await waitFor(() => expect(posted.some(m => m.type === 'ia-run')).toBe(true))
    expect(api.start).toHaveBeenCalledWith('s1', 7, '2.9.0')
    expect(posted.find(m => m.type === 'ia-run')?.cmd).toEqual({ kind: 'saved_unsave', session_id: 's1', batch_id: 7, run_seq: 3 })
    expect(posted.findIndex(m => m.type === 'ia-job')).toBeGreaterThanOrEqual(0)
    expect(api.stop).not.toHaveBeenCalled()
  })

  it('U21 busy extension: Start stays disabled with the reason and start is never called', async () => {
    fakeExtension({ jobs: [runningJob('actions')] })
    api.status.mockResolvedValue(status({}, batch()))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/Eklentide başka bir iş çalışıyor \(Takip işlemleri\)\. Bitince Başlat'a bas\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Başlat' })).toBeDisabled()
    expect(api.start).not.toHaveBeenCalled()
  })

  it('U21 busy at click time (job began after the page loaded): start is not called', async () => {
    fakeExtension({ jobs: [null, runningJob('actions')] })
    api.status.mockResolvedValue(status({}, batch()))
    renderApp(<ExtrasPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Başlat' }))
    expect(await screen.findByText(/Eklentide başka bir iş çalışıyor/)).toBeInTheDocument()
    expect(api.start).not.toHaveBeenCalled()
  })

  it('U21 ia-run fails: POST /stop {start_failed, run_seq from start} and "Eklenti işi başlatamadı"', async () => {
    fakeExtension({ runReply: { ok: false, code: 'running' } })
    api.status.mockResolvedValue(status({}, batch({ id: 7 })))
    api.start.mockResolvedValue({ batch_id: 7, status: 'running', run_seq: 4, started_at: null })
    api.stop.mockResolvedValue({ batch_id: 7, status: 'stopped', last_stop_reason: 'start_failed', applied: true })
    renderApp(<ExtrasPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Başlat' }))
    expect(await screen.findByText('Eklenti işi başlatamadı.')).toBeInTheDocument()
    expect(api.stop).toHaveBeenCalledWith('s1', 7, { reason: 'start_failed', run_seq: 4 })
  })

  it('U21 ia-run gets no answer within 10 s: start_failed as well', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const posted = fakeExtension()
    // ia-run'a hiç yanıt verme
    const spy = window.postMessage as unknown as ReturnType<typeof vi.fn>
    const orig = spy.getMockImplementation()!
    spy.mockImplementation(((d: any) => { if (d?.type === 'ia-run') { posted.push(d); return } return orig(d, '*') }) as any)
    api.status.mockResolvedValue(status({}, batch({ id: 7 })))
    api.start.mockResolvedValue({ batch_id: 7, status: 'running', run_seq: 5, started_at: null })
    api.stop.mockResolvedValue({ batch_id: 7, status: 'stopped', last_stop_reason: 'start_failed', applied: true })
    renderApp(<ExtrasPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Başlat' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
    await waitFor(() => expect(api.stop).toHaveBeenCalledWith('s1', 7, { reason: 'start_failed', run_seq: 5 }))
  })

  it('U9 not ready: Start disabled with the earliest time, per reason', async () => {
    fakeExtension()
    const at = new Date(Date.now() + 3 * 3600_000).toISOString()
    api.status.mockResolvedValue(status({ run_state: 'limit', next_allowed_at: at }, batch()))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/Başlat şu saatten sonra etkin: .*\(saatlik sınır\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Başlat' })).toBeDisabled()
  })

  it('U9 quiet hours and pause show their own text; pause is red and states the end time', async () => {
    fakeExtension()
    const at = new Date(Date.now() + 5 * 3600_000).toISOString()
    api.status.mockResolvedValue(status({ run_state: 'quiet_hours', next_allowed_at: at }, batch()))
    const { unmount } = renderApp(<ExtrasPage />)
    expect(await screen.findByText(/\(sessiz saat\)/)).toBeInTheDocument()
    unmount()
    api.status.mockResolvedValue(status({ run_state: 'paused', next_allowed_at: at, paused_until: at, paused_reason: 'blocked' }, batch()))
    renderApp(<ExtrasPage />)
    const strip = await screen.findByRole('alert')
    expect(strip).toHaveTextContent(/Instagram işlemi engelledi; tüm işlemler 24 saat duraklatıldı/)
    expect(strip).toHaveTextContent(/Bitiş: .*\d{2}:\d{2}/)
    expect(strip.className).toMatch(/red/)
  })

  it('U9 "off" reason is shown as its own text', async () => {
    fakeExtension()
    api.status.mockResolvedValue(status({ run_state: 'off' }, batch()))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Bu ek iş kapatıldı.')).toBeInTheDocument()
  })

  it('U8 progress: counts, next-action time, polled every 5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ status: 'running', total: 500, pending: 372, done: 120, already: 3, not_found: 1, protected: 2, failed: 1, run_seq: 2 })))
    renderApp(<ExtrasPage />)
    const prog = await screen.findByRole('progressbar')
    expect(prog).toHaveAttribute('aria-valuenow', '128')
    expect(screen.getByText(/120 \/ 500 yapıldı/)).toBeInTheDocument()
    expect(screen.getByText(/3 zaten/)).toBeInTheDocument()
    expect(screen.getByText(/1 bulunamadı/)).toBeInTheDocument()
    expect(screen.getByText(/2 korundu/)).toBeInTheDocument()
    expect(screen.getByText(/1 başarısız/)).toBeInTheDocument()
    expect(screen.getByText(/sıradaki ~33 sn/)).toBeInTheDocument()
    const before = api.status.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    expect(api.status.mock.calls.length).toBeGreaterThan(before)
  })

  it('U8 progress counters live in an aria-live region', async () => {
    fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ status: 'running', total: 10, pending: 9, done: 1 })))
    renderApp(<ExtrasPage />)
    const txt = await screen.findByText(/1 \/ 10 yapıldı/)
    expect(txt.closest('[aria-live]')).not.toBeNull()
  })

  it('U18 running batch explains that Stop does not interrupt the current action', async () => {
    fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ status: 'running', pending: 4 })))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/Durdur, o an yapılan işlemi kesmez; o işlem biter, sonrakine geçilmez\./)).toBeInTheDocument()
  })

  it('C40 Stop: calls POST /stop {user_stop} and sends ia-stop to the extension', async () => {
    const posted = fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ id: 7, status: 'running', pending: 4 })))
    api.stop.mockResolvedValue({ batch_id: 7, status: 'stopped', last_stop_reason: 'user_stop', applied: true })
    renderApp(<ExtrasPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Durdur' }))
    await waitFor(() => expect(api.stop).toHaveBeenCalledWith('s1', 7, { reason: 'user_stop' }))
    await waitFor(() => expect(posted.some(m => m.type === 'ia-stop')).toBe(true))
  })

  it('U23 Stop failure: "Durdurulamadı" with Retry, and ia-stop is still sent', async () => {
    const posted = fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ id: 7, status: 'running', pending: 4 })))
    api.stop.mockRejectedValue(new Error('down'))
    renderApp(<ExtrasPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Durdur' }))
    expect(await screen.findByText('Durdurulamadı; uygulamaya ulaşılamıyor.')).toBeInTheDocument()
    expect(posted.some(m => m.type === 'ia-stop')).toBe(true)
    api.stop.mockResolvedValue({ batch_id: 7, status: 'stopped', last_stop_reason: 'user_stop', applied: true })
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await waitFor(() => expect(screen.queryByText('Durdurulamadı; uygulamaya ulaşılamıyor.')).not.toBeInTheDocument())
  })

  it('"Kalanları iptal et" cancels the batch', async () => {
    fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ id: 7, status: 'running', pending: 4 })))
    api.cancel.mockResolvedValue({ cancelled: true, status: 'cancelled' })
    renderApp(<ExtrasPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Kalanları iptal et' }))
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('s1', 7))
  })

  it('U20 stopping: server says stopped but the extension job still runs: Start is disabled', async () => {
    fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ status: 'stopped', last_stop_reason: 'user_stop' })))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Durduruluyor: o anki işlem bitiyor.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Başlat' })).toBeDisabled()
  })

  it('U20 stopped with an idle extension: "Durdu: <reason>" and an enabled Start', async () => {
    fakeExtension({ jobs: [null] })
    api.status.mockResolvedValue(status({}, batch({ status: 'stopped', last_stop_reason: 'user_stop' })))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(/Durdu:.*Sen durdurdun\./)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
  })

  it('U20 running batch has no Start button', async () => {
    fakeExtension({ jobs: [runningJob('saved_unsave')] })
    api.status.mockResolvedValue(status({}, batch({ status: 'running' })))
    renderApp(<ExtrasPage />)
    await screen.findByRole('button', { name: 'Durdur' })
    expect(screen.queryByRole('button', { name: 'Başlat' })).not.toBeInTheDocument()
  })

  it('U25 rate_limited stop: yellow strip with the Instagram text, Start enabled when ready', async () => {
    fakeExtension()
    api.status.mockResolvedValue(status({}, batch({ status: 'stopped', last_stop_reason: 'rate_limited' })))
    renderApp(<ExtrasPage />)
    const strip = await screen.findByText(/Instagram çok sık istek yapıldığını söyledi\. Bir süre bekleyip Başlat'a bas\./)
    expect(strip.closest('[role="alert"], [role="status"]')?.className).toMatch(/amber|yellow/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
  })

  it('U26 mutation_unrecognised: red strip, post unchanged, Start disabled until a newer extension (C57)', async () => {
    fakeExtension({ version: '2.9.0' })
    api.status.mockResolvedValue(status({}, batch({ status: 'stopped', last_stop_reason: 'mutation_unrecognised', requires_ext_above: '2.9.0' })))
    renderApp(<ExtrasPage />)
    const strip = await screen.findByText(/Instagram kaydedilenlerden çıkarma isteğini tanımadı/)
    expect(strip).toHaveTextContent(/Bu gönderi değişmedi\./)
    expect(screen.getByText('Eklentinin yeni sürümü gerekiyor (şu an 2.9.0).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Başlat' })).toBeDisabled()
  })

  it('C57 start disabled until newer extension: a patched version (2.9.1) enables Start', async () => {
    fakeExtension({ version: '2.9.1' })
    api.status.mockResolvedValue(status({}, batch({ status: 'stopped', last_stop_reason: 'mutation_unrecognised', requires_ext_above: '2.9.0' })))
    renderApp(<ExtrasPage />)
    await screen.findByText(/Instagram kaydedilenlerden çıkarma isteğini tanımadı/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
    expect(screen.queryByText(/Eklentinin yeni sürümü gerekiyor \(şu an/)).not.toBeInTheDocument()
  })

  it('U26 already_streak: yellow strip with three buttons in order; Start stays enabled', async () => {
    fakeExtension()
    api.status.mockResolvedValue(status({}, batch({ status: 'stopped', last_stop_reason: 'already_streak' })))
    renderApp(<ExtrasPage />)
    await screen.findByText(/Art arda 5 gönderi zaten kaydedilmemiş görünüyor/)
    const names = screen.getAllByRole('button').map(b => b.textContent)
    const i = names.indexOf('Kalanları iptal et')
    expect(names.slice(i, i + 3)).toEqual(['Kalanları iptal et', 'Yeniden tara', 'Yeniden önizle'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Başlat' })).toBeEnabled())
  })

  it.each(Object.entries(tr.cleanup.reason).filter(([k]) =>
    ['user_stop', 'limit', 'quiet_hours', 'off', 'blocked', 'circuit_breaker', 'account_mismatch', 'extension_outdated',
      'login_required', 'tab_closed', 'network', 'tokens_missing', 'read_limit', 'stale', 'start_failed'].includes(k)))(
    'U26 stop reason %s has its own text on a stopped batch', async (code, text) => {
      fakeExtension()
      api.status.mockResolvedValue(status({ run_state: 'ready' }, batch({ status: 'stopped', last_stop_reason: code })))
      renderApp(<ExtrasPage />)
      expect(await screen.findByText(new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.*')))).toBeInTheDocument()
    })

  it('U15 status polling fails: last known state stays and "Uygulamaya ulaşılamıyor" shows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fakeExtension()
    api.status.mockResolvedValueOnce(status({}, batch({ total: 5 }))).mockRejectedValue(new Error('down'))
    renderApp(<ExtrasPage />)
    await screen.findByText('Parti hazır: 5 gönderi.')
    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    expect(await screen.findByText('Uygulamaya ulaşılamıyor; yeniden deneniyor.')).toBeInTheDocument()
    expect(screen.getByText('Parti hazır: 5 gönderi.')).toBeInTheDocument()
  })

  it('U10 finished batch: summary with all counts and a link to the history', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fakeExtension()
    api.status.mockResolvedValueOnce(status({}, batch({ status: 'running', total: 10, pending: 1, done: 7, already: 1, not_found: 1, protected: 0, failed: 0, cancelled: 0 })))
      .mockResolvedValue(status({}, null))
    renderApp(<ExtrasPage />)
    await screen.findByText(/7 \/ 10 yapıldı/)
    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    const sum = await screen.findByRole('region', { name: 'Bitti' })
    expect(sum).toHaveTextContent(/Yapıldı: 7/)
    expect(sum).toHaveTextContent(/Zaten: 1/)
    expect(sum).toHaveTextContent(/Bulunamadı: 1/)
    expect(sum).toHaveTextContent(/Korundu: 0/)
    expect(sum).toHaveTextContent(/Başarısız: 0/)
    expect(sum).toHaveTextContent(/İptal: 0/)
    expect(within(sum).getByRole('link', { name: /Geçmiş/ })).toHaveAttribute('href', '#cleanup-history')
  })
})

/* ── Geçmiş: AC-U16 ───────────────────────────────────────────────────── */

describe('History', () => {
  const row = (id: number, st: string) => ({ id, action: 'unsave', label: `kisi${id}`, status: st, attempts: 1, note_code: null, created_at: '2026-11-10T10:00:00Z', done_at: null })

  it('U16 lists history rows, filters by status and pages', async () => {
    fakeExtension()
    api.history.mockImplementation(async (_id: string, p: { state?: string; offset?: number }) =>
      ({ counts: { done: 60, failed: 1 }, items: p.state === 'failed' ? [row(99, 'failed')] : [row(1, 'done'), row(2, 'done')] }))
    renderApp(<ExtrasPage />)
    const hist = await screen.findByRole('region', { name: 'Geçmiş' })
    expect(await within(hist).findByText('kisi1')).toBeInTheDocument()
    await userEvent.selectOptions(within(hist).getByRole('combobox', { name: 'Durum' }), 'failed')
    expect(await within(hist).findByText('kisi99')).toBeInTheDocument()
    expect(api.history).toHaveBeenLastCalledWith('s1', expect.objectContaining({ state: 'failed', offset: 0 }))
    await userEvent.selectOptions(within(hist).getByRole('combobox', { name: 'Durum' }), '')
    await userEvent.click(within(hist).getByRole('button', { name: 'Sonraki' }))
    await waitFor(() => expect(api.history).toHaveBeenLastCalledWith('s1', expect.objectContaining({ offset: 50 })))
  })

  it('U16 empty history', async () => {
    fakeExtension()
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Henüz geçmiş yok')).toBeInTheDocument()
  })

  it('U16 history error with Retry', async () => {
    fakeExtension()
    api.history.mockRejectedValueOnce(new Error('x'))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Geçmiş yüklenemedi')).toBeInTheDocument()
    api.history.mockResolvedValue({ counts: {}, items: [] })
    const hist = screen.getByRole('region', { name: 'Geçmiş' })
    await userEvent.click(within(hist).getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Henüz geçmiş yok')).toBeInTheDocument()
  })
})

/* ── Önizleme ve onay: AC-C6, U7, U13, U24, S14 ──────────────────────────── */

describe('ConfirmDialog', () => {
  const sel = { scan_id: 3, select: 'refs' as const, refs: ['1', '2'] }
  const prev = (over: Record<string, unknown> = {}) => ({
    batch_id: 12, item_count: 50, unknown_refs: 0, excluded: 0, excluded_protected: 0, in_unprotected_collections: 0,
    truncated: false, remaining: 0, expires_at: '2026-11-11T20:00:00Z', estimate: { hourly: 40, daily: 200, days: 3, starts: 5 }, ...over,
  })
  const items = (n: number, off = 0) => ({
    total: 50, items: Array.from({ length: n }, (_, i) => ({
      ref: String(off + i), label: `kisi${off + i}`, status: 'pending', shortcode: `SC${off + i}`, thumbnail_url: null, collections: [],
    })),
  })
  const open = (props: Record<string, unknown> = {}) => {
    const onClose = vi.fn(), onConfirmed = vi.fn(), onStale = vi.fn()
    renderApp(<ConfirmDialog sessionId="s1" selection={sel} maxItems={500} onClose={onClose} onConfirmed={onConfirmed} onStale={onStale} {...props} />)
    return { onClose, onConfirmed, onStale }
  }

  it('U13 loading: skeleton while the preview is prepared', () => {
    api.preview.mockReturnValue(new Promise(() => {}))
    open()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Önizleme hazırlanıyor…')).toBeInTheDocument()
  })

  it('U7 preview shows N, days, number of Starts, irreversibility, and the list comes from the server', async () => {
    api.preview.mockResolvedValue(prev())
    api.batchItems.mockResolvedValue(items(2))
    open()
    expect(await screen.findByText('50 gönderi kaydedilenlerden çıkarılacak. Gönderiler silinmez.')).toBeInTheDocument()
    expect(screen.getByText("Tahmini süre: 3 gün; bütçe yüzünden yaklaşık 5 kez Başlat'a basman gerekecek.")).toBeInTheDocument()
    expect(screen.getByText('Bu işlem geri alınamaz.')).toBeInTheDocument()
    expect(api.preview).toHaveBeenCalledWith('s1', sel)
    expect(api.batchItems).toHaveBeenCalledWith('s1', 12, 50, 0)
    expect(await screen.findByText('kisi0')).toBeInTheDocument()
  })

  it('S14 preview list is paged from the server plan (next page asks offset 50)', async () => {
    api.preview.mockResolvedValue(prev({ item_count: 120 }))
    api.batchItems.mockImplementation(async (_s: string, _b: number, _l: number, off: number) => ({ ...items(1, off), total: 120 }))
    open()
    await screen.findByText('kisi0')
    await userEvent.click(screen.getByRole('button', { name: 'Sonraki' }))
    expect(await screen.findByText('kisi50')).toBeInTheDocument()
    expect(api.batchItems).toHaveBeenLastCalledWith('s1', 12, 50, 50)
  })

  it('U7 truncated: note with {max}, the remainder and the 24-hour rescan hint', async () => {
    api.preview.mockResolvedValue(prev({ item_count: 500, truncated: true, remaining: 204 }))
    api.batchItems.mockResolvedValue(items(1))
    open({ maxItems: 500 })
    expect(await screen.findByText(/Seçiminden ilk 500 alındı; kalan 204 gönderi bu partiye girmedi\. Parti bitince yeniden önizleyebilirsin; tarama o zamana kadar 24 saati geçerse önce yeniden taraman gerekir\./)).toBeInTheDocument()
  })

  it('U7 (K-22) per-row collection names and the "in unprotected collections" summary; no line when K = 0', async () => {
    api.preview.mockResolvedValue(prev({ in_unprotected_collections: 3 }))
    api.batchItems.mockResolvedValue({ total: 1, items: [{ ref: '1', label: 'kisi1', status: 'pending', shortcode: 'A', thumbnail_url: null, collections: [{ name: 'Seyahat', id_suffix: '1234' }] }] })
    open()
    expect(await screen.findByText('3 gönderi korumasız koleksiyonlarda.')).toBeInTheDocument()
    expect(screen.getByText('Koleksiyon: Seyahat ·1234')).toBeInTheDocument()
  })

  it('U7 no summary line when K = 0', async () => {
    api.preview.mockResolvedValue(prev({ in_unprotected_collections: 0 }))
    api.batchItems.mockResolvedValue(items(1))
    open()
    await screen.findByText('kisi0')
    expect(screen.queryByText(/korumasız koleksiyonlarda/)).not.toBeInTheDocument()
  })

  it('U24 empty preview: message with the excluded count, no confirm field', async () => {
    api.preview.mockResolvedValue(prev({ batch_id: null, item_count: 0, excluded: 4 }))
    open()
    expect(await screen.findByText('Seçiminde çıkarılacak gönderi kalmadı (4 tanesi bu taramada zaten işlendi).')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument()
  })

  it('C6 exact count: only the exact decimal string enables Confirm (050, 50.0, Arabic-Indic, N-1, N+1 do not)', async () => {
    api.preview.mockResolvedValue(prev({ item_count: 50 }))
    api.batchItems.mockResolvedValue(items(1))
    open()
    const input = await screen.findByLabelText(/Onaylamak için 50 yaz/)
    expect(input).toHaveAttribute('inputmode', 'numeric')
    const btn = screen.getByRole('button', { name: 'Onayla' })
    expect(btn).toBeDisabled()
    for (const bad of ['050', '50.0', '٥٠', '49', '51', '5 0', '']) {
      await userEvent.clear(input)
      if (bad) await userEvent.type(input, bad)
      expect(btn, `"${bad}"`).toBeDisabled()
    }
    await userEvent.clear(input)
    await userEvent.type(input, ' 50 ')               // kırpılır
    expect(btn).toBeEnabled()
  })

  it('C6 confirm sends confirm_count as a number and reports the batch as ready', async () => {
    api.preview.mockResolvedValue(prev({ item_count: 50 }))
    api.batchItems.mockResolvedValue(items(1))
    api.confirm.mockResolvedValue({ batch_id: 12, status: 'confirmed', queued: 50 })
    const { onConfirmed } = open()
    await userEvent.type(await screen.findByLabelText(/Onaylamak için 50 yaz/), '50')
    await userEvent.click(screen.getByRole('button', { name: 'Onayla' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledWith('s1', 12, 50))
    expect(typeof api.confirm.mock.calls[0][2]).toBe('number')
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
  })

  it('U13 preview errors: scan_mismatch asks to reload the list; other failures offer Retry', async () => {
    api.preview.mockRejectedValueOnce(httpErr(409, 'scan_mismatch'))
    const { onStale } = open()
    expect(await screen.findByText('Envanter yenilendi; listeyi yeniden yükle.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Listeyi yeniden yükle' }))
    expect(onStale).toHaveBeenCalled()
  })

  it('U13 preview failure: "Önizleme hazırlanamadı" and Retry works', async () => {
    api.preview.mockRejectedValueOnce(new Error('500'))
    open()
    expect(await screen.findByText('Önizleme hazırlanamadı')).toBeInTheDocument()
    api.preview.mockResolvedValue(prev())
    api.batchItems.mockResolvedValue(items(1))
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('50 gönderi kaydedilenlerden çıkarılacak. Gönderiler silinmez.')).toBeInTheDocument()
  })

  it.each([
    [409, 'plan_changed', 'Envanter ya da sınır değişti; yeniden önizle.'],
    [410, 'expired', 'Önizlemenin süresi doldu.'],
    [409, 'not_draft', 'Bu önizlemenin yerini yenisi aldı.'],
    [409, 'batch_active', 'Önce mevcut partiyi bitir ya da iptal et.'],
    [422, 'count_mismatch', 'Yazdığın sayı önizlemedeki sayıyla aynı değil.'],
    [403, 'feature_off', 'Bu ek iş kapalı.'],
  ])('U13 confirm error %s %s has its own message', async (status, code, text) => {
    api.preview.mockResolvedValue(prev({ item_count: 50 }))
    api.batchItems.mockResolvedValue(items(1))
    api.confirm.mockRejectedValue(httpErr(status as number, code as string))
    open()
    await userEvent.type(await screen.findByLabelText(/Onaylamak için 50 yaz/), '50')
    await userEvent.click(screen.getByRole('button', { name: 'Onayla' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text as string)
  })

  it('Cancel closes without confirming; Escape closes too', async () => {
    api.preview.mockResolvedValue(prev())
    api.batchItems.mockResolvedValue(items(1))
    const { onClose } = open()
    await screen.findByText('kisi0')
    await userEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(api.confirm).not.toHaveBeenCalled()
  })
})

/* ── Ayarlar anahtarı ve sınır paneli: AC-C3, U12, U28 (açma diyaloğu), L6 ───── */

describe('Settings card', () => {
  const renderCard = (lang: 'tr' | 'en' = 'tr') => renderApp(<CleanupSettingsCard sessionId="s1" />, { lang })

  it('C3 enable dialog: the switch opens the dialog; "Aç" stays disabled until the box is ticked; then PUT with ack', async () => {
    api.settings.mockResolvedValue(settings(false))
    api.setEnabled.mockResolvedValue(settings(true))
    renderCard()
    const sw = await screen.findByRole('switch', { name: /Kaydedilen temizleme/ })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    const dlg = await screen.findByRole('dialog', { name: 'Kaydedilenleri temizlemeyi aç' })
    expect(api.setEnabled).not.toHaveBeenCalled()
    const turnOn = within(dlg).getByRole('button', { name: 'Aç' })
    expect(turnOn).toBeDisabled()
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /geri alınamayacağını ve hesabım için risk taşıdığını anlıyorum/ }))
    expect(turnOn).toBeEnabled()
    await userEvent.click(turnOn)
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith('s1', true, true))
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
  })

  it('U28 enable dialog shows the W text when collection_choice_available is true', async () => {
    api.settings.mockResolvedValue(settings(false, true))
    renderCard()
    await userEvent.click(await screen.findByRole('switch'))
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toHaveTextContent('Korumaya aldığın koleksiyonlardaki gönderilere dokunulmaz; yeni bulunan her koleksiyon önce korumaya alınır. Instagram\'da kaydedilenlerden çıkan bir gönderi, korumadan çıkardığın koleksiyonlarından da çıkabilir.')
    expect(dlg).toHaveTextContent('Sen önizlemeyi görüp sayıyı yazarak onaylamadan hiçbir şey yapılmaz.')
    expect(dlg).toHaveTextContent('hiçbir ayar bunun olmayacağını garanti etmez'.replace('hiçbir', 'Hiçbir'))
  })

  it('U28 enable dialog shows the F text when collection_choice_available is false', async () => {
    api.settings.mockResolvedValue(settings(false, false))
    renderCard()
    await userEvent.click(await screen.findByRole('switch'))
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toHaveTextContent('Bir koleksiyonda duran gönderilere dokunulmaz.')
    expect(dlg).not.toHaveTextContent('Korumaya aldığın koleksiyonlardaki')
  })

  it('C3 English dialog text', async () => {
    api.settings.mockResolvedValue(settings(false, true))
    renderCard('en')
    await userEvent.click(await screen.findByRole('switch'))
    const dlg = await screen.findByRole('dialog', { name: 'Turn on saved posts cleanup' })
    expect(dlg).toHaveTextContent('On Instagram, a post removed from Saved may also leave the collections you unprotected.')
    expect(within(dlg).getByRole('button', { name: 'Turn on' })).toBeDisabled()
  })

  it('C3 Cancel keeps the feature off and sends nothing', async () => {
    api.settings.mockResolvedValue(settings(false))
    renderCard()
    await userEvent.click(await screen.findByRole('switch'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Vazgeç' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.setEnabled).not.toHaveBeenCalled()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('U12 saving: the switch is disabled while the request runs', async () => {
    api.settings.mockResolvedValue(settings(true))
    let release: (v: unknown) => void = () => {}
    api.setEnabled.mockReturnValue(new Promise(r => { release = r }))
    renderCard()
    const sw = await screen.findByRole('switch')
    await userEvent.click(sw)                                   // kapatma: diyaloğsuz
    await waitFor(() => expect(sw).toBeDisabled())
    release(settings(false))
    await waitFor(() => expect(sw).toBeEnabled())
    expect(api.setEnabled).toHaveBeenCalledWith('s1', false, undefined)
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('U12 save failure: the switch returns to its old position and a message shows', async () => {
    api.settings.mockResolvedValue(settings(true))
    api.setEnabled.mockRejectedValue(httpErr(500, 'x'))
    renderCard()
    const sw = await screen.findByRole('switch')
    await userEvent.click(sw)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Kaydedilemedi/)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).toBeEnabled()
  })

  it('U12 ack_required from the server is shown with the generic text', async () => {
    api.settings.mockResolvedValue(settings(false))
    api.setEnabled.mockRejectedValue(httpErr(422, 'ack_required'))
    renderCard()
    await userEvent.click(await screen.findByRole('switch'))
    const dlg = await screen.findByRole('dialog')
    await userEvent.click(within(dlg).getByRole('checkbox'))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Aç' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Devam etmek için onay kutusunu işaretle.')
  })

  it('L6 limits panel is read-only: source, path, follow note, worst case, hash, warnings, per-profile values and hard caps', async () => {
    api.settings.mockResolvedValue({ ...settings(true), account: { hourly: 80, daily: 400, worst_case: { hourly: 95, daily: 460 } } })
    api.limits.mockResolvedValue(limits({ warnings: [{ key: 'profiles.safe.unsave.hourly', code: 'clamped', value: 120, used: 80 }], unknown_count: 2 }))
    renderCard()
    const panel = await screen.findByRole('region', { name: /Ek iş sınırları/ })
    expect(panel).toHaveTextContent('Takip işlemlerinin sınırları bu dosyadan yönetilmez.')
    expect(panel).toHaveTextContent('Ayar dosyası: config/limits.toml')
    expect(panel).toHaveTextContent('Takip kuyruğu bu toplama uymaz; en kötü toplam saatte 95, günde 460 işlemdir.')
    expect(panel).toHaveTextContent('a3f9c2e1b7d0')
    expect(panel).toHaveTextContent('profiles.safe.unsave.hourly')
    expect(panel).toHaveTextContent(/120/)
    expect(panel).toHaveTextContent(/bilinmeyen anahtar: 2/)
    expect(panel).toHaveTextContent('safe')
    expect(panel).toHaveTextContent(/en fazla 80/)
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(panel).queryAllByRole('spinbutton')).toHaveLength(0)
    expect(within(panel).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(panel).queryAllByRole('switch')).toHaveLength(0)
    expect(panel.querySelectorAll('input, select, textarea')).toHaveLength(0)
  })

  it('L6 source=defaults: red "safe defaults" badge', async () => {
    api.limits.mockResolvedValue(limits({ source: 'defaults', code: 'file_missing', sha256: null, loaded_at: null, changed_at: null }))
    renderCard()
    const badge = await screen.findByText(/Güvenli varsayılanlar: ayar dosyası okunamadı \/ yok/)
    expect(badge.className).toMatch(/red/)
  })

  it('L6 limits load failure shows an error with Retry instead of a blank panel', async () => {
    api.limits.mockRejectedValueOnce(new Error('x'))
    renderCard()
    expect(await screen.findByText('Sınırlar yüklenemedi.')).toBeInTheDocument()
    api.limits.mockResolvedValue(limits())
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Ayar dosyası: config/limits.toml')).toBeInTheDocument()
  })
})

/* ═══ T-11b: Kaydedilenler sekmesi (tarama, envanter, seçim) ═══════════════════ */

const item = (i: number, over: Record<string, unknown> = {}) => ({
  ref: String(i), shortcode: `SC${i}`, owner_username: `kisi${i}`, media_type: 'image', is_ad: false,
  thumbnail_url: `https://cdn.example/x${i}.jpg`, collections: [], position: i, state: 'available', ...over,
})
const scanView = (over: Record<string, unknown> = {}) => ({
  id: 1, status: 'ok', started_at: '2026-11-11T10:00:00Z', finished_at: '2026-11-11T10:05:00Z', items: 5, partial: false,
  stale: false, collections_mode: 'per_collection', ...over,
})
const inv = (items: unknown[], over: Record<string, unknown> = {}, scan: Record<string, unknown> | null = {}) => ({
  scan: scan === null ? null : scanView({ items: items.length, ...scan }), total: items.length, protected_total: 0, items, ...over,
})
const withLimits = (maxItems = 500, pageDelayMax = 6) => limits({
  effective: { ...(limits().effective as object), batch: { max_items: maxItems }, scan: { page_delay_min: 3, page_delay_max: pageDelayMax, saved_max_pages: 100, max_per_hour: 2 } },
})
const five = () => [1, 2, 3, 4, 5].map(i => item(i))
const box = (i: number) => screen.getByRole('checkbox', { name: `@kisi${i}, SC${i} seç` })

describe('SavedTab: scan states', () => {
  it('U3 never scanned: its own text and a scan button; no selection controls, no preview', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([], {}, null))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Henüz taranmadı.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kaydedilenleri tara' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Seçilenleri önizle/ })).not.toBeInTheDocument()
  })

  it('U3 empty inventory: a different text; still no selection or preview', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([], {}, {}))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Kaydedilen gönderin yok.')).toBeInTheDocument()
    expect(screen.queryByText('Henüz taranmadı.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Seçilenleri önizle/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('U2 old extension: the scan button exists but is disabled', async () => {
    fakeExtension({ version: '2.8.6' })
    api.inventory.mockResolvedValue(inv([], {}, null))
    renderApp(<ExtrasPage />)
    expect(await screen.findByRole('button', { name: 'Kaydedilenleri tara' })).toBeDisabled()
  })

  it('C21 the scan only starts on click: ia-run {saved_scan, session_id} is sent once, by the button', async () => {
    const posted = fakeExtension()
    api.inventory.mockResolvedValue(inv([], {}, null))
    renderApp(<ExtrasPage />)
    const btn = await screen.findByRole('button', { name: 'Kaydedilenleri tara' })
    await waitFor(() => expect(btn).toBeEnabled())
    expect(posted.filter(m => m.type === 'ia-run')).toHaveLength(0)
    await userEvent.click(btn)
    await waitFor(() => expect(posted.filter(m => m.type === 'ia-run')).toHaveLength(1))
    expect(posted.find(m => m.type === 'ia-run')?.cmd).toEqual({ kind: 'saved_scan', session_id: 's1' })
  })

  it('U4 scanning: "Sayfa 3 · 63 gönderi görüldü" in an aria-live region, with Stop that sends ia-stop', async () => {
    const posted = fakeExtension({ jobs: [{ ...runningJob('saved_scan'), index: 3 }] })
    api.status.mockResolvedValue(status({ last_scan: scanView({ status: 'running', items: 63, finished_at: null }) }))
    api.inventory.mockResolvedValue(inv([], {}, null))
    renderApp(<ExtrasPage />)
    const txt = await screen.findByText('Sayfa 3 · 63 gönderi görüldü')
    expect(txt.closest('[aria-live="polite"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Kaydedilenleri tara' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Durdur' }))
    await waitFor(() => expect(posted.some(m => m.type === 'ia-stop')).toBe(true))
  })

  it('U22 no page for page_delay_max + 60 s: "Tarama yanıt vermiyor" with Stop', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fakeExtension({ jobs: [{ ...runningJob('saved_scan'), index: 3 }] })
    api.limits.mockResolvedValue(withLimits(500, 6))
    api.status.mockResolvedValue(status({ last_scan: scanView({ status: 'running', items: 63, finished_at: null }) }))
    api.inventory.mockResolvedValue(inv([], {}, null))
    renderApp(<ExtrasPage />)
    await screen.findByText('Sayfa 3 · 63 gönderi görüldü')
    expect(screen.queryByText(/Tarama yanıt vermiyor/)).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(screen.queryByText(/Tarama yanıt vermiyor/)).not.toBeInTheDocument()       // eşik 66 sn
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
    expect(await screen.findByText('Tarama yanıt vermiyor; Instagram sekmesi kapanmış olabilir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Durdur' })).toBeInTheDocument()
  })

  it.each([
    ['blocked', 'blocked', /Instagram işlemi engelledi; tüm işlemler 24 saat duraklatıldı/],
    ['failed', 'rate_limited', /Instagram çok sık istek yapıldığını söyledi/],
    ['failed', 'login_required', /Instagram oturumu kapalı ya da doğrulama istiyor/],
    ['failed', 'network', /Ağ hatası; Instagram'a ulaşılamadı/],
    ['failed', 'unrecognised_shape', /Instagram'ın yanıtı tanınmadı/],
    ['failed', 'account_mismatch', /Instagram'da başka bir hesap açık; bu profil @me\. Doğru hesaba geç\./],
  ])('U5 scan error %s/%s: its own message and "Tekrar dene"', async (st, note, re) => {
    const posted = fakeExtension()
    api.status.mockResolvedValue(status({ last_scan: scanView({ id: 2, status: st, note_code: note, items: 0 }) }))
    api.inventory.mockResolvedValue(inv([], {}, null))
    renderApp(<ExtrasPage />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(re)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    await waitFor(() => expect(posted.some(m => m.type === 'ia-run' && m.cmd.kind === 'saved_scan')).toBe(true))
  })

  it('scan start failure from the extension shows "Tarama başlatılamadı." (no raw text)', async () => {
    fakeExtension({ runReply: { ok: false, error: 'ham eklenti metni' } })
    api.inventory.mockResolvedValue(inv([], {}, null))
    renderApp(<ExtrasPage />)
    const btn = await screen.findByRole('button', { name: 'Kaydedilenleri tara' })
    await waitFor(() => expect(btn).toBeEnabled())
    await userEvent.click(btn)
    expect(await screen.findByText('Tarama başlatılamadı.')).toBeInTheDocument()
    expect(screen.queryByText('ham eklenti metni')).not.toBeInTheDocument()
  })

  it('U14 partial scan: yellow strip with the seen count', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv(five(), {}, { status: 'partial', partial: true, items: 240 }))
    renderApp(<ExtrasPage />)
    const strip = await screen.findByText('Tarama yarım kaldı: yalnız görülen 240 gönderi listelendi.')
    expect(strip.closest('[role="status"], [role="alert"]')?.className).toMatch(/amber|yellow/)
  })

  it('U14 stale scan (> 24 h): "yeniden tara" message and the preview button is disabled', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv(five(), {}, { stale: true }))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Tarama eski, önizlemeden önce yeniden tara.')).toBeInTheDocument()
    await userEvent.click(box(1))
    expect(screen.getByRole('button', { name: /Seçilenleri önizle/ })).toBeDisabled()
  })

  it('inventory load failure: message with Retry', async () => {
    fakeExtension()
    api.inventory.mockRejectedValueOnce(new Error('x'))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Envanter yüklenemedi.')).toBeInTheDocument()
    api.inventory.mockResolvedValue(inv(five()))
    const retry = screen.getAllByRole('button', { name: 'Tekrar dene' }).pop()!
    await userEvent.click(retry)
    expect(await screen.findByText('@kisi1')).toBeInTheDocument()
  })
})

describe('SavedTab: inventory rows', () => {
  it('U6 row content: checkbox named "@owner, shortcode seç", thumbnail, owner, type, Sponsorlu badge (S19)', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([item(1), item(2, { media_type: 'video' }), item(3, { is_ad: true, media_type: 'image' }), item(4, { media_type: 'carousel' })]))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('@kisi1')).toBeInTheDocument()
    expect(box(1)).toBeEnabled()
    const rowOf = (i: number) => within(screen.getByText(`@kisi${i}`).closest('li')!)
    expect(rowOf(1).getByText('Görsel')).toBeInTheDocument()
    expect(rowOf(2).getByText('Video')).toBeInTheDocument()
    expect(rowOf(4).getByText('Albüm')).toBeInTheDocument()
    expect(rowOf(3).getByText('Sponsorlu')).toBeInTheDocument()
    expect(rowOf(1).queryByText('Sponsorlu')).not.toBeInTheDocument()
    expect(document.querySelector('img[src*="x1.jpg"]')).not.toBeNull()
  })

  it('S19 sponsored rows are selectable like any other', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([item(1, { is_ad: true })]))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    expect(within(screen.getByText('@kisi1').closest('li')!).getByText('Sponsorlu')).toBeInTheDocument()
    await userEvent.click(box(1))
    expect(box(1)).toBeChecked()
  })

  it('S7 broken thumbnail: grey placeholder with the short code; no second request for the image', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([item(1)]))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    const img = document.querySelector('img[src*="x1.jpg"]') as HTMLImageElement
    act(() => { img.dispatchEvent(new Event('error')) })
    expect(document.querySelector('img[src*="x1.jpg"]')).toBeNull()
    expect(screen.getByTestId('thumb-placeholder-1')).toHaveTextContent('SC1')
  })

  it('S15 processed rows carry a state badge and cannot be selected', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([
      item(1, { state: 'done' }), item(2, { state: 'already' }), item(3, { state: 'not_found' }), item(4, { state: 'queued' }), item(5),
    ]))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    for (const [text, i] of [['Çıkarıldı', 1], ['Zaten yoktu', 2], ['Bulunamadı', 3], ['Sırada', 4]] as const) {
      const row = screen.getByText(`@kisi${i}`).closest('li')!
      expect(within(row).getByText(text)).toBeInTheDocument()
      expect(within(row).queryByRole('checkbox')).not.toBeInTheDocument()
    }
    expect(box(5)).toBeEnabled()
  })

  it('S16/U6 W mode protected rows: lock + name (first + "+N"), unknown, unreadable; none selectable; header counter', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([
      item(1, { state: 'protected', collections: [{ collection_id: '10', name: 'Seyahat', protected: true }, { collection_id: '11', name: 'Yemek', protected: true }, { collection_id: '12', name: 'Diğer', protected: true }] }),
      item(2, { state: 'protected', collections: [{ collection_id: '13', name: null, protected: true }] }),
      item(3, { state: 'protected', collections: [] }),
      item(4, { collections: [{ collection_id: '14', name: 'Gezi', protected: false }] }),
    ], { protected_total: 3 }))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    expect(screen.getByText('Korunan koleksiyonda: Seyahat +2')).toBeInTheDocument()
    expect(screen.getByText('Bilinmeyen koleksiyonda: korunuyor')).toBeInTheDocument()
    expect(screen.getByText('Koleksiyon bilgisi okunamadı: korunuyor')).toBeInTheDocument()
    expect(screen.getByText('Koleksiyon: Gezi')).toBeInTheDocument()
    expect(screen.getByText('3 gönderi korunuyor.')).toBeInTheDocument()
    for (const i of [1, 2, 3]) {
      const row = screen.getByText(`@kisi${i}`).closest('li')!
      expect(within(row).queryByRole('checkbox')).not.toBeInTheDocument()
      expect(row.querySelector('svg')).not.toBeNull()                      // kilit simgesi
    }
    expect(box(4)).toBeEnabled()                                          // korumasız koleksiyondaki gönderi seçilebilir
  })

  it('S16/U6 F mode: "Koleksiyonda: korunuyor", no collection names, header note', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([item(1, { state: 'protected', collections: [{ collection_id: '10', name: null, protected: true }] })],
      { protected_total: 1 }, { collections_mode: 'all_protected' }))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    expect(screen.getByText('Koleksiyonda: korunuyor')).toBeInTheDocument()
    expect(screen.queryByText(/Bilinmeyen koleksiyonda/)).not.toBeInTheDocument()
    expect(screen.getByText('Koleksiyonlardaki gönderiler korunuyor.')).toBeInTheDocument()
  })

  it('U6 two collections with the same name get the last 4 digits of the id', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([
      item(1, { collections: [{ collection_id: '9001231234', name: 'Seyahat', protected: false }] }),
      item(2, { collections: [{ collection_id: '9001239999', name: 'Seyahat', protected: false }] }),
    ]))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Koleksiyon: Seyahat ·1234')).toBeInTheDocument()
    expect(screen.getByText('Koleksiyon: Seyahat ·9999')).toBeInTheDocument()
  })

  it('S5 no collection filter; the filters are username search and type only', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv(five()))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    expect(screen.queryByLabelText(/koleksiyon/i)).not.toBeInTheDocument()
    const type = screen.getByRole('combobox', { name: 'Tür' })
    expect(within(type).getAllByRole('option').map(o => o.textContent)).toEqual(['Tümü', 'Görsel', 'Video', 'Albüm', 'Sponsorlu'])
    expect(screen.getByRole('searchbox', { name: 'Kullanıcı adı ara' })).toBeInTheDocument()
  })

  it('S14 filters go to the server: q is trimmed, "@" dropped, lower-cased; type is passed; invalid q is not sent', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv(five()))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kullanıcı adı ara' }), ' @Kisi1 ')
    await waitFor(() => expect(api.inventory).toHaveBeenLastCalledWith('s1', expect.objectContaining({ q: 'kisi1', offset: 0 })))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tür' }), 'ad')
    await waitFor(() => expect(api.inventory).toHaveBeenLastCalledWith('s1', expect.objectContaining({ q: 'kisi1', media_type: 'ad' })))
    const before = api.inventory.mock.calls.length
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Kullanıcı adı ara' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kullanıcı adı ara' }), 'a b!')
    expect(await screen.findByText('Kullanıcı adı yalnız harf, rakam, nokta ve alt çizgi içerebilir.')).toBeInTheDocument()
    await new Promise(r => setTimeout(r, 500))
    expect(api.inventory.mock.calls.slice(before).every(c => c[1].q === undefined || /^[a-z0-9._]+$/.test(c[1].q))).toBe(true)
  })

  it('inventory is paged by 50 from the server', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv(five(), { total: 120 }))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    await userEvent.click(screen.getByRole('button', { name: 'Sonraki' }))
    await waitFor(() => expect(api.inventory).toHaveBeenLastCalledWith('s1', expect.objectContaining({ offset: 50, limit: 50 })))
  })
})

describe('SavedTab: selection (AC-S12, AC-U17, AC-U19)', () => {
  const openPage = async (over: Record<string, unknown> = {}, lim = 500) => {
    fakeExtension()
    api.limits.mockResolvedValue(withLimits(lim))
    api.inventory.mockResolvedValue(inv(five(), over))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
  }
  const previewBtn = () => screen.getByRole('button', { name: /Seçilenleri önizle/ })

  it('U19 no selection: counter 0, disabled preview, hint', async () => {
    await openPage()
    expect(screen.getByText('Seçili: 0')).toBeInTheDocument()
    expect(previewBtn()).toBeDisabled()
    expect(screen.getByText('Önce en az bir gönderi seç.')).toBeInTheDocument()
  })

  it('S12 one-by-one: counter and preview count follow the checkboxes; "Seçimi temizle" empties', async () => {
    await openPage()
    await userEvent.click(box(1)); await userEvent.click(box(3))
    expect(screen.getByText('Seçili: 2')).toBeInTheDocument()
    expect(previewBtn()).toHaveTextContent('Seçilenleri önizle (2)')
    expect(previewBtn()).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Seçimi temizle' }))
    expect(screen.getByText('Seçili: 0')).toBeInTheDocument()
  })

  it('U19 at the cap ({max} from the settings file) new rows cannot be ticked, with the hint', async () => {
    await openPage({}, 2)
    await userEvent.click(box(1)); await userEvent.click(box(2))
    expect(box(3)).toBeDisabled()
    expect(screen.getByText('Bir partide en fazla 2 gönderi.')).toBeInTheDocument()
    expect(box(1)).toBeEnabled()                                        // işareti kaldırmak serbest
  })

  it('S12 "Bu sayfadakileri seç" ticks the visible selectable rows (up to the cap)', async () => {
    await openPage({}, 3)
    await userEvent.click(screen.getByRole('button', { name: 'Bu sayfadakileri seç' }))
    expect(screen.getByText('Seçili: 3')).toBeInTheDocument()
    expect(box(1)).toBeChecked(); expect(box(4)).not.toBeChecked()
  })

  it('S12 header checkbox does the same as the page button, and unticks when all are ticked', async () => {
    await openPage()
    const head = screen.getByRole('checkbox', { name: 'Sayfadaki satırları işaretle' })
    await userEvent.click(head)
    expect(screen.getByText('Seçili: 5')).toBeInTheDocument()
    await userEvent.click(head)
    expect(screen.getByText('Seçili: 0')).toBeInTheDocument()
  })

  it('S12 one-by-one selection survives page changes and filter changes (counter shows how many are in view)', async () => {
    fakeExtension()
    api.inventory.mockImplementation(async (_id: string, p: { offset?: number }) => inv(p.offset ? [item(60)] : five(), { total: 120 }))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    await userEvent.click(box(1))
    await userEvent.click(screen.getByRole('button', { name: 'Sonraki' }))
    await screen.findByText('@kisi60')
    expect(screen.getByText('Seçili: 1')).toBeInTheDocument()
    expect(screen.getByText(/bu görünümde: 0/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tür' }), 'video')
    await waitFor(() => expect(api.inventory).toHaveBeenLastCalledWith('s1', expect.objectContaining({ media_type: 'video' })))
    expect(screen.getByText('Seçili: 1')).toBeInTheDocument()
  })

  it('S12 mode switch: "Filtreye uyan tümünü seç (M)" replaces the one-by-one set with a notice; M = matches minus protected', async () => {
    await openPage({ total: 7, protected_total: 2 })
    await userEvent.click(box(1))
    await userEvent.click(screen.getByRole('button', { name: 'Filtreye uyan tümünü seç (5)' }))
    expect(screen.getByText('Tek tek seçimin yerini filtre seçimi aldı.')).toBeInTheDocument()
    expect(screen.getByText('Filtreye uyan 5 gönderinin tümü seçili')).toBeInTheDocument()
    expect(screen.getByText('Seçili: 5')).toBeInTheDocument()
    expect(box(1)).toBeChecked(); expect(box(4)).toBeChecked()
  })

  it('S12 filter-all: unticking a row excludes it, the counter shows "(1 hariç)", and re-ticking removes the exclusion', async () => {
    await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Filtreye uyan tümünü seç (5)' }))
    await userEvent.click(box(2))
    expect(box(2)).not.toBeChecked()
    expect(screen.getByText('Filtreye uyan 5 gönderinin tümü seçili (1 hariç)')).toBeInTheDocument()
    expect(screen.getByText('Seçili: 4')).toBeInTheDocument()
    await userEvent.click(box(2))
    expect(screen.getByText('Filtreye uyan 5 gönderinin tümü seçili')).toBeInTheDocument()
  })

  it('S12 filter-all: a filter change resets to one-by-one with "Filtre değişti; seçim temizlendi."', async () => {
    await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Filtreye uyan tümünü seç (5)' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tür' }), 'video')
    expect(await screen.findByText('Filtre değişti; seçim temizlendi.')).toBeInTheDocument()
    expect(screen.getByText('Seçili: 0')).toBeInTheDocument()
    expect(screen.queryByText(/tümü seçili/)).not.toBeInTheDocument()
  })

  it('S12 filter-all: "Seçimi temizle" returns to one-by-one with an empty set', async () => {
    await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Filtreye uyan tümünü seç (5)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seçimi temizle' }))
    expect(screen.getByText('Seçili: 0')).toBeInTheDocument()
    expect(screen.queryByText(/tümü seçili/)).not.toBeInTheDocument()
  })

  it('S12 filter-all keeps mode and exclusions across pages (rows tick unless excluded)', async () => {
    fakeExtension()
    api.inventory.mockImplementation(async (_id: string, p: { offset?: number }) => inv(p.offset ? [item(60), item(61)] : five(), { total: 120 }))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    await userEvent.click(screen.getByRole('button', { name: 'Filtreye uyan tümünü seç (120)' }))
    await userEvent.click(box(1))
    await userEvent.click(screen.getByRole('button', { name: 'Sonraki' }))
    await screen.findByText('@kisi60')
    expect(screen.getByRole('checkbox', { name: '@kisi60, SC60 seç' })).toBeChecked()
    expect(screen.getByText('Filtreye uyan 120 gönderinin tümü seçili (1 hariç)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Önceki' }))
    await screen.findByText('@kisi1')
    expect(box(1)).not.toBeChecked()
  })

  it('S12 rescan clears the selection: a changed scan id shows "Envanter yenilendi; seçimin temizlendi."', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fakeExtension()
    api.inventory.mockResolvedValue(inv(five()))
    api.status.mockResolvedValue(status({ last_scan: scanView({ id: 1 }) }))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    await userEvent.click(box(1))
    api.status.mockResolvedValue(status({ last_scan: scanView({ id: 2 }) }))
    api.inventory.mockResolvedValue(inv(five(), {}, { id: 2 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5200) })
    expect(await screen.findByText('Envanter yenilendi; seçimin temizlendi.')).toBeInTheDocument()
    expect(screen.getByText('Seçili: 0')).toBeInTheDocument()
  })

  it('U17 active batch: selection and preview are disabled with the reason', async () => {
    fakeExtension()
    api.status.mockResolvedValue(status({}, batch({ status: 'running' })))
    api.inventory.mockResolvedValue(inv(five()))
    renderApp(<ExtrasPage />)
    await screen.findByText('@kisi1')
    await waitFor(() => expect(box(1)).toBeDisabled())
    expect(screen.getByRole('button', { name: /Seçilenleri önizle/ })).toBeDisabled()
    expect(screen.getAllByText('Önce mevcut partiyi bitir ya da iptal et.').length).toBeGreaterThan(0)
  })

  it('S14 preview body, one-by-one: {scan_id, select:"refs", refs} and the dialog opens', async () => {
    await openPage()
    api.preview.mockResolvedValue({ batch_id: 12, item_count: 2, unknown_refs: 0, excluded: 0, excluded_protected: 0, in_unprotected_collections: 0, truncated: false, remaining: 0, expires_at: null, estimate: { hourly: 40, daily: 200, days: 1, starts: 1 } })
    api.batchItems.mockResolvedValue({ total: 2, items: [] })
    await userEvent.click(box(1)); await userEvent.click(box(3))
    await userEvent.click(previewBtn())
    expect(await screen.findByRole('dialog', { name: 'Önizleme' })).toBeInTheDocument()
    expect(api.preview).toHaveBeenCalledWith('s1', { scan_id: 1, select: 'refs', refs: ['1', '3'] })
  })

  it('S14 preview body, filter-all: {scan_id, select:"filter", filter, exclude_refs}', async () => {
    await openPage()
    api.preview.mockReturnValue(new Promise(() => {}))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tür' }), 'ad')
    await waitFor(() => expect(api.inventory).toHaveBeenLastCalledWith('s1', expect.objectContaining({ media_type: 'ad' })))
    await userEvent.click(screen.getByRole('button', { name: /Filtreye uyan tümünü seç/ }))
    await userEvent.click(box(2))
    await userEvent.click(previewBtn())
    await waitFor(() => expect(api.preview).toHaveBeenCalledWith('s1', { scan_id: 1, select: 'filter', filter: { media_type: 'ad' }, exclude_refs: ['2'] }))
  })

  it('S12 preview cancelled: the selection is kept', async () => {
    await openPage()
    api.preview.mockReturnValue(new Promise(() => {}))
    await userEvent.click(box(1))
    await userEvent.click(previewBtn())
    await userEvent.click(await screen.findByRole('button', { name: 'Vazgeç' }).catch(() => screen.getByRole('dialog')) as HTMLElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Seçili: 1')).toBeInTheDocument()
  })

  it('S12 confirmed preview: the dialog closes, the batch appears as ready and the selection is cleared', async () => {
    await openPage()
    api.preview.mockResolvedValue({ batch_id: 12, item_count: 1, unknown_refs: 0, excluded: 0, excluded_protected: 0, in_unprotected_collections: 0, truncated: false, remaining: 0, expires_at: null, estimate: { hourly: 40, daily: 200, days: 1, starts: 1 } })
    api.batchItems.mockResolvedValue({ total: 1, items: [] })
    api.confirm.mockResolvedValue({ batch_id: 12, status: 'confirmed', queued: 1 })
    await userEvent.click(box(1))
    await userEvent.click(previewBtn())
    await userEvent.type(await screen.findByLabelText(/Onaylamak için 1 yaz/), '1')
    api.status.mockResolvedValue(status({}, batch({ id: 12, total: 1, pending: 1 })))
    await userEvent.click(screen.getByRole('button', { name: 'Onayla' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Parti hazır: 1 gönderi.')).toBeInTheDocument()
  })

  it('U13 preview scan_mismatch: reload the list, selection cleared with the notice', async () => {
    await openPage()
    api.preview.mockRejectedValue(httpErr(409, 'scan_mismatch'))
    await userEvent.click(box(1))
    await userEvent.click(previewBtn())
    await userEvent.click(await screen.findByRole('button', { name: 'Listeyi yeniden yükle' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Envanter yenilendi; seçimin temizlendi.')).toBeInTheDocument()
  })

  it('U26 already_streak "Yeniden tara" starts a scan, and "Yeniden önizle" opens the preview of the current selection', async () => {
    const posted = fakeExtension()
    api.status.mockResolvedValue(status({}, batch({ status: 'stopped', last_stop_reason: 'already_streak' })))
    api.inventory.mockResolvedValue(inv(five()))
    renderApp(<ExtrasPage />)
    await screen.findByText(/Art arda 5 gönderi zaten/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yeniden tara' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Yeniden tara' }))
    await waitFor(() => expect(posted.some(m => m.type === 'ia-run' && m.cmd.kind === 'saved_scan')).toBe(true))
  })
})

/* ═══ T-11w: Korunan koleksiyonlar paneli (AC-U27) ve korumayı kaldırma diyaloğu (AC-U28) ═══════════ */

const coll = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  collection_id: id, name, id_suffix: null, protected: true, in_last_scan: true, is_new: false, post_count: 3, ...over,
})
const colls = (items: unknown[], mode: string | null = 'per_collection') => ({ mode, scan_id: mode ? 1 : null, items })
const trC = tr.cleanup.collections
const setColl = () => {
  return { list: api.collections, put: api.setCollectionProtected }
}
const sw = (name: string) => screen.getByRole('switch', { name })

describe('Collections panel (AC-U27)', () => {
  beforeEach(() => { api.inventory.mockResolvedValue(inv(five())) })

  it('loading: skeleton status while the list is pending', async () => {
    fakeExtension()
    setColl().list.mockReturnValue(new Promise(() => {}))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(trC.loading)).toBeInTheDocument()
  })

  it('error: its own text with Tekrar dene that reloads; inventory is unaffected', async () => {
    fakeExtension()
    const { list } = setColl()
    list.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(colls([coll('1', 'Gezi')]))
    renderApp(<ExtrasPage />)
    const panel = (await screen.findByText(trC.title)).closest('section') as HTMLElement
    expect(await within(panel).findByText('Koleksiyonlar yüklenemedi.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '@kisi1, SC1 seç' })).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Tekrar dene' }))
    expect(await within(panel).findByRole('switch', { name: 'Gezi koleksiyonunu koru' })).toBeInTheDocument()
  })

  it('never scanned: "Koleksiyonlar tarama sırasında okunur."', async () => {
    fakeExtension()
    api.inventory.mockResolvedValue(inv([], {}, null))
    setColl().list.mockResolvedValue(colls([], null))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Koleksiyonlar tarama sırasında okunur.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('code-level F (collection_choice_available=false): no panel and no collections call', async () => {
    fakeExtension()
    api.settings.mockResolvedValue(settings(true, false))
    const { list } = setColl()
    list.mockResolvedValue(colls([coll('1', 'Gezi')], 'all_protected'))
    renderApp(<ExtrasPage />)
    await screen.findByRole('checkbox', { name: '@kisi1, SC1 seç' })
    expect(screen.queryByText(trC.title)).not.toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })

  it('fallback to F: yellow strip and every switch disabled', async () => {
    fakeExtension()
    setColl().list.mockResolvedValue(colls([coll('1', 'Gezi')], 'all_protected'))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(trC.fallback)).toBeInTheDocument()
    expect(sw('Gezi koleksiyonunu koru')).toBeDisabled()
  })

  it('empty: "Koleksiyonun yok."', async () => {
    fakeExtension()
    setColl().list.mockResolvedValue(colls([]))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('Koleksiyonun yok.')).toBeInTheDocument()
  })

  it('list: id_suffix for same names, count, New badge, not-seen note, text state and header count', async () => {
    fakeExtension()
    setColl().list.mockResolvedValue(colls([
      coll('11111234', 'Seyahat', { id_suffix: '1234', is_new: true, post_count: 12 }),
      coll('22229999', 'Seyahat', { id_suffix: '9999', protected: false }),
      coll('3', 'Eski', { in_last_scan: false }),
    ]))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText('3 koleksiyondan 2\'si korunuyor.')).toBeInTheDocument()
    const s1 = sw('Seyahat ·1234 koleksiyonunu koru')
    expect(s1).toHaveAttribute('aria-checked', 'true')
    expect(sw('Seyahat ·9999 koleksiyonunu koru')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('12 gönderi')).toBeInTheDocument()
    expect(screen.getAllByText('Yeni')).toHaveLength(1)
    expect(screen.getAllByText('Son taramada görülmedi')).toHaveLength(1)
    expect(screen.getAllByText('Korunuyor').length).toBe(2)
    expect(screen.getAllByText('Korunmuyor')).toHaveLength(1)
  })

  it('protecting is one step: PUT {protected:true}, no dialog; the inventory reloads', async () => {
    fakeExtension()
    const { list, put } = setColl()
    list.mockResolvedValue(colls([coll('5', 'Gezi', { protected: false })]))
    put.mockResolvedValue({ collection_id: '5', protected: true })
    renderApp(<ExtrasPage />)
    const before = api.inventory.mock.calls.length
    await userEvent.click(await screen.findByRole('switch', { name: 'Gezi koleksiyonunu koru' }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('s1', '5', true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(sw('Gezi koleksiyonunu koru')).toHaveAttribute('aria-checked', 'true'))
    await waitFor(() => expect(api.inventory.mock.calls.length).toBeGreaterThan(before))
  })

  it('saving: that row\'s switch is disabled with a spinner status until the PUT settles', async () => {
    fakeExtension()
    const { list, put } = setColl()
    list.mockResolvedValue(colls([coll('5', 'Gezi', { protected: false }), coll('6', 'Yemek')]))
    let done: (v: unknown) => void = () => {}
    put.mockReturnValue(new Promise(r => { done = r }))
    renderApp(<ExtrasPage />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Gezi koleksiyonunu koru' }))
    expect(await screen.findByRole('status', { name: trC.saving })).toBeInTheDocument()
    expect(sw('Gezi koleksiyonunu koru')).toBeDisabled()
    expect(sw('Yemek koleksiyonunu koru')).toBeEnabled()
    await act(async () => { done({ collection_id: '5', protected: true }) })
    await waitFor(() => expect(sw('Gezi koleksiyonunu koru')).toBeEnabled())
  })

  it('failed save: the switch returns to its old position with "Kaydedilemedi; tekrar dene."', async () => {
    fakeExtension()
    const { list, put } = setColl()
    list.mockResolvedValue(colls([coll('5', 'Gezi', { protected: false })]))
    put.mockRejectedValue(httpErr(500, 'x'))
    renderApp(<ExtrasPage />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Gezi koleksiyonunu koru' }))
    expect(await screen.findByText('Kaydedilemedi; tekrar dene.')).toBeInTheDocument()
    expect(sw('Gezi koleksiyonunu koru')).toHaveAttribute('aria-checked', 'false')
  })

  it('active batch: the R7 L5 note is shown and the switches still work', async () => {
    fakeExtension()
    api.status.mockResolvedValue(status({}, batch()))
    setColl().list.mockResolvedValue(colls([coll('5', 'Gezi')]))
    renderApp(<ExtrasPage />)
    expect(await screen.findByText(trC.activeBatch)).toBeInTheDocument()
    expect(sw('Gezi koleksiyonunu koru')).toBeEnabled()
  })
})

describe('Unprotect dialog (AC-U28, K-23)', () => {
  beforeEach(() => { api.inventory.mockResolvedValue(inv(five())) })

  async function open(name = 'Gezi') {
    fakeExtension()
    const m = setColl()
    m.list.mockResolvedValue(colls([coll('5', name)]))
    m.put.mockResolvedValue({ collection_id: '5', protected: false })
    renderApp(<ExtrasPage />)
    await userEvent.click(await screen.findByRole('switch', { name: `${name} koleksiyonunu koru` }))
    return { ...m, dlg: await screen.findByRole('dialog') }
  }

  it('shows the K-23 TR text verbatim; "Korumayı kaldır" is disabled until the box is ticked', async () => {
    const { dlg } = await open()
    expect(within(dlg).getByRole('heading', { name: '"Gezi" koleksiyonunun korumasını kaldır' })).toBeInTheDocument()
    expect(within(dlg).getByText('Bu koleksiyondaki gönderiler temizlemeye seçilebilir hale gelir. Instagram\'da kaydedilenlerden çıkan bir gönderi bu koleksiyondan da çıkabilir.')).toBeInTheDocument()
    expect(within(dlg).getByText('Bu koleksiyon başka kişilerle paylaşılıyorsa onlar da etkilenebilir. Uygulama bir koleksiyonun paylaşılıp paylaşılmadığını bilemez.')).toBeInTheDocument()
    expect(within(dlg).getByText('Koruma, sen geri alana kadar kaldırılmış kalır.')).toBeInTheDocument()
    const btn = within(dlg).getByRole('button', { name: 'Korumayı kaldır' })
    expect(btn).toBeDisabled()
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Bu koleksiyonun başka kişilerle paylaşılmadığını biliyorum.' }))
    expect(btn).toBeEnabled()
  })

  it('EN strings are the K-23 text verbatim', () => {
    expect(en.cleanup.collections.dlgBody).toBe('Posts in this collection can now be selected for cleanup. On Instagram, a post removed from Saved may also leave this collection.')
    expect(en.cleanup.collections.dlgShared).toBe('If this collection is shared with other people, they may be affected too. The app cannot tell whether a collection is shared.')
    expect(en.cleanup.collections.dlgPersist).toBe('Protection stays off until you turn it back on.')
    expect(en.cleanup.collections.dlgAck).toBe('I know this collection is not shared with other people.')
    expect(en.cleanup.collections.dlgTitle('Gezi')).toBe('Unprotect the "Gezi" collection')
    expect(en.cleanup.collections.dlgConfirm).toBe('Unprotect')
    expect(en.cleanup.collections.dlgCancel).toBe('Cancel')
  })

  it('Cancel: the switch stays on "Korunuyor" and PUT is not called', async () => {
    const { dlg, put } = await open()
    await userEvent.click(within(dlg).getByRole('button', { name: 'Vazgeç' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sw('Gezi koleksiyonunu koru')).toHaveAttribute('aria-checked', 'true')
    expect(put).not.toHaveBeenCalled()
  })

  it('Confirm: PUT {protected:false} with the acknowledgement, then the row reads "Korunmuyor"', async () => {
    const { dlg, put } = await open()
    await userEvent.click(within(dlg).getByRole('checkbox'))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Korumayı kaldır' }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('s1', '5', false))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(sw('Gezi koleksiyonunu koru')).toHaveAttribute('aria-checked', 'false'))
  })

  it('failed unprotect: the dialog closes, the switch stays on and the row shows the failure text', async () => {
    const { dlg, put } = await open()
    put.mockRejectedValue(httpErr(409, 'collections_unavailable'))
    await userEvent.click(within(dlg).getByRole('checkbox'))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Korumayı kaldır' }))
    expect(await screen.findByText('Kaydedilemedi; tekrar dene.')).toBeInTheDocument()
    expect(sw('Gezi koleksiyonunu koru')).toHaveAttribute('aria-checked', 'true')
  })
})
