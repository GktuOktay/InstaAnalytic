import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))
vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../api/actions', () => ({ actionsApi: { follow: vi.fn(), unfollow: vi.fn(), removeFollower: vi.fn(), bulkUnfollow: vi.fn() } }))
vi.mock('../api/bridge', () => ({ bridgeApi: { actions: vi.fn(), enqueueActions: vi.fn(), clearActions: vi.fn() } }))

import { sessionsApi } from '../api/sessions'
import api from '../api/client'
import { actionsApi } from '../api/actions'
import { bridgeApi } from '../api/bridge'
import UsersPage from '../pages/UsersPage'

const sess = sessionsApi as unknown as Record<string, ReturnType<typeof vi.fn>>
const http = api as unknown as Record<string, ReturnType<typeof vi.fn>>
const bridge = bridgeApi as unknown as Record<string, ReturnType<typeof vi.fn>>

const user = (id: number, username: string, over: Record<string, unknown> = {}) => ({
  id, username, full_name: null, profile_pic_url: null, is_private: false, is_verified: false,
  follower_count: null, following_count: null, we_follow: true, they_follow: false,
  like_count: 0, comment_count: 0, engagement_score: 0, first_seen_at: null, ...over,
})
const queue = (over: Record<string, unknown> = {}) => ({
  enabled: true, blocked: null, quiet_hours: false, pending_count: 0, pending: [], done_hour: 1, done_day: 3,
  hourly_limit: 8, daily_limit: 30, delay: [120, 240], paused_reason: null, ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  http.get.mockResolvedValue({ data: { total: 2, items: [user(5, 'ali'), user(6, 'veli', { we_follow: false })] } })
  bridge.actions.mockResolvedValue(queue())
  bridge.enqueueActions.mockResolvedValue({ added: 1, duplicate: 0, skipped: 0 })
})

describe('UsersPage — ZIP profile: the extension does follow / unfollow from a queue', () => {
  it('unfollow button queues the action instead of calling Instagram', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    renderApp(<UsersPage />)
    const btn = await screen.findAllByTitle('Takipten çık')
    await userEvent.click(btn[0])
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', [5]))
    expect(actionsApi.unfollow).not.toHaveBeenCalled()          // sunucunun anında-işlem yolu kullanılmaz
    expect(await screen.findByText('1 işlem kuyruğa eklendi')).toBeInTheDocument()
  })

  it('shows the queue panel with counts, limits and the pace', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    bridge.actions.mockResolvedValue(queue({ pending_count: 3, pending: [{ id: 1, ig_user_id: 5, username: 'ali', action: 'unfollow' }] }))
    renderApp(<UsersPage />)
    expect(await screen.findByText(/3 işlem sırada/)).toBeInTheDocument()
    expect(screen.getByText(/Bu saat 1\/8 · bugün 3\/30 · işlemler arası ~120-240 sn/)).toBeInTheDocument()
    expect(await screen.findByText(/1 kişi kuyrukta; listelerden düşürüldü\./)).toBeInTheDocument()
    expect(screen.queryByText('@ali')).not.toBeInTheDocument()                                  // kuyruktaki kişi normal listeden düştü
    expect(screen.getByText('@veli')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kuyruğu temizle' })).toBeEnabled()
  })

  it('"run queue" needs the extension; without it the button stays off and says why', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    bridge.actions.mockResolvedValue(queue({ pending_count: 2 }))
    renderApp(<UsersPage />)
    expect(await screen.findByText('İşlemleri yapmak için Chrome eklentisi gerekli.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kuyruğu çalıştır' })).toBeDisabled()
  })

  it('quiet hours: explains that nothing runs until morning', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    bridge.actions.mockResolvedValue(queue({ pending_count: 2, quiet_hours: true }))
    renderApp(<UsersPage />)
    expect(await screen.findByText(/Sessiz saatler \(01:00-08:00\)/)).toBeInTheDocument()
  })

  it('actions turned off in Settings: requests are still queued (kept) and the panel links to Settings — no warning button', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: false })])
    bridge.actions.mockResolvedValue(queue({ enabled: false, blocked: 'off', pending_count: 1 }))
    renderApp(<UsersPage />)
    const unfollow = (await screen.findAllByTitle('Takipten çık'))[0]
    expect(unfollow).not.toHaveAttribute('aria-disabled', 'true')               // kapalıyken de kuyruğa ekler
    await userEvent.click(unfollow)
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', [5]))
    expect(await screen.findByText(/İşlemler Ayarlar'dan kapatılmış\. İstekler kuyruğa eklenir ve silinmez/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ayarlar\'da aç' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: 'İşlemleri aç' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kuyruğu çalıştır' })).toBeDisabled()
  })

  it('paused: still queues, and explains that queued requests are kept', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    bridge.actions.mockResolvedValue(queue({ blocked: 'paused', pending_count: 2 }))
    renderApp(<UsersPage />)
    expect(await screen.findByText(/Kuyruktaki istekler silinmez/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kuyruğu çalıştır' })).toBeDisabled()
  })

  it('removing a follower is not offered for ZIP profiles', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 1, items: [user(5, 'ali', { they_follow: true })] } })
    renderApp(<UsersPage />)
    expect(await screen.findByTitle('ZIP profilinde takipçiyi çıkarma yapılamaz; Instagram\'da elle yapın.')).toBeDisabled()
  })

  it('English mode shows the queue fully in English', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    bridge.actions.mockResolvedValue(queue({ pending_count: 2 }))
    renderApp(<UsersPage />, { lang: 'en' })
    expect(await screen.findByText(/2 actions queued/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run queue' })).toBeInTheDocument()
    expect(screen.getByText(/This hour 1\/8 · today 3\/30/)).toBeInTheDocument()
  })

  it('a refused request shows the reason in the chosen language, not a raw server text', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    bridge.enqueueActions.mockRejectedValue({ response: { status: 403, data: { detail: 'Takip/takipten çıkma işlemleri kapalı.' } } })
    renderApp(<UsersPage />, { lang: 'en' })
    await userEvent.click((await screen.findAllByTitle('Unfollow'))[0])
    expect(await screen.findByText('Follow / unfollow actions are turned off. You can deliberately turn them on in Settings.')).toBeInTheDocument()
  })
})

