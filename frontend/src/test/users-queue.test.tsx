import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))
vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../api/actions', () => ({ actionsApi: { follow: vi.fn(), unfollow: vi.fn(), removeFollower: vi.fn(), bulkUnfollow: vi.fn() } }))
vi.mock('../api/bridge', () => ({ bridgeApi: { actions: vi.fn(), actionHistory: vi.fn(), enqueueActions: vi.fn(), clearActions: vi.fn(), cancelActions: vi.fn() } }))

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
  bridge.actionHistory.mockResolvedValue({ counts: { pending: 0, done: 0, skipped: 0, failed: 0 }, items: [] })
  bridge.enqueueActions.mockResolvedValue({ added: 1, duplicate: 0, skipped: 0 })
})

describe('UsersPage — ZIP profile: the extension does follow / unfollow from a queue', () => {
  it('unfollow button queues the action instead of calling Instagram', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    renderApp(<UsersPage />)
    const btn = await screen.findAllByTitle('Takipten çık')
    await userEvent.click(btn[0])
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', ['ali'], true))
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

  it('queued actions say the extension starts by itself (does not look stuck)', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    bridge.actions.mockResolvedValue(queue({ pending_count: 12, pending: [{ id: 1, ig_user_id: 5, username: 'ali', action: 'unfollow', manual: true }] }))
    renderApp(<UsersPage />)
    window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-ext', version: '2.9.0' }, origin: window.location.origin, source: window }))
    expect(await screen.findByTestId('queue-waiting')).toHaveTextContent(/12 işlem sırada: eklenti birkaç saniye içinde kendiliğinden başlar/)
  })

  it('actions turned off in Settings: requests are still queued (kept) and the panel links to Settings — no warning button', async () => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: false })])
    bridge.actions.mockResolvedValue(queue({ enabled: false, blocked: 'off', pending_count: 1 }))
    renderApp(<UsersPage />)
    const unfollow = (await screen.findAllByTitle('Takipten çık'))[0]
    expect(unfollow).not.toHaveAttribute('aria-disabled', 'true')               // kapalıyken de kuyruğa ekler
    await userEvent.click(unfollow)
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', ['ali'], true))
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
    await waitFor(() => expect(bridge.cancelActions).toHaveBeenCalledWith('s1', ['ali']))
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
    await waitFor(() => expect(bridge.cancelActions).toHaveBeenCalledWith('s1', expect.arrayContaining(['ali', 'veli'])))
  })

  it('English mode', async () => {
    renderApp(<UsersPage />, { lang: 'en' })
    expect(await screen.findByRole('button', { name: /^Queued\s*1$/ })).toBeInTheDocument()
    expect(screen.getByText(/1 people are queued; hidden from the lists\./)).toBeInTheDocument()
  })
})


