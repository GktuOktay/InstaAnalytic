// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import backgroundSrc from '../../extension/background.js?raw'
import { extensionOutdated, cmpVersion, LATEST_EXTENSION_VERSION } from '../lib/extension'

/** background.js'i sahte bir Chrome ortamında çalıştırır. */
function loadBackground(installed: string, appVersion: string | null, store: Record<string, any> = {},
  todo: any[] = [], stopped = false) {
  const listeners: Record<string, Function> = {}
  const reload = vi.fn()
  const chrome = {
    runtime: {
      id: 'ext', getManifest: () => ({ version: installed }), reload,
      onMessage: { addListener: (f: Function) => { listeners.message = f } },
      onInstalled: { addListener: (f: Function) => { listeners.installed = f } },
      onStartup: { addListener: (f: Function) => { listeners.startup = f } },
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, store[k]])),
        set: async (o: Record<string, any>) => { Object.assign(store, o) },
      },
      onChanged: { addListener: () => {} },
    },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    notifications: { create: vi.fn() },
    tabs: {
      create: vi.fn(async (o: any) => ({ id: 77, ...o })), update: vi.fn(async () => ({})), remove: vi.fn(async () => {}),
      onRemoved: { addListener: (f: Function) => { listeners.removed = f } },
    },
  }
  const session: Record<string, any> = {}
  let observeReply: any = {}
  ;(chrome as any).__setObserve = (r: any) => { observeReply = r }
  ;(chrome.storage as any).session = {
    get: async (k: string) => ({ [k]: session[k] }),
    set: async (o: Record<string, any>) => { Object.assign(session, o) },
  }
  const fetchStub = vi.fn(async (url: string) => {
    if (appVersion === null) throw new Error('down')
    if (String(url).includes('/bridge/todo')) return new Response(JSON.stringify(todo), { status: 200 })
    if (String(url).includes('/bridge/observe')) return new Response(JSON.stringify(observeReply), { status: 200 })
    if (String(url).includes('/bridge/jobs')) return new Response('{"id":"x"}', { status: 201 })
    if (String(url).includes('/bridge/status')) return new Response(JSON.stringify({ stopped }), { status: 200 })
    if (String(url).includes('/bridge/resume')) { stopped = false; return new Response('{"stopped":false}', { status: 200 }) }
    return new Response(JSON.stringify({ version: appVersion }), { status: 200 })
  })
  // eslint-disable-next-line no-new-func
  new Function('chrome', 'fetch', backgroundSrc)(chrome, fetchStub)
  const ask = (msg: any) => new Promise(res => listeners.message(msg, { id: 'ext' }, res))
  return { store, reload, ask, chrome, fetchStub, listeners, session }
}

describe('extension self-update', () => {
  it('stays put when the app has the same version', async () => {
    const b = loadBackground('2.2.0', '2.2.0')
    const u: any = await b.ask({ type: 'ia-update', force: true })
    expect(u.state).toBe('current')
    expect(b.reload).not.toHaveBeenCalled()
  })

  it('reloads itself once when the app ships a newer version', async () => {
    const b = loadBackground('2.2.0', '2.3.0')
    const u: any = await b.ask({ type: 'ia-update', force: true })
    expect(u.state).toBe('reloading')
    expect(b.reload).toHaveBeenCalledTimes(1)
  })

  it('a copied install that did not change after reloading asks for a manual fix (no reload loop)', async () => {
    const store = { update: { reloadedFor: '2.3.0', current: '2.2.0', checkedAt: 0 } }
    const b = loadBackground('2.2.0', '2.3.0', store)
    const u: any = await b.ask({ type: 'ia-update', force: true })
    expect(u.state).toBe('manual')
    expect(b.reload).not.toHaveBeenCalled()
    expect(b.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '↑' })
  })

  it('does not hammer the app: checks at most every few hours unless forced', async () => {
    const b = loadBackground('2.2.0', '2.2.0', { update: { checkedAt: Date.now(), state: 'current' } })
    await b.ask({ type: 'ia-update', force: false })
    expect(b.fetchStub).not.toHaveBeenCalled()
  })

  it('says so when the app cannot be reached', async () => {
    const b = loadBackground('2.2.0', null)
    const u: any = await b.ask({ type: 'ia-update', force: true })
    expect(u.state).toBe('unreachable')
  })

  it('update requests from a web page are refused', async () => {
    const b = loadBackground('2.2.0', '2.3.0')
    const reply = vi.fn()
    const async = b.listeners.message({ type: 'ia-update', force: true }, { id: 'ext', tab: { url: 'https://www.instagram.com/x/' } }, reply)
    expect(async).toBe(false)
    expect(b.reload).not.toHaveBeenCalled()
    expect(b.listeners.message({ type: 'ia-update' }, { id: 'baska-eklenti' }, reply)).toBe(false)
  })
})

