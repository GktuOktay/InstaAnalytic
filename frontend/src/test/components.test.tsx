import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({
  sessionsApi: {
    list: vi.fn(), createZipOnly: vi.fn(), browsers: vi.fn(), scanBrowsers: vi.fn(), confirmBrowser: vi.fn(),
    setAllowActions: vi.fn(), purge: vi.fn(), delete: vi.fn(),
  },
}))
vi.mock('../api/imports', () => ({
  importApi: {
    dataStatus: vi.fn(), snapshots: vi.fn(), scanStatus: vi.fn(), activeJob: vi.fn(), job: vi.fn(),
    uploadFiles: vi.fn(), resetProgress: vi.fn(),
  },
}))
vi.mock('../api/ghosts', () => ({
  ghostsApi: { status: vi.fn(), start: vi.fn(), stop: vi.fn(), list: vi.fn(), mark: vi.fn() },
}))
vi.mock('../api/risk', () => ({ riskApi: { get: vi.fn(), set: vi.fn() } }))
vi.mock('../api/insights', () => ({
  insightsApi: { fans: vi.fn() },
  downloadCsv: vi.fn(),
}))
vi.mock('../api/analysis', () => ({ analysisApi: { goldenHour: vi.fn(), summary: vi.fn() } }))

import { sessionsApi } from '../api/sessions'
import { insightsApi } from '../api/insights'
import { analysisApi } from '../api/analysis'
import { importApi } from '../api/imports'
import { riskApi } from '../api/risk'
import { ghostsApi } from '../api/ghosts'
import GhostPanel from '../components/GhostPanel'
import SessionPage from '../pages/SettingsPage'
import FansPage from '../pages/FansPage'
import ErrorBoundary from '../components/ErrorBoundary'
import SafetyBadge from '../components/SafetyBadge'
import SetupGuide from '../components/SetupGuide'
import StartPage from '../pages/StartPage'
import GoldenHourHeatmap from '../components/GoldenHourHeatmap'

const api = sessionsApi as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  api.list.mockResolvedValue([])
  const empty = { count: 0, oldest: null, newest: null, dated: 0 }
  ;(importApi.dataStatus as any).mockResolvedValue({ source: 'zip', followers: empty, following: empty,
    last_import_at: null, last_scan_at: null, imports: 0, warnings: [] })
  ;(importApi.snapshots as any).mockResolvedValue([])
  ;(importApi.scanStatus as any).mockResolvedValue({ used_hour: 0, limit_hour: 8, used_day: 0, limit_day: 30,
    cooldown_until: null, strikes: 0, can_scan: true, next_available_at: null, running: false, paused: { followers: false, following: false } })
  ;(importApi.activeJob as any).mockResolvedValue(null)
  ;(riskApi.get as any).mockResolvedValue({ profile: 'safe', profiles: [] })
})

describe('SessionPage — ZIP first', () => {
  it('recommends ZIP and keeps browser connection collapsed', async () => {
    renderApp(<SessionPage />)
    expect(await screen.findByText(/ZIP ile başla/)).toBeInTheDocument()
    expect(screen.getByText('En güvenli')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tarayıcıdan bağlan/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Hangi tarayıcıya bakalım/)).not.toBeInTheDocument()
    expect(api.browsers).not.toHaveBeenCalled()          // kullanıcı açmadan tarayıcı bağlayıcısına dokunulmaz
  })

  it('validates the username before calling the API, with a friendly message', async () => {
    const user = userEvent.setup()
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: 'Kullanıcı adımı gir' }))
    await user.type(screen.getByLabelText('Instagram kullanıcı adın'), 'bad name!')
    await user.click(screen.getByRole('button', { name: 'Profili oluştur' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('harf, rakam, nokta')
    expect(api.createZipOnly).not.toHaveBeenCalled()
  })

  it('creates the profile and points to the next step', async () => {
    const user = userEvent.setup()
    const jane = makeSession({ id: 'j1', ig_username: 'jane' })
    api.createZipOnly.mockResolvedValue(jane)
    api.list.mockResolvedValueOnce([]).mockResolvedValue([jane])
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: 'Kullanıcı adımı gir' }))
    await user.type(screen.getByLabelText('Instagram kullanıcı adın'), '@jane{Enter}')
    await waitFor(() => expect(api.createZipOnly).toHaveBeenCalledWith('jane'))
    expect(await screen.findByRole('tab', { name: '@jane', selected: true })).toBeInTheDocument()   // yeni profil seçilir
    await waitFor(() => expect(importApi.dataStatus).toHaveBeenCalledWith('j1'))                    // ve veri bölümü açılır
  })

  it('shows the API error instead of crashing', async () => {
    const user = userEvent.setup()
    api.createZipOnly.mockRejectedValue({ response: { data: { detail: "'jane' zaten kayıtlı" } } })
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: 'Kullanıcı adımı gir' }))
    await user.type(screen.getByLabelText('Instagram kullanıcı adın'), 'jane{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('zaten kayıtlı')
  })
})

