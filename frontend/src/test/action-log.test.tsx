import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp, makeSession } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn() } }))
vi.mock('../api/actions', () => ({ actionsApi: { log: vi.fn() } }))

import { sessionsApi } from '../api/sessions'
import { actionsApi } from '../api/actions'
import ActionLogPage from '../pages/ActionLogPage'
import { actionNoteKey } from '../lib/actionNotes'

const sess = sessionsApi as unknown as Record<string, ReturnType<typeof vi.fn>>
const log = actionsApi.log as unknown as ReturnType<typeof vi.fn>
const entry = (id: number, status: string, error_msg: string | null) => ({
  id, ig_user_id: id, ig_username: `kisi${id}`, action_type: 'unfollow', status, error_msg,
  created_at: '2026-11-06T09:00:00Z', executed_at: '2026-11-06T09:00:30Z',
})

beforeEach(() => {
  vi.resetAllMocks()
  sess.list.mockResolvedValue([makeSession({ source: 'zip' })])
})

describe('ActionLogPage — extension notes', () => {
  it('"Profil düğmeleri bulunamadı" is explained as a missing button, not as a 404 "not found"', async () => {
    log.mockResolvedValue([entry(1, 'failed', 'Profil düğmeleri bulunamadı; sayfa yüklenmedi ya da Instagram düzeni değişmiş olabilir.')])
    renderApp(<ActionLogPage />)
    expect(await screen.findByText(/takip düğmesi tanınamadı/)).toBeInTheDocument()
    expect(screen.queryByText(/Aradığın şey bulunamadı|404/i)).not.toBeInTheDocument()
    expect(screen.getByText('Ayrıntı')).toBeInTheDocument()                    // ham not "Ayrıntı" altında saklı
  })

  it('English mode shows the same notes in English', async () => {
    log.mockResolvedValue([
      entry(1, 'failed', 'Takip düğmesi tanınmadı (sayfadaki düğmeler: Seçenekler | Mesaj Gönder). Instagram sayfa düzeni değişmiş olabilir.'),
      entry(2, 'skipped', 'Zaten takip etmiyorsunuz.'),
      entry(3, 'failed', 'Hesap bulunamadı: silinmiş, dondurulmuş ya da kullanıcı adı değişmiş olabilir.'),
    ])
    renderApp(<ActionLogPage />, { lang: 'en' })
    expect(await screen.findByText(/follow button was not recognised/)).toBeInTheDocument()
    expect(screen.getByText(/You were not following them already/)).toBeInTheDocument()
    expect(screen.getByText(/Account not found: deleted, suspended/)).toBeInTheDocument()
  })

  it('a skipped entry is shown in a neutral colour, a failed one in red', async () => {
    log.mockResolvedValue([entry(1, 'skipped', 'Zaten takip etmiyorsunuz.'), entry(2, 'failed', 'Hesap bulunamadı: silinmiş.')])
    renderApp(<ActionLogPage />)
    expect((await screen.findByText(/Zaten takip etmiyordun/)).className).toContain('text-gray-400')
    expect(screen.getByText(/Hesap bulunamadı: silinmiş, dondurulmuş/).className).toContain('text-red-400')
  })

  it('recognises every note the extension can write', () => {
    for (const n of ['Yapıldı.', 'Zaten takip etmiyorsunuz.', 'Zaten takip ediyorsunuz.', 'Takip isteği zaten gönderilmiş.',
      'Gizli hesap: takip isteği gönderildi.', 'Hesap bulunamadı: x', 'Takip düğmesi kayboldu; sayfa değişti.',
      'Profil düğmeleri bulunamadı; x', 'Düğmeye tıklandı ama sonuç doğrulanamadı; x', 'Instagram işlemi engelledi.',
      'Instagram bir kısıtlama uyarısı gösterdi.', "Instagram giriş sayfası açıldı; x", 'Kendi hesabınız için işlem yapılmaz.', 'Geçersiz işlem.']) {
      expect(actionNoteKey(n), n).not.toBeNull()
    }
  })
})