describe('UsersPage — permanent queue history', () => {
  const hist = (items: any[], counts: Record<string, number>) => ({ counts: { pending: 0, done: 0, skipped: 0, failed: 0, ...counts }, items })
  const row = (id: number, username: string, status: string, note: string | null, attempts = 0) => ({
    id, ig_user_id: id, username, action: 'unfollow', status, attempts, note, created_at: '2026-11-06T09:00:00Z', done_at: '2026-11-06T09:05:00Z',
  })
  beforeEach(() => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 1, items: [user(5, 'ali')] } })
  })

  it('lists finished, skipped and failed actions with the reason, and says the history is permanent', async () => {
    bridge.actionHistory.mockResolvedValue(hist([
      row(1, 'yapilan', 'done', 'Yapıldı.'),
      row(2, 'zaten', 'skipped', 'Zaten takip etmiyorsunuz.'),
      row(3, 'bozuk', 'failed', 'Profil düğmeleri bulunamadı; sayfa yüklenmedi.', 3),
    ], { done: 1, skipped: 1, failed: 1 }))
    renderApp(<UsersPage />)
    expect(await screen.findByText('Kuyruk geçmişi · 1 yapıldı, 1 atlandı, 1 başarısız')).toBeInTheDocument()
    expect(screen.getByText('@yapilan')).toBeInTheDocument()
    expect(screen.getByText(/takip düğmesi tanınamadı/)).toBeInTheDocument()            // "bulunamadı" 404 diye değil, anlamıyla
    expect(screen.getByText(/3 deneme/)).toBeInTheDocument()
    expect(screen.getByText(/Geçmiş kalıcıdır/)).toBeInTheDocument()
  })

  it('"queue the failed ones again" adds only the failed people back', async () => {
    bridge.actionHistory.mockResolvedValue(hist([row(2, 'zaten', 'skipped', null), row(3, 'bozuk', 'failed', 'x', 3)], { skipped: 1, failed: 1 }))
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Başarısızları yeniden kuyruğa ekle' }))
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', ['bozuk'], false))
  })

  it('filter buttons ask the server for that state; nothing is shown when there is no history', async () => {
    bridge.actionHistory.mockResolvedValue(hist([row(3, 'bozuk', 'failed', 'x', 3)], { failed: 1 }))
    renderApp(<UsersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Başarısız' }))
    await waitFor(() => expect(bridge.actionHistory).toHaveBeenCalledWith('s1', 50, 'failed'))
  })

  it('no history section when nothing has finished yet, English otherwise', async () => {
    renderApp(<UsersPage />)
    await screen.findByText('@ali')
    expect(screen.queryByText(/Kuyruk geçmişi/)).not.toBeInTheDocument()
  })
})


describe('UsersPage — clicking a person starts the extension at human pace', () => {
  function extReady() {
    window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-ext', version: '2.6.3' }, origin: window.location.origin, source: window }))
  }
  const runCalls = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.filter(c => (c[0] as any)?.type === 'ia-run')

  beforeEach(() => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 4, items: [user(5, 'ali'), user(6, 'veli'), user(7, 'ayse'), user(8, 'can')] } })
  })

  it('a single click queues the person as manual and triggers the extension right away', async () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation((() => {}) as any)
    renderApp(<UsersPage />)
    await screen.findAllByTitle('Takipten çık')
    extReady()
    await userEvent.click((await screen.findAllByTitle('Takipten çık'))[0])
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', ['ali'], true))
    await waitFor(() => expect(runCalls(post).length).toBe(1))
    expect((runCalls(post)[0][0] as any).cmd).toEqual({ kind: 'actions' })
    post.mockRestore()
  })

  it('a bulk selection is queued slowly and does NOT start the extension by itself', async () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation((() => {}) as any)
    renderApp(<UsersPage />)
    await screen.findAllByTitle('Takipten çık')
    extReady()
    const boxes = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-square'))
    await userEvent.click(boxes[0])                                            // tümünü seç
    await userEvent.click(await screen.findByRole('button', { name: /Toplu Çıkar/ }))
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', expect.arrayContaining(['ali', 'veli', 'ayse', 'can']), false))
    expect(runCalls(post).length).toBe(0)
    post.mockRestore()
  })

  it('without the extension the click still queues and says nothing is lost', async () => {
    renderApp(<UsersPage />)                                                   // eklenti sinyali yok
    await userEvent.click((await screen.findAllByTitle('Takipten çık'))[0])
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', ['ali'], true))
  })
})


