/// <reference types="vite/client" />
// Rehberdeki indirilebilir dosyalar. Hepsi tarayıcıda üretilir; sunucuya istek gitmez.
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import followersSample from './samples/followers_1.json?raw'
import followingSample from './samples/following.json?raw'
import type { GuideContent } from './content'

/* ── Köprü eklentisi ─────────────────────────────────────────────────────── */

export const EXTENSION_FOLDER = 'instaanalytic-kopru'
const EXT_PREFIX = '../../extension/'

// Metin dosyaları ham hâliyle; görseller ?raw ile bozulacağı için ayrı, URL olarak alınır.
const textModules = import.meta.glob(
  ['../../extension/**/*', '!../../extension/**/*.{png,jpg,jpeg,gif,webp,ico,zip}', '!../../extension/**/node_modules/**'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const binaryModules = import.meta.glob(
  ['../../extension/**/*.{png,jpg,jpeg,gif,webp,ico}', '!../../extension/**/node_modules/**'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>

const SKIP = /(^|\/)(\.[^/]*|node_modules|.*\.test\.[jt]s|.*\.map)$/

const relative = (key: string) => key.slice(key.indexOf(EXT_PREFIX) + EXT_PREFIX.length)

interface ExtFile { path: string; text?: string; url?: string }

export function listExtensionFiles(): ExtFile[] {
  const out: ExtFile[] = []
  for (const [k, text] of Object.entries(textModules)) {
    const path = relative(k)
    if (!SKIP.test(path) && typeof text === 'string') out.push({ path, text })
  }
  for (const [k, url] of Object.entries(binaryModules)) {
    const path = relative(k)
    if (!SKIP.test(path)) out.push({ path, url })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/** Chrome'un yükleyebilmesi için kökte manifest.json şart. */
export function extensionInfo(): { available: boolean; count: number; version: string | null } {
  const files = listExtensionFiles()
  const manifest = files.find(f => f.path === 'manifest.json')
  let version: string | null = null
  try { version = manifest?.text ? (JSON.parse(manifest.text).version ?? null) : null } catch { version = null }
  return { available: !!manifest, count: files.length, version }
}

export async function buildExtensionZip(): Promise<Blob> {
  const files = listExtensionFiles()
  if (!files.some(f => f.path === 'manifest.json')) throw new Error('extension files missing')
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  for (const f of files) {
    const name = `${EXTENSION_FOLDER}/${f.path}`
    if (f.text !== undefined) {
      await writer.add(name, new TextReader(f.text))
    } else if (f.url) {
      const res = await fetch(f.url)
      if (!res.ok) throw new Error(`${f.path}: ${res.status}`)
      await writer.add(name, new BlobReader(await res.blob()))
    }
  }
  return writer.close()
}

/* ── Örnek dosyalar ──────────────────────────────────────────────────────── */

export const SAMPLE_FILES: { name: string; text: string }[] = [
  { name: 'followers_1.json', text: followersSample },
  { name: 'following.json', text: followingSample },
]

/* ── Kontrol listesi ─────────────────────────────────────────────────────── */

export function checklistMarkdown(c: GuideContent): string {
  const d = c.checklistDoc
  const lines = [`# ${d.title}`, '', d.intro, '']
  for (const g of d.groups) {
    lines.push(`## ${g.title}`, '')
    for (const item of g.items) lines.push(`- [ ] ${item}`)
    lines.push('')
  }
  lines.push('---', '', d.footer, '')
  return lines.join('\n')
}

/* ── İndirme ─────────────────────────────────────────────────────────────── */

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const saveText = (text: string, fileName: string, type: string) =>
  saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName)
