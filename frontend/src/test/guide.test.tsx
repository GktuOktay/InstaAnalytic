import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, screen } from '@testing-library/react'
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
    expect(note).toHaveTextContent(/Güvenli/)
    expect(note).toHaveTextContent(/aşmaya çalışma/)
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

  it('both languages have the same install steps', () => {
    const tr = guideContent('tr').bridge.install.map(s => s.art)
    const en = guideContent('en').bridge.install.map(s => s.art)
    expect(en).toEqual(tr)
    expect(new Set(tr).size).toBe(tr.length)
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
