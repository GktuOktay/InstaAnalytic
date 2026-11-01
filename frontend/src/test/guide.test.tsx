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
    // Uyarı bir engel değil: öneri 24/72 saat ara, telefondan normal kullanım, doğrulamayı kendin yap, yavaş git
    expect(note).toHaveTextContent(/uyarı, engel değil/)
    expect(note).toHaveTextContent(/Ara ver/)
    expect(note).toHaveTextContent(/telefonundan/)
    expect(note).toHaveTextContent(/doğrulama isterse onu kendin tamamla/)
    expect(note).toHaveTextContent(/Devam edersen daha yavaş git/)
    expect(note).toHaveTextContent(/aşmaya çalışma/)
    // Kendiliğinden durdurma, duraklatma ya da engelleme anlatılmaz
    expect(note).not.toHaveTextContent(/durduruldu\b|\bdurur\b|duraklat|engellen|beğenen listesi açma|açmayı bırak/i)
    // Resimdeki şerit uygulamanınkiyle aynı: ara önerisi ve "Hiçbir şey durdurulmadı"
    const art = within(note).getByRole('img', { name: W.alt })
    // Şeridin ilk satırı iki satıra bölünür (tspan'ler arasında boşluk yok)
    expect(art).toHaveTextContent(/tarihine kadar ara vermeni\s*öneririz/)
    expect(art).toHaveTextContent('Hiçbir şey durdurulmadı; devam edip etmemek senin kararın.')
  })

  it('draws the popup as it is now: logo, master switch, Araçlar tab and the three tool cards', async () => {
    await renderGuide()
    const B = guideContent('tr').bridge
    const popup = B.install.find(s => s.art === 'popup')!
    const svg = screen.getByRole('img', { name: popup.alt })
    // Uygulama çubuğu: logo, ad, sürüm
    expect(svg.querySelector('rect[width="128"][rx="30"]')).not.toBeNull()
    expect(svg).toHaveTextContent('InstaAnalytic')
    expect(svg).toHaveTextContent('Köprü v2.4.0')
    // Sekmeler
    expect(svg).toHaveTextContent('Araçlar')
    expect(svg).toHaveTextContent('Ayarlar')
    expect(svg).toHaveTextContent('Güncelleme')
    // Üç araç kartı, iş düğmeleri ve sayıları
    for (const t of ['Gönderi listesi', 'Beğenenler', 'Yorumlar', 'Gönderileri çek', 'Beğenenleri çek', 'Yorumları çek']) {
      expect(svg).toHaveTextContent(t)
    }
    expect(svg).not.toHaveTextContent('Profilimi aç')
    expect(svg).not.toHaveTextContent('Sıradaki gönderiyi aç')
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

  it('explains the three jobs, where to start them and how to stop them', async () => {
    const { container } = await renderGuide()
    const C = guideContent('tr')
    const section = container.querySelector(`section#${SECTION_ANCHOR.use}`) as HTMLElement
    expect(section).not.toBeNull()
    expect(SECTION_ANCHOR.use).toBe('kullanim')
    const within_ = within(section)

    // İşi başlatmanın üç yolu: uygulamanın Gönderiler sayfası, tek gönderi paneli, eklenti penceresi
    expect(C.use.steps.map(s => s.art)).toEqual(['appJobs', 'postDetail', 'popupJobs'])
    C.use.steps.forEach((s, i) => {
      const img = within_.getByRole('img', { name: s.alt })
      expect(img.tagName.toLowerCase()).toBe('svg')
      expect(img.closest('figure')?.querySelector('figcaption')?.textContent).toBe(s.caption)
      expect(within_.getByRole('heading', { level: 4, name: `${C.bridge.stepLabel} ${i + 1}: ${s.title}` })).toBeInTheDocument()
    })
    const art = (id: string) => within_.getByRole('img', { name: C.use.steps.find(s => s.art === id)!.alt })
    // Uygulamanın Gönderiler sayfası: üç düğme ve iş kutusu ("Beğenenler: 3 / 12", "Durdur")
    for (const t of ['Gönderileri çek', 'Beğenenleri çek', 'Yorumları çek', 'Beğenenler: 3 / 12', 'Durdur']) {
      expect(art('appJobs')).toHaveTextContent(t)
    }
    // Gönderi paneli: yalnızca bu gönderi için iki düğme
    expect(art('postDetail')).toHaveTextContent('Bu gönderinin beğenenlerini çek')
    expect(art('postDetail')).toHaveTextContent('Bu gönderinin yorumlarını çek')
    // Eklenti penceresi: kartlarda iş düğmeleri, üstte iş çubuğu
    for (const t of ['Gönderileri çek', 'Beğenenleri çek', 'Yorumları çek', 'Beğenenler: 3 / 12', 'Durdur']) {
      expect(art('popupJobs')).toHaveTextContent(t)
    }
    // Metinde de: üç düğme, tek gönderi düğmeleri, eklenti bulunamadı notu
    for (const t of ['"Gönderileri çek"', '"Beğenenleri çek"', '"Yorumları çek"', '"Bu gönderinin beğenenlerini çek"', '"Bu gönderinin yorumlarını çek"']) {
      expect(section).toHaveTextContent(t)
    }
    expect(section).toHaveTextContent(/eklenti bu sayfada bulunamadı/)
    expect(section).toHaveTextContent(/sayfayı bir kez yenile/)
    // Durdurmak: "Durdur" ya da sekmeyi kapatmak
    expect(C.use.stop.text).toMatch(/"Durdur"/)
    expect(C.use.stop.text).toMatch(/sekmesini kapatmak da işi durdurur/)
    expect(section).toHaveTextContent(C.use.stop.text)

    // Her iş için ayrı, başlıklı bir blok
    expect(C.use.tools.map(t => t.id)).toEqual(TOOL_IDS)
    expect(C.use.tools.map(t => t.title)).toEqual(['Gönderileri çek', 'Beğenenleri çek', 'Yorumları çek'])
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
    expect(block('posts')).toHaveTextContent(/sonuna gelene kadar yavaşça aşağı kaydırır/)
    expect(block('posts')).toHaveTextContent('N gönderi bulundu')
    expect(block('likers')).toHaveTextContent(/"X beğenme" yazısına tıklar/)
    expect(block('likers')).toHaveTextContent('6–18 saniye')
    expect(block('likers')).toHaveTextContent('Hepsi okundu')
    expect(block('likers')).toHaveTextContent('5–10')
    expect(block('comments')).toHaveTextContent(/"daha fazla yorum" düğmesine basar/)
    expect(within(block('comments')).getByRole('img')).toHaveTextContent('Daha fazla yorum yükle')

    // Kendin gezerken de kaydeder; anahtarlar yalnızca bunu açıp kapatır
    expect(within_.getByRole('heading', { level: 3, name: C.use.passive.title })).toBeInTheDocument()
    expect(within_.getByRole('heading', { level: 3, name: C.use.off.title })).toBeInTheDocument()
    expect(C.use.off.text).toMatch(/hiçbir şey kaydetmez/)
    expect(C.use.off.text).toMatch(/İş düğmeleri anahtarlardan bağımsız/)
    expect(C.use.off.text).toMatch(/Köprü kapalı\. Sağ üstteki anahtarla açın\./)
    expect(within_.getByRole('img', { name: C.use.off.alt })).toHaveTextContent('Yorumlar')

    // Sorunlar: eklenti bulunamadı, beğenenler gelmedi, sekme kapatıldı
    const table = within_.getByRole('table', { name: C.use.troubleTitle })
    expect(within(table).getByRole('rowheader', { name: /eklenti bu sayfada bulunamadı/ })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /İş başladı ama beğenenler gelmedi/ })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /Sekmeyi kapattım/ })).toBeInTheDocument()
    expect(table).toHaveTextContent(/uygulama sayfasını bir kez yenile/)
    expect(table).toHaveTextContent(/beğeni sayısı gizli/)
    expect(table).toHaveTextContent(/"Bu gönderinin beğenenlerini çek"i dene/)
    expect(table).toHaveTextContent(/İşi yeniden başlat/)

    // Açık konuşalım: görünen sekme, insan gibi; uyarır ama durdurmaz
    expect(C.use.limit).toMatch(/görünen bir Instagram sekmesinde/)
    expect(C.use.limit).toMatch(/uyarı gösterebilir/)
    expect(C.use.limit).toMatch(/uyarır ama seni durdurmaz/)

    // Başlık kimlikleri kurulum adımlarıyla çakışmasın
    const ids = Array.from(container.querySelectorAll('[id]')).map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows the job buttons in English too, and keeps the popup in Turkish', async () => {
    const { container } = await renderGuide({ lang: 'en' })
    const C = guideContent('en')
    const section = container.querySelector(`section#${SECTION_ANCHOR.use}`) as HTMLElement
    const app = within(section).getByRole('img', { name: C.use.steps[0].alt })
    for (const t of ['Fetch posts', 'Fetch likers', 'Fetch comments', 'Stop']) expect(app).toHaveTextContent(t)
    const panel = within(section).getByRole('img', { name: C.use.steps[1].alt })
    expect(panel).toHaveTextContent("Fetch this post's likers")
    expect(panel).toHaveTextContent("Fetch this post's comments")
    const popup = within(section).getByRole('img', { name: C.use.steps[2].alt })
    for (const t of ['Gönderileri çek', 'Beğenenleri çek', 'Yorumları çek', 'Durdur']) expect(popup).toHaveTextContent(t)
    expect(C.use.limit).toMatch(/warns you but does not stop you/)
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
      expect(checklistMarkdown(C)).not.toMatch(/Profilimi aç|Sıradaki gönderiyi aç/)
    }
    expect(checklistMarkdown(guideContent('tr'))).toMatch(/"Gönderileri çek"/)
    expect(checklistMarkdown(guideContent('tr'))).toMatch(/"Bu gönderinin beğenenlerini çek"/)
    expect(checklistMarkdown(guideContent('en'))).toMatch(/"Fetch posts"/)
    expect(checklistMarkdown(guideContent('en'))).toMatch(/"Fetch this post's likers"/)
  })

  it('no longer mentions the old popup buttons ("Profilimi aç", "Sıradaki gönderiyi aç")', () => {
    for (const lang of ['tr', 'en']) {
      const C = guideContent(lang)
      const all = JSON.stringify(C) + checklistMarkdown(C)
      expect(all).not.toMatch(/Profilimi aç|Sıradaki gönderiyi aç|open my profile|open the next post/i)
      // Eklenti penceresindeki üç kartın her birinde iş düğmesi var; sürüm 2.4.0
      expect(Object.values(C.bridge.ui.popupTools).map(t => t.action)).toEqual(['Gönderileri çek', 'Beğenenleri çek', 'Yorumları çek'])
      expect(C.bridge.ui.popupVersionValue).toBe('2.4.0')
      expect(C.bridge.ui.extVersion).toBe('2.4.0')
    }
  })

  it('never says collection is stopped, paused or blocked when Instagram warns', () => {
    const tr = /durduruldu\b|\bdurur\b|\bdurdu\b|duraklat|engellen|kilitlenir|beğenen listesi açma|açmayı bırak|dur ve bekle/i
    // "nothing was stopped" doğru cümle; "collection is stopped" gibi olanlar yasak
    const en = /(?<!nothing )\b(is|are|was|were|get|gets) (stopped|paused|blocked)\b|\bstops? for\b|stop opening|do not open likers|stop and wait/i
    for (const lang of ['tr', 'en'] as const) {
      const C = guideContent(lang)
      const W = C.bridge.warning
      const warnGroup = C.checklistDoc.groups[C.checklistDoc.groups.length - 1]
      const warnRow = C.safety.rows.find(r => r.link?.to === '#uyari')!
      const warnFaq = C.faq.items.find(r => r.link?.to === '#uyari')!
      const texts = [
        W.intro, ...W.effects, ...W.do, W.never, W.alt, W.caption,
        warnRow.text, warnFaq.text, ...warnGroup.items, C.checklistDoc.footer,
        C.bridge.ui.warnBanner, C.bridge.ui.warnBannerTodo,
        C.bridge.rules[C.bridge.rules.length - 1], C.use.limit,
      ]
      for (const t of texts) expect(t).not.toMatch(lang === 'tr' ? tr : en)
      // Bir uyarı, engel değil; önerimiz 24 saat (bir hafta içinde tekrarlarsa 72 saat)
      const joined = texts.join(' ')
      expect(joined).toMatch(lang === 'tr' ? /uyarı, engel değil/ : /warning, not a block/)
      expect(joined).toMatch(/24/)
      expect(joined).toMatch(/72/)
      expect(warnRow.text).toMatch(/24/)
      // Takip/çıkış kuyruğunun boşaltılması uyarı satırında anlatılmaz (köprü uyarısıyla ilgisi yok)
      expect(warnRow.text).not.toMatch(/kuyruk|queue|6 saat|6 hours/)
    }
  })

  it('no illustration draws the old popup', () => {
    for (const lang of ['tr', 'en']) {
      const ui = guideContent(lang).bridge.ui
      for (const id of ART_IDS) {
        const { container, unmount } = render(<Illustration id={id} ui={ui} alt={id} caption={id} />)
        expect(container).not.toHaveTextContent('Gezinirken beğenenleri kaydet')
        expect(container).not.toHaveTextContent('Durum')
        expect(container).not.toHaveTextContent('Profilimi aç')
        expect(container).not.toHaveTextContent('Sıradaki gönderiyi aç')
        expect(container).not.toHaveTextContent('2.3.0')
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
    expect(en.safety.rows).toHaveLength(tr.safety.rows.length)
    expect(en.safety.limits).toHaveLength(tr.safety.limits.length)
    expect(Object.keys(en.bridge.ui).sort()).toEqual(Object.keys(tr.bridge.ui).sort())
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