describe('SessionPage — browser flow needs explicit consent', () => {
  it('lists browsers, scans only the picked one and saves nothing until confirmed', async () => {
    const user = userEvent.setup()
    api.browsers.mockResolvedValue(['Chrome', 'Firefox'])
    api.scanBrowsers.mockResolvedValue({ candidates: [{ candidate_id: 'c1', browser: 'Chrome', ig_username: 'me', full_name: null, already_saved: false }], errors: [] })
    api.confirmBrowser.mockResolvedValue([makeSession({ source: 'browser' })])
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: /Tarayıcıdan bağlan/ }))
    const find = await screen.findByRole('button', { name: 'Hesapları bul' })
    expect(find).toBeDisabled()                                   // tarayıcı seçmeden taranamaz
    await user.click(screen.getByLabelText('Chrome'))
    await user.click(find)
    await waitFor(() => expect(api.scanBrowsers).toHaveBeenCalledWith(['Chrome']))
    expect(api.confirmBrowser).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Seçilenleri bağla' }))
    await waitFor(() => expect(api.confirmBrowser).toHaveBeenCalledWith(['c1']))
  })

  it('tells the user how to start the connector when it is off', async () => {
    const user = userEvent.setup()
    api.browsers.mockRejectedValue({ response: { status: 503 } })
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: /Tarayıcıdan bağlan/ }))
    expect(await screen.findByText(/bağlayıcısı çalışmıyor/)).toBeInTheDocument()
    expect(screen.getByText('bash start.sh')).toBeInTheDocument()
  })
})

describe('SessionPage — safety panel', () => {
  it('actions are off by default and need confirmation to enable', async () => {
    const user = userEvent.setup()
    api.list.mockResolvedValue([makeSession({ source: 'browser' })])
    api.setAllowActions.mockResolvedValue(makeSession({ source: 'browser', allow_actions: true }))
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderApp(<SessionPage />)
    const toggle = await screen.findByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    confirmSpy.mockReturnValueOnce(false)
    await user.click(toggle)
    expect(api.setAllowActions).not.toHaveBeenCalled()            // vazgeçti
    confirmSpy.mockReturnValueOnce(true)
    await user.click(toggle)
    await waitFor(() => expect(api.setAllowActions).toHaveBeenCalledWith('s1', true))
  })

  it('ZIP profiles have no actions switch at all', async () => {
    api.list.mockResolvedValue([makeSession({ source: 'zip' })])
    renderApp(<SessionPage />)
    expect(await screen.findByText('ZIP profili: işlem yapılamaz')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows a visible warning while actions are paused', async () => {
    api.list.mockResolvedValue([makeSession({ source: 'browser', allow_actions: true,
      paused_until: new Date(Date.now() + 3600e3).toISOString(), paused_reason: 'Üst üste 3 işlem başarısız oldu' })])
    renderApp(<SessionPage />)
    // Önce sade açıklama, ham sebep "Teknik ayrıntı"nın altında
    expect(await screen.findByText('İşlemler üst üste başarısız oldu, güvenlik için durduruldu')).toBeInTheDocument()
    expect(screen.getByText(/İşlemler güvenlik için durduruldu/)).toBeInTheDocument()
    expect(screen.getByText('Teknik ayrıntı')).toBeInTheDocument()
    expect(screen.getByText(/Üst üste 3/)).toBeInTheDocument()
  })

  it('purge asks for confirmation first', async () => {
    const user = userEvent.setup()
    api.list.mockResolvedValue([makeSession()])
    api.purge.mockResolvedValue({})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: /Tüm verimi sil/ }))
    expect(api.purge).not.toHaveBeenCalled()
    confirmSpy.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: /Tüm verimi sil/ }))
    await waitFor(() => expect(api.purge).toHaveBeenCalledWith('s1'))
  })
})

