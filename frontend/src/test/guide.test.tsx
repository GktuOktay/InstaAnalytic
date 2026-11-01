import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { BlobReader, ZipReader } from '@zip.js/zip.js'
import userEvent from '@testing-library/user-event'
import { renderApp } from './utils'

vi.mock('../api/sessions', () => ({ sessionsApi: { list: vi.fn().mockResolvedValue([]) } }))

import GuidePage from '../pages/GuidePage'
import { guideContent, SECTION_ANCHOR, SECTION_ORDER, TOOL_ANCHOR, TOOL_IDS } from '../guide/content'
import { buildExtensionZip, checklistMarkdown, extensionInfo, SAMPLE_FILES } from '../guide/files'
import { ART_IDS, Illustration } from '../guide/illustrations'

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
    for (const t of C.use.tools) {
      expect(screen.getByRole('region', { name: t.title })).toBeInTheDocument()
      for (const s of t.steps) expect(screen.getByRole('img', { name: s.alt })).toBeInTheDocument()
    }
    expect(screen.getByRole('img', { name: C.use.off.alt })).toBeInTheDocument()
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

  it('draws the popup as it is now: logo, master switch, Araçlar tab and the three tool cards', async () => {
    await renderGuide()
    const B = guideContent('tr').bridge
    const popup = B.install.find(s => s.art === 'popup')!
    const svg = screen.getByRole('img', { name: popup.alt })
    // Uygulama çubuğu: logo, ad, sürüm
    expect(svg.querySelector('rect[width="128"][rx="30"]')).not.toBeNull()
    expect(svg).toHaveTextContent('InstaAnalytic')
    expect(svg).toHaveTextContent('Köprü v2.3.0')
    // Sekmeler
    expect(svg).toHaveTextContent('Araçlar')
    expect(svg).toHaveTextContent('Ayarlar')
    expect(svg).toHaveTextContent('Güncelleme')
    // Üç araç kartı, düğmeleri ve sayıları
    for (const t of ['Gönderi listesi', 'Beğenenler', 'Yorumlar', 'Profilimi aç', 'Sıradaki gönderiyi aç']) {
      expect(svg).toHaveTextContent(t)
    }
    expect(svg).toHaveTextContent('50 gönderi bulundu')
    expect(svg).toHaveTextContent('12 / 50 gönderi okundu')
    expect(svg).toHaveTextContent('9 gönderinin yorumları kaydedildi')
    // Durum kutusu ve alt düğme
    expect(svg).toHaveTextContent('Dinliyor.')
    expect(svg).toHaveTextContent('Bugün')
    expect(svg).toHaveTextContent('Son kayıt')
    expect(svg).toHaveTextContent('Uygulamayı aç')
    // Eski pencere yok
    expect(svg).not.toHaveTextContent('Gezinirken beğenenleri kaydet')
    expect(svg).not.toHaveTextContent('Durum')
    expect(svg).not.toHaveTextContent('Şimdi dene')
    expect(popup.text).toMatch(/Eklenti simgesine tıkla, sağ üstteki anahtarı aç; Ayarlar sekmesinden profilini kontrol et\./)
    const connected = B.install.find(s => s.art === 'connected')!
    expect(screen.getByRole('img', { name: connected.alt })).toHaveTextContent('Dinliyor')
  })

  it('draws the app logo as the toolbar icon, with the red "!" and amber "↑" badges', async () => {
    const { container } = await renderGuide()
    const B = guideContent('tr').bridge
    const logo = 'rect[width="128"][rx="30"]'
    for (const art of ['card', 'pin', 'popup', 'connected'] as const) {
      const s = B.install.find(x => x.art === art)!
      expect(screen.getByRole('img', { name: s.alt }).querySelector(logo)).not.toBeNull()
    }
    const warning = screen.getByRole('img', { name: B.warning.alt })
    expect(warning.querySelector(logo)).not.toBeNull()
    expect(warning).toHaveTextContent('!')
    const manual = within(container.querySelector('#guncelle') as HTMLElement).getByRole('img', { name: B.update.fixAlt })
    expect(manual.querySelector(logo)).not.toBeNull()
    expect(manual).toHaveTextContent('↑')
  })

  it('explains the three tools as separate, illustrated blocks in the usage section', async () => {
    const { container } = await renderGuide()
    const C = guideContent('tr')
    const section = container.querySelector(`section#${SECTION_ANCHOR.use}`) as HTMLElement
    expect(section).not.toBeNull()
    expect(SECTION_ANCHOR.use).toBe('kullanim')
    const within_ = within(section)

    // Önce: pencereyi aç
    const start = within_.getByRole('img', { name: C.use.steps[0].alt })
    for (const t of ['Araçlar', 'Gönderi listesi', 'Beğenenler', 'Yorumlar']) expect(start).toHaveTextContent(t)

    // Her araç için ayrı, başlıklı bir blok
    expect(C.use.tools.map(t => t.id)).toEqual(TOOL_IDS)
    for (const tool of C.use.tools) {
      const block = within_.getByRole('region', { name: tool.title })
      expect(block).toHaveAttribute('id', TOOL_ANCHOR[tool.id])
      expect(block).toHaveAttribute('data-tool', tool.id)
      expect(block).toHaveTextContent(tool.what)
      tool.steps.forEach((s, i) => {
        const img = within(block).getByRole('img', { name: s.alt })
        expect(img.tagName.toLowerCase()).toBe('svg')
        expect(s.alt.length).toBeGreaterThan(20)
        expect(img.closest('figure')?.querySelector('figcaption')?.textContent).toBe(s.caption)
        expect(within(block).getByRole('heading', { level: 4, name: `${C.bridge.stepLabel} ${i + 1}: ${s.title}` })).toBeInTheDocument()
      })
    }
    const block = (id: 'posts' | 'likers' | 'comments') => within_.getByRole('region', { name: C.use.tools.find(t => t.id === id)!.title })
    // Gönderi listesi: "Profilimi aç", sona kadar kaydır, "N gönderi bulundu"
    expect(block('posts')).toHaveTextContent('Profilimi aç')
    expect(block('posts')).toHaveTextContent(/sonuna gelene kadar aşağı kaydır/)
    expect(block('posts')).toHaveTextContent('N gönderi bulundu')
    // Beğenenler: "Sıradaki gönderiyi aç", beğenme sayısına tıkla, sona kadar kaydır, çubuk dolar, 5–10
    expect(block('likers')).toHaveTextContent('Sıradaki gönderiyi aç')
    expect(block('likers')).toHaveTextContent(/"X beğenme" yazısına tıkla/)
    expect(block('likers')).toHaveTextContent(/en alta kadar kaydır/)
    expect(block('likers')).toHaveTextContent(/çubuk biraz dolar/)
    expect(block('likers')).toHaveTextContent('Hepsi okundu')
    expect(block('likers')).toHaveTextContent('5–10')
    // Yorumlar: ayrıca bir şey yapmaya gerek yok
    expect(block('comments')).toHaveTextContent(/Ayrıca bir şey yapman gerekmez/)
    expect(block('comments')).toHaveTextContent(/yorum yapanları kendiliğinden kaydeder/)

    // Kapatılan araç hiçbir şey kaydetmez
    expect(within_.getByRole('heading', { level: 3, name: C.use.off.title })).toBeInTheDocument()
    expect(C.use.off.text).toMatch(/hiçbir şey kaydetmez/)
    expect(C.use.off.text).toMatch(/Köprü kapalı\. Sağ üstteki anahtarla açın\./)
    const off = within_.getByRole('img', { name: C.use.off.alt })
    expect(off).toHaveTextContent('Yorumlar')

    expect(within_.getByRole('heading', { level: 3, name: C.use.troubleTitle })).toBeInTheDocument()
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

  it('no longer mentions the old popup ("Gezinirken beğenenleri kaydet" toggle, "Durum" tab)', () => {
    for (const lang of ['tr', 'en']) {
      const C = guideContent(lang)
      const all = JSON.stringify(C) + checklistMarkdown(C)
      expect(all).not.toMatch(/Gezinirken beğenenleri kaydet|save likers while browsing/i)
      expect(all).not.toMatch(/Durum sekme|Durum tab|Durum \(status\)/)
      expect(Object.values(C.bridge.ui)).not.toContain('Durum')
      // Kurulumdaki pencere adımı ve kontrol listesi yeni ana anahtarı anlatır
      const popup = C.bridge.install.find(s => s.art === 'popup')!
      expect(popup.text).toMatch(/sağ üstteki anahtar|switch at the top right/)
      expect(popup.text).toMatch(/Araçlar/)
      expect(checklistMarkdown(C)).toMatch(/sağ üstteki anahtar|switch at the top right/)
      for (const t of ['Profilimi aç', 'Sıradaki gönderiyi aç']) expect(checklistMarkdown(C)).toContain(t)
    }
  })

  it('no illustration draws the old popup', () => {
    for (const lang of ['tr', 'en']) {
      const ui = guideContent(lang).bridge.ui
      for (const id of ART_IDS) {
        const { container, unmount } = render(<Illustration id={id} ui={ui} alt={id} caption={id} />)
        expect(container).not.toHaveTextContent('Gezinirken beğenenleri kaydet')
        expect(container).not.toHaveTextContent('Durum')
        unmount()
      }
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
    expect(en.use.tools.map(t => t.id)).toEqual(tr.use.tools.map(t => t.id))
    expect(en.use.tools.map(t => t.steps.map(s => s.art))).toEqual(tr.use.tools.map(t => t.steps.map(s => s.art)))
    expect(en.use.tools.map(t => !!t.tip)).toEqual(tr.use.tools.map(t => !!t.tip))
    expect(en.use.trouble).toHaveLength(tr.use.trouble.length)
    // Eklenti penceresi yalnızca Türkçe; iki dilde de aynı çizilir
    expect(en.bridge.ui.popupTools).toEqual(tr.bridge.ui.popupTools)
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
    // Görseller (simgeler) uygulamanın adresinden URL ile çekilir; jsdom göreli adresi çözemediği için taklit et.
    // Yanıt jsdom'un Blob'uyla değil baytlarla kurulur: jsdom'un Blob'unda zip.js'in istediği stream() yok.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([137, 80, 78, 71])))
    const blob = await buildExtensionZip()
    const reader = new ZipReader(new BlobReader(blob))
    const names = (await reader.getEntries()).map(e => e.filename)
    await reader.close()
    expect(names).toContain('instaanalytic-kopru/manifest.json')
    expect(names.every(n => n.startsWith('instaanalytic-kopru/'))).toBe(true)
    // Simgeler varsa onlar da pakette
    for (const call of fetchMock.mock.calls) {
      const path = String(call[0]).split('/extension/')[1]
      if (path) expect(names).toContain(`instaanalytic-kopru/${path}`)
    }
    fetchMock.mockRestore()
  })

  it('checklist markdown has a checkbox for every item', () => {
    const C = guideContent('tr')
    const md = checklistMarkdown(C)
    const total = C.checklistDoc.groups.reduce((n, g) => n + g.items.length, 0)
    expect(md.startsWith(`# ${C.checklistDoc.title}`)).toBe(true)
    expect(md.match(/- \[ \] /g)).toHaveLength(total)
  })
})
