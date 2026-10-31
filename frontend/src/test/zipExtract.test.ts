// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { extractExportJson, isImportantEntry } from '../lib/zipExtract'

async function makeZip(entries: Record<string, string>): Promise<File> {
  const w = new ZipWriter(new BlobWriter('application/zip'))
  for (const [name, text] of Object.entries(entries)) await w.add(name, new TextReader(text))
  return new File([await w.close()], 'export.zip')
}

describe('isImportantEntry', () => {
  it('takes Instagram follower lists only', () => {
    expect(isImportantEntry('connections/followers_and_following/followers_1.json')).toBe(true)
    expect(isImportantEntry('connections/followers_and_following/following.json')).toBe(true)
    expect(isImportantEntry('your_instagram_activity/threads/following.json')).toBe(false)
    expect(isImportantEntry('media/posts/a.jpg')).toBe(false)
    expect(isImportantEntry('your_instagram_activity/messages/inbox/x/message_1.json')).toBe(false)
  })
})

describe('extractExportJson', () => {
  it('extracts only the follower JSONs and ignores media/messages/threads', async () => {
    const zip = await makeZip({
      'connections/followers_and_following/followers_1.json': '[{"a":1}]',
      'connections/followers_and_following/following.json': '{"relationships_following":[]}',
      'your_instagram_activity/threads/following.json': '[]',
      'media/posts/p1.jpg': 'x'.repeat(5000),
      'your_instagram_activity/messages/inbox/a/message_1.json': '{}',
    })
    const ticks: number[] = []
    const { files, entryCount } = await extractExportJson(zip, p => p.phase === 'extract' && ticks.push(p.done))
    expect(entryCount).toBe(5)
    expect(files.map(f => f.name).sort()).toEqual(['followers_1.json', 'following.json'])
    expect(await files.find(f => f.name === 'followers_1.json')!.text()).toBe('[{"a":1}]')
    expect(ticks).toEqual([1, 2])
  })

  it('rejects a file that is not a zip', async () => {
    await expect(extractExportJson(new File(['nope'], 'x.zip'))).rejects.toBeTruthy()
  })
})
