// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.instagram.com/"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import contentSrc from '../../extension/content.js?raw'

type Item = { id: number; username: string; action: 'follow' | 'unfollow'; manual?: boolean; igUserId: number }
type Route = (url: string, init?: RequestInit) => { status: number; body?: unknown; text?: string } | undefined

/**
 * content.js'i sahte Chrome + sahte Instagram uç noktalarıyla çalıştırır. Arka planın rolünü de üstlenir:
 * sırayla öğe verir, sonuçları toplar. Dönen: toplanan sonuçlar ve yapılan istekler.
 */
async function runDirect(items: Item[], route: Route, { cookie = 'csrftoken=TOKEN123abc' } = {}) {
  document.cookie = cookie
  sessionStorage.setItem('www-claim-v2', 'hmac.CLAIM')
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), method: String(init.method ?? 'GET'), headers: { ...(init.headers as Record<string, string>) }, body: init.body as string | undefined })
    const r = route(String(url), init) ?? { status: 404, text: '<!DOCTYPE html>' }
    return { status: r.status, json: async () => { if (r.body === undefined) throw new Error('not json'); return r.body }, text: async () => r.text ?? JSON.stringify(r.body ?? '') } as unknown as Response
  }))

  const results: any[] = []
  let queue = [...items]
  let listener: Function = () => {}
  const chrome = {
    runtime: {
      id: 'ext',
      sendMessage: vi.fn(async (m: any) => {
        if (m.type === 'ia-config') return { on: true, username: 'gktuoktay', tools: {}, job: null }
        if (m.type === 'ia-api-next') {
          if (m.result) results.push(m.result)
          const item = queue.shift()
          return item ? { item, waitMs: results.length ? 3000 : 0 } : { item: null }
        }
        return undefined
      }),
      onMessage: { addListener: (f: Function) => { listener = f } },
    },
    storage: { onChanged: { addListener: () => {} } },
  }
  // eslint-disable-next-line no-new-func
  new Function('chrome', contentSrc)(chrome)
  const ping = await new Promise<any>(res => listener({ type: 'ia-api-ping' }, { id: 'ext' }, res))
  listener({ type: 'ia-api-run', jobId: 'j1' }, { id: 'ext' }, () => {})
  await vi.advanceTimersByTimeAsync(60_000)
  return { results, calls, ping }
}

const ali: Item = { id: 11, username: 'ali', action: 'unfollow', igUserId: 28088623519 }

