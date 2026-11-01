import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import { BlobReader, ZipReader } from '@zip.js/zip.js'
import userEvent from '@testing-library/user-event'
import { renderApp } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn().mockResolvedValue([]) } }))

import GuidePage from '../pages/GuidePage'
import { guideContent, SECTION_ANCHOR, SECTION_ORDER } from '../guide/content'
import { buildExtensionZip, checklistMarkdown, extensionInfo, SAMPLE_FILES } from '../guide/files'

// SessionProvider oturum listesini asenkron çeker; act uyarısı çıkmasın diye o güncellemeyi bekle.
async function renderGuide(opts?: { lang?: string }) {
  const r = renderApp(<GuidePage />, opts)
  await act(async () => {})
  return r
}

describe('GuidePage', () => {
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders every section with a heading and a stable anchor', async () => {
    const { container } = await renderGuide()
    expect(screen.getByRole('heading', { level: 1, name: /Kullanım rehberi/ })).toBeInTheDocument()
    const C = guideContent('tr')
    for (const id of SECTION_ORDER) {
      expect(screen.getByRole('heading', { level: 2, name: C.sections[id] })).toBeInTheDocument()
      expect(container.querySelector(`section#${SECTION_ANCHOR[id]}`)).not.toBeNull()
    }
    // Diğer sayfalar bu çapalara bağlanıyor
    expect(container.querySelector('#kopru')).not.toBeNull()
    expect(container.querySelector('#referans')).not.toBeNull()
  })

  it('has the table of contents and in-app links', async () => {
    await renderGuide()
    const toc = screen.getByRole('navigation', { name: 'Bu sayfada' })
    expect(toc.querySelectorAll('a')).toHaveLength(SECTION_ORDER.length)
    expect(screen.getByRole('link', { name: /Kurulum sihirbazı/ })).toHaveAttribute('href', '/start')
    expect(screen.getAllByText(/Tüm zamanlar/).length).toBeGreaterThan(0)
  })

  it('offers sample and checklist downloads', async () => {
    const user = userEvent.setup()
    await renderGuide()
    const followers = screen.getByRole('button', { name: /followers_1\.json/ })
    expect(screen.getByRole('button', { name: /following\.json/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kontrol listesini indir/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zip olarak indir/ })).toBeInTheDocument()

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(followers)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('switches to English', async () => {
    await renderGuide({ lang: 'en' })
    expect(screen.getByRole('heading', { level: 1, name: /User guide/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Reference files' })).toBeInTheDocument()
    const C = guideContent('en')
    for (const s of C.bridge.install) expect(screen.getByRole('img', { name: s.alt })).toBeInTheDocument()
    for (const s of C.use.steps) expect(screen.getByRole('img', { name: s.alt })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: C.bridge.update.alt })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: C.bridge.update.fixAlt })).toBeInTheDocument()
    expect(screen.getByRole('note', { name: C.bridge.warning.title })).toBeInTheDocument()
  })

  it('shows an illustrated, numbered install step for every part of the setup', async () => {
    await renderGuide()
    const B = guideContent('tr').bridge
    // Her adımın bir resmi var ve resmin ekran okuyucu için bir adı var
    const arts = B.install.map(s => s.art)
    for (const id of ['appFolder', 'address', 'devmode', 'loadUnpacked', 'pickFolder', 'card', 'pin', 'reload', 'popup', 'connected'] as const) {
      expect(arts).toContain(id)
    }
    // Asıl yolda zip indirme ve açma adımı yok
    expect(arts).not.toContain('download' as never)
    expect(arts).not.toContain('unzip' as never)
    expect(arts[0]).toBe('appFolder')
    B.install.forEach((s, i) => {
      const img = screen.getByRole('img', { name: s.alt })
      expect(img.tagName.toLowerCase()).toBe('svg')
      expect(img.closest('figure')?.querySelector('figcaption')?.textContent).toBe(s.caption)
      expect(screen.getByRole('heading', { level: 4, name: `${B.stepLabel} ${i + 1}: ${s.title}` })).toBeInTheDocument()
    })
    expect(screen.getByRole('img', { name: B.warning.alt })).toBeInTheDocument()
    // Kurulum sorunları listesi
    expect(screen.getByRole('heading', { level: 3, name: B.troubleTitle })).toBeInTheDocument()
    expect(screen.getByText(/Manifest dosyası eksik/)).toBeInTheDocument()
  })

  it('installs from the app folder: InstaAnalytic → frontend → extension', async () => {
    const { container } = await renderGuide()
    for (const lang of ['tr', 'en']) {
      const B = guideContent(lang).bridge
      const first = B.install[0]
      expect(first.art).toBe('appFolder')
      expect(first.text).toMatch(/InstaAnalytic Kur\.command/)
      expect(first.text).toMatch(/frontend → extension/)
      expect(first.text).toMatch(/manifest\.json/)
      const pick = B.install.find(s => s.art === 'pickFolder')!
      expect(pick.text).toMatch(/InstaAnalytic\/frontend\/extension/)
      expect(pick.tip).toMatch(/manifest\.json/)
      // Kurulum adımlarında zip indirme ya da açma yok
      for (const s of B.install) expect(`${s.title} ${s.text} ${s.tip ?? ''}`).not.toMatch(/\.zip|unzip|ZIP dosyasını aç|ayıkla|Extract/i)
    }
    const C = guideContent('tr')
    const section = container.querySelector(`section#${SECTION_ANCHOR.bridge}`) as HTMLElement
    const folder = within(section).getByRole('img', { name: C.bridge.install[0].alt })
    expect(folder).toHaveTextContent('frontend')
    expect(folder).toHaveTextContent('extension')
    expect(folder).toHaveTextContent('manifest.json')
    expect(folder).toHaveTextContent('InstaAnalytic Kur.command')
    const picker = within(section).getByRole('img', { name: C.bridge.install.find(s => s.art === 'pickFolder')!.alt })
    expect(picker).toHaveTextContent('InstaAnalytic › frontend')
    expect(picker).toHaveTextContent('extension')
    // Zip yalnızca ikinci planda, kendiliğinden güncellenmediği söylenerek
    expect(section).toHaveTextContent(C.bridge.zipNote.text)
    expect(C.bridge.zipNote.text).toMatch(/kendiliğinden güncellenmez/)
  })

  it('copies chrome://extensions, which cannot be opened as a link', async () => {
    const user = userEvent.setup()
    await renderGuide()
    const btn = screen.getByRole('button', { name: 'Kopyala: chrome://extensions' })
    await user.click(btn)
    expect(await navigator.clipboard.readText()).toBe('chrome://extensions')
    expect(btn).toHaveTextContent('Kopyalandı')
    expect(screen.queryByRole('link', { name: /chrome:\/\/extensions/ })).toBeNull()
  })

  it('has a prominent warning callout with what to do', async () => {
    await renderGuide()
    const W = guideContent('tr').bridge.warning
    const note = screen.getByRole('note', { name: W.title })
    expect(note).toHaveAttribute('id', 'uyari')
    expect(note).toHaveTextContent('24 saat')
    expect(note).toHaveTextContent('72 saat')
    expect(note).toHaveTextContent(/kırmızı/)
    expect(note).toHaveTextContent(/429/)
    expect(note).toHaveTextContent(/Beğenen listelerini açmayı bırak/)
    expect(note).toHaveTextContent(/doğrulama/)
    expect(note).toHaveTextContent(/aşmaya çalışma/)
  })

  it('draws the new popup: save toggle, "Dinliyor" status, no "Şimdi dene" button', async () => {
    await renderGuide()
    const B = guideContent('tr').bridge
    const popup = B.install.find(s => s.art === 'popup')!
    const svg = screen.getByRole('img', { name: popup.alt })
    expect(svg).toHaveTextContent('InstaAnalytic Köprüsü')
    expect(svg).toHaveTextContent('Gezinirken beğenenleri kaydet')
    expect(svg).toHaveTextContent('Dinliyor')
    expect(svg).toHaveTextContent('Bugün')
    expect(svg).toHaveTextContent('Son kayıt')
    expect(svg).toHaveTextContent('Uygulamayı aç')
    // Sekmeler
    expect(svg).toHaveTextContent('Durum')
    expect(svg).toHaveTextContent('Ayarlar')
    expect(svg).toHaveTextContent('Güncelleme')
    expect(svg).not.toHaveTextContent('Şimdi dene')
    const connected = B.install.find(s => s.art === 'connected')!
    expect(screen.getByRole('img', { name: connected.alt })).toHaveTextContent('Dinliyor')
  })

  it('has an illustrated usage section with at least 5 named steps', async () => {
    const { container } = await renderGuide()
    const C = guideContent('tr')
    const section = container.querySelector(`section#${SECTION_ANCHOR.use}`) as HTMLElement
    expect(section).not.toBeNull()
    expect(SECTION_ANCHOR.use).toBe('kullanim')
    expect(C.use.steps.length).toBeGreaterThanOrEqual(5)
    const within_ = within(section)
    C.use.steps.forEach((s, i) => {
      const img = within_.getByRole('img', { name: s.alt })
      expect(img.tagName.toLowerCase()).toBe('svg')
      expect(s.alt.length).toBeGreaterThan(20)
      expect(img.closest('figure')?.querySelector('figcaption')?.textContent).toBe(s.caption)
      expect(within_.getByRole('heading', { level: 4, name: `${C.bridge.stepLabel} ${i + 1}: ${s.title}` })).toBeInTheDocument()
    })
    expect(section).toHaveTextContent('5–10')
    expect(within_.getByRole('heading', { level: 3, name: C.use.troubleTitle })).toBeInTheDocument()
    expect(section).toHaveTextContent(/profilini aç/)
    // Başlık kimlikleri kurulum adımlarıyla çakışmasın
    const ids = Array.from(container.querySelectorAll('[id]')).map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('explains that the extension updates itself, with the Güncelleme tab and the one-time zip fix', async () => {
    const { container } = await renderGuide()
    const U = guideContent('tr').bridge.update
    const block = container.querySelector('#guncelle') as HTMLElement
    expect(block).not.toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: U.title })).toBeInTheDocument()
    expect(U.intro).toMatch(/yapman gereken bir şey yok/)
    expect(block.querySelectorAll('ol > li')).toHaveLength(U.steps.length + U.fixSteps.length)
    expect(block).toHaveTextContent(/Instagram sekmesini bir kez yenile/)
    expect(block).toHaveTextContent('Eklenti X sürümüne güncellendi')
    // Güncelleme sekmesinin resmi, erişilebilir adıyla
    const tab = within(block).getByRole('img', { name: U.alt })
    expect(tab.tagName.toLowerCase()).toBe('svg')
    expect(tab).toHaveTextContent('Güncelleme')
    expect(tab).toHaveTextContent('Yüklü sürüm')
    expect(tab).toHaveTextContent('Uygulamadaki sürüm')
    expect(tab).toHaveTextContent('Güncel')
    expect(tab).toHaveTextContent('Şimdi denetle')
    expect(tab.closest('figure')?.querySelector('figcaption')?.textContent).toBe(U.caption)
    // Zip kopyası için bir kerelik düzeltme
    expect(within(block).getByRole('heading', { level: 4, name: U.fixTitle })).toBeInTheDocument()
    expect(U.fixIntro).toMatch(/kendiliğinden güncellenemez/)
    expect(U.fixSteps.some(s => /Kaldır/.test(s.text))).toBe(true)
    expect(U.fixSteps.some(s => /InstaAnalytic\/frontend\/extension/.test(s.text))).toBe(true)
    const manual = within(block).getByRole('img', { name: U.fixAlt })
    expect(manual).toHaveTextContent('elle kurulum gerekiyor')
    expect(manual).toHaveTextContent('↑')
  })

  it('lists the update problems in troubleshooting', async () => {
    const { container } = await renderGuide()
    const section = container.querySelector(`section#${SECTION_ANCHOR.bridge}`) as HTMLElement
    const table = within(section).getByRole('table', { name: guideContent('tr').bridge.troubleTitle })
    expect(within(table).getByRole('rowheader', { name: /elle kurulum gerekiyor/ })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /güncellendi.*kayıt olmuyor/ })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /Eklentin güncel değil/ })).toBeInTheDocument()
  })

  it('shows the short ZIP export path', async () => {
    await renderGuide()
    const path = screen.getByRole('list', { name: 'Kısa yol' })
    expect(path.querySelectorAll('li')).toHaveLength(guideContent('tr').zip.path.length)
    expect(path).toHaveTextContent('JSON')
  })
})

