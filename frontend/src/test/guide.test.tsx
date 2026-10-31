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
