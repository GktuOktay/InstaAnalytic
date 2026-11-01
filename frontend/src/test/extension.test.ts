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
    expect(pageFetch).toHaveBeenCalledTimes(2)                               // eklenti kendi isteğini göndermedi

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
    expect(m.permissions).toEqual(['storage'])
    expect(m.host_permissions.every((h: string) => /^http:\/\/(localhost|127\.0\.0\.1):3002\/\*$/.test(h))).toBe(true)
    expect(JSON.stringify(m)).not.toMatch(/cookies|webRequest|scripting|"tabs"|<all_urls>|debugger/)
    // Uygulamayla aynı logo, Chrome'un beklediği boyutlarda
    for (const size of ['16', '32', '48', '128']) expect(m.icons[size]).toBe(`icons/icon-${size}.png`)
  })
})
