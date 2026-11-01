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
    expect(screen.getByRole('button', { name: /Eklentiyi indir/ })).toBeInTheDocument()

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
    expect(screen.getByRole('note', { name: C.bridge.warning.title })).toBeInTheDocument()
  })

  it('shows an illustrated, numbered install step for every part of the setup', async () => {
    await renderGuide()
    const B = guideContent('tr').bridge
    // Her adımın bir resmi var ve resmin ekran okuyucu için bir adı var
    const arts = B.install.map(s => s.art)
    for (const id of ['download', 'unzip', 'address', 'devmode', 'loadUnpacked', 'pickFolder', 'card', 'pin', 'reload', 'popup', 'connected'] as const) {
      expect(arts).toContain(id)
    }
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
    expect(screen.getByText(/frontend\/extension/)).toBeInTheDocument()
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

  it('explains how to update an installed extension', async () => {
    const { container } = await renderGuide()
    const U = guideContent('tr').bridge.update
    const block = container.querySelector('#guncelle') as HTMLElement
    expect(block).not.toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: U.title })).toBeInTheDocument()
    expect(U.steps.length).toBeGreaterThanOrEqual(3)
    expect(block.querySelectorAll('ol > li')).toHaveLength(U.steps.length)
    expect(block).toHaveTextContent('↻')
    expect(block).toHaveTextContent(/Instagram sekmesini/)
    expect(screen.getByRole('img', { name: U.alt })).toBeInTheDocument()
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
      expect(all).not.toMatch(/Şimdi dene|Try now/)
      expect(all).not.toMatch(/25–80|25-80/)
      expect(all).not.toMatch(/günde 12|12 posts a day|12, 20/i)
      expect(all).not.toMatch(/bilgisayar(ın)? başında|at the computer/i)
      expect(all).not.toMatch(/3 gününde|first 3 days/i)
      expect(all).not.toMatch(/istekler arası|between requests/i)
      expect(all).not.toMatch(/toplamaya izin ver/)
    }
  })

  it('both languages have the same install, usage and update steps', () => {
    const tr = guideContent('tr')
    const en = guideContent('en')
    expect(en.bridge.install.map(s => s.art)).toEqual(tr.bridge.install.map(s => s.art))
    expect(new Set(tr.bridge.install.map(s => s.art)).size).toBe(tr.bridge.install.length)
    expect(en.use.steps.map(s => s.art)).toEqual(tr.use.steps.map(s => s.art))
    expect(en.bridge.update.steps).toHaveLength(tr.bridge.update.steps.length)
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