describe('UsersPage — several quick clicks in a row', () => {
  const rows = [user(5, 'ali'), user(6, 'veli'), user(7, 'ayse')]
  beforeEach(() => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 3, items: rows } })
  })
  const announce = () => window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-ext', version: '2.8.2' }, origin: window.location.origin, source: window }))

  function replyToRuns(replies: any[], delay = 5) {
    let n = 0
    return vi.spyOn(window, 'postMessage').mockImplementation(((d: any) => {
      if (d?.type === 'ia-run') {
        const r = replies[Math.min(n++, replies.length - 1)]
        setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-reply', id: d.id, reply: r }, origin: window.location.origin, source: window })), delay)
      }
    }) as any)
  }

  it('"job already running" / "queue empty" after the automatic start are not shown as errors', async () => {
    const post = replyToRuns([{ ok: false, code: 'running', error: 'Zaten çalışan bir iş var (Takip işlemleri).' }])
    renderApp(<UsersPage />)
    await screen.findAllByTitle('Takipten çık')
    announce()
    await userEvent.click((await screen.findAllByTitle('Takipten çık'))[0])
    await waitFor(() => expect(post.mock.calls.some(c => (c[0] as any)?.type === 'ia-run')).toBe(true))      // gerçekten tetiklendi
    await new Promise(r => setTimeout(r, 60))
    expect(screen.queryByText(/Zaten çalışan bir iş var/)).not.toBeInTheDocument()
    post.mockRestore()
    const post2 = replyToRuns([{ ok: false, code: 'empty', error: 'Kuyrukta bekleyen işlem yok.' }])
    await userEvent.click((await screen.findAllByTitle('Takipten çık'))[0])
    await waitFor(() => expect(post2.mock.calls.some(c => (c[0] as any)?.type === 'ia-run')).toBe(true))
    await new Promise(r => setTimeout(r, 60))
    expect(screen.queryByText(/Kuyrukta bekleyen işlem yok/)).not.toBeInTheDocument()
    post2.mockRestore()
  })

  it('a real reason (hourly limit) is still shown', async () => {
    const post = replyToRuns([{ ok: false, code: 'limit', error: 'Bu saat ya da gün için işlem sınırına ulaşıldı. Biraz sonra tekrar deneyin.' }])
    renderApp(<UsersPage />)
    await screen.findAllByTitle('Takipten çık')
    announce()
    await userEvent.click((await screen.findAllByTitle('Takipten çık'))[0])
    expect(await screen.findByText(/işlem sınırına ulaşıldı/)).toBeInTheDocument()
    post.mockRestore()
  })

  it('quick successive clicks all get queued, but only one start request is sent while one is in flight', async () => {
    const post = replyToRuns([{ ok: true, total: 1 }], 400)                                       // ilk başlatma henüz yanıtlanmadı
    renderApp(<UsersPage />)
    const btns = await screen.findAllByTitle('Takipten çık')
    announce()
    await userEvent.click(btns[0])
    await userEvent.click(btns[1])
    await userEvent.click(btns[2])
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledTimes(3))                  // üçü de kuyruğa girdi
    expect(post.mock.calls.filter(c => (c[0] as any)?.type === 'ia-run').length).toBe(1)          // tek başlatma isteği
    post.mockRestore()
  })
})


