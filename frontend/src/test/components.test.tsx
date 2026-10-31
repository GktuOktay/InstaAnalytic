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
vi.mock('../api/insights', () => ({
  insightsApi: { fans: vi.fn() },
  downloadCsv: vi.fn(),
}))
vi.mock('../api/analysis', () => ({ analysisApi: { goldenHour: vi.fn(), summary: vi.fn() } }))

import { sessionsApi } from '../api/sessions'
import { insightsApi } from '../api/insights'
import { analysisApi } from '../api/analysis'
import SessionPage from '../pages/SessionPage'
import FansPage from '../pages/FansPage'
import ErrorBoundary from '../components/ErrorBoundary'
import SafetyBadge from '../components/SafetyBadge'
import SetupGuide from '../components/SetupGuide'
import GoldenHourHeatmap from '../components/GoldenHourHeatmap'

const api = sessionsApi as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  api.list.mockResolvedValue([])
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
    api.createZipOnly.mockResolvedValue(makeSession({ ig_username: 'jane' }))
    renderApp(<SessionPage />)
    await user.click(await screen.findByRole('button', { name: 'Kullanıcı adımı gir' }))
    await user.type(screen.getByLabelText('Instagram kullanıcı adın'), '@jane{Enter}')
    await waitFor(() => expect(api.createZipOnly).toHaveBeenCalledWith('jane'))
    expect(await screen.findByText(/Profil hazır/)).toBeInTheDocument()
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
    expect(await screen.findByText('İşlemler güvenlik için durduruldu')).toBeInTheDocument()
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

  it('guide shows 3 steps for a new user and hides when done', async () => {
    const { unmount } = renderApp(<SetupGuide hasData={false} />)
    expect(await screen.findByText('1. Profilini bağla')).toBeInTheDocument()
    unmount()
    api.list.mockResolvedValue([makeSession()])
    renderApp(<SetupGuide hasData={true} />)
    await waitFor(() => expect(screen.queryByText('1. Profilini bağla')).not.toBeInTheDocument())
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
