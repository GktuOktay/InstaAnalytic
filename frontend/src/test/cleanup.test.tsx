import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))
vi.mock('../api/insights', () => ({ insightsApi: { cleanup: vi.fn() }, downloadCsv: vi.fn() }))
vi.mock('../api/bridge', () => ({ bridgeApi: { status: vi.fn(), todo: vi.fn(), stop: vi.fn(), resume: vi.fn() } }))

import { sessionsApi } from '../api/sessions'
import { insightsApi } from '../api/insights'
import { bridgeApi } from '../api/bridge'
import BridgeStatusCard from '../components/BridgeStatusCard'
import { LATEST_EXTENSION_VERSION as LATEST } from '../lib/extension'
import BridgeWarningBanner from '../components/BridgeWarningBanner'

const counts = { ghost: 2, one_way_silent: 1, mutual_silent: 0, silent_follower: 0, one_way_engaged: 0, occasional: 0, loyal: 1 }
const row = (username: string, group: string) => ({
  ig_user_id: username.length, username, full_name: null, i_follow: true, follows_me: false, likes: 0, comments: 0,
  posts_engaged: 0, engagement_rate: 0, last_engaged_at: null, group,
})
const res = (over = {}) => ({
  total_posts: 50, scanned_posts: 12, min_posts: 10, enough_data: true, followers_known: 858, following_known: 830,
  counts, total_rows: 1, rows: [row('sessiz', 'one_way_silent')], ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  ;(sessionsApi.list as any).mockResolvedValue([makeSession()])
  ;(bridgeApi.status as any).mockResolvedValue({
    posts: 50, likers_done: 12, comments_done: 12, today_posts: 3, today_people: 214, last_seen: new Date().toISOString(),
    last_saved: new Date().toISOString(), connected: true, stopped: false, warning_until: null, warning_reason: null,
  })
  ;(bridgeApi.todo as any).mockResolvedValue([
    { id: '77', shortcode: 'NEW1', thumbnail_url: null, like_count: 5, comment_count: 0, taken_at: null },
  ])
})

describe('BridgeWarningBanner', () => {
  it('shows a red alert on every page while Instagram has paused collection', async () => {
    ;(bridgeApi.status as any).mockResolvedValue({
      posts: 50, likers_done: 12, comments_done: 12, today_posts: 0, today_people: 0, last_seen: null, last_saved: null,
      connected: false, stopped: false, warning_until: '2026-11-02T10:00:00Z',
      warning_reason: 'Köprü: Instagram uyarı verdi (feedback_required)',
    })
    renderApp(<BridgeWarningBanner />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Instagram @me için uyarı verdi')
    expect(alert).toHaveTextContent('feedback_required')
    expect(screen.getByRole('link', { name: 'Ne yapmalıyım?' })).toHaveAttribute('href', '/guide#uyari')
  })

  it('stays hidden when nothing is paused', async () => {
    renderApp(<BridgeWarningBanner />)
    await waitFor(() => expect(bridgeApi.status).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('BridgeStatusCard version check', () => {
  it('tells the user when the extension is older than the app', async () => {
    ;(bridgeApi.status as any).mockResolvedValue({
      posts: 50, likers_done: 12, comments_done: 12, today_posts: 0, today_people: 0, last_seen: null, last_saved: null,
      connected: true, stopped: false, warning_until: null, warning_reason: null, extension_version: '1.0.0',
    })
    renderApp(<BridgeStatusCard sessionId="s1" />)
    expect(await screen.findByText(/Eklentin güncel değil \(1\.0\.0 →/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nasıl güncellenir?' })).toHaveAttribute('href', '/guide#guncelle')
  })
})

describe('BridgeStatusCard version check uses the live extension version', () => {
  const status = (v: string | null) => ({
    posts: 50, likers_done: 12, comments_done: 12, today_posts: 0, today_people: 0, last_seen: null, last_saved: null,
    connected: true, stopped: false, warning_until: null, warning_reason: null, extension_version: v,
  })
  const announce = (version: string) =>
    window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-ext', version }, origin: window.location.origin, source: window }))

  it('a current extension is not called out of date just because the server last heard an old version', async () => {
    ;(bridgeApi.status as any).mockResolvedValue(status('2.5.7'))                         // sunucudaki eski kayıt
    ;(bridgeApi.todo as any).mockResolvedValue([])
    renderApp(<BridgeStatusCard sessionId="s1" />)
    expect(await screen.findByText(/Eklentin güncel değil \(2\.5\.7 →/)).toBeInTheDocument()   // eklenti sayfada görünmeden: sunucu kaydı
    announce(LATEST)                                                                      // eklentinin kendi bildirdiği güncel sürüm
    await waitFor(() => expect(screen.queryByText(/Eklentin güncel değil/)).not.toBeInTheDocument())
  })

  it('an outdated live extension is still reported, with the live version', async () => {
    ;(bridgeApi.status as any).mockResolvedValue(status(null))
    ;(bridgeApi.todo as any).mockResolvedValue([])
    renderApp(<BridgeStatusCard sessionId="s1" />)
    await waitFor(() => expect(bridgeApi.status).toHaveBeenCalled())
    announce('1.2.0')
    expect(await screen.findByText(/Eklentin güncel değil \(1\.2\.0 →/)).toBeInTheDocument()
  })

  it('without the extension on the page the server-reported version is used', async () => {
    ;(bridgeApi.status as any).mockResolvedValue(status('1.0.0'))
    ;(bridgeApi.todo as any).mockResolvedValue([])
    renderApp(<BridgeStatusCard sessionId="s1" />)
    expect(await screen.findByText(/Eklentin güncel değil \(1\.0\.0 →/)).toBeInTheDocument()
  })
})