describe('UsersPage — a clicked person that is left waiting is started automatically', () => {
  const rows = [user(5, 'ali'), user(6, 'veli')]
  const announce = () => window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-ext', version: '2.8.3' }, origin: window.location.origin, source: window }))
  const pendingManual = (manual: boolean) => queue({ pending_count: 1, pending: [{ id: 1, ig_user_id: 5, username: 'ali', action: 'unfollow', manual }] })
  let post: ReturnType<typeof vi.spyOn>
  const runs = () => post.mock.calls.filter(c => (c[0] as any)?.type === 'ia-run').length
  const answer = (reply: unknown) => vi.spyOn(window, 'postMessage').mockImplementation(((d: any) => {
    if (d?.type === 'ia-run') setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-reply', id: d.id, reply }, origin: window.location.origin, source: window })), 5)
  }) as any)

  beforeEach(() => {
    sessionStorage.clear()                                // önceki testin bekleyen komutu (PENDING_KEY) bu testte yeniden oynatılmasın
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 2, items: rows } })
  })
  afterEach(() => { post?.mockRestore() })

  it('someone clicked is waiting, the extension is idle: it is started by itself after a few seconds', async () => {
    post = answer({ ok: true, total: 1 })
    bridge.actions.mockResolvedValue(pendingManual(true))
    renderApp(<UsersPage />)
    await screen.findByText('@veli')
    announce()
    expect(runs()).toBe(0)
    await waitFor(() => expect(runs()).toBe(1), { timeout: 9000 })
  }, 15000)

  it('bulk (not clicked) items are never started by themselves', async () => {
    post = answer({ ok: true, total: 1 })
    bridge.actions.mockResolvedValue(pendingManual(false))
    renderApp(<UsersPage />)
    await screen.findByText('@veli')
    announce()
    await new Promise(r => setTimeout(r, 7500))
    expect(runs()).toBe(0)
  }, 15000)

  it('when the start fails it does not retry in a loop', async () => {
    vi.useFakeTimers()                                   // gerçek bekleme yok: zaman elle ilerletilir (suite yükünden bağımsız)
    try {
      post = answer({ ok: false, code: 'nostab', error: "Açık bir Instagram sekmesi yok." })
      bridge.actions.mockResolvedValue(pendingManual(true))
      renderApp(<UsersPage />)
      const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
      for (let i = 0; i < 20 && !screen.queryByText('@veli'); i++) await tick(50)
      expect(screen.getByText('@veli')).toBeInTheDocument()
      act(() => announce())
      expect(runs()).toBe(0)
      await tick(6_100)                                  // otomatik başlatma gecikmesi (6 sn) + yanıt (5 ms)
      await tick(100)
      expect(runs()).toBe(1)
      expect(screen.getByText(/Eklenti işi başlatamadı: Açık bir Instagram sekmesi yok/)).toBeInTheDocument()   // hata panelde kalır
      await tick(60_000)                                 // 1 dakika geçse de yeniden denenmez
      expect(runs()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('UsersPage — people whose ids are beyond the JS safe-integer range (ZIP placeholders)', () => {
  // Sunucu -48586600665382524 gönderir; tarayıcı sayıyı -48586600665382520'ye yuvarlar. Eşleşme kimlikle değil kullanıcı adıyla olmalı.
  const corrupted = -48586600665382520
  const other = -48586600665382500                      // kuyruk listesinde başka bir yuvarlama
  beforeEach(() => {
    sess.list.mockResolvedValue([makeSession({ source: 'zip', allow_actions: true })])
    http.get.mockResolvedValue({ data: { total: 2, items: [user(corrupted, 'zip_kisi'), user(6, 'veli')] } })
  })

  it('the click sends the USERNAME, never the corrupted number', async () => {
    http.get.mockResolvedValue({ data: { total: 1, items: [user(corrupted, 'zip_kisi')] } })
    renderApp(<UsersPage />)
    await userEvent.click((await screen.findAllByTitle('Takipten çık'))[0])
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', ['zip_kisi'], true))
    const sent = bridge.enqueueActions.mock.calls[0][2]
    expect(JSON.stringify(sent)).not.toContain('4858')                                   // hiçbir yerde sayısal kimlik yok
  })

  it('a queued person is recognised by username even if the number in the queue list differs', async () => {
    bridge.actions.mockResolvedValue(queue({ pending_count: 1, pending: [{ id: 1, ig_user_id: other, username: 'Zip_Kisi', action: 'unfollow', manual: false }] }))
    renderApp(<UsersPage />)
    expect(await screen.findByText('@veli')).toBeInTheDocument()
    expect(screen.queryByText('@zip_kisi')).not.toBeInTheDocument()                      // kuyrukta: normal listeden düştü
    await userEvent.click(screen.getByRole('button', { name: /^Kuyrukta\s*1$/ }))
    expect(screen.getByText('@zip_kisi')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Kuyruktan geri al: @zip_kisi' }))
    await waitFor(() => expect(bridge.cancelActions).toHaveBeenCalledWith('s1', ['zip_kisi']))
  })

  it('bulk selection also goes by username', async () => {
    renderApp(<UsersPage />)
    await screen.findAllByTitle('Takipten çık')
    const boxes = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-square'))
    await userEvent.click(boxes[0])
    await userEvent.click(await screen.findByRole('button', { name: /Toplu Çıkar/ }))
    await waitFor(() => expect(bridge.enqueueActions).toHaveBeenCalledWith('s1', 'unfollow', expect.arrayContaining(['zip_kisi', 'veli']), false))
  })
})