beforeEach(() => { vi.useFakeTimers(); history.replaceState({}, '', '/') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT' })

describe('extension: direct follow / unfollow requests (no tab, token from the signed-in session)', () => {
  it('answers the background ping with only booleans: the token itself is never sent anywhere', async () => {
    const { ping } = await runDirect([], () => undefined)
    expect(ping).toEqual({ ok: true, csrf: true, loginWall: false })
  })

  it('unfollow: checks the real state, posts destroy with the token headers, accepts the confirmed result', async () => {
    const { results, calls } = await runDirect([ali], (url, init) => {
      if (url.includes('/friendships/show/')) return { status: 200, body: { following: true, outgoing_request: false } }
      if (url.includes('/friendships/destroy/')) return { status: 200, body: { status: 'ok', friendship_status: { following: false, outgoing_request: false } } }
    })
    expect(results).toEqual([{ outcome: 'done' }])
    const post = calls.find(c => c.method === 'POST')!
    expect(post.url).toBe('/api/v1/friendships/destroy/28088623519/')
    expect(post.headers['X-CSRFToken']).toBe('TOKEN123abc')
    expect(post.headers['X-IG-App-ID']).toBe('936619743392459')
    expect(post.headers['X-IG-WWW-Claim']).toBe('hmac.CLAIM')
    expect(post.body).toContain('user_id=28088623519')
    expect(JSON.stringify(results)).not.toContain('TOKEN123abc')                       // token sonuca / nota sızmaz
  })

  it('already not following: no destroy request is sent', async () => {
    const { results, calls } = await runDirect([ali], url => url.includes('/friendships/show/') ? { status: 200, body: { following: false, outgoing_request: false } } : undefined)
    expect(results[0]).toMatchObject({ outcome: 'already' })
    expect(calls.some(c => c.method === 'POST')).toBe(false)
  })

  it('follow: creates, and a private account that answers "outgoing request" counts as done with a note', async () => {
    const { results } = await runDirect([{ id: 2, username: 'gizli', action: 'follow', igUserId: 555555 }], url => {
      if (url.includes('/friendships/show/')) return { status: 200, body: { following: false, outgoing_request: false } }
      if (url.includes('/friendships/create/')) return { status: 200, body: { status: 'ok', friendship_status: { following: false, outgoing_request: true } } }
    })
    expect(results[0]).toMatchObject({ outcome: 'done', note: expect.stringContaining('takip isteği') })
  })

  it('a placeholder id is resolved from the profile page data (no extra tab)', async () => {
    const { results, calls } = await runDirect([{ ...ali, igUserId: -44079261470305000 }], url => {
      if (url === '/ali/') return { status: 200, text: '<script type="application/json">{"profile_id":"28088623519"}</script>' }
      if (url.includes('/friendships/show/28088623519/')) return { status: 200, body: { following: true } }
      if (url.includes('/friendships/destroy/28088623519/')) return { status: 200, body: { status: 'ok', friendship_status: { following: false } } }
    })
    expect(results[0]).toMatchObject({ outcome: 'done' })
    expect(calls[0].url).toBe('/ali/')
  })

  it('a deleted account (profile page 404) is reported as not found, nothing is posted', async () => {
    const { results, calls } = await runDirect([{ ...ali, igUserId: -1 }], url => url === '/ali/' ? { status: 404, text: '<html>' } : undefined)
    expect(results[0]).toMatchObject({ outcome: 'not_found' })
    expect(calls.some(c => c.method === 'POST')).toBe(false)
  })

  it('HTTP 429 and feedback_required are "blocked" (the job stops)', async () => {
    const a = await runDirect([ali], url => url.includes('/friendships/show/') ? { status: 429, body: { message: 'Please wait a few minutes' } } : undefined)
    expect(a.results[0]).toMatchObject({ outcome: 'blocked' })
    const b = await runDirect([ali], url => {
      if (url.includes('/friendships/show/')) return { status: 200, body: { following: true } }
      return { status: 400, body: { message: 'feedback_required', spam: true } }
    })
    expect(b.results[0]).toMatchObject({ outcome: 'blocked' })
  })

  it('an unconfirmed result is a failure, never a fake success', async () => {
    const { results } = await runDirect([ali], url => {
      if (url.includes('/friendships/show/')) return { status: 200, body: { following: true } }
      return { status: 200, body: { status: 'ok', friendship_status: { following: true } } }       // hâlâ takipte
    })
    expect(results[0].outcome).toBe('failed')
    expect(results[0].note).toContain('doğrulanamadı')
  })

  it('no token (signed out): nothing is requested and the reason is given', async () => {
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    const { results, calls, ping } = await runDirect([ali], () => undefined, { cookie: 'x=1' })
    expect(ping.csrf).toBe(false)
    expect(results[0].error).toContain('Instagram oturumu kapalı')
    expect(calls.length).toBe(0)
  })

  it('never acts on your own account or on a malformed username', async () => {
    const { results, calls } = await runDirect([{ ...ali, username: 'gktuoktay' }, { ...ali, username: '../x' }], () => undefined)
    expect(results.map(r => r.error)).toEqual(['Kendi hesabınız için işlem yapılmaz.', 'Geçersiz işlem.'])
    expect(calls.length).toBe(0)
  })

  it('waits the 3-5 s the background asked for between two people', async () => {
    const t0 = Date.now()
    const stamps: number[] = []
    await runDirect([ali, { ...ali, id: 12, username: 'veli', igUserId: 777777 }], url => {
      if (url.includes('/friendships/show/')) { stamps.push(Date.now() - t0); return { status: 200, body: { following: false } } }
    })
    expect(stamps.length).toBe(2)
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(3000)
  })
})