describe('account detection', () => {
  it('remembers which Instagram account is open even while the extension is off', async () => {
    const b = loadBackground('2.2.0', '2.2.0', { enabled: false })
    const answer: any = await new Promise(res =>
      b.listeners.message({ type: 'ia-config', viewer: '525215615' }, { id: 'ext', tab: { url: 'https://www.instagram.com/' } }, res))
    expect(answer).toEqual({ on: false })
    expect(b.store.lastViewer).toBe('525215615')
  })

  it('ignores garbage account ids', async () => {
    const b = loadBackground('2.2.0', '2.2.0', { enabled: true })
    await new Promise(res =>
      b.listeners.message({ type: 'ia-config', viewer: 'abc' }, { id: 'ext', tab: { url: 'https://www.instagram.com/' } }, res))
    expect(b.store.lastViewer).toBeUndefined()
  })
})

describe('tools', () => {
  it('tells the app only the tools that are switched on', async () => {
    const store = { enabled: true, tools: { posts: true, likers: false, comments: true },
      profiles: { '525': { id: '423ac6e4-e9ae-4dfb-85e4-193fd856ddb8', username: 'me' } } }
    const b = loadBackground('2.3.0', '2.3.0', store)
    b.listeners.message({ type: 'ia-observed', viewer: '525', url: 'https://www.instagram.com/graphql/query',
      page: 'https://www.instagram.com/me/', status: 200, text: '{}', friendly: 'X', variables: '', kinds: ['likers', 'posts'] },
      { id: 'ext', tab: { url: 'https://www.instagram.com/me/' } }, () => {})
    await new Promise(r => setTimeout(r, 30))
    const call = b.fetchStub.mock.calls.find((c: any[]) => String(c[0]).includes('/api/bridge/observe')) as any
    expect(call).toBeTruthy()
    const body = JSON.parse(call[1].body)
    expect(body.kinds).toEqual(['posts'])                 // beğenenler kapalı: istenmiş olsa da gönderilmez
    expect(body.req_body).not.toContain('fb_dtsg')
  })

  it('with every tool off, Instagram pages get "off"', async () => {
    const b = loadBackground('2.3.0', '2.3.0', { enabled: true, tools: { posts: false, likers: false, comments: false } })
    const answer: any = await new Promise(res =>
      b.listeners.message({ type: 'ia-config', viewer: '525' }, { id: 'ext', tab: { url: 'https://www.instagram.com/' } }, res))
    expect(answer).toEqual({ on: false })
  })
})

// İş sekmesinden bir yanıt gelmiş gibi yap; uygulama `saved` kadar kayıt bildirir
async function observeSaved(b: any, saved: Record<string, number | boolean>) {
  b.chrome.__setObserve({ posts: 0, likers: 0, comments: 0, warning: false, ignored: false, ...saved })
  b.listeners.message({ type: 'ia-observed', viewer: '525', url: 'https://www.instagram.com/graphql/query',
    page: 'https://www.instagram.com/p/AAAAA/liked_by/', status: 200, text: '{}', friendly: 'Q', variables: '', kinds: ['likers', 'posts'] },
    { id: 'ext', tab: { id: 77, url: 'https://www.instagram.com/p/AAAAA/' } }, () => {})
  await vi.advanceTimersByTimeAsync(50)
}

