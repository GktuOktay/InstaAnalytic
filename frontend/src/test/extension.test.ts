// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.instagram.com/gktuoktay/"}
import { describe, it, expect, beforeAll, vi } from 'vitest'
import listenerSrc from '../../extension/listener.js?raw'
import manifestSrc from '../../extension/manifest.json?raw'

const seen: any[] = []
const pageFetch = vi.fn(async (_url: string, _init?: RequestInit) =>
  new Response('{"data":{"user":{"username":"x"}}}', { status: 200 }))

function flush() { return new Promise(r => setTimeout(r, 20)) }

// jsdom, postMessage olaylarında origin/source alanlarını doldurmaz; gerçek Chrome doldurur.
// Bu yüzden giden mesajlar postMessage çağrısından, gelen ayar ise dolu alanlı bir olayla verilir.
function sendConfig(on: boolean) {
  window.dispatchEvent(new MessageEvent('message', { data: { __ia: 'ia-config', on }, origin: 'https://www.instagram.com', source: window }))
}

beforeAll(async () => {
  ;(window as any).fetch = pageFetch
  vi.spyOn(window, 'postMessage').mockImplementation(((data: any) => { if (data?.__ia === 'ia-observed') seen.push(data) }) as any)
  // eslint-disable-next-line no-new-func
  new Function(listenerSrc)()
})

async function igGraphql(friendly: string, extra: Record<string, string> = {}) {
  const body = new URLSearchParams({ fb_api_req_friendly_name: friendly, variables: '{"media_id":"5"}', fb_dtsg: 'GIZLI', lsd: 'GIZLI2', ...extra })
  const res = await window.fetch('https://www.instagram.com/graphql/query', { method: 'POST', body })
  await flush()
  return res
}

describe('extension listener (read-only)', () => {
  it('copies nothing while the extension is off', async () => {
    await igGraphql('PolarisPostLikersQuery')      // ayar henüz gelmedi: yalnızca bellekte bekler
    expect(seen).toHaveLength(0)
    sendConfig(false)                              // kapalı: bekleyen yanıt atılır
    await igGraphql('PolarisPostLikersQuery')
    expect(seen).toHaveLength(0)
  })

  it('when on: forwards only wanted queries, never session tokens, and leaves the response untouched', async () => {
    sendConfig(true)
    const res = await igGraphql('PolarisPostLikersQuery')
    expect(await res.text()).toBe('{"data":{"user":{"username":"x"}}}')    // sayfa aynı yanıtı alır
    expect(seen).toHaveLength(1)
    const msg = seen[0]
    expect(msg.friendly).toBe('PolarisPostLikersQuery')
    expect(msg.variables).toBe('{"media_id":"5"}')
    expect(JSON.stringify(msg)).not.toContain('GIZLI')                       // fb_dtsg / lsd asla
    expect(pageFetch).toHaveBeenCalledTimes(3)                               // yalnızca sayfanın kendi istekleri; eklenti istek göndermedi

    for (const f of ['PolarisDirectInboxQuery', 'PolarisStoriesV3TrayQuery', 'PolarisSearchBoxQuery', 'PolarisExploreQuery']) {
      await igGraphql(f)
    }
    await window.fetch('https://www.instagram.com/api/v1/direct_v2/inbox/')
    await window.fetch('https://www.instagram.com/api/v1/web/logging/falco')
    await flush()
    expect(seen).toHaveLength(1)

    await window.fetch('https://www.instagram.com/api/v1/media/5/likers/')
    await flush()
    expect(seen).toHaveLength(2)
  })

  it('ignores a config message that does not come from the Instagram page itself', async () => {
    sendConfig(false)
    window.dispatchEvent(new MessageEvent('message', { data: { __ia: 'ia-config', on: true }, origin: 'https://evil.example', source: window }))
    await igGraphql('PolarisPostLikersQuery')
    expect(seen).toHaveLength(2)
  })

  it('asks for the minimum permissions', () => {
    const m = JSON.parse(manifestSrc)
    expect(m.permissions).toEqual(['storage', 'notifications'])   // bildirim: iş bitince haber verir
    expect(m.host_permissions.every((h: string) => /^http:\/\/(localhost|127\.0\.0\.1):3002\/\*$/.test(h))).toBe(true)
    expect(JSON.stringify(m)).not.toMatch(/cookies|webRequest|scripting|"tabs"|<all_urls>|debugger/)
    // Uygulamayla aynı logo, Chrome'un beklediği boyutlarda
    for (const size of ['16', '32', '48', '128']) expect(m.icons[size]).toBe(`icons/icon-${size}.png`)
  })
})


// Sayfa yenilenince Instagram ilk isteklerini eklentinin ayarı gelmeden yapar: o yanıtlar kaybolmamalı
describe('extension listener: responses that arrive before the config', () => {
  async function freshListener() {
    seen.length = 0
    ;(window as any).__iaListener = false
    ;(window as any).fetch = pageFetch
    // eslint-disable-next-line no-new-func
    new Function(listenerSrc)()
  }

  it('delivers responses that finished before the config said "on"', async () => {
    await freshListener()
    await igGraphql('PolarisProfilePostsQuery')
    await window.fetch('https://www.instagram.com/api/v1/media/5/likers/')
    await flush()
    expect(seen).toHaveLength(0)                   // ayar gelmeden hiçbir şey iletilmedi
    sendConfig(true)
    expect(seen).toHaveLength(2)                   // ayar gelince beklenenler sırayla iletildi
    expect(seen[0].friendly).toBe('PolarisProfilePostsQuery')
    sendConfig(true)
    expect(seen).toHaveLength(2)                   // tampon boşaldı: ikinci kez iletilmez
  })

  it('drops unrelated queries and never holds session tokens', async () => {
    await freshListener()
    await igGraphql('PolarisDirectInboxQuery')
    sendConfig(true)
    expect(seen).toHaveLength(0)
  })

  it('discards the held responses when the config says "off"', async () => {
    await freshListener()
    await igGraphql('PolarisPostLikersQuery')
    sendConfig(false)
    sendConfig(true)
    expect(seen).toHaveLength(0)
  })

  it('does not deliver responses that waited longer than the hold time', async () => {
    await freshListener()
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    await igGraphql('PolarisPostLikersQuery')
    now.mockReturnValue(1_000_000 + 31_000)
    sendConfig(true)
    now.mockRestore()
    expect(seen).toHaveLength(0)
  })

  it('keeps at most 60 held responses', async () => {
    await freshListener()
    for (let i = 0; i < 70; i++) await window.fetch(`https://www.instagram.com/api/v1/media/${i + 1}/likers/`)
    await flush()
    sendConfig(true)
    expect(seen).toHaveLength(60)
  })
})