describe('UsersPage — filters that replaced the Cleanup page', () => {
  const rows = [
    user(1, 'tek_yonlu_sessiz', { we_follow: true, they_follow: false }),                         // ben takip ediyorum, o etmiyor, hiç etkileşim yok
    user(2, 'karsilikli_sessiz', { we_follow: true, they_follow: true }),
    user(3, 'tek_yonlu_ama_begenir', { we_follow: true, they_follow: false, like_count: 4 }),
    user(4, 'kapali_hesap', { we_follow: true, they_follow: false, reach_status: 'unreachable' }), // hayalet: sessiz sayılmaz
    user(5, 'sadik', { we_follow: true, they_follow: true, like_count: 9, comment_count: 2, engagement_score: 60 }),
  ]
  beforeEach(() => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: rows.length, items: rows } })
  })

  it('"Takip etmiyor, ilgisi yok" lists only people you follow who do not follow back and never touched a post', async () => {
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Takip etmiyor, ilgisi yok/ }))
    expect(screen.getByText('@tek_yonlu_sessiz')).toBeInTheDocument()
    for (const n of ['karsilikli_sessiz', 'tek_yonlu_ama_begenir', 'kapali_hesap', 'sadik']) expect(screen.queryByText(`@${n}`)).not.toBeInTheDocument()
  })

  it('"Karşılıklı ama sessiz" lists only mutual follows without any engagement', async () => {
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Karşılıklı ama sessiz/ }))
    expect(screen.getByText('@karsilikli_sessiz')).toBeInTheDocument()
    expect(screen.queryByText('@sadik')).not.toBeInTheDocument()
    expect(screen.queryByText('@tek_yonlu_sessiz')).not.toBeInTheDocument()
  })

  it('a closed account is a ghost, never "inactive"', async () => {
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Hayaletler/ }))
    expect(screen.getByText('@kapali_hesap')).toBeInTheDocument()
    expect(screen.queryByText('@tek_yonlu_sessiz')).not.toBeInTheDocument()
  })
})

