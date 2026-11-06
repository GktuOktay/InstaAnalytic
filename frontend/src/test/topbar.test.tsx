import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))
vi.mock('../api/notifications', () => ({ notificationsApi: { list: vi.fn(), unread: vi.fn(), read: vi.fn(), readAll: vi.fn(), clear: vi.fn() } }))

import { sessionsApi } from '../api/sessions'
import { notificationsApi } from '../api/notifications'
import Topbar from '../components/Topbar'
import { useSession } from '../contexts/SessionContext'

const sess = sessionsApi as unknown as Record<string, ReturnType<typeof vi.fn>>
const nApi = notificationsApi as unknown as Record<string, ReturnType<typeof vi.fn>>

const note = (id: number, kind: string, level: string, params: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id, session_id: 's1', kind, level, params, link: '/monitor', created_at: new Date(Date.now() - 5 * 60_000).toISOString(), read: false, ...over,
})

function ActiveProbe() { const { activeId } = useSession(); return <p data-testid="active">{activeId}</p> }

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  sess.list.mockResolvedValue([makeSession({ id: 's1', ig_username: 'ilk' }), makeSession({ id: 's2', ig_username: 'ikinci', source: 'browser' })])
  nApi.unread.mockResolvedValue(0)
  nApi.list.mockResolvedValue({ unread: 0, items: [] })
  nApi.read.mockResolvedValue({ ok: true })
  nApi.readAll.mockResolvedValue({ updated: 0 })
  nApi.clear.mockResolvedValue({ removed: 0 })
})

describe('Topbar — profile menu', () => {
  it('shows the active profile and switches it for the whole app', async () => {
    renderApp(<><Topbar /><ActiveProbe /></>)
    const trigger = await screen.findByRole('button', { name: 'Hesap menüsü' })
    expect(trigger).toHaveTextContent('@ilk')
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menuitemradio', { name: /@ikinci/ }))
    expect(screen.getByTestId('active')).toHaveTextContent('s2')
    expect(trigger).toHaveTextContent('@ikinci')
    expect(localStorage.getItem('activeSession')).toBe('s2')            // yenilemede hatırlanır
  })

  it('remembers the choice and falls back to the first profile if it no longer exists', async () => {
    localStorage.setItem('activeSession', 's2')
    const first = renderApp(<ActiveProbe />)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('s2'))
    first.unmount()
    localStorage.setItem('activeSession', 'silinmis')
    renderApp(<ActiveProbe />)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('s1'))
  })

  it('theme and language buttons live in the topbar', async () => {
    renderApp(<Topbar />)
    expect(await screen.findByRole('button', { name: 'Açık tema' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByRole('button', { name: 'Türkçe' })).toBeInTheDocument()
  })
})

describe('Topbar — notification bell', () => {
  it('shows an unread badge and writes each notification in the chosen language', async () => {
    nApi.unread.mockResolvedValue(2)
    nApi.list.mockResolvedValue({ unread: 2, items: [
      note(2, 'job_partial', 'warning', { job: 'likers', done: 10, total: 10, ok: 7, saved: 640 }),
      note(1, 'actions_blocked', 'error', {}),
    ] })
    renderApp(<Topbar />)
    const bell = await screen.findByRole('button', { name: '2 okunmamış bildirim' })
    await userEvent.click(bell)
    expect(await screen.findByText('Beğenenler bitti, bazı sorunlar var')).toBeInTheDocument()
    expect(screen.getByText('10 işlendi, 7 tanesi tamam')).toBeInTheDocument()
    expect(screen.getByText('Instagram işlemi engelledi')).toBeInTheDocument()
    expect(screen.getAllByText('5 dk önce').length).toBe(2)
  })

  it('English mode: the same notifications are fully English', async () => {
    nApi.unread.mockResolvedValue(1)
    nApi.list.mockResolvedValue({ unread: 1, items: [note(1, 'sync_completed', 'success', { job_type: 'followers', items: 120 })] })
    renderApp(<Topbar />, { lang: 'en' })
    await userEvent.click(await screen.findByRole('button', { name: '1 unread notifications' }))
    expect(await screen.findByText('Follower scan finished')).toBeInTheDocument()
    expect(screen.getByText('120 records processed')).toBeInTheDocument()
    expect(screen.getByText('5 min ago')).toBeInTheDocument()
  })

  it('clicking a notification marks it read and opens its page', async () => {
    nApi.unread.mockResolvedValue(1)
    nApi.list.mockResolvedValue({ unread: 1, items: [note(7, 'job_ok', 'success', { job: 'posts', done: 1, total: 1, ok: 1, saved: 50 })] })
    renderApp(<Topbar />)
    await userEvent.click(await screen.findByRole('button', { name: '1 okunmamış bildirim' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Gönderi listesi bitti/ }))
    expect(nApi.read).toHaveBeenCalledWith(7)
  })

  it('empty state, mark-all and clear', async () => {
    nApi.unread.mockResolvedValue(1)
    nApi.list.mockResolvedValue({ unread: 1, items: [note(1, 'job_ok', 'success', { job: 'posts', done: 1, total: 1, ok: 1, saved: 1 })] })
    renderApp(<Topbar />)
    await userEvent.click(await screen.findByRole('button', { name: '1 okunmamış bildirim' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Tümünü okundu say' }))
    expect(nApi.readAll).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Temizle' }))
    expect(nApi.clear).toHaveBeenCalled()
  })

  it('an unknown notification kind from a newer server does not break the list', async () => {
    nApi.unread.mockResolvedValue(1)
    nApi.list.mockResolvedValue({ unread: 1, items: [note(1, 'baska_bir_tur', 'info', {})] })
    renderApp(<Topbar />)
    await userEvent.click(await screen.findByRole('button', { name: '1 okunmamış bildirim' }))
    expect(await screen.findByText('Bildirim')).toBeInTheDocument()
  })

  it('stays usable when the notifications API is down', async () => {
    nApi.unread.mockRejectedValue(new Error('down'))
    renderApp(<Topbar />)
    expect(await screen.findByRole('button', { name: 'Bildirimleri aç' })).toBeInTheDocument()
  })
})
