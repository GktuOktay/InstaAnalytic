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
    connected: false, stopped: false, warning_until: null, warning_reason: null,
  })
  ;(bridgeApi.todo as any).mockResolvedValue([])
})

describe('PostsPage', () => {
  it('each job is a separate button and runs through the extension', async () => {
    ;(sessionsApi.list as any).mockResolvedValue([makeSession({ source: 'zip', ig_username: 'gktuoktay' })])
    const sent: any[] = []
    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (d?.__ia !== true) return
      sent.push(d)
      // sahte eklenti (app-bridge.js gibi davranır)
      if (d.type === 'ia-ping') window.postMessage({ __ia: true, type: 'ia-ext', version: '2.4.0' }, window.location.origin)
      if (d.type === 'ia-run') window.postMessage({ __ia: true, type: 'ia-reply', id: d.id, reply: { ok: true, total: 1 } }, window.location.origin)
    }
    window.addEventListener('message', onMsg)
    renderApp(<PostsPage />)
    for (const name of ['Gönderileri çek', 'Beğenenleri çek', 'Yorumları çek']) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /Gönderileri Çek$/ })).toBeNull()    // eski sunucu taraması yok
    expect(postsApi.syncPosts).not.toHaveBeenCalled()
    window.removeEventListener('message', onMsg)
  })

  it('without the extension the buttons are disabled and the guide is linked', async () => {
    ;(sessionsApi.list as any).mockResolvedValue([makeSession({ source: 'browser' })])
    renderApp(<PostsPage />)
    expect(await screen.findByRole('button', { name: 'Beğenenleri çek' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Nasıl kurulur?' })).toHaveAttribute('href', '/guide#kopru')
  })
})