describe('UsersPage — "Not following me back" with a ghost switch', () => {
  const rows = [
    user(1, 'canli', { we_follow: true, they_follow: false }),
    user(2, 'hayalet', { we_follow: true, they_follow: false, reach_status: 'unreachable' }),
    user(3, 'karsilikli', { we_follow: true, they_follow: true }),
  ]
  beforeEach(() => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 3, items: rows } })
  })

  it('includes ghosts by default and can leave them out', async () => {
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Beni Takip Etmeyenler/ }))
    expect(screen.getByText('@canli')).toBeInTheDocument()
    expect(screen.getByText('@hayalet')).toBeInTheDocument()
    expect(screen.queryByText('@karsilikli')).not.toBeInTheDocument()
    const box = screen.getByRole('checkbox', { name: /Hayalet hesapları da dahil et/ })
    expect(box).toBeChecked()
    await userEvent.click(box)
    expect(screen.queryByText('@hayalet')).not.toBeInTheDocument()
    expect(screen.getByText('@canli')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Beni Takip Etmeyenler\s*1$/ })).toBeInTheDocument()     // sekme sayısı da güncellenir
  })

  it('the switch only shows on that tab, and in English too', async () => {
    renderApp(<UsersPage />, { lang: 'en' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /Not Following Me Back/ }))
    expect(screen.getByRole('checkbox', { name: /Include ghost accounts/ })).toBeInTheDocument()
  })
})


describe('UsersPage — queued people leave the lists and can be taken back', () => {
  const rows = [user(5, 'ali'), user(6, 'veli', { we_follow: true }), user(7, 'ayse', { we_follow: true })]
  beforeEach(() => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 3, items: rows } })
    bridge.cancelActions = vi.fn().mockResolvedValue({ removed: 1 })
    ;(bridgeApi as any).cancelActions = bridge.cancelActions
    bridge.actions.mockResolvedValue(queue({ pending_count: 1, pending: [{ id: 1, ig_user_id: 5, username: 'ali', action: 'unfollow' }] }))
  })

  it('a queued person is gone from "All" and its count, and shows up under "Queued" with an Undo button', async () => {
    renderApp(<UsersPage />)
    expect(await screen.findByText('@veli')).toBeInTheDocument()
    expect(screen.queryByText('@ali')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tümü\s*2$/ })).toBeInTheDocument()            // sayı kuyruktakini içermez
    await userEvent.click(screen.getByRole('button', { name: /^Kuyrukta\s*1$/ }))
    expect(screen.getByText('@ali')).toBeInTheDocument()
    expect(screen.queryByText('@veli')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kuyruktan geri al: @ali' })).toBeInTheDocument()
  })

  it('"Undo" takes the person back from the queue (nothing else is touched)', async () => {
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /^Kuyrukta\s*1$/ }))
    bridge.actions.mockResolvedValue(queue())                                                   // geri alınca kuyruk boşalır
    await userEvent.click(screen.getByRole('button', { name: 'Kuyruktan geri al: @ali' }))
    await waitFor(() => expect(bridge.cancelActions).toHaveBeenCalledWith('s1', [5]))
    expect(await screen.findByText('1 kişi kuyruktan geri alındı')).toBeInTheDocument()
    expect(await screen.findByText('@ali')).toBeInTheDocument()                                 // ana listeye döndü
    expect(screen.queryByRole('button', { name: /^Kuyrukta/ })).not.toBeInTheDocument()         // boş sekme kaybolur
  })

  it('bulk undo from the Queued tab', async () => {
    bridge.actions.mockResolvedValue(queue({ pending_count: 2, pending: [
      { id: 1, ig_user_id: 5, username: 'ali', action: 'unfollow' }, { id: 2, ig_user_id: 6, username: 'veli', action: 'unfollow' }] }))
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: /^Kuyrukta\s*2$/ }))
    const boxes = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-square'))
    await userEvent.click(boxes[0])                                                              // üstteki "tümünü seç"
    await userEvent.click(await screen.findByRole('button', { name: 'Kuyruktan geri al' }))
    await waitFor(() => expect(bridge.cancelActions).toHaveBeenCalledWith('s1', expect.arrayContaining([5, 6])))
  })

  it('English mode', async () => {
    renderApp(<UsersPage />, { lang: 'en' })
    expect(await screen.findByRole('button', { name: /^Queued\s*1$/ })).toBeInTheDocument()
    expect(screen.getByText(/1 people are queued; hidden from the lists\./)).toBeInTheDocument()
  })
})