describe('guide content', () => {
  it('no longer mentions removed rules (night pause, 3-day wait)', () => {
    for (const lang of ['tr', 'en']) {
      const C = guideContent(lang)
      const all = JSON.stringify(C) + checklistMarkdown(C)
      expect(all).not.toMatch(/01:00|08:00/)
      expect(all).not.toMatch(/3 günlük|3 gün dolmadan|Sessiz saatler|gece/i)
      expect(all).not.toMatch(/Quiet hours|until it is 3 days old|younger than 3 days/i)
    }
  })

  it('no longer describes timers or pacing of the old extension', () => {
    for (const lang of ['tr', 'en']) {
      const C = guideContent(lang)
      const all = JSON.stringify(C) + checklistMarkdown(C)
      // Eski "Şimdi dene" düğmesi; yeni Güncelleme sekmesindeki "Şimdi denetle" ayrı bir şey
      expect(all).not.toMatch(/Şimdi dene(?!tle)|Try now/)
      expect(all).not.toMatch(/25–80|25-80/)
      expect(all).not.toMatch(/günde 12|12 posts a day|12, 20/i)
      expect(all).not.toMatch(/bilgisayar(ın)? başında|at the computer/i)
      expect(all).not.toMatch(/3 gününde|first 3 days/i)
      expect(all).not.toMatch(/istekler arası|between requests/i)
      expect(all).not.toMatch(/toplamaya izin ver/)
    }
  })

  it('never tells the user to re-download or copy files on every update', () => {
    for (const lang of ['tr', 'en']) {
      const C = guideContent(lang)
      const all = JSON.stringify(C) + checklistMarkdown(C)
      expect(all).not.toMatch(/yeniden indir|tekrar indir|download (it|the extension) again/i)
      expect(all).not.toMatch(/içindekileri (sil|yenileriyle)|Replace what is inside|Delete what is inside/i)
      expect(all).not.toMatch(/instaanalytic-kopru klasör|instaanalytic-kopru folder/i)
      expect(all).not.toMatch(/↻/)
      const U = C.bridge.update
      for (const s of U.steps) expect(s.text).not.toMatch(/\bindir\b|\.zip|Download the/i)
    }
    // Zip yolu kendiliğinden güncellenmediği söylenerek anlatılır
    expect(guideContent('tr').files.ext.text).toMatch(/kendiliğinden güncellenmez/)
    expect(guideContent('en').files.ext.text).toMatch(/does not update itself/)
    expect(guideContent('en').bridge.zipNote.text).toMatch(/does not update itself/)
  })

  it('both languages have the same install, usage and update steps', () => {
    const tr = guideContent('tr')
    const en = guideContent('en')
    expect(en.bridge.install.map(s => s.art)).toEqual(tr.bridge.install.map(s => s.art))
    expect(new Set(tr.bridge.install.map(s => s.art)).size).toBe(tr.bridge.install.length)
    expect(en.use.steps.map(s => s.art)).toEqual(tr.use.steps.map(s => s.art))
    expect(en.bridge.update.steps).toHaveLength(tr.bridge.update.steps.length)
    expect(en.bridge.update.fixSteps).toHaveLength(tr.bridge.update.fixSteps.length)
    expect(en.bridge.trouble).toHaveLength(tr.bridge.trouble.length)
    expect(en.faq.items).toHaveLength(tr.faq.items.length)
    expect(en.checklistDoc.groups.map(g => g.items.length)).toEqual(tr.checklistDoc.groups.map(g => g.items.length))
  })
})