describe('jobs started from the app', () => {
  const ME = { lastViewer: '525', profiles: { '525': { id: '423ac6e4-e9ae-4dfb-85e4-193fd856ddb8', username: 'gktuoktay' } } }
  const fromApp = { id: 'ext', tab: { url: 'http://localhost:3002/posts' } }
  const fromIg = (id = 77) => ({ id: 'ext', tab: { id, url: 'https://www.instagram.com/p/AAAAA/' } })
  const msg = (b: any, m: any, s: any) => new Promise<any>(res => { if (!b.listeners.message(m, s, res)) res(undefined) })

  it('opens one tab per job and walks the queue post by post', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const b = loadBackground('2.4.0', '2.4.0', { ...ME }, [{ shortcode: 'AAAAA' }, { shortcode: 'BBBBB' }])
    const r = await msg(b, { type: 'ia-run', cmd: { kind: 'likers' } }, fromApp)
    expect(r).toEqual({ ok: true, total: 2 })
    expect(b.chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.instagram.com/p/AAAAA/', active: true })

    // ikinci bir iş aynı anda başlamaz
    expect((await msg(b, { type: 'ia-run', cmd: { kind: 'posts' } }, fromApp)).ok).toBe(false)

    // iş sekmesi kendi adımını alır; anahtarlar kapalı olsa da beğenenler kaydedilir
    const cfg = await msg(b, { type: 'ia-config', viewer: '525' }, fromIg())
    expect(cfg.job).toEqual({ kind: 'likers', shortcode: 'AAAAA' })
    expect(cfg.tools.likers).toBe(true)

    // 1. gönderi: uygulama 40 beğenen kaydettiğini söylüyor
    await observeSaved(b, { likers: 40 })
    b.listeners.message({ type: 'ia-job-done', error: null, seen: 40 }, fromIg(), () => {})
    await vi.advanceTimersByTimeAsync(20000)
    expect(b.chrome.tabs.update).toHaveBeenCalledWith(77, { url: 'https://www.instagram.com/p/BBBBB/' })

    // 2. gönderi: liste açıldı, 12 kişi göründü ama hiçbiri kaydedilmedi → somut teşhis
    b.listeners.message({ type: 'ia-job-done', error: null, seen: 12 }, fromIg(), () => {})
    await vi.advanceTimersByTimeAsync(3000)
    const job = b.session.job
    expect(job.state).toBe('done')
    expect(job.outcome).toBe('partial')
    expect(job.message).toContain('2 gönderi açıldı, 1 tanesinden toplam 40 beğenen kaydedildi')
    expect(job.message).toContain('BBBBB: Sayfada 12 kişi göründü ama hiçbiri kaydedilmedi')
    expect(b.chrome.tabs.remove).toHaveBeenCalledWith(77)
    // sonuç uygulamaya yazıldı ve masaüstü bildirimi gösterildi
    await vi.advanceTimersByTimeAsync(100)
    const report = b.fetchStub.mock.calls.find((c: any[]) => String(c[0]).endsWith('/api/bridge/jobs')) as any
    expect(JSON.parse(report[1].body)).toMatchObject({ kind: 'likers', outcome: 'partial', saved: 40, total: 2 })
    expect(b.chrome.notifications.create).toHaveBeenCalledWith(expect.any(String),
      expect.objectContaining({ title: 'InstaAnalytic: Beğenenler bitti, bazı gönderilerde sorun var' }))
    vi.useRealTimers()
  })

  it('a single post can be fetched on its own', async () => {
    const b = loadBackground('2.4.0', '2.4.0', { ...ME })
    const r = await msg(b, { type: 'ia-run', cmd: { kind: 'comments', shortcodes: ['CCCCC', '../bad'] } }, fromApp)
    expect(r.total).toBe(1)
    expect(b.chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.instagram.com/p/CCCCC/', active: true })
  })

  it('posts job opens the own profile; closing the tab stops the job', async () => {
    const b = loadBackground('2.4.0', '2.4.0', { ...ME })
    await msg(b, { type: 'ia-run', cmd: { kind: 'posts' } }, fromApp)
    expect(b.chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.instagram.com/gktuoktay/', active: true })
    await b.listeners.removed(77)
    expect(b.session.job.state).toBe('stopped')
  })

  it('starting a job turns saving back on when it was stopped in the app, and says so', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const b = loadBackground('2.5.1', '2.5.1', { ...ME }, [], true)
    expect((await msg(b, { type: 'ia-run', cmd: { kind: 'posts' } }, fromApp)).ok).toBe(true)
    expect(b.fetchStub.mock.calls.some((c: any[]) => String(c[0]).endsWith('/bridge/resume'))).toBe(true)
    await observeSaved(b, { posts: 38 })
    b.listeners.message({ type: 'ia-job-done', error: null, seen: 38 }, fromIg(), () => {})
    await vi.advanceTimersByTimeAsync(3000)
    expect(b.session.job.outcome).toBe('ok')
    expect(b.session.job.message).toContain('38 gönderi kaydedildi')
    expect(b.session.job.message).toContain('yeniden açıldı')
    vi.useRealTimers()
  })

  it('if the app still refuses to save, the result names that instead of "not recognised"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const b = loadBackground('2.5.1', '2.5.1', { ...ME })
    await msg(b, { type: 'ia-run', cmd: { kind: 'posts' } }, fromApp)
    await observeSaved(b, { ignored: true, stopped: true })
    b.listeners.message({ type: 'ia-job-done', error: null, seen: 38 }, fromIg(), () => {})
    await vi.advanceTimersByTimeAsync(3000)
    expect(b.session.job.outcome).toBe('failed')
    expect(b.session.job.message).toContain('kayıt durdurulmuş')
    expect(b.session.job.message).not.toContain('tanınmadı')
    vi.useRealTimers()
  })

  it('only the app page and the popup may start jobs', async () => {
    const b = loadBackground('2.4.0', '2.4.0', { ...ME })
    expect(b.listeners.message({ type: 'ia-run', cmd: { kind: 'posts' } }, { id: 'ext', tab: { url: 'https://evil.example/' } }, () => {})).toBe(false)
    expect(b.listeners.message({ type: 'ia-run', cmd: { kind: 'posts' } }, fromIg(), () => {})).toBe(false)
    expect(b.chrome.tabs.create).not.toHaveBeenCalled()
  })
})

describe('app side version check', () => {
  it('knows the bundled extension version and flags older ones', () => {
    expect(LATEST_EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(cmpVersion('2.10.0', '2.9.9')).toBe(1)
    expect(extensionOutdated('1.0.0')).toBe(true)
    expect(extensionOutdated(LATEST_EXTENSION_VERSION)).toBe(false)
    expect(extensionOutdated(null)).toBe(false)
  })
})