describe('SafetyBadge / SetupGuide', () => {
  it('badge says safe mode when no profile has actions on', async () => {
    api.list.mockResolvedValue([makeSession()])
    renderApp(<SafetyBadge />)
    expect(await screen.findByLabelText('Güvenli mod: salt okunur')).toBeInTheDocument()
  })

  it('badge warns when actions are on', async () => {
    api.list.mockResolvedValue([makeSession({ source: 'browser', allow_actions: true })])
    renderApp(<SafetyBadge />)
    expect(await screen.findByLabelText('İşlemler AÇIK (1)')).toBeInTheDocument()
  })

  it('banner points a new user to the wizard and hides once data exists', async () => {
    const { unmount } = renderApp(<SetupGuide hasData={false} />)
    expect(await screen.findByRole('link', { name: 'Kuruluma başla' })).toHaveAttribute('href', '/start')
    unmount()
    api.list.mockResolvedValue([makeSession()])
    const second = renderApp(<SetupGuide hasData={false} />)
    expect(await screen.findByRole('link', { name: 'Kuruluma devam et' })).toBeInTheDocument()
    second.unmount()
    renderApp(<SetupGuide hasData={true} />)
    await waitFor(() => expect(screen.queryByRole('link', { name: /Kurulum/ })).not.toBeInTheDocument())
  })
})

