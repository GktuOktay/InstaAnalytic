import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))
vi.mock('../api/posts', () => ({
  postsApi: { list: vi.fn(), stats: vi.fn(), likers: vi.fn(), comments: vi.fn(), syncPosts: vi.fn(),
    syncInteractions: vi.fn(), syncAllInteractions: vi.fn() },
}))
vi.mock('../api/bridge', () => ({ bridgeApi: { status: vi.fn(), todo: vi.fn(), stop: vi.fn(), resume: vi.fn() } }))

import { sessionsApi } from '../api/sessions'
import { postsApi } from '../api/posts'
import { bridgeApi } from '../api/bridge'
import PostsPage from '../pages/PostsPage'

beforeEach(() => {
  vi.clearAllMocks()
  ;(postsApi.list as any).mockResolvedValue([])
  ;(postsApi.stats as any).mockResolvedValue(null)
  ;(bridgeApi.status as any).mockResolvedValue({
    posts: 0, likers_done: 0, comments_done: 0, today_posts: 0, today_people: 0, last_seen: null, last_saved: null,
    connected: false, stopped: false, paused_until: null, paused_reason: null,
  })
  ;(bridgeApi.todo as any).mockResolvedValue([])
})

describe('PostsPage', () => {
  it('ZIP profile: no server scan, points to the profile on Instagram instead', async () => {
    ;(sessionsApi.list as any).mockResolvedValue([makeSession({ source: 'zip', ig_username: 'gktuoktay' })])
    renderApp(<PostsPage />)
    const link = await screen.findByRole('link', { name: /Profilimi Instagram'da aç/ })
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/gktuoktay/')
    expect(screen.queryByRole('button', { name: /Gönderileri Çek/ })).toBeNull()
    expect(screen.getByText(/Medya ya da dosya yüklemene gerek yok/)).toBeInTheDocument()
    expect(await screen.findByText('Tarayıcı köprüsü')).toBeInTheDocument()
    expect(postsApi.syncPosts).not.toHaveBeenCalled()
  })

  it('browser profile keeps the scan buttons', async () => {
    ;(sessionsApi.list as any).mockResolvedValue([makeSession({ source: 'browser' })])
    renderApp(<PostsPage />)
    expect(await screen.findByRole('button', { name: /Gönderileri Çek/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Profilimi Instagram'da aç/ })).toBeNull()
  })
})
