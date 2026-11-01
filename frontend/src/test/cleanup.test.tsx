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
import CleanupPage from '../pages/CleanupPage'
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
    last_saved: new Date().toISOString(), connected: true, stopped: false, paused_until: null, paused_reason: null,
  })
  ;(bridgeApi.todo as any).mockResolvedValue([
    { id: '77', shortcode: 'NEW1', thumbnail_url: null, like_count: 5, comment_count: 0, taken_at: null },
  ])
})

describe('CleanupPage', () => {
  it('lists the default group and switches groups', async () => {
    ;(insightsApi.cleanup as any).mockResolvedValueOnce(res())
      .mockResolvedValueOnce(res({ rows: [row('kapali', 'ghost')], total_rows: 2 }))
    renderApp(<CleanupPage />)
    expect(await screen.findByText('@sessiz')).toBeInTheDocument()
    expect(screen.getByText('12 / 50 gönderinin beğenenleri okundu')).toBeInTheDocument()
    expect(await screen.findByText('Dinliyor')).toBeInTheDocument()
    expect(screen.getByText('Bugün 3 gönderi, 214 kişi')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Instagram'da aç: 5 beğeni/ })).toHaveAttribute('href', 'https://www.instagram.com/p/NEW1/')
    await userEvent.click(screen.getByRole('tab', { name: /Hayalet/ }))
    expect(await screen.findByText('@kapali')).toBeInTheDocument()
    expect((insightsApi.cleanup as any).mock.calls[1][1]).toMatchObject({ group: 'ghost', page: 1 })
    expect(screen.getByRole('button', { name: /Daha fazla/ })).toBeInTheDocument()
  })

  it('points to the guide when nothing has been read yet', async () => {
    ;(insightsApi.cleanup as any).mockResolvedValue(res({ scanned_posts: 0, rows: [], total_rows: 0 }))
    renderApp(<CleanupPage />)
    expect(await screen.findByRole('link', { name: /Nasıl kurulur/ })).toHaveAttribute('href', '/guide#kopru')
  })

  it('warns when too few posts were read', async () => {
    ;(insightsApi.cleanup as any).mockResolvedValue(res({ scanned_posts: 4, enough_data: false }))
    renderApp(<CleanupPage />)
    await waitFor(() => expect(screen.getByText(/en az 10 gönderi bekle/)).toBeInTheDocument())
  })
})

describe('BridgeWarningBanner', () => {
  it('shows a red alert on every page while Instagram has paused collection', async () => {
    ;(bridgeApi.status as any).mockResolvedValue({
      posts: 50, likers_done: 12, comments_done: 12, today_posts: 0, today_people: 0, last_seen: null, last_saved: null,
      connected: false, stopped: false, paused_until: '2026-11-02T10:00:00Z',
      paused_reason: 'Köprü: Instagram uyarı verdi (feedback_required)',
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