describe('guide files', () => {
  it('samples follow the Instagram export shape', () => {
    const followers = JSON.parse(SAMPLE_FILES.find(f => f.name === 'followers_1.json')!.text)
    const following = JSON.parse(SAMPLE_FILES.find(f => f.name === 'following.json')!.text)
    expect(Array.isArray(followers)).toBe(true)
    expect(followers[0].string_list_data[0]).toMatchObject({ value: expect.any(String), timestamp: expect.any(Number) })
    expect(Array.isArray(following.relationships_following)).toBe(true)
    expect(following.relationships_following[0].title).toMatch(/^ornek/)
  })

  it.skipIf(!extensionInfo().available)('packs the extension under one folder', async () => {
    const blob = await buildExtensionZip()
    const reader = new ZipReader(new BlobReader(blob))
    const names = (await reader.getEntries()).map(e => e.filename)
    await reader.close()
    expect(names).toContain('instaanalytic-kopru/manifest.json')
    expect(names.every(n => n.startsWith('instaanalytic-kopru/'))).toBe(true)
  })

  it('checklist markdown has a checkbox for every item', () => {
    const C = guideContent('tr')
    const md = checklistMarkdown(C)
    const total = C.checklistDoc.groups.reduce((n, g) => n + g.items.length, 0)
    expect(md.startsWith(`# ${C.checklistDoc.title}`)).toBe(true)
    expect(md.match(/- \[ \] /g)).toHaveLength(total)
  })
})