describe('FansPage', () => {
  const fan = (o = {}) => ({ ig_user_id: 1, username: 'u1', full_name: null, follows_me: true, likes: 3, comments: 1,
    posts_engaged: 4, engagement_rate: 40, score: 80, tier: 'active', trend: 'warming', ...o })

  it('explains what to do when posts are not scanned yet', async () => {
    api.list.mockResolvedValue([makeSession()])
    ;(insightsApi.fans as any).mockResolvedValue({ total_posts: 10, scanned_posts: 0, enough_data: false, fans: [] })
    renderApp(<FansPage />)
    expect(await screen.findByText(/taranması gerekir/)).toBeInTheDocument()
  })

  it('lists fans, filters by tier and search, warns on few posts', async () => {
    const user = userEvent.setup()
    api.list.mockResolvedValue([makeSession()])
    ;(insightsApi.fans as any).mockResolvedValue({ total_posts: 10, scanned_posts: 3, enough_data: false, fans: [
      fan({ ig_user_id: 1, username: 'alice', tier: 'super', score: 100 }),
      fan({ ig_user_id: 2, username: 'bob', tier: 'silent', score: 5, trend: 'cooling' }),
    ] })
    renderApp(<FansPage />)
    expect(await screen.findByText('@alice')).toBeInTheDocument()
    expect(screen.getByText(/güvenilir değil/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sessiz' }))
    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
    expect(screen.getByText('@bob')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hepsi' }))
    await user.type(screen.getByLabelText('Kullanıcı ara'), 'ali')
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.queryByText('@bob')).not.toBeInTheDocument()
  })

  it('shows a retry state instead of a blank screen when the API fails', async () => {
    api.list.mockResolvedValue([makeSession()])
    ;(insightsApi.fans as any).mockRejectedValue(new Error('boom'))
    renderApp(<FansPage />)
    expect(await screen.findByText(/yüklenemedi/)).toBeInTheDocument()
  })

  it('paginates long lists instead of rendering everything', async () => {
    api.list.mockResolvedValue([makeSession()])
    const many = Array.from({ length: 120 }, (_, i) => fan({ ig_user_id: i, username: `user${i}`, score: 100 - (i % 100) }))
    ;(insightsApi.fans as any).mockResolvedValue({ total_posts: 10, scanned_posts: 10, enough_data: true, fans: many })
    renderApp(<FansPage />)
    await screen.findByText('@user0')
    expect(screen.getAllByText(/^@user/)).toHaveLength(50)
  })
})

describe('GoldenHourHeatmap', () => {
  const slot = (o: object) => ({ day_of_week: 1, hour: 10, avg_engagement: 10, post_count: 1, lift: 1, confidence: 'low', ...o })

  it('warns when data is thin and prefers reliable slots for the top 3', async () => {
    api.list.mockResolvedValue([])
    ;(analysisApi.goldenHour as any).mockResolvedValue({ enough_data: false, slots: [
      slot({ hour: 3, avg_engagement: 999, post_count: 1, confidence: 'low', lift: 9 }),   // tek gönderilik şans
      slot({ hour: 15, avg_engagement: 100, post_count: 6, confidence: 'high', lift: 2 }),
      slot({ hour: 16, avg_engagement: 90, post_count: 5, confidence: 'ok', lift: 1.8 }),
      slot({ hour: 17, avg_engagement: 80, post_count: 4, confidence: 'ok', lift: 1.6 }),
    ] })
    renderApp(<GoldenHourHeatmap sessionId="s1" />)
    expect(await screen.findByText(/Az gönderi var/)).toBeInTheDocument()
    expect(screen.getByText(/15:00/)).toBeInTheDocument()
    expect(screen.queryByText(/03:00/)).not.toBeInTheDocument()
  })
})

describe('ErrorBoundary', () => {
  it('shows a recovery UI instead of a blank screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => { throw new Error('render failed') }
    renderApp(<Routes><Route path="/" element={<ErrorBoundary><Boom /></ErrorBoundary>} /></Routes>)
    expect(screen.getByRole('alert')).toHaveTextContent('Verilerin güvende')
    fireEvent.click(screen.getByRole('button', { name: /Yenile/ }))
  })
})


describe('SettingsPage — one place for source, scan and safety', () => {
  it('shows data status, warns when the followers file is much newer than the following file', async () => {
    api.list.mockResolvedValue([makeSession({ source: 'zip' })])
    ;(importApi.dataStatus as any).mockResolvedValue({
      source: 'zip',
      followers: { count: 94, oldest: '2025-11-15T00:00:00Z', newest: '2026-09-27T00:00:00Z', dated: 94 },
      following: { count: 947, oldest: '2013-08-26T00:00:00Z', newest: '2026-10-27T00:00:00Z', dated: 947 },
      last_import_at: null, last_scan_at: null, imports: 1, warnings: ['followers_range_short'],
    })
    renderApp(<SessionPage />)
    expect(await screen.findByText('Veri durumu')).toBeInTheDocument()
    expect(await screen.findByText('94')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Tüm zamanlar')
    expect(screen.getByText('Veri kaynağı')).toBeInTheDocument()
    expect(screen.getByText('Tarama')).toBeInTheDocument()
    expect(screen.getByText('Güvenlik ve gizlilik')).toBeInTheDocument()
  })

  it('switches between profiles', async () => {
    const user = userEvent.setup()
    api.list.mockResolvedValue([makeSession({ id: 's1', ig_username: 'a' }), makeSession({ id: 's2', ig_username: 'b' })])
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('tab', { name: '@b' }))
    await waitFor(() => expect(importApi.dataStatus).toHaveBeenCalledWith('s2'))
  })

  it('ZIP profiles show no scan controls, browser profiles do', async () => {
    api.list.mockResolvedValue([makeSession({ source: 'zip' })])
    const { unmount } = renderApp(<SessionPage />)
    expect(await screen.findByText(/tarama ayarı yok/)).toBeInTheDocument()
    expect(screen.queryByText('Canlı tarama bütçesi')).not.toBeInTheDocument()
    unmount()
    api.list.mockResolvedValue([makeSession({ source: 'browser' })])
    renderApp(<SessionPage />)
    expect(await screen.findByText('Canlı tarama bütçesi')).toBeInTheDocument()
  })
})

describe('StartPage wizard', () => {
  beforeEach(() => { try { localStorage.removeItem('ia:wizard') } catch { /* yok */ } })

  it('walks account, request and upload; remembers the step', async () => {
    const user = userEvent.setup()
    const me = makeSession({ id: 'w1', ig_username: 'wiz' })
    api.createZipOnly.mockResolvedValue(me)
    api.list.mockResolvedValueOnce([]).mockResolvedValue([me])
    renderApp(<StartPage />)
    await user.type(await screen.findByLabelText('Instagram kullanıcı adın'), 'wiz{Enter}')
    await waitFor(() => expect(api.createZipOnly).toHaveBeenCalledWith('wiz'))
    expect(await screen.findByText('Instagram\'dan verini iste')).toBeInTheDocument()
    expect(screen.getByText(/Tüm zamanlar/, { selector: 'p' })).toBeInTheDocument()   // en sık hata açıkça uyarılıyor
    expect(screen.getByRole('link', { name: /Instagram'ı aç/ })).toHaveAttribute('rel', expect.stringContaining('noopener'))
    await user.click(screen.getByRole('button', { name: 'Dosyam hazır' }))
    expect(await screen.findByText('Dosyayı buraya bırak')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ia:wizard')!)).toEqual({ step: 2, sessionId: 'w1' })
  })

  it('tells the user what is missing when the counts differ', async () => {
    const user = userEvent.setup()
    const me = makeSession({ id: 'w1', ig_username: 'wiz' })
    localStorage.setItem('ia:wizard', JSON.stringify({ step: 3, sessionId: 'w1' }))
    api.list.mockResolvedValue([me])
    const one = { count: 94, oldest: null, newest: null, dated: 0 }
    ;(importApi.dataStatus as any).mockResolvedValue({ source: 'zip', followers: one,
      following: { ...one, count: 947 }, last_import_at: null, last_scan_at: null, imports: 1, warnings: [] })
    renderApp(<StartPage />)
    await user.type(await screen.findByLabelText('Takipçi'), '858')
    expect(await screen.findByText(/Dosyada 764 takipçi eksik/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeniden iste' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Takipçi'))
    await user.type(screen.getByLabelText('Takipçi'), '94')
    expect(await screen.findByText(/Takipçi: tutuyor/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yeniden iste' })).not.toBeInTheDocument()
  })
})

describe('errors arrive as toasts', () => {
  it('a failed purge shows the server message as a dismissible toast', async () => {
    const user = userEvent.setup()
    api.list.mockResolvedValue([makeSession()])
    api.purge.mockRejectedValue({ response: { data: { detail: 'Silme sırasında bir sorun oluştu' } } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: /Tüm verimi sil/ }))
    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent('Silme sırasında bir sorun oluştu')
    await user.click(screen.getByRole('button', { name: 'Kapat' }))
    await waitFor(() => expect(screen.queryByText('Silme sırasında bir sorun oluştu')).not.toBeInTheDocument())
  })

  it('does not stack the same message twice', async () => {
    const user = userEvent.setup()
    api.list.mockResolvedValue([makeSession()])
    api.purge.mockRejectedValue({ response: { data: { detail: 'Aynı hata' } } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp(<SessionPage />)
    const del = await screen.findByRole('button', { name: /Tüm verimi sil/ })
    await user.click(del)
    await user.click(del)
    await waitFor(() => expect(api.purge).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText('Aynı hata')).toHaveLength(1)
  })
})

describe('GhostPanel', () => {
  const status = (over: Record<string, any> = {}) => ({
    job: { state: 'idle', total: 0, done: 0, ok: 0, unreachable: 0, unknown: 0, message: '', resume_at: null, started_at: null, updated_at: null, ...(over.job ?? {}) },
    pace: { interval_s: 30, per_hour: 120, strikes: 0, cooldown_until: null, day_count: 0, day_cap: 2000, ...(over.pace ?? {}) },
    counts: { candidates: 857, unchecked: 857, ok: 0, unreachable: 0, unknown: 0, ...(over.counts ?? {}) },
  })

  it('needs explicit consent before it starts, and says the account is not used', async () => {
    const user = userEvent.setup()
    ;(ghostsApi.status as any).mockResolvedValue(status())
    ;(ghostsApi.start as any).mockResolvedValue({ status: 'queued', total: 857 })
    renderApp(<GhostPanel sessionId="s1" onChanged={() => {}} />)
    expect(await screen.findByText(/Hesabına dokunmuyoruz/)).toBeInTheDocument()
    const go = screen.getByRole('button', { name: '857 hesabı kontrol et' })
    expect(go).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(go)
    await waitFor(() => expect(ghostsApi.start).toHaveBeenCalledWith('s1'))
  })

  it('shows live progress, speed and a stop button while running', async () => {
    const user = userEvent.setup()
    ;(ghostsApi.status as any).mockResolvedValue(status({ job: { state: 'running', total: 200, done: 50, unreachable: 6, ok: 44 }, pace: { per_hour: 240 } }))
    ;(ghostsApi.stop as any).mockResolvedValue({})
    renderApp(<GhostPanel sessionId="s1" onChanged={() => {}} />)
    expect(await screen.findByText('50 / 200 hesap kontrol edildi')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText(/Saatte yaklaşık 240 kontrol/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Durdur/ }))
    await waitFor(() => expect(ghostsApi.stop).toHaveBeenCalledWith('s1'))
  })

  it('explains a cooldown instead of looking stuck', async () => {
    ;(ghostsApi.status as any).mockResolvedValue(status({ job: { state: 'cooldown', total: 200, done: 50, resume_at: Date.now() / 1000 + 900 } }))
    renderApp(<GhostPanel sessionId="s1" onChanged={() => {}} />)
    expect(await screen.findByText(/Instagram yavaşlamamızı istedi/)).toBeInTheDocument()
  })

  it('surfaces a server refusal as a toast', async () => {
    const user = userEvent.setup()
    ;(ghostsApi.status as any).mockResolvedValue(status())
    ;(ghostsApi.start as any).mockRejectedValue({ response: { data: { detail: 'Kontrol zaten sürüyor' } } })
    renderApp(<GhostPanel sessionId="s1" onChanged={() => {}} />)
    await user.click(await screen.findByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '857 hesabı kontrol et' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kontrol zaten sürüyor')
  })
})

