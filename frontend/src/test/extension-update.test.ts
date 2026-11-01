// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import backgroundSrc from '../../extension/background.js?raw'
import { extensionOutdated, cmpVersion, LATEST_EXTENSION_VERSION } from '../lib/extension'

/** background.js'i sahte bir Chrome ortamında çalıştırır. */
function loadBackground(installed: string, appVersion: string | null, store: Record<string, any> = {}) {
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
  }
  const fetchStub = vi.fn(async () => appVersion === null
    ? Promise.reject(new Error('down'))
    : new Response(JSON.stringify({ version: appVersion }), { status: 200 }))
  // eslint-disable-next-line no-new-func
  new Function('chrome', 'fetch', backgroundSrc)(chrome, fetchStub)
  const ask = (msg: any) => new Promise(res => listeners.message(msg, { id: 'ext' }, res))
  return { store, reload, ask, chrome, fetchStub, listeners }
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

describe('app side version check', () => {
  it('knows the bundled extension version and flags older ones', () => {
    expect(LATEST_EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(cmpVersion('2.10.0', '2.9.9')).toBe(1)
    expect(extensionOutdated('1.0.0')).toBe(true)
    expect(extensionOutdated(LATEST_EXTENSION_VERSION)).toBe(false)
    expect(extensionOutdated(null)).toBe(false)
  })
})
