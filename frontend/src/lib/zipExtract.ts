import { BlobReader, BlobWriter, ZipReader, type Entry } from '@zip.js/zip.js'

// Backend ile aynı kurallar (ig_export.py): yalnızca Instagram takipçi/takip listeleri; Threads'inkiler hariç.
const FOLLOWERS_RE = /(^|\/)followers_\d+\.json$/i
const FOLLOWING_RE = /(^|\/)following\.json$/i
const MAX_MEMBER_BYTES = 300 * 1024 * 1024

export const isImportantEntry = (name: string): boolean => {
  const n = name.replace(/\\/g, '/')
  if (`/${n.toLowerCase()}`.includes('/threads/')) return false
  return FOLLOWERS_RE.test(n) || FOLLOWING_RE.test(n)
}

export interface ExtractProgress { phase: 'index' | 'extract'; done: number; total: number }

/**
 * Büyük ZIP'i belleğe yüklemeden açar: yalnızca merkezi dizini (sonundaki dosya listesi) ve
 * followers/following JSON'larını okur. Fotoğraf, video, mesajlar tarayıcıdan dışarı çıkmaz.
 * Hata durumunda fırlatır; çağıran tam dosyayı yüklemeyi deneyebilir.
 */
export async function extractExportJson(
  zip: File,
  onProgress?: (p: ExtractProgress) => void,
): Promise<{ files: File[]; entryCount: number }> {
  const reader = new ZipReader(new BlobReader(zip))
  try {
    const entries = (await reader.getEntries()) as Entry[]
    onProgress?.({ phase: 'index', done: entries.length, total: entries.length })
    const wanted = entries.filter(e => !e.directory && isImportantEntry(e.filename))
    const files: File[] = []
    for (const [i, e] of wanted.entries()) {
      if (e.uncompressedSize > MAX_MEMBER_BYTES) throw new Error(`${e.filename} çok büyük`)
      if (!e.getData) continue
      const blob = await e.getData(new BlobWriter('application/json'))
      const base = e.filename.replace(/\\/g, '/').split('/').pop() as string
      files.push(new File([blob], base, { type: 'application/json' }))
      onProgress?.({ phase: 'extract', done: i + 1, total: wanted.length })
    }
    return { files, entryCount: entries.length }
  } finally {
    await reader.close()
  }
}
