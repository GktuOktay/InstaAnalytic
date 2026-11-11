// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.instagram.com/gktuoktay/"}
// SPEC-001 v1.6 (Kaydedilenler temizliği), eklenti tarafı. T-8a: content.js (tarama, unsave, gövde bekçisi, token
// sınırı) ve listener.js `NEVER`. Sahte sayfa, sahte Chrome, sahte fetch; canlı Instagram'a istek YOK.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import contentSrc from '../../extension/content.js?raw'
import listenerSrc from '../../extension/listener.js?raw'
import backgroundSrc from '../../extension/background.js?raw'
import cleanupBgSrc from '../../extension/cleanup-bg.js?raw'
import appBridgeSrc from '../../extension/app-bridge.js?raw'
import manifestSrc from '../../extension/manifest.json?raw'
import fixtureRaw from '../../../backend/tests/fixtures/is_protected_cases.json?raw'

type Msg = Record<string, any>
const TOKENS = { dtsg: 'TEST_DTSG_123', lsd: 'TEST_LSD_456', csrf: 'TEST_CSRF_789' }
const VIEWER = '111222333'
const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status })
const GQL = (o: unknown, status = 200) => new Response('for (;;);' + JSON.stringify(o), { status })

interface Req { url: string; method: string; headers: Record<string, string>; body: string; t: number }

let sent: Msg[]
let reqs: Req[]
let listeners: Array<(m: Msg, s: Msg, r: (x: unknown) => void) => unknown>
let storageSets: unknown[]

function pageWithTokens() {
  document.cookie = `csrftoken=${TOKENS.csrf}`
  document.cookie = `ds_user_id=${VIEWER}`
  document.body.innerHTML = `<script type="application/json">{"define":[["LSD",[],{"token":"${TOKENS.lsd}"}],["DTSGInitialData",[],{"token":"${TOKENS.dtsg}"}]]}</script>`
}

/** content.js'i sahte Chrome ile yükler. bg: arka plan sahtesi; fetchImpl: sahte Instagram. */
function boot(bg: (m: Msg) => unknown, fetchImpl: (url: string, init: RequestInit | undefined, req: Req) => Response | Promise<Response>, config: Msg = { on: false }) {
  // Her yükleme kendi dizilerine yazar: önceki testlerin window dinleyicileri (kaldırılamaz) bunları kirletmez
  const mySent: Msg[] = []; const myReqs: Req[] = []; const myListeners: typeof listeners = []; const mySets: unknown[] = []
  sent = mySent; reqs = myReqs; listeners = myListeners; storageSets = mySets
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const req: Req = { url: String(url), method: init?.method || 'GET', headers: { ...(init?.headers as Record<string, string> || {}) }, body: String(init?.body ?? ''), t: Date.now() }
    myReqs.push(req)
    return fetchImpl(String(url), init, req)
  }))
  const chrome = {
    runtime: {
      id: 'ext',
      onMessage: { addListener: (l: any) => myListeners.push(l) },
      sendMessage: vi.fn(async (m: Msg) => {
        mySent.push(JSON.parse(JSON.stringify(m)))
        if (m.type === 'ia-config') return config
        return bg(m)
      }),
    },
    storage: { onChanged: { addListener: () => {} }, local: { set: (v: unknown) => mySets.push(v) }, session: { set: (v: unknown) => mySets.push(v) } },
  }
  // eslint-disable-next-line no-new-func
  new Function('chrome', contentSrc)(chrome)
}

async function run(msg: Msg, ms = 900_000) {
  for (const l of listeners) l({ ...msg }, { id: 'ext' }, () => {})
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)       // her bekleme alt sınırında
  history.replaceState({}, '', '/gktuoktay/')
  pageWithTokens()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

// ── Sahte Instagram ──────────────────────────────────────────────────────────

const infoBody = (pk: string, saved: boolean, ids?: unknown) => ({
  num_results: 1, status: 'ok',
  items: [{ pk, id: `${pk}_99`, ...(saved ? { has_viewer_saved: true } : {}), ...(saved && ids !== undefined ? { saved_collection_ids: ids } : {}) }],
})

interface IgState {
  saved: Set<string>
  ids: Record<string, unknown>
  info?: (pk: string, n: number) => Response | undefined
  unsave?: (pk: string, n: number) => Response | undefined
  infoCount: Record<string, number>
  unsaveCount: number
}
function ig(init: { saved?: string[]; ids?: Record<string, unknown> } = {}) {
  const st: IgState = { saved: new Set(init.saved || []), ids: init.ids || {}, infoCount: {}, unsaveCount: 0 }
  const fetchImpl = (url: string, _i: RequestInit | undefined, req: Req): Response => {
    const m = url.match(/^\/api\/v1\/media\/(\d+)\/info\/$/)
    if (m) {
      const pk = m[1]
      st.infoCount[pk] = (st.infoCount[pk] || 0) + 1
      return st.info?.(pk, st.infoCount[pk]) ?? J(infoBody(pk, st.saved.has(pk), st.ids[pk] ?? []))
    }
    if (url === '/api/graphql' && /usePolarisSaveMediaUnsaveMutation/.test(req.body)) {
      const v = JSON.parse(new URLSearchParams(req.body).get('variables') || '{}')
      const pk = v.input.media_id
      st.unsaveCount += 1
      const custom = st.unsave?.(pk, st.unsaveCount)
      if (custom) return custom
      st.saved.delete(pk)
      return GQL({ data: { xig_media_unsave: { media: { id: pk } } }, extensions: { is_final: true } })
    }
    return new Response('not found', { status: 404 })
  }
  return { st, fetchImpl }
}

/** Arka plan sahtesi (unsave döngüsü): öğeleri sırayla verir, sonuçları ve precheck'leri kaydeder. */
function bgUnsave(items: Array<{ id: number; ref: string }>, o: { allow?: string[]; precheck?: (m: Msg, n: number) => Msg; delay?: [number, number]; extra?: Msg } = {}) {
  const results: Msg[] = []
  const prechecks: Msg[] = []
  let i = 0
  const handler = (m: Msg) => {
    if (m.type === 'ia-cl-next') {
      if (m.result) {
        results.push(m.result)
        // Gerçek arka plan iş durduran sonuçta (sunucu stopped=true) işi bitirir
        if (m.result.outcome === 'blocked' || ['rate_limited', 'login_required', 'tokens_missing', 'account_mismatch', 'mutation_unrecognised'].includes(m.result.note_code)) return { item: null }
      }
      const item = items[i++]
      return item ? { item, delay: o.delay ?? [10, 20], allow: o.allow ?? [], ...(o.extra || {}) } : { item: null }
    }
    if (m.type === 'ia-cl-precheck') { prechecks.push(m); return o.precheck ? o.precheck(m, prechecks.length) : { action: 'write' } }
    return undefined
  }
  return { handler, results, prechecks }
}

const RUN_UNSAVE = { type: 'ia-cl-run', jobId: 'j1', kind: 'saved_unsave' }
const writes = () => reqs.filter(r => r.method === 'POST')

// ── AC-S3 / AC-C52: okuma, already, protected, precheck sırası ──────────────

describe('saved unsave: read, already, protected, precheck order (AC-S3, AC-C52, AC-S16)', () => {
  it('reads first, then prechecks, then writes, then verifies; reports done', async () => {
    const f = ig({ saved: ['5001'] })
    const b = bgUnsave([{ id: 7, ref: '5001' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    const order = reqs.map(r => (r.method === 'POST' ? 'POST' : 'GET')).join(',')
    expect(order).toBe('GET,POST,GET')                                       // okuma, yazma, doğrulama
    expect(b.prechecks).toHaveLength(1)
    expect(b.prechecks[0]).toMatchObject({ type: 'ia-cl-precheck', itemId: 7, collectionIds: [], viewer: VIEWER })
    expect(b.results).toEqual([expect.objectContaining({ item_id: 7, outcome: 'done' })])
  })

  it('absent has_viewer_saved means not saved: already, no precheck, no write (v1.6)', async () => {
    const f = ig({ saved: [] })                                              // alan HİÇ yok (false değil)
    const b = bgUnsave([{ id: 1, ref: '5002' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ item_id: 1, outcome: 'already' })
    expect(b.prechecks).toHaveLength(0)
    expect(writes()).toHaveLength(0)
  })

  it('has_viewer_saved:false is also not saved', async () => {
    const f = ig()
    f.st.info = pk => J({ items: [{ pk, has_viewer_saved: false }] })
    const b = bgUnsave([{ id: 1, ref: '5002' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0].outcome).toBe('already')
  })

  it('read delay after already (default 3-6 s), but the write delay only after a real write (L-6)', async () => {
    const f = ig({ saved: ['5004'] })
    const b = bgUnsave([{ id: 1, ref: '5003' }, { id: 2, ref: '5004' }, { id: 3, ref: '5005' }], { delay: [60, 90] })
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    const t = (pk: string) => reqs.find(r => r.url.includes(`/media/${pk}/info/`))!.t
    expect(t('5004') - t('5003')).toBeGreaterThanOrEqual(3000)               // already -> okuma aralığı
    expect(t('5004') - t('5003')).toBeLessThan(10_000)                       // yazma gecikmesi (60 sn) uygulanmadı
    const lastRead = reqs.filter(r => r.url.includes('/media/5004/info/')).slice(-1)[0].t
    expect(t('5005') - lastRead).toBeGreaterThanOrEqual(60_000)              // gerçek yazmadan sonra `delay`
  })

  it('read 404 and 410 report not_found without precheck, then wait the read gap (L-b)', async () => {
    const f = ig()
    f.st.info = pk => (pk === '5006' ? new Response('', { status: 404 }) : pk === '5007' ? new Response('', { status: 410 }) : undefined)
    const b = bgUnsave([{ id: 1, ref: '5006' }, { id: 2, ref: '5007' }, { id: 3, ref: '5008' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results.map(r => r.outcome)).toEqual(['not_found', 'not_found', 'already'])
    expect(b.results[0].http_status).toBe(404)
    expect(b.prechecks).toHaveLength(0)
    const t = (pk: string) => reqs.find(r => r.url.includes(`/media/${pk}/info/`))!.t
    expect(t('5007') - t('5006')).toBeGreaterThanOrEqual(3000)
  })

  it('info pk mismatch is unrecognised_shape (retryable), nothing written (R6 M-9)', async () => {
    const f = ig({ saved: ['5009'] })
    f.st.info = () => J(infoBody('999', true, []))
    const b = bgUnsave([{ id: 1, ref: '5009' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ outcome: 'failed', note_code: 'unrecognised_shape' })
    expect(writes()).toHaveLength(0)
  })

  it('empty or missing items is unrecognised_shape; numeric pk is never coerced', async () => {
    const f = ig({ saved: ['5010'] })
    f.st.info = (pk, n) => (n === 1 ? J({ items: [] }) : J({ items: [{ pk: Number(pk), has_viewer_saved: true }] }))
    const b = bgUnsave([{ id: 1, ref: '5010' }, { id: 2, ref: '5010' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results.map(r => r.note_code)).toEqual(['unrecognised_shape', 'unrecognised_shape'])
    expect(writes()).toHaveLength(0)
  })

  it('protected: collection not in allow_collections -> protected/in_collection, precheck 0, write 0 (F mode: allow is empty)', async () => {
    const f = ig({ saved: ['6001', '6002', '6003'], ids: { 6001: ['17890000000000001'], 6003: [] } })
    const b = bgUnsave([{ id: 1, ref: '6001' }, { id: 2, ref: '6002' }, { id: 3, ref: '6003' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ item_id: 1, outcome: 'protected', note_code: 'in_collection' })
    expect(b.prechecks.map(p => p.itemId)).toEqual([2, 3])                    // korunan için precheck yok
    expect(writes().map(w => new URLSearchParams(w.body).get('variables'))).toHaveLength(2)
    expect(b.results.slice(1).map(r => r.outcome)).toEqual(['done', 'done'])
  })

  it('W mode: every id inside allow_collections proceeds; one outside is protected', async () => {
    const f = ig({ saved: ['6101', '6102'], ids: { 6101: ['17890000000000002'], 6102: ['17890000000000002', '17890000000000001'] } })
    const b = bgUnsave([{ id: 1, ref: '6101' }, { id: 2, ref: '6102' }], { allow: ['17890000000000002'] })
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results.map(r => r.outcome)).toEqual(['done', 'protected'])
    expect(b.prechecks[0].collectionIds).toEqual(['17890000000000002'])        // taze kimlikler precheck'e gider
  })

  it.each([
    ['invalid element', ['123', 'abc']],
    ['non-string element', ['123', 5]],
    ['21 elements', Array.from({ length: 21 }, (_, i) => String(1000 + i))],
    ['not an array', 'x'],
    ['field absent', undefined],
  ])('fail-closed: saved_collection_ids %s -> protected, no precheck, no POST (R6 H-2)', async (_n, ids) => {
    const f = ig({ saved: ['6201'] })
    f.st.info = pk => J({ items: [{ pk, has_viewer_saved: true, ...(ids === undefined ? {} : { saved_collection_ids: ids }) }] })
    const b = bgUnsave([{ id: 1, ref: '6201' }], { allow: ['123', '1000'] })
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ outcome: 'protected', note_code: 'in_collection' })
    expect(b.prechecks).toHaveLength(0)
    expect(writes()).toHaveLength(0)
  })

  it('precheck replies: too_soon waits retry_after and asks again (no failure); not_pending skips; protected is reported', async () => {
    const f = ig({ saved: ['7001', '7002', '7003'] })
    const b = bgUnsave([{ id: 1, ref: '7001' }, { id: 2, ref: '7002' }, { id: 3, ref: '7003' }], {
      precheck: (m, n) => (m.itemId === 1 ? (n === 1 ? { action: 'wait', retryAfterMs: 40_000 } : { action: 'write' })
        : m.itemId === 2 ? { action: 'skip' } : { action: 'report', outcome: 'protected', note_code: 'in_collection' }),
    })
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.prechecks.filter(p => p.itemId === 1)).toHaveLength(2)
    const [p1, p2] = b.prechecks.filter(p => p.itemId === 1)
    expect(writes()).toHaveLength(1)                                           // yalnız 1. öğe yazıldı
    expect(b.results.map(r => r.item_id)).toEqual([1, 3])                      // 2 (skip) için sonuç yok
    expect(b.results[1]).toMatchObject({ outcome: 'protected', note_code: 'in_collection' })
    expect(p1 && p2).toBeTruthy()
  })

  it('precheck reply "end" or a failed message ends the job without a write', async () => {
    const f = ig({ saved: ['7101', '7102'] })
    const b = bgUnsave([{ id: 1, ref: '7101' }, { id: 2, ref: '7102' }], { precheck: () => ({ action: 'end' }) })
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(writes()).toHaveLength(0)
    expect(b.prechecks).toHaveLength(1)
    expect(b.results).toHaveLength(0)
  })
})

// ── AC-S17 + §7.9.4 B ────────────────────────────────────────────────────────

describe('unsave GraphQL request (AC-S17) and response table (§7.9.4 B)', () => {
  it('request shape: constants, variables.input from ref + ds_user_id + counter', async () => {
    const f = ig({ saved: ['8001', '8002'] })
    const b = bgUnsave([{ id: 1, ref: '8001' }, { id: 2, ref: '8002' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    const [w1, w2] = writes()
    const p1 = new URLSearchParams(w1.body)
    expect(w1.url).toBe('/api/graphql')
    expect(p1.get('fb_api_req_friendly_name')).toBe('usePolarisSaveMediaUnsaveMutation')
    expect(p1.get('doc_id')).toBe('27371251859134880')
    expect(p1.get('av')).toBe(VIEWER)
    expect(p1.get('__d')).toBe('www'); expect(p1.get('__user')).toBe('0'); expect(p1.get('__a')).toBe('1')
    expect(p1.get('__comet_req')).toBe('7'); expect(p1.get('server_timestamps')).toBe('true')
    expect(p1.get('fb_api_caller_class')).toBe('RelayModern')
    expect(p1.get('fb_dtsg')).toBe(TOKENS.dtsg); expect(p1.get('lsd')).toBe(TOKENS.lsd); expect(p1.get('jazoest')).toBeTruthy()
    const v1 = JSON.parse(p1.get('variables')!)
    expect(v1).toEqual({ input: { media_id: '8001', actor_id: VIEWER, client_mutation_id: '1' } })
    expect(JSON.parse(new URLSearchParams(w2.body).get('variables')!).input.client_mutation_id).toBe('2')   // 1'den artan sayaç
    expect(w1.headers).toMatchObject({ 'X-CSRFToken': TOKENS.csrf, 'X-FB-LSD': TOKENS.lsd, 'X-FB-Friendly-Name': 'usePolarisSaveMediaUnsaveMutation', 'X-ASBD-ID': '359341' })
    expect(w1.headers['X-IG-App-ID']).toBeTruthy()
  })

  const row = (name: string, unsave: (pk: string) => Response, verify: 'saved' | 'unsaved' | '5xx', expected: Msg, opts: { stopped?: boolean; infoAfter?: number } = {}) => ({ name, unsave, verify, expected, opts })
  const rows = [
    row('3. expected path -> verify -> done', pk => GQL({ data: { xig_media_unsave: { media: { id: pk } } } }), 'unsaved', { outcome: 'done' }),
    row('3. expected path but still saved -> verify_failed', pk => GQL({ data: { xig_media_unsave: { media: { id: pk } } } }), 'saved', { outcome: 'failed', note_code: 'verify_failed' }),
    row('3. expected path, verify reads all 5xx -> verify_unavailable', pk => GQL({ data: { xig_media_unsave: { media: { id: pk } } } }), '5xx', { outcome: 'failed', note_code: 'verify_unavailable' }),
    row('6. errors[] + still saved -> mutation_unrecognised', () => GQL({ errors: [{ message: 'SECRET FREE TEXT' }] }), 'saved', { outcome: 'failed', note_code: 'mutation_unrecognised', fields: ['errors'] }),
    row('6. HTTP 400 + still saved -> mutation_unrecognised', () => GQL({ errors: [] }, 400), 'saved', { outcome: 'failed', note_code: 'mutation_unrecognised' }),
    row('6. HTTP 404 on graphql is NOT not_found', () => GQL({}, 404), 'saved', { outcome: 'failed', note_code: 'mutation_unrecognised' }),
    row('6. unrecognised 200 but verify says unsaved -> done, with fields', () => GQL({ data: null, extensions: {} }), 'unsaved', { outcome: 'done', fields: ['data', 'extensions'] }),
    row('6. unrecognised 200 and verify 5xx -> mutation_unrecognised (R6 M-7)', () => GQL({ data: null }), '5xx', { outcome: 'failed', note_code: 'mutation_unrecognised' }),
    row('6. free text "try again later" in a 200 is NOT blocked (R6 M-6)', () => GQL({ errors: [{ message: 'please try again later' }] }), 'saved', { outcome: 'failed', note_code: 'mutation_unrecognised' }),
    row('6. different id in the expected path -> row 6', () => GQL({ data: { xig_media_unsave: { media: { id: '1' } } } }), 'saved', { outcome: 'failed', note_code: 'mutation_unrecognised' }),
    row('6. not JSON -> row 6', () => new Response('<html>', { status: 200 }), 'saved', { outcome: 'failed', note_code: 'mutation_unrecognised' }),
    row('4. message feedback_required -> blocked', () => GQL({ message: 'feedback_required' }, 400), 'saved', { outcome: 'blocked', note_code: 'blocked' }, { infoAfter: 0 }),
    row('4. error_type checkpoint_required -> blocked', () => GQL({ error_type: 'checkpoint_required' }), 'saved', { outcome: 'blocked' }, { infoAfter: 0 }),
    row('4. spam === true -> blocked', () => GQL({ spam: true }), 'saved', { outcome: 'blocked' }, { infoAfter: 0 }),
    row('1. 429 -> rate_limited, no verify read', () => GQL({}, 429), 'saved', { outcome: 'failed', note_code: 'rate_limited', http_status: 429 }, { infoAfter: 0 }),
    row('1. 429 wins over a blocked-looking body (429 is not blocked, AC-C46)', () => GQL({ message: 'feedback_required', spam: true }, 429), 'saved', { outcome: 'failed', note_code: 'rate_limited' }, { infoAfter: 0 }),
    row('2. 401 -> login_required, no verify read', () => GQL({}, 401), 'saved', { outcome: 'failed', note_code: 'login_required' }, { infoAfter: 0 }),
    row('2. message login_required -> login_required', () => GQL({ message: 'login_required' }), 'saved', { outcome: 'failed', note_code: 'login_required' }, { infoAfter: 0 }),
    row('5. HTTP 500 + unsaved -> done', () => new Response('', { status: 500 }), 'unsaved', { outcome: 'done' }),
    row('5. HTTP 502 + still saved -> http_error', () => new Response('', { status: 502 }), 'saved', { outcome: 'failed', note_code: 'http_error', http_status: 502 }),
  ]
  it.each(rows)('$name', async ({ unsave, verify, expected, opts }) => {
    const f = ig({ saved: ['9001', '9002'] })
    f.st.unsave = pk => {
      const r = unsave(pk)
      if (verify === 'unsaved') f.st.saved.delete(pk)
      return r
    }
    f.st.info = (pk, n) => {
      if (n === 1) return undefined                                            // ilk okuma: kayıtlı
      if (verify === '5xx') return new Response('', { status: 503 })
      return undefined                                                         // saved ya da unsaved: durum kümesinden
    }
    const b = bgUnsave([{ id: 1, ref: '9001' }, { id: 2, ref: '9002' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ item_id: 1, ...expected })
    const infoReads = f.st.infoCount['9001'] || 0
    if (opts.infoAfter === 0) {
      expect(infoReads).toBe(1)                                                // doğrulama okuması yapılmadı
      expect(b.prechecks).toHaveLength(1)
    } else {
      expect(infoReads).toBeGreaterThan(1)
    }
    if (expected.outcome === 'failed' || expected.outcome === 'blocked') {
      if (['rate_limited', 'login_required', 'mutation_unrecognised'].includes(expected.note_code) || expected.outcome === 'blocked') {
        expect(f.st.unsaveCount).toBe(1)                                       // ikinci öğe için POST yok (iş durduran sınıf; bg işi bitirir)
      }
    }
  })

  it('verification: up to 3 reads with growing delays; the 3rd read can still succeed', async () => {
    const f = ig({ saved: ['9101'] })
    f.st.unsave = () => GQL({ data: { xig_media_unsave: { media: { id: '9101' } } } })   // durum kümesi değişmez: hâlâ kayıtlı
    f.st.info = (pk, n) => (n === 4 ? J(infoBody(pk, false)) : undefined)                   // 1 okuma + 3 doğrulama; sonuncusu başarılı
    const b = bgUnsave([{ id: 1, ref: '9101' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(f.st.infoCount['9101']).toBe(4)
    expect(b.results[0].outcome).toBe('done')
    const ts = reqs.filter(r => r.url.includes('/media/9101/info/')).map(r => r.t)
    expect(ts[2] - ts[1]).toBeGreaterThanOrEqual(2000)
    expect(ts[3] - ts[2]).toBeGreaterThanOrEqual(3500)
  })

  it('verify read 429 -> rate_limited and no further verify read; 401 -> login_required; 404 -> not_found (R6 M-7)', async () => {
    for (const [status, expected] of [[429, { outcome: 'failed', note_code: 'rate_limited' }], [401, { outcome: 'failed', note_code: 'login_required' }], [404, { outcome: 'not_found' }]] as const) {
      const f = ig({ saved: ['9201'] })
      f.st.info = (_pk, n) => (n === 2 ? new Response('', { status }) : undefined)
      const b = bgUnsave([{ id: 1, ref: '9201' }])
      boot(b.handler, f.fetchImpl)
      await run(RUN_UNSAVE)
      expect(b.results[0]).toMatchObject(expected)
      expect(f.st.infoCount['9201']).toBe(2)
    }
  })

  it('429 on the initial read is rate_limited, not blocked (AC-C46)', async () => {
    const f = ig({ saved: ['9301'] })
    f.st.info = () => J({ message: 'feedback_required' }, 429)
    const b = bgUnsave([{ id: 1, ref: '9301' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ outcome: 'failed', note_code: 'rate_limited', http_status: 429 })
    expect(b.prechecks).toHaveLength(0)
  })

  it('actor_id must equal the viewer sent at precheck, else account_mismatch with no write (AC-S17)', async () => {
    const f = ig({ saved: ['9401'] })
    const b = bgUnsave([{ id: 1, ref: '9401' }], { precheck: () => { document.cookie = 'ds_user_id=999'; return { action: 'write' } } })
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ outcome: 'failed', note_code: 'account_mismatch' })
    expect(writes()).toHaveLength(0)
  })

  it('page tokens missing: no write, tokens_missing', async () => {
    document.body.innerHTML = ''
    const f = ig({ saved: ['9501'] })
    const b = bgUnsave([{ id: 1, ref: '9501' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ outcome: 'failed', note_code: 'tokens_missing' })
    expect(writes()).toHaveLength(0)
  })

  it('exception, network error and bad JSON send only note_code (AC-C28)', async () => {
    const f = ig({ saved: ['9601', '9602'] })
    f.st.info = (pk) => { if (pk === '9601') throw new Error('SECRET stack text'); return new Response('<html>SECRET', { status: 200 }) }
    const b = bgUnsave([{ id: 1, ref: '9601' }, { id: 2, ref: '9602' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(b.results[0]).toMatchObject({ outcome: 'failed', note_code: 'network' })
    expect(b.results[1]).toMatchObject({ outcome: 'failed', note_code: 'not_json' })
    expect(JSON.stringify(b.results)).not.toContain('SECRET')
    for (const r of b.results) expect(Object.keys(r).sort().every(k => ['item_id', 'outcome', 'note_code', 'http_status', 'fields', 'wrote'].includes(k))).toBe(true)
  })
})

// ── AC-C54 / AC-C56 / kontrol akışı ─────────────────────────────────────────

describe('token boundary (AC-C54), constants (AC-C56), control', () => {
  it('graphql tokens only go to /api/graphql, csrf only to the instagram origin, never to app, messages or storage', async () => {
    const f = ig({ saved: ['9701'] })
    const b = bgUnsave([{ id: 1, ref: '9701' }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(reqs.length).toBeGreaterThan(2)
    for (const r of reqs) {
      expect(r.url.startsWith('/') || r.url.startsWith('https://www.instagram.com/')).toBe(true)      // yalnız Instagram kökeni
      const hay = JSON.stringify(r.headers) + r.body
      if (r.url === '/api/graphql') {
        expect(hay).toContain(TOKENS.dtsg); expect(hay).toContain(TOKENS.lsd)
      } else {
        expect(hay).not.toContain(TOKENS.dtsg); expect(hay).not.toContain(TOKENS.lsd)
      }
      expect(hay).toContain(TOKENS.csrf)
    }
    const everything = JSON.stringify(sent) + JSON.stringify(storageSets)
    for (const t of Object.values(TOKENS)) expect(everything).not.toContain(t)
    expect(everything).not.toMatch(/www-claim|jazoest/i)
  })

  it('doc_id, friendly name and variables in the next payload are ignored; constants are used (AC-C56)', async () => {
    const f = ig({ saved: ['9801'] })
    const b = bgUnsave([{ id: 1, ref: '9801', doc_id: '1', friendly_name: 'EvilMutation', variables: '{"x":1}' } as any], {
      extra: { doc_id: '2', friendly_name: 'Evil', variables: { a: 1 }, UNSAVE_DOC_ID: '3' },
      precheck: () => ({ action: 'write', doc_id: '4', friendly_name: 'Evil2' }),
    })
    boot(b.handler, f.fetchImpl)
    await run({ ...RUN_UNSAVE, doc_id: '5', friendly_name: 'Evil3', variables: '{}' })
    const w = writes()[0]
    const p = new URLSearchParams(w.body)
    expect(p.get('doc_id')).toBe('27371251859134880')
    expect(p.get('fb_api_req_friendly_name')).toBe('usePolarisSaveMediaUnsaveMutation')
    expect(JSON.parse(p.get('variables')!)).toEqual({ input: { media_id: '9801', actor_id: VIEWER, client_mutation_id: '1' } })
    expect(JSON.stringify(reqs)).not.toMatch(/EvilMutation|Evil2|Evil3|"x":1/)
  })

  it('a ref that is not 1-25 digits is never sent to Instagram', async () => {
    const f = ig()
    const b = bgUnsave([{ id: 1, ref: '12/../x' }, { id: 2, ref: '1'.repeat(26) }])
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    expect(reqs).toHaveLength(0)
    expect(b.results.map(r => r.outcome)).toEqual(['failed', 'failed'])
  })

  it('heartbeat every 15 s while waiting, and abort cuts the wait at once', async () => {
    const f = ig({ saved: ['9901', '9902'] })
    const b = bgUnsave([{ id: 1, ref: '9901' }, { id: 2, ref: '9902' }], { delay: [100, 100] })
    boot(b.handler, f.fetchImpl)
    for (const l of listeners) l({ ...RUN_UNSAVE }, { id: 'ext' }, () => {})
    await vi.advanceTimersByTimeAsync(60_000)                                 // 1. öğe bitti, 100 sn bekleme sürüyor
    const beats = sent.filter(m => m.type === 'ia-cl-beat')
    expect(beats.length).toBeGreaterThanOrEqual(3)
    expect(beats[0]).toMatchObject({ jobId: 'j1' })
    expect(f.st.infoCount['9902']).toBeUndefined()
    for (const l of listeners) l({ type: 'ia-cl-abort', jobId: 'j1' }, { id: 'ext' }, () => {})
    await vi.advanceTimersByTimeAsync(5_000)
    expect(f.st.infoCount['9902']).toBeUndefined()                            // beklemeden çıkıldı, 2. öğe işlenmedi
    expect(sent.filter(m => m.type === 'ia-cl-next').length).toBeLessThanOrEqual(2)
  })

  it('messages not from the extension, or a second run while one is active, start nothing', async () => {
    const f = ig({ saved: ['9951'] })
    const b = bgUnsave([{ id: 1, ref: '9951' }])
    boot(b.handler, f.fetchImpl)
    for (const l of listeners) l({ ...RUN_UNSAVE }, { id: 'other' }, () => {})
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reqs).toHaveLength(0)
    for (const l of listeners) l({ ...RUN_UNSAVE, jobId: '' }, { id: 'ext' }, () => {})
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reqs).toHaveLength(0)
  })
})

// ── AC-S1 / S2 / S18 / S20: tarama ──────────────────────────────────────────

const savedMedia = (pk: unknown, o: Msg = {}) => ({
  media: {
    pk, id: `${pk}_77`, code: `Code${String(pk).slice(-6)}`, media_type: 1, product_type: 'feed', has_viewer_saved: true,
    user: { pk: '77', id: '77', username: 'Owner.One' },
    image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/big.jpg', width: 1080 }, { url: 'https://scontent.cdninstagram.com/small.jpg', width: 240 }, { url: 'https://scontent.cdninstagram.com/tiny.jpg', width: 100 }] },
    caption: { text: 'GİZLİ AÇIKLAMA' }, taken_at: 1700000000, saved_collection_ids: [],
    ...o,
  },
})

function bgScan(o: { pageReply?: (n: number) => Msg; collectionsReply?: Msg } = {}) {
  const pages: Msg[] = []; const collections: Msg[] = []; const finishes: Msg[] = []
  const handler = (m: Msg) => {
    if (m.type === 'ia-cl-page') { pages.push(m); return o.pageReply ? o.pageReply(pages.length) : { continue: true, waitMs: 3000 } }
    if (m.type === 'ia-cl-collections') { collections.push(m); return o.collectionsReply ?? { ok: true } }
    if (m.type === 'ia-cl-finish') { finishes.push(m); return { ok: true } }
    return undefined
  }
  return { handler, pages, collections, finishes }
}
const RUN_SCAN = { type: 'ia-cl-run', jobId: 's1', kind: 'saved_scan', collectionChoice: false }
const feedUrls = () => reqs.filter(r => r.url.startsWith('/api/v1/feed/saved/posts/')).map(r => r.url)

describe('saved scan (AC-S1, S2, S18)', () => {
  it('pages through max_id <- next_max_id with the page delay; sends whitelisted fields only', async () => {
    const pagesData = [
      { items: [savedMedia('3001'), savedMedia('3002', { media_type: 2, product_type: 'clips' })], more_available: true, next_max_id: 'abc==1' },
      { items: [savedMedia('3003', { media_type: 8, product_type: 'ad', saved_collection_ids: ['17890000000000002'] })], more_available: false },
    ]
    let n = 0
    const b = bgScan()
    boot(b.handler, (url) => (url.startsWith('/api/v1/feed/saved/posts/') ? J(pagesData[n++]) : new Response('', { status: 404 })))
    await run(RUN_SCAN)
    expect(feedUrls()).toEqual(['/api/v1/feed/saved/posts/', '/api/v1/feed/saved/posts/?max_id=abc%3D%3D1'])
    expect(reqs[1].t - reqs[0].t).toBeGreaterThanOrEqual(3000)                  // bg'nin verdiği sayfa gecikmesi
    expect(b.pages.map(p => p.pageNo)).toEqual([1, 2])
    expect(b.pages[0].items[0]).toEqual({
      media_id: '3001', shortcode: 'Code3001', owner_username: 'owner.one', media_type: 'image', is_ad: false,
      thumbnail_url: 'https://scontent.cdninstagram.com/small.jpg', collection_ids: [],
    })
    expect(b.pages[0].items[1]).toMatchObject({ media_type: 'video', is_ad: false })      // clips -> is_ad false
    expect(b.pages[1].items[0]).toMatchObject({ media_type: 'carousel', is_ad: true, collection_ids: ['17890000000000002'] })
    expect(JSON.stringify(b.pages)).not.toMatch(/GİZLİ AÇIKLAMA|taken_at|"user"|"id":"3001_77"|"pk"/)
    expect(b.finishes).toEqual([expect.objectContaining({ outcome: 'ok' })])
  })

  it('maps pk safely: string pk wins; number pk falls back to id before "_"; never String(number) (R7 M6)', async () => {
    const big = '3512345678901234567'
    const b = bgScan()
    boot(b.handler, () => J({ items: [savedMedia(big), { media: { ...savedMedia('1').media, pk: Number(big), id: `${big}_77`, code: 'CodeNumPk' } }, { media: { ...savedMedia('1').media, pk: Number(big), id: undefined, code: 'CodeNoId0' } }], more_available: false }))
    await run(RUN_SCAN)
    expect(b.pages[0].items.map((i: Msg) => i.media_id)).toEqual([big, big])      // sayı pk + id yedeği doğru; id'siz öğe atlandı
  })

  it('skips items with an invalid pk or code; the rest of the page is sent', async () => {
    const b = bgScan()
    boot(b.handler, () => J({ items: [savedMedia('4001'), savedMedia('x1'), savedMedia('4003', { code: 'ab' }), savedMedia('4004')], more_available: false }))
    await run(RUN_SCAN)
    expect(b.pages[0].items.map((i: Msg) => i.media_id)).toEqual(['4001', '4004'])
    expect(b.pages[0].skipped).toBe(2)
  })

  it('collection_ids: valid array as is; invalid or >20 -> collections_unreadable, no collection_ids; absent -> neither (R6 H-2)', async () => {
    const b = bgScan()
    const items = [
      savedMedia('5101', { saved_collection_ids: ['17890000000000001'] }),
      savedMedia('5102', { saved_collection_ids: ['abc'] }),
      savedMedia('5103', { saved_collection_ids: Array.from({ length: 21 }, (_, i) => String(100 + i)) }),
      savedMedia('5104', { saved_collection_ids: [5] }),
      savedMedia('5105', { saved_collection_ids: undefined }),
      savedMedia('5106', { saved_collection_ids: 'x' }),
    ]
    boot(b.handler, () => J({ items, more_available: false }))
    await run(RUN_SCAN)
    const out = b.pages[0].items as Msg[]
    expect(out[0].collection_ids).toEqual(['17890000000000001'])
    for (const i of [1, 2, 3]) { expect(out[i].collections_unreadable).toBe(true); expect('collection_ids' in out[i]).toBe(false) }
    for (const i of [4, 5]) { expect('collection_ids' in out[i]).toBe(false); expect('collections_unreadable' in out[i]).toBe(false) }
  })

  it('thumbnail: smallest >=150 wide, else first; carousel_media[0] fallback; non-instagram hosts dropped', async () => {
    const b = bgScan()
    const items = [
      savedMedia('5201', { image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/a.jpg', width: 100 }, { url: 'https://x.cdninstagram.com/b.jpg', width: 90 }] } }),
      savedMedia('5202', { image_versions2: undefined, carousel_media: [{ image_versions2: { candidates: [{ url: 'https://y.fbcdn.net/c.jpg', width: 320 }] } }] }),
      savedMedia('5203', { image_versions2: { candidates: [{ url: 'https://evil.example/d.jpg', width: 320 }] } }),
      savedMedia('5204', { image_versions2: { candidates: [{ url: 'http://x.cdninstagram.com/e.jpg', width: 320 }] } }),
    ]
    boot(b.handler, () => J({ items, more_available: false }))
    await run(RUN_SCAN)
    const out = b.pages[0].items as Msg[]
    expect(out[0].thumbnail_url).toBe('https://x.cdninstagram.com/a.jpg')
    expect(out[1].thumbnail_url).toBe('https://y.fbcdn.net/c.jpg')
    expect('thumbnail_url' in out[2]).toBe(false)
    expect('thumbnail_url' in out[3]).toBe(false)
  })

  it('media_type other than 1/2/8 and an unusable owner name are omitted, not guessed', async () => {
    const b = bgScan()
    boot(b.handler, () => J({ items: [savedMedia('5301', { media_type: 19, user: { username: 'BAD NAME!' } })], more_available: false }))
    await run(RUN_SCAN)
    const it0 = b.pages[0].items[0]
    expect('media_type' in it0).toBe(false)
    expect('owner_username' in it0).toBe(false)
  })

  it('an empty first page finishes ok with no page sent (empty inventory, AC-U3)', async () => {
    const b = bgScan()
    boot(b.handler, () => J({ items: [], more_available: false }))
    await run(RUN_SCAN)
    expect(b.pages).toHaveLength(0)
    expect(b.finishes).toEqual([expect.objectContaining({ outcome: 'ok' })])
  })

  it('no item with has_viewer_saved === true on a non-empty page -> finish(failed, unrecognised_shape), nothing sent (R6 M-8)', async () => {
    const b = bgScan()
    boot(b.handler, () => J({ items: [savedMedia('5401', { has_viewer_saved: undefined }), savedMedia('5402', { has_viewer_saved: false })], more_available: false }))
    await run(RUN_SCAN)
    expect(b.pages).toHaveLength(0)
    expect(b.finishes).toEqual([expect.objectContaining({ outcome: 'failed', note_code: 'unrecognised_shape' })])
  })

  it('more_available true but no next_max_id finishes ok', async () => {
    const b = bgScan()
    boot(b.handler, () => J({ items: [savedMedia('5501')], more_available: true }))
    await run(RUN_SCAN)
    expect(feedUrls()).toHaveLength(1)
    expect(b.finishes[0].outcome).toBe('ok')
  })

  it('background says end (server stopped it): no more requests and no finish from the page', async () => {
    const b = bgScan({ pageReply: () => ({ end: true }) })
    boot(b.handler, () => J({ items: [savedMedia('5601')], more_available: true, next_max_id: 'n' }))
    await run(RUN_SCAN)
    expect(feedUrls()).toHaveLength(1)
    expect(b.finishes).toHaveLength(0)
  })

  it.each([
    ['429 on the first page', [429], 'failed', 'rate_limited'],
    ['429 on a later page keeps what was read', [200, 429], 'partial', 'rate_limited'],
    ['feedback_required body', [200, 400], 'blocked', 'blocked'],
    ['401', [401], 'failed', 'login_required'],
    ['500', [500], 'failed', 'http_error'],
    ['200 but not JSON', [-1], 'failed', 'not_json'],
    ['200 but no items array', [-2], 'failed', 'unrecognised_shape'],
  ])('listing error: %s -> finish(%s, %s)', async (_n, statuses, outcome, note) => {
    const b = bgScan()
    let n = 0
    boot(b.handler, () => {
      const s = statuses[Math.min(n++, statuses.length - 1)]
      if (s === 200) return J({ items: [savedMedia(`60${n}1`)], more_available: true, next_max_id: `n${n}` })
      if (s === -1) return new Response('<html>', { status: 200 })
      if (s === -2) return J({ status: 'ok' })
      if (s === 400) return J({ message: 'feedback_required' }, 400)
      return J({ message: 'x' }, s)
    })
    await run(RUN_SCAN)
    const last = b.finishes.slice(-1)[0]
    expect(last).toMatchObject({ outcome, note_code: note })
    expect(b.finishes).toHaveLength(1)
    expect(JSON.stringify(b.finishes)).not.toContain('"message"')
  })
})

describe('collection list (AC-S20, W mode)', () => {
  const colPage = (nodes: Msg[], next: string | null) => GQL({ data: { viewer: { media_collections: { edges: nodes.map(node => ({ node })), page_info: { end_cursor: next, has_next_page: next !== null } } } } })
  const node = (id: unknown, name: unknown) => ({ collection_id: id, collection_name: name, id: 'x', cover_media: { id: 'SECRET_COVER' } })
  const run4 = { ...RUN_SCAN, collectionChoice: true }

  it('reads the list before the first page and sends only {collection_id, name}', async () => {
    const b = bgScan()
    boot(b.handler, (url, _i, req) => (url === '/api/graphql' ? colPage([node('17890000000000001', 'Seyahat'), node('17890000000000002', 'Yemek')], null)
      : J({ items: [savedMedia('7001')], more_available: false })))
    await run(run4)
    expect(b.collections).toEqual([expect.objectContaining({ available: true, collections: [{ collection_id: '17890000000000001', name: 'Seyahat' }, { collection_id: '17890000000000002', name: 'Yemek' }] })])
    expect(JSON.stringify(b.collections)).not.toContain('SECRET_COVER')
    const gql = reqs.find(r => r.url === '/api/graphql')!
    const p = new URLSearchParams(gql.body)
    expect(p.get('doc_id')).toBe('29115677831365401')
    expect(p.get('fb_api_req_friendly_name')).toBe('PolarisSavedCollectionPickerQuery')
    expect(JSON.parse(p.get('variables')!)).toEqual({ first: 50 })
    expect(reqs.indexOf(gql)).toBe(0)                                           // ilk sayfadan önce
    expect(b.finishes[0].outcome).toBe('ok')
  })

  it('does not ask for the list when collection_choice is not true', async () => {
    const b = bgScan()
    boot(b.handler, () => J({ items: [savedMedia('7002')], more_available: false }))
    await run({ ...RUN_SCAN, collectionChoice: 'yes' })
    expect(reqs.some(r => r.url === '/api/graphql')).toBe(false)
    expect(b.collections).toHaveLength(0)
  })

  it('pages with the previous end_cursor, up to 4 pages; more than that -> available:false', async () => {
    const b = bgScan()
    let n = 0
    boot(b.handler, (url) => (url === '/api/graphql' ? colPage([node(`1789000000000000${n}`, `K${n++}`)], `cur${n}`) : J({ items: [savedMedia('7003')], more_available: false })))
    await run(run4)
    const vars = reqs.filter(r => r.url === '/api/graphql').map(r => JSON.parse(new URLSearchParams(r.body).get('variables')!))
    expect(vars).toEqual([{ first: 50 }, { first: 50, after: 'cur1' }, { first: 50, after: 'cur2' }, { first: 50, after: 'cur3' }])
    expect(b.collections[0]).toMatchObject({ available: false, note_code: 'collections_unavailable' })
    expect(b.pages).toHaveLength(1)                                              // tarama F ile sürer
  })

  it.each([
    ['bad collection_id', [node('abc', 'X')]],
    ['non-string name', [node('17890000000000001', 5)]],
  ])('shape problem (%s) -> available:false and the scan goes on (F)', async (_n, nodes) => {
    const b = bgScan()
    boot(b.handler, (url) => (url === '/api/graphql' ? colPage(nodes, null) : J({ items: [savedMedia('7004')], more_available: false })))
    await run(run4)
    expect(b.collections[0]).toMatchObject({ available: false, note_code: 'collections_unavailable' })
    expect(b.pages).toHaveLength(1)
    expect(b.finishes[0].outcome).toBe('ok')
  })

  it('missing tokens or an unrecognised body -> available:false; the scan goes on', async () => {
    document.body.innerHTML = ''
    const b = bgScan()
    boot(b.handler, () => J({ items: [savedMedia('7005')], more_available: false }))
    await run(run4)
    expect(b.collections[0]).toMatchObject({ available: false })
    expect(reqs.some(r => r.url === '/api/graphql')).toBe(false)
    expect(b.pages).toHaveLength(1)
  })

  it.each([
    ['429', () => GQL({}, 429), 'failed', 'rate_limited'],
    ['feedback_required', () => GQL({ message: 'feedback_required' }, 400), 'blocked', 'blocked'],
    ['401', () => GQL({}, 401), 'failed', 'login_required'],
  ])('list %s ends the scan (finish %s/%s) without reading pages', async (_n, res, outcome, note) => {
    const b = bgScan()
    boot(b.handler, (url) => (url === '/api/graphql' ? res() : J({ items: [savedMedia('7006')], more_available: false })))
    await run(run4)
    expect(b.finishes).toEqual([expect.objectContaining({ outcome, note_code: note })])
    expect(feedUrls()).toHaveLength(0)
  })
})

// ── AC-S6 / AC-C55: pasif yol ───────────────────────────────────────────────

const MAILBOX = '{"data":{"get_slide_mailbox_for_iris_subscription":{"threads_by_folder":[{"thread_id":"1","username":"u","taken_at":1}]}}}'
function postMessageObserved(d: Msg) {
  window.dispatchEvent(new MessageEvent('message', { data: { __ia: 'ia-observed', ...d }, origin: 'https://www.instagram.com', source: window }))
}
const observed = () => sent.filter(m => m.type === 'ia-observed')
const ON = { on: true, username: 'gktuoktay', tools: { posts: true, likers: true, comments: true } }

describe('passive path: own saved page, body guard, scanEmbedded (AC-S6, AC-C55)', () => {
  it('own /saved/ page is not observed (pageAllowed)', async () => {
    boot(() => undefined, () => J({}), ON)
    await vi.advanceTimersByTimeAsync(2000)
    history.replaceState({}, '', '/gktuoktay/saved/')
    postMessageObserved({ url: 'https://www.instagram.com/api/v1/feed/saved/posts/', status: 200, text: '{"items":[{"username":"a","taken_at":1}]}', friendly: '', variables: '' })
    history.replaceState({}, '', '/gktuoktay/saved/koleksiyon/123/')
    postMessageObserved({ url: 'https://www.instagram.com/api/v1/feed/saved/posts/', status: 200, text: '{"items":[{"username":"a","taken_at":1}]}', friendly: '', variables: '' })
    expect(observed()).toHaveLength(0)
    history.replaceState({}, '', '/gktuoktay/')                                  // sağlama: kendi profili hâlâ izinli
    postMessageObserved({ url: 'https://www.instagram.com/api/v1/feed/user/1/', status: 200, text: '{"items":[{"username":"a","taken_at":1}]}', friendly: '', variables: '' })
    expect(observed()).toHaveLength(1)
  })

  it('body guard blocks a mailbox body even under a WANTED name (PolarisProfilePostsQuery)', async () => {
    boot(() => undefined, () => J({}), ON)
    await vi.advanceTimersByTimeAsync(2000)
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: MAILBOX, friendly: 'PolarisProfilePostsQuery', variables: '' })
    expect(observed()).toHaveLength(0)
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: '{"data":{"user":{"username":"a","taken_at":1}}}', friendly: 'PolarisProfilePostsQuery', variables: '' })
    expect(observed()).toHaveLength(1)                                           // normal yanıt geçer
  })

  it.each([
    'get_slide_mailbox', 'iris_subscription', 'as_ig_direct_thread', 'threads_by_folder', 'direct_v2', '"thread_id":"1"', 'DTSGInitialData', '["LSD",[],{"token":"x"}]', '"csrf_token":"TEST_CSRF_789"',
  ])('guard pattern "%s": the whole block is dropped, even with post data in it', async (needle) => {
    boot(() => undefined, () => J({}), ON)
    await vi.advanceTimersByTimeAsync(2000)
    postMessageObserved({ url: 'https://www.instagram.com/api/v1/feed/user/1/', status: 200, text: `{"username":"a","taken_at":1} ${needle}`, friendly: '', variables: '' })
    expect(observed()).toHaveLength(0)
  })

  it('scanEmbedded never forwards threads_by_folder, token or csrf blocks, but forwards a clean post block', async () => {
    document.body.innerHTML = `
      <script type="application/json">{"threads_by_folder":[],"username":"u","taken_at":1}</script>
      <script type="application/json">{"csrf_token":"${TOKENS.csrf}","username":"u","taken_at":1}</script>
      <script type="application/json">{"define":[["DTSGInitialData",[],{"token":"${TOKENS.dtsg}"}]],"username":"u","taken_at":1}</script>
      <script type="application/json">{"items":[{"username":"clean","taken_at":2}]}</script>`
    boot(() => undefined, () => J({}), ON)
    await vi.advanceTimersByTimeAsync(5000)
    const o = observed()
    expect(o).toHaveLength(1)
    expect(o[0].text).toContain('"clean"')
    expect(JSON.stringify(sent)).not.toMatch(/threads_by_folder|TEST_CSRF_789|TEST_DTSG_123/)
  })

  it('saved jobs ignore ia-observed and injected DM metadata: nothing from it reaches the app', async () => {
    const f = ig({ saved: ['9961'] })
    const b = bgUnsave([{ id: 1, ref: '9961' }])
    boot(b.handler, f.fetchImpl, ON)
    for (const l of listeners) l({ ...RUN_UNSAVE }, { id: 'ext' }, () => {})
    await vi.advanceTimersByTimeAsync(1000)
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: MAILBOX, friendly: 'PolarisProfilePostsQuery', variables: '' })
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: '{"data":{"xig_media_unsave":{"media":{"id":"9961"}},"username":"a","taken_at":1}}', friendly: 'usePolarisSaveMediaUnsaveMutation', variables: '' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(JSON.stringify(sent)).not.toMatch(/threads_by_folder|get_slide_mailbox|thread_id/)
    expect(b.results[0].outcome).toBe('done')                                    // sonuç yalnız kendi isteğinin yanıtından
  })
})

// ── FB-1 sayaçları: yalnız sayı ─────────────────────────────────────────────

describe('FB-1 body-guard counters (counts only)', () => {
  const stats = () => (window as unknown as { __iaGuardStats?: () => Record<string, number> }).__iaGuardStats?.()

  it('counts forwarded blocks, guard-dropped blocks, and dropped blocks that carried post data; embedded scan goes through the same counters', async () => {
    document.body.innerHTML = `
      <script type="application/json">{"threads_by_folder":[],"username":"u","taken_at":1}</script>
      <script type="application/json">{"csrf_token":"${TOKENS.csrf}"}</script>
      <script type="application/json">{"items":[{"username":"clean","taken_at":2}]}</script>`
    boot(() => undefined, () => J({}), ON)
    await vi.advanceTimersByTimeAsync(5000)
    expect(stats()).toEqual({ forwarded: 1, guarded: 1, guardedWithPostData: 1 })   // csrf bloğu gönderi benzeri değil: scanEmbedded süzer, bekçiye ulaşmaz
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: MAILBOX, friendly: 'PolarisProfilePostsQuery', variables: '' })
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: '{"DTSGInitialData":1}', friendly: 'PolarisProfilePostsQuery', variables: '' })
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: '{"data":{"user":{"username":"a","taken_at":1}}}', friendly: 'PolarisProfilePostsQuery', variables: '' })
    expect(stats()).toEqual({ forwarded: 2, guarded: 3, guardedWithPostData: 2 })
  })

  it('only numbers are kept; nothing from them or from a guarded body is sent anywhere or logged', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(k => vi.spyOn(console, k).mockImplementation(() => {}))
    boot(() => undefined, () => J({}), ON)
    await vi.advanceTimersByTimeAsync(2000)
    postMessageObserved({ url: 'https://www.instagram.com/api/graphql', status: 200, text: MAILBOX, friendly: 'PolarisProfilePostsQuery', variables: '' })
    const s = stats()!
    expect(Object.values(s).every(v => typeof v === 'number')).toBe(true)
    expect(Object.keys(s).sort()).toEqual(['forwarded', 'guarded', 'guardedWithPostData'])
    expect(observed()).toHaveLength(0)
    expect(JSON.stringify(sent)).not.toMatch(/guard|forwarded|threads_by_folder|get_slide_mailbox|thread_id/i)
    for (const sp of spies) expect(sp).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ── listener.js NEVER (AC-C55 madde 2) ──────────────────────────────────────

describe('listener.js NEVER pattern widened (AC-C55)', () => {
  const NEVER_SRC = /const NEVER = (\/.*\/i);/
  const WANTED_SRC = /const WANTED = (\/.*\/i);/
  const toRe = (src: RegExp) => { const m = listenerSrc.match(src)!; return new RegExp(m[1].slice(1, m[1].lastIndexOf('/')), 'i') }

  it('save, collection, mailbox, iris and slide names (and variants) never come out of the listener', () => {
    const NEVER = toRe(NEVER_SRC)
    for (const n of [
      'usePolarisSaveMediaUnsaveMutation', 'PolarisSavedCollectionPickerQuery', 'usePolarisMediaSaveToCollectionMutation', 'PolarisCollectionAddMediaMutation',
      'PolarisSavedCollectionPageWWWQuery', 'polarissavedmedia', 'GetSlideMailboxForIrisSubscription', 'IrisSubscriptionQuery', 'PolarisSlideTrayQuery', 'POLARISCOLLECTIONMEDIA',
    ]) expect(NEVER.test(n), n).toBe(true)
  })

  it('the names the current listener tests use are not caught by NEVER', () => {
    const NEVER = toRe(NEVER_SRC); const WANTED = toRe(WANTED_SRC)
    for (const n of ['PolarisPostLikersQuery', 'PolarisProfilePostsQuery', 'PolarisPostCommentsQuery', 'PolarisFeedTimelineQuery', 'PolarisMediaLikesQuery']) {
      expect(WANTED.test(n), n).toBe(true)
      expect(NEVER.test(n), n).toBe(false)
    }
  })

  it('end to end: the unsave and picker responses are not copied by the page listener', async () => {
    const seen: any[] = []
    vi.spyOn(window, 'postMessage').mockImplementation(((d: any) => { if (d?.__ia === 'ia-observed') seen.push(d) }) as any)
    ;(window as any).__iaListener = false
    ;(window as any).fetch = vi.fn(async () => new Response('{"data":{}}', { status: 200 }))
    // eslint-disable-next-line no-new-func
    new Function(listenerSrc)()
    window.dispatchEvent(new MessageEvent('message', { data: { __ia: 'ia-config', on: true }, origin: 'https://www.instagram.com', source: window }))
    const call = async (friendly: string) => {
      await window.fetch('https://www.instagram.com/api/graphql', { method: 'POST', body: new URLSearchParams({ fb_api_req_friendly_name: friendly, variables: '{}' }) })
      await vi.advanceTimersByTimeAsync(50)
    }
    for (const n of ['usePolarisSaveMediaUnsaveMutation', 'PolarisSavedCollectionPickerQuery', 'usePolarisMediaSaveToCollectionMutation', 'PolarisCollectionAddMediaMutation']) await call(n)
    expect(seen).toHaveLength(0)
    await call('PolarisProfilePostsQuery')
    expect(seen).toHaveLength(1)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// T-9: background.js + cleanup-bg.js + app-bridge.js (sahte Chrome, sahte uygulama; Instagram'a istek YOK)
// ═══════════════════════════════════════════════════════════════════════════════

const SID = '11111111-1111-4111-8111-111111111111'
const BG_VIEWER = '4242'
const TAB = 5
const IG_SENDER = { id: 'ext', tab: { id: TAB, url: 'https://www.instagram.com/' } }
const APP_SENDER = { id: 'ext', tab: { id: 9, url: 'http://localhost:3002/cleanup' } }

interface Call { path: string; body: any }
type Route = (path: string, body: any, n: number) => { status: number; data?: unknown } | undefined

interface Bg { ask: (m: Msg, sender?: Msg) => Promise<any>; calls: Call[]; tabMsgs: Msg[]; store: { local: Msg; session: Msg }; chrome: any; of: (suffix: RegExp | string) => Call[]; fire: (name: string, ...a: unknown[]) => unknown; notes: Msg[] }

/** background.js + cleanup-bg.js'i sahte Chrome ve sahte uygulamayla yükler. Varsayılan uygulama: sıradaki öğeleri verir, her precheck'e izin verir. */
function loadBg(o: { items?: Array<{ id: number; ref: string; label?: string }>; route?: Route; importScripts?: boolean; igTab?: boolean; tabHandler?: (m: Msg, cb: (r: unknown) => void) => void } = {}): Bg {
  const store = { local: { profiles: { [BG_VIEWER]: { id: SID, username: 'me' } }, lastViewer: BG_VIEWER, appUrl: 'http://localhost:3002', enabled: false } as Msg, session: { igTabs: { [TAB]: Date.now() } } as Msg }
  const listeners: Record<string, (...a: any[]) => any> = {}
  const calls: Call[] = []; const tabMsgs: Msg[] = []; const notes: Msg[] = []
  let pending = [...(o.items ?? [])]
  const dflt: Route = (path, body) => {
    if (/\/saved\/next$/.test(path)) {
      const items = pending.splice(0, 10)
      return { status: 200, data: items.length ? { items: items.map(i => ({ label: '@secretuser · abc12', ...i })), run_seq: body.run_seq, delay: [10, 20], stale_after_ms: 600000, allow_collections: [], reason: null } : { items: [], run_seq: body.run_seq, delay: [10, 20], stale_after_ms: 600000, allow_collections: [], reason: 'empty' } }
    }
    const pre = path.match(/\/items\/(\d+)\/precheck$/)
    if (pre) return { status: 200, data: { allow: true, item_id: Number(pre[1]) } }
    if (/\/items\/\d+\/result$/.test(path)) return { status: 200, data: { ok: true, status: 'done', retry: false, stopped: false } }
    if (/\/batches\/\d+\/stop$/.test(path)) return { status: 200, data: { applied: true } }
    if (/\/scan\/start$/.test(path)) return { status: 200, data: { scan_id: 77, max_pages: 100, page_delay: [3, 6], warn_after_ms: 66000, stale_after_ms: 600000, collection_choice: false } }
    if (/\/scan\/77\/page$/.test(path)) return { status: 200, data: { accepted: 1, duplicates: 0, total: 1, continue: true } }
    if (/\/scan\/77\/(finish|collections)$/.test(path)) return { status: 200, data: { status: 'ok', items: 1, mode: 'all_protected', new_count: 0 } }
    return undefined
  }
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(String(url))
    if (u.pathname === '/extension/manifest.json') return new Response(JSON.stringify({ version: '2.9.0' }), { status: 200 })
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path: u.pathname, body })
    if (u.pathname === '/api/bridge/jobs') return new Response('{"id":"x"}', { status: 201 })
    const r = (o.route?.(u.pathname, body, calls.length) ?? dflt(u.pathname, body, calls.length)) ?? { status: 404, data: {} }
    if (r.status === 0) throw new Error('down')
    return new Response(JSON.stringify(r.data ?? {}), { status: r.status })
  })
  const chrome: any = {
    runtime: {
      id: 'ext', lastError: undefined, getManifest: () => ({ version: JSON.parse(manifestSrc).version }), reload: vi.fn(),
      onMessage: { addListener: (f: any) => { listeners.message = f } }, onInstalled: { addListener: (f: any) => { listeners.installed = f } }, onStartup: { addListener: (f: any) => { listeners.startup = f } },
    },
    storage: {
      local: { get: async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).map(x => [x, store.local[x]])), set: async (v: Msg) => { Object.assign(store.local, v) } },
      session: { get: async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).map(x => [x, store.session[x]])), set: async (v: Msg) => { Object.assign(store.session, v) } },
      onChanged: { addListener: () => {} },
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    notifications: { create: (_id: string, n: Msg) => { notes.push(n) } },
    tabs: {
      create: vi.fn(async (x: Msg) => ({ id: 77, ...x })), update: vi.fn(async () => ({})), remove: vi.fn(async () => {}),
      onRemoved: { addListener: (f: any) => { listeners.removed = f } },
      sendMessage: (tab: number, m: Msg, cb?: (r: unknown) => void) => {
        tabMsgs.push({ tab, ...m })
        if (m.type === 'ia-api-ping') cb?.(o.igTab === false ? undefined : { ok: true, csrf: true, loginWall: false })
        else if (m.type === 'ia-cl-run') (o.tabHandler ? o.tabHandler(m, (r) => cb?.(r)) : cb?.({ ok: true }))
        else if (m.type === 'ia-cl-abort' && o.tabHandler) { o.tabHandler(m, () => {}); cb?.(undefined) }
        else cb?.(undefined)
      },
    },
  }
  const imp = (f: string) => { expect(f).toBe('cleanup-bg.js'); new Function(cleanupBgSrc)() }
  // eslint-disable-next-line no-new-func
  if (o.importScripts === false) { delete (globalThis as any).iaCleanup; new Function('chrome', 'fetch', backgroundSrc)(chrome, fetchStub) } else new Function('chrome', 'fetch', 'importScripts', backgroundSrc)(chrome, fetchStub, imp)
  const ask = (m: Msg, sender: Msg = APP_SENDER) => new Promise<any>(res => { const r = listeners.message(m, sender, res); if (!r) res(undefined) })
  return {
    ask, calls, tabMsgs, store, chrome, notes,
    of: (suffix: RegExp | string) => calls.filter(c => (typeof suffix === 'string' ? c.path.endsWith(suffix) : suffix.test(c.path))),
    fire: (name: string, ...a: unknown[]) => listeners[name]?.(...a),
  }
}

const startUnsave = (bg: Bg, extra: Msg = {}) => bg.ask({ type: 'ia-run', cmd: { kind: 'saved_unsave', session_id: SID, batch_id: 12, run_seq: 3, ...extra } })
const cl = (bg: Bg, m: Msg) => bg.ask({ jobId: bg.store.session.job?.id, ...m }, IG_SENDER)
const nextItem = (bg: Bg, result: Msg | null = null) => cl(bg, { type: 'ia-cl-next', result })
const res = (id: number, outcome: string, extra: Msg = {}) => ({ item_id: id, outcome, wrote: false, ...extra })
const job = (bg: Bg) => bg.store.session.job
const stopsOf = (bg: Bg) => bg.of(/\/batches\/12\/stop$/)
const five = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, ref: String(1000 + i) }))

describe('T-9 manifest and load (AC-C31)', () => {
  it('manifest is 2.9.0 and still asks for the minimum permissions', () => {
    const m = JSON.parse(manifestSrc)
    expect(m.version).toBe('2.9.0')
    expect(m.permissions).toEqual(['storage', 'notifications'])
  })

  it('cleanup-bg.js is loaded only behind the importScripts guard; without it the new kinds say "not supported" and the follow path is untouched', async () => {
    const bg = loadBg({ importScripts: false, items: five(1) })
    const r = await startUnsave(bg)
    expect(r).toMatchObject({ ok: false, error: 'Bu iş bu eklenti sürümünde desteklenmiyor.' })
    expect(bg.calls).toHaveLength(0)
    expect((await bg.ask({ type: 'ia-run', cmd: { kind: 'nonsense' } }))).toMatchObject({ ok: false, error: 'Bilinmeyen iş.' })
  })
})

describe('T-9 start and command validation (AC-C33, AC-C49, AC-C56)', () => {
  it('start: asks the server for the first items with run_seq, viewer, ext_version, then tells the tab to run', async () => {
    const bg = loadBg({ items: five(3) })
    const r = await startUnsave(bg)
    expect(r).toEqual({ ok: true, total: 3 })
    const next = bg.of('/saved/next')[0]
    expect(next.path).toBe(`/api/sessions/${SID}/cleanup/saved/next`)
    expect(next.body).toEqual({ batch_id: 12, run_seq: 3, viewer_id: BG_VIEWER, ext_version: '2.9.0', limit: 10 })
    expect(bg.tabMsgs.find(m => m.type === 'ia-cl-run')).toMatchObject({ tab: TAB, kind: 'saved_unsave', jobId: job(bg).id })
    expect(job(bg)).toMatchObject({ cleanup: true, api: true, state: 'running', runSeq: 3, batchId: 12, deadAfterMs: 600000 })
  })

  it('a command for another profile than the selected one does nothing: no app call, no tab message (C33)', async () => {
    const bg = loadBg({ items: five(2) })
    const r = await startUnsave(bg, { session_id: '22222222-2222-4222-8222-222222222222' })
    expect(r).toMatchObject({ ok: false, code: 'profile_mismatch' })
    expect(bg.calls).toHaveLength(0)
    expect(bg.tabMsgs.filter(m => m.type === 'ia-cl-run')).toHaveLength(0)
  })

  it('next reason=stopped (or any server stop) at start: no write job, no stop call', async () => {
    for (const reason of ['stopped', 'limit', 'quiet_hours', 'off', 'paused']) {
      const bg = loadBg({ route: (p, b) => (p.endsWith('/saved/next') ? { status: 200, data: { items: [], run_seq: b.run_seq, delay: [10, 20], stale_after_ms: 600000, allow_collections: [], reason } } : undefined) })
      const r = await startUnsave(bg)
      expect(r.ok).toBe(false)
      expect(bg.tabMsgs.filter(m => m.type === 'ia-cl-run')).toHaveLength(0)
      expect(stopsOf(bg)).toHaveLength(0)
    }
  })

  it('app-bridge cleanCmd keeps only kind, session_id, batch_id, run_seq; doc_id, friendly name, variables are dropped; bad shapes are refused (C56)', async () => {
    const posted: Msg[] = []; const sent: Msg[] = []
    vi.spyOn(window, 'postMessage').mockImplementation(((d: any) => { posted.push(d) }) as any)
    const chrome = { runtime: { getManifest: () => ({ version: '2.9.0' }), sendMessage: vi.fn(async (m: Msg) => { sent.push(m); return { ok: true } }) }, storage: { onChanged: { addListener: () => {} } } }
    // eslint-disable-next-line no-new-func
    new Function('chrome', appBridgeSrc)(chrome)
    const run = async (cmd: Msg) => {
      window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, type: 'ia-run', id: 1, cmd }, origin: location.origin, source: window }))
      await vi.advanceTimersByTimeAsync(10)
    }
    await run({ kind: 'saved_unsave', session_id: SID, batch_id: 12, run_seq: 3, doc_id: '1', friendly_name: 'Evil', variables: '{}', UNSAVE_DOC_ID: '2' })
    expect(sent[sent.length - 1]).toEqual({ type: 'ia-run', cmd: { kind: 'saved_unsave', session_id: SID, batch_id: 12, run_seq: 3 } })
    await run({ kind: 'saved_scan', session_id: SID, doc_id: '1', batch_id: 5 })
    expect(sent[sent.length - 1]).toEqual({ type: 'ia-run', cmd: { kind: 'saved_scan', session_id: SID } })
    const before = sent.length
    for (const bad of [{ kind: 'saved_unsave', session_id: SID }, { kind: 'saved_unsave', session_id: SID, batch_id: 0, run_seq: 1 }, { kind: 'saved_unsave', session_id: 'x', batch_id: 1, run_seq: 1 }, { kind: 'saved_unsave', session_id: SID, batch_id: 1, run_seq: -1 }, { kind: 'saved_scan' }]) await run(bad)
    expect(sent).toHaveLength(before)                                           // arka plana hiçbiri gitmedi
    expect(posted.filter(p => p.type === 'ia-reply' && p.reply?.ok === false).length).toBe(5)
    // eski türler aynı çıktıyı verir
    await run({ kind: 'actions', mode: 'tab', doc_id: 'x' })
    expect(sent[sent.length - 1]).toEqual({ type: 'ia-run', cmd: { kind: 'actions', mode: 'tab' } })
  })

  it('doc_id or variables in the ia-run command or in the next reply never reach the tab', async () => {
    const bg = loadBg({ items: five(1), route: (p, b) => (p.endsWith('/saved/next') ? { status: 200, data: { items: [{ id: 1, ref: '1000', label: 'x', doc_id: '9', variables: { a: 1 } }], run_seq: b.run_seq, delay: [10, 20], stale_after_ms: 600000, allow_collections: ['17890000000000002', 'DROP'], reason: null, doc_id: '8', friendly_name: 'Evil' } } : undefined) })
    await startUnsave(bg, { doc_id: '5', friendly_name: 'Evil', variables: '{}' })
    const reply = await nextItem(bg)
    expect(reply).toEqual({ item: { id: 1, ref: '1000' }, delay: [10, 20], allow: ['17890000000000002'] })
    expect(JSON.stringify([bg.tabMsgs, reply])).not.toMatch(/doc_id|Evil|"variables"/)
  })
})

describe('T-9 loop, result table, end paths (AC-C40, AC-C51, §6.6)', () => {
  it('serves items from the server batch, posts each result with run_seq, finishes done on reason=empty (no stop call)', async () => {
    const bg = loadBg({ items: five(2) })
    await startUnsave(bg)
    const a = await nextItem(bg)
    expect(a.item).toMatchObject({ id: 1 })
    const b = await nextItem(bg, res(1, 'done'))
    expect(b.item).toMatchObject({ id: 2 })
    const c = await nextItem(bg, res(2, 'already', { note_code: 'already' }))
    expect(c).toEqual({ item: null })
    const results = bg.of(/\/items\/\d+\/result$/)
    expect(results.map(r => r.body)).toEqual([
      { viewer_id: BG_VIEWER, run_seq: 3, outcome: 'done' },
      { viewer_id: BG_VIEWER, run_seq: 3, outcome: 'already', note_code: 'already' },
    ])
    expect(job(bg)).toMatchObject({ state: 'done', outcome: 'ok' })
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('a result for another item than the one handed out is ignored (never posted)', async () => {
    const bg = loadBg({ items: five(2) })
    await startUnsave(bg)
    await nextItem(bg)
    await nextItem(bg, res(99, 'done'))
    expect(bg.of(/\/result$/)).toHaveLength(0)
  })

  it('result 200 stopped=true ends the job without calling stop (blocked, 429, login_required, mutation_unrecognised ...)', async () => {
    for (const [outcome, note, why] of [['blocked', 'blocked', 'blocked'], ['failed', 'rate_limited', 'rate_limited'], ['failed', 'login_required', 'login_required'], ['failed', 'mutation_unrecognised', 'mutation_unrecognised'], ['failed', 'tokens_missing', 'tokens_missing']]) {
      const bg = loadBg({ items: five(3), route: (p) => (/\/result$/.test(p) ? { status: 200, data: { ok: true, status: 'pending', retry: false, stopped: true } } : undefined) })
      await startUnsave(bg)
      await nextItem(bg)
      expect(await nextItem(bg, res(1, outcome, { note_code: note }))).toEqual({ item: null })
      expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: why })
      expect(stopsOf(bg)).toHaveLength(0)
    }
  })

  it.each([
    ['409 account_mismatch', { status: 409, data: { detail: { code: 'account_mismatch' } } }, 'account_mismatch', false],
    ['422', { status: 422, data: { detail: { code: 'invalid' } } }, 'unexpected', false],
    ['500', { status: 500, data: {} }, 'save_failed', true],
    ['app down', { status: 0 }, 'save_failed', true],
  ])('result %s ends the job (stop only tried for 0/5xx)', async (_n, reply, why, triesStop) => {
    const bg = loadBg({ items: five(3), route: (p) => (/\/result$/.test(p) ? reply : undefined) })
    await startUnsave(bg)
    await nextItem(bg)
    expect(await nextItem(bg, res(1, 'done'))).toEqual({ item: null })
    expect(job(bg).stopReason).toBe(why)
    expect(stopsOf(bg).length).toBe(triesStop ? 1 : 0)
  })

  it('result 404 continues with the next item', async () => {
    const bg = loadBg({ items: five(3), route: (p) => (/\/result$/.test(p) ? { status: 404, data: {} } : undefined) })
    await startUnsave(bg)
    await nextItem(bg)
    expect((await nextItem(bg, res(1, 'done'))).item).toMatchObject({ id: 2 })
  })

  it('result retry=true puts the item back at the end of the job', async () => {
    let n = 0
    const bg = loadBg({ items: five(2), route: (p) => (/\/result$/.test(p) ? { status: 200, data: { ok: true, status: 'pending', retry: ++n === 1, stopped: false } } : undefined) })
    await startUnsave(bg)
    await nextItem(bg)                                                           // 1
    expect((await nextItem(bg, res(1, 'failed', { note_code: 'verify_failed' }))).item.id).toBe(2)
    expect((await nextItem(bg, res(2, 'done'))).item.id).toBe(1)                // 1 yeniden, sonda
    expect(await nextItem(bg, res(1, 'done'))).toEqual({ item: null })
  })

  it.each(['limit', 'quiet_hours', 'off', 'paused', 'stopped'])('next reason=%s mid-job ends the job; the server stopped it so stop is NOT called (C51)', async (reason) => {
    let calls = 0
    const bg = loadBg({ items: five(1), route: (p, b) => (p.endsWith('/saved/next') && ++calls > 1 ? { status: 200, data: { items: [], run_seq: b.run_seq, delay: [10, 20], stale_after_ms: 600000, allow_collections: [], reason } } : undefined) })
    await startUnsave(bg)
    await nextItem(bg)
    expect(await nextItem(bg, res(1, 'done'))).toEqual({ item: null })
    expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: reason })
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it.each([['extension_update_required'], ['account_mismatch'], ['viewer_unknown'], ['extension_outdated']])('next 409 %s mid-job ends without stop (C51, C57)', async (c) => {
    let calls = 0
    const bg = loadBg({ items: five(1), route: (p) => (p.endsWith('/saved/next') && ++calls > 1 ? { status: 409, data: { detail: { code: c } } } : undefined) })
    await startUnsave(bg)
    await nextItem(bg)
    await nextItem(bg, res(1, 'done'))
    expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: c })
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('end paths that the extension sees itself call stop(reason, run_seq, viewer_id): user_stop, tab_closed, stale (C51)', async () => {
    for (const [kind, drive, reason] of [
      ['user_stop', (bg: Bg) => bg.ask({ type: 'ia-stop' }), 'user_stop'],
      ['tab_closed', async (bg: Bg) => { await bg.fire('removed', TAB) }, 'tab_closed'],
    ] as const) {
      const bg = loadBg({ items: five(2) })
      await startUnsave(bg)
      await nextItem(bg)
      await drive(bg)
      await vi.advanceTimersByTimeAsync(10)
      expect(stopsOf(bg).map(s => s.body), kind).toEqual([{ reason, run_seq: 3, viewer_id: BG_VIEWER }])
      expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: reason })
      expect(bg.tabMsgs.some(m => m.type === 'ia-cl-abort')).toBe(true)         // bekleme hemen kesilir
    }
  })

  it('stop during a wait ends the job and calls stop once; a second stop is a no-op', async () => {
    const bg = loadBg({ items: five(2) })
    await startUnsave(bg)
    await nextItem(bg)
    await bg.ask({ type: 'ia-stop' }); await bg.ask({ type: 'ia-stop' })
    expect(stopsOf(bg)).toHaveLength(1)
    expect(await nextItem(bg, res(1, 'done'))).toEqual({ item: null })           // eski döngünün gecikmiş mesajı: işlenmez
    expect(bg.of(/\/result$/)).toHaveLength(0)
  })

  it('messages from another tab, another job id, or a non-instagram sender are ignored', async () => {
    const bg = loadBg({ items: five(2) })
    await startUnsave(bg)
    expect(await bg.ask({ type: 'ia-cl-next', jobId: 'other' }, IG_SENDER)).toEqual({ item: null })
    expect(await bg.ask({ type: 'ia-cl-next', jobId: job(bg).id }, { id: 'ext', tab: { id: 99, url: 'https://www.instagram.com/' } })).toEqual({ item: null })
    expect(await bg.ask({ type: 'ia-cl-next', jobId: job(bg).id }, { id: 'ext', tab: { id: TAB, url: 'https://evil.example/' } })).toBeUndefined()
    expect(await bg.ask({ type: 'ia-cl-next', jobId: job(bg).id }, { id: 'evil', tab: IG_SENDER.tab })).toBeUndefined()
  })
})

describe('T-9 circuit breaker, too_soon, already_streak (AC-C16, AC-C48, AC-C52)', () => {
  const drive = async (bg: Bg, outcomes: Array<[string, Msg?]>) => {
    let last: any = await nextItem(bg)
    for (const [o, x] of outcomes) { if (!last.item) break; last = await nextItem(bg, res(last.item.id, o, x)) }
    return last
  }

  it('breaker after 5 consecutive failed: stop(circuit_breaker, run_seq); resets on any other result', async () => {
    const bg = loadBg({ items: five(12) })
    await startUnsave(bg)
    await drive(bg, [['failed'], ['failed'], ['failed'], ['failed'], ['done'], ['failed'], ['failed'], ['failed'], ['failed']])
    expect(job(bg).state).toBe('running')                                       // 4 + 1 + 4: hiçbir zaman 5 ardışık değil
    expect(stopsOf(bg)).toHaveLength(0)
    const end = await drive(bg, [['failed']])
    expect(end.item).toBeFalsy() ; expect(stopsOf(bg).map(s => s.body)).toEqual([{ reason: 'circuit_breaker', run_seq: 3, viewer_id: BG_VIEWER }])
    expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: 'circuit_breaker' })
  })

  it('too_soon waits retry_after and asks again; it is not a failure and does not feed the breaker', async () => {
    let n = 0
    const bg = loadBg({ items: five(2), route: (p) => { const m = p.match(/\/items\/(\d+)\/precheck$/); if (m && ++n <= 3) return { status: 200, data: { allow: false, item_id: Number(m[1]), reason: 'too_soon', retry_after: 7 } } } })
    await startUnsave(bg)
    const it = (await nextItem(bg)).item
    const pc = () => cl(bg, { type: 'ia-cl-precheck', itemId: it.id, collectionIds: [], viewer: BG_VIEWER })
    expect(await pc()).toEqual({ action: 'wait', retryAfterMs: 7000 })
    expect(await pc()).toEqual({ action: 'wait', retryAfterMs: 7000 })
    expect(await pc()).toEqual({ action: 'wait', retryAfterMs: 7000 })
    expect(await pc()).toEqual({ action: 'write' })
    expect(job(bg).failStreak).toBe(0)
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('five too_soon for the same item trigger stop(circuit_breaker) (N-8); retry_after below 1 is raised to 1 s', async () => {
    const bg = loadBg({ items: five(1), route: (p) => { const m = p.match(/\/items\/(\d+)\/precheck$/); if (m) return { status: 200, data: { allow: false, item_id: Number(m[1]), reason: 'too_soon', retry_after: 0 } } } })
    await startUnsave(bg)
    const it = (await nextItem(bg)).item
    const pc = () => cl(bg, { type: 'ia-cl-precheck', itemId: it.id, collectionIds: [], viewer: BG_VIEWER })
    for (let i = 0; i < 4; i++) expect(await pc()).toEqual({ action: 'wait', retryAfterMs: 1000 })
    expect(await pc()).toEqual({ action: 'end' })
    expect(stopsOf(bg).map(s => s.body.reason)).toEqual(['circuit_breaker'])
  })

  it('five already in a row: stop(already_streak, run_seq); a different result resets the count and a new job starts at 0', async () => {
    const bg = loadBg({ items: five(12) })
    await startUnsave(bg)
    await drive(bg, [['already'], ['already'], ['already'], ['already'], ['protected', { note_code: 'in_collection' }], ['already'], ['already'], ['already'], ['already']])
    expect(job(bg).state).toBe('running')
    const end = await drive(bg, [['already']])
    expect(end.item).toBeFalsy()
    expect(stopsOf(bg).map(s => s.body)).toEqual([{ reason: 'already_streak', run_seq: 3, viewer_id: BG_VIEWER }])
    expect(job(bg).stopReason).toBe('already_streak')
  })
})

describe('T-9 precheck mapping table (§6.6)', () => {
  const pre = async (route: Route, extra: Msg = {}) => {
    const bg = loadBg({ items: five(2), route })
    await startUnsave(bg)
    const it = (await nextItem(bg)).item
    const reply = await cl(bg, { type: 'ia-cl-precheck', itemId: it.id, collectionIds: ['17890000000000002'], viewer: BG_VIEWER, ...extra })
    return { bg, reply, it }
  }
  const P = (reply: { status: number; data?: unknown }): Route => (p) => (/\/precheck$/.test(p) ? reply : undefined)

  it('allow=true with the same item_id -> write; the body carries run_seq, viewer, ext_version and the fresh collection_ids', async () => {
    const { bg, reply, it } = await pre(() => undefined)
    expect(reply).toEqual({ action: 'write' })
    expect(bg.of(/\/precheck$/)[0]).toMatchObject({ path: `/api/sessions/${SID}/cleanup/items/${it.id}/precheck`, body: { viewer_id: BG_VIEWER, ext_version: '2.9.0', run_seq: 3, collection_ids: ['17890000000000002'] } })
  })

  it.each([
    ['not_pending', { status: 200, data: { allow: false, item_id: 1, reason: 'not_pending' } }, { action: 'skip' }],
    ['protected (AC-S23)', { status: 200, data: { allow: false, item_id: 1, reason: 'protected' } }, { action: 'report', outcome: 'protected' }],
    ['404', { status: 404, data: {} }, { action: 'skip' }],
    ['422', { status: 422, data: {} }, { action: 'report', outcome: 'failed' }],
    ['500', { status: 500, data: {} }, { action: 'report', outcome: 'failed' }],
    ['app down', { status: 0 }, { action: 'report', outcome: 'failed' }],
    ['allow=true but another item_id', { status: 200, data: { allow: true, item_id: 999 } }, { action: 'report', outcome: 'failed' }],
    ['not JSON', { status: 200, data: 'x' }, { action: 'report', outcome: 'failed' }],
  ])('precheck %s', async (_n, reply, expected) => {
    const { reply: out, bg } = await pre(P(reply as any))
    expect(out).toEqual(expected)
    expect(stopsOf(bg)).toHaveLength(0)
    expect(job(bg).state).toBe('running')
  })

  it.each(['limit', 'quiet_hours', 'off', 'paused', 'stopped'])('precheck allow=false %s ends the job; the server stopped it, so no stop call (kill switch: C14)', async (reason) => {
    const { reply, bg } = await pre(P({ status: 200, data: { allow: false, item_id: 1, reason } }))
    expect(reply).toEqual({ action: 'end' })
    expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: reason })
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it.each(['account_mismatch', 'viewer_unknown', 'extension_outdated'])('precheck 409 %s ends without stop', async (c) => {
    const { reply, bg } = await pre(P({ status: 409, data: { detail: { code: c } } }))
    expect(reply).toEqual({ action: 'end' })
    expect(job(bg).stopReason).toBe(c)
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('invalid or >20 collection ids are never sent: reported as protected without a precheck call', async () => {
    for (const ids of [['abc'], Array.from({ length: 21 }, (_, i) => String(i + 1)), 'x', null]) {
      const { reply, bg } = await pre(() => undefined, { collectionIds: ids })
      expect(reply).toEqual({ action: 'report', outcome: 'protected' })
      expect(bg.of(/\/precheck$/)).toHaveLength(0)
    }
  })

  it('precheck for an item that is not the current one, or with a missing viewer, ends and sends nothing', async () => {
    const a = await pre(() => undefined, { itemId: 42 })
    expect(a.reply).toEqual({ action: 'end' })
    const b = await pre(() => undefined, { viewer: 'x' })
    expect(b.reply).toEqual({ action: 'end' })
    expect(a.bg.of(/\/precheck$/)).toHaveLength(0)
  })
})

describe('T-9 one threshold: stale_after_ms, beat, second start (AC-C30, AC-C44)', () => {
  it('each next reply sets deadAfterMs from stale_after_ms; a job with delay_max=900 (T=1920 s) is not killed by a second start after 120 s', async () => {
    const bg = loadBg({ items: five(3), route: (p, b) => (p.endsWith('/saved/next') ? { status: 200, data: { items: [{ id: 1, ref: '1000', label: 'x' }], run_seq: b.run_seq, delay: [600, 900], stale_after_ms: 1_920_000, allow_collections: [], reason: null } } : undefined) })
    await startUnsave(bg)
    expect(job(bg).deadAfterMs).toBe(1_920_000)
    bg.store.session.job.beat = Date.now() - 120_000                              // 2 dk sessizlik: takip işinin 60 sn eşiğini aşar
    const r = await startUnsave(bg, { batch_id: 13, run_seq: 4 })
    expect(r).toMatchObject({ ok: false, code: 'running' })
    expect(job(bg).state).toBe('running')
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('beat keeps the job alive; a job silent beyond deadAfterMs is declared dead by a second start: stop(stale, OLD run_seq), then the new job starts', async () => {
    const bg = loadBg({ route: (p, b) => (p.endsWith('/saved/next') ? { status: 200, data: { items: [{ id: 1, ref: '1000', label: 'x' }], run_seq: b.run_seq, delay: [10, 20], stale_after_ms: 600000, allow_collections: [], reason: null } } : undefined) })
    await startUnsave(bg)
    bg.store.session.job.beat = Date.now() - 700_000                              // T = 600 s aşıldı
    const r = await startUnsave(bg, { batch_id: 12, run_seq: 4 })
    expect(stopsOf(bg).map(s => s.body)).toEqual([{ reason: 'stale', run_seq: 3, viewer_id: BG_VIEWER }])   // eski run_seq: yeni çalıştırmayı durduramaz (K-3)
    expect(r.ok).toBe(true)
    expect(job(bg)).toMatchObject({ state: 'running', runSeq: 4 })
  })

  it('ia-cl-beat refreshes the beat', async () => {
    const bg = loadBg({ items: five(2) })
    await startUnsave(bg)
    bg.store.session.job.beat = 1
    await cl(bg, { type: 'ia-cl-beat' })
    expect(Date.now() - job(bg).beat).toBeLessThan(5000)
  })

  it('a running follow job is not interrupted by a cleanup start', async () => {
    const bg = loadBg({ items: five(2) })
    bg.store.session.job = { id: 'f1', kind: 'actions', state: 'running', api: true, beat: Date.now(), startedAt: Date.now(), tabId: TAB, items: [], queue: [], total: 1, index: 0, results: [] }
    expect(await startUnsave(bg)).toMatchObject({ ok: false, code: 'running' })
  })
})

describe('T-9 counts only: jobView, report, notifications (AC-C29)', () => {
  it('jobView and the bridge report carry numbers only: no ref, label or username', async () => {
    const bg = loadBg({ items: [{ id: 1, ref: '5550001', label: '@secretuser · AbC123' }, { id: 2, ref: '5550002', label: '@secretuser · AbC124' }] })
    await startUnsave(bg)
    await nextItem(bg)
    await nextItem(bg, res(1, 'done'))
    const mid = JSON.stringify(bg.store.local.jobView)
    expect(mid).not.toMatch(/secretuser|5550001|5550002|AbC12/)
    await nextItem(bg, res(2, 'already'))
    await vi.advanceTimersByTimeAsync(50)
    const view = bg.store.local.jobView
    expect(JSON.stringify(view)).not.toMatch(/secretuser|555000|AbC12/)
    expect(view).toMatchObject({ kind: 'saved_unsave', state: 'done', counts: { done: 1, already: 1, not_found: 0, protected: 0, failed: 0 }, results: [] })
    const report = bg.of('/api/bridge/jobs')[0].body
    expect(report).toMatchObject({ session_id: SID, kind: 'saved_unsave', outcome: 'ok', results: [], saved: 0 })
    expect(report.message).toMatch(/^[0-9 /,.:]{0,200}$/)                         // sunucunun saf sayı kuralı
    expect(JSON.stringify(bg.notes)).not.toMatch(/secretuser|555000/)
    // öğe listesi yalnız oturum belleğinde (kuyruk kalan öğeleri tutar), yerelde değil
    expect(JSON.stringify(bg.store.local)).not.toMatch(/555000|"queue"/)
  })
})

describe('T-9 scan job (AC-S1, AC-S20; §6.6 scan table)', () => {
  const startScan = (bg: Bg) => bg.ask({ type: 'ia-run', cmd: { kind: 'saved_scan', session_id: SID, batch_id: 5 } })
  const page = (bg: Bg, no: number, n = 1) => cl(bg, { type: 'ia-cl-page', pageNo: no, items: Array.from({ length: n }, (_, i) => ({ media_id: String(100 + i), shortcode: `Code${i}0000` })) })

  it('start: scan/start with viewer + ext_version, tab gets collectionChoice from the server answer only; page replies carry a delay inside page_delay', async () => {
    const bg = loadBg({ route: (p) => (p.endsWith('/scan/start') ? { status: 200, data: { scan_id: 77, max_pages: 100, page_delay: [3, 6], warn_after_ms: 66000, stale_after_ms: 600000, collection_choice: true } } : undefined) })
    expect(await startScan(bg)).toEqual({ ok: true, total: 0 })
    expect(bg.of('/scan/start')[0].body).toEqual({ viewer_id: BG_VIEWER, ext_version: '2.9.0' })
    expect(bg.tabMsgs.find(m => m.type === 'ia-cl-run')).toMatchObject({ kind: 'saved_scan', collectionChoice: true })
    const r = await page(bg, 1)
    expect(r).toMatchObject({ continue: true })
    expect(r.waitMs).toBeGreaterThanOrEqual(3000); expect(r.waitMs).toBeLessThanOrEqual(6000)
    expect(bg.of('/scan/77/page')[0].body).toMatchObject({ viewer_id: BG_VIEWER, page_no: 1 })
    expect(job(bg)).toMatchObject({ pages: 1, items: 1, deadAfterMs: 600000 })
  })

  it('collection_choice defaults to false; the tab is never told to read collections on its own', async () => {
    const bg = loadBg()
    await startScan(bg)
    expect(bg.tabMsgs.find(m => m.type === 'ia-cl-run')).toMatchObject({ collectionChoice: false })
  })

  it.each([
    ['429 scan_too_soon with retry_after', { status: 429, data: { detail: { code: 'scan_too_soon', retry_after: 90 } } }, /90 sn/],
    ['409 scan_running', { status: 409, data: { detail: { code: 'scan_running' } } }, /./],
    ['409 extension_outdated', { status: 409, data: { detail: { code: 'extension_outdated' } } }, /2\.9\.0/],
    ['403 feature_off', { status: 403, data: { detail: { code: 'feature_off' } } }, /kapalı/],
    ['app down', { status: 0 }, /ulaşılamadı/],
  ])('start %s: no tab run, a readable error', async (_n, reply, msg) => {
    const bg = loadBg({ route: (p) => (p.endsWith('/scan/start') ? (reply as any) : undefined) })
    const r = await startScan(bg)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(msg)
    expect(bg.tabMsgs.filter(m => m.type === 'ia-cl-run')).toHaveLength(0)
  })

  it.each([
    ['continue=false -> finish(partial, page_cap)', { status: 200, data: { continue: false } }, 2, { outcome: 'partial', note_code: 'page_cap' }],
    ['422 on page 1 -> finish(failed, unrecognised_shape)', { status: 422, data: {} }, 1, { outcome: 'failed', note_code: 'unrecognised_shape' }],
    ['422 on page 3 -> finish(partial, unrecognised_shape)', { status: 422, data: {} }, 3, { outcome: 'partial', note_code: 'unrecognised_shape' }],
    ['403 feature_off -> finish(partial, feature_off)', { status: 403, data: { detail: { code: 'feature_off' } } }, 2, { outcome: 'partial', note_code: 'feature_off' }],
  ])('page %s', async (_n, reply, pageNo, fin) => {
    let seen = 0
    const bg = loadBg({ route: (p) => { if (/\/scan\/77\/page$/.test(p) && ++seen === pageNo) return reply as any } })
    await startScan(bg)
    let r: any
    for (let i = 1; i <= pageNo; i++) r = await page(bg, i)
    expect(r).toEqual({ end: true })
    expect(bg.of('/scan/77/finish')[0].body).toMatchObject({ viewer_id: BG_VIEWER, ...fin })
    expect(job(bg).state).toBe('stopped')
  })

  it('page 409 (scan_closed / page_out_of_order) and 5xx end the job; the server closes by threshold, no finish call', async () => {
    for (const reply of [{ status: 409, data: { detail: { code: 'page_out_of_order' } } }, { status: 500, data: {} }, { status: 0 }]) {
      const bg = loadBg({ route: (p) => (/\/page$/.test(p) ? (reply as any) : undefined) })
      await startScan(bg)
      expect(await page(bg, 1)).toEqual({ end: true })
      expect(bg.of('/scan/77/finish')).toHaveLength(0)
    }
  })

  it('finish from the tab is forwarded with only note_code, http_status and field names; ok ends done; blocked/partial/failed end stopped', async () => {
    const bg = loadBg()
    await startScan(bg)
    await page(bg, 1)
    await cl(bg, { type: 'ia-cl-finish', outcome: 'ok' })
    expect(bg.of('/scan/77/finish')[0].body).toEqual({ viewer_id: BG_VIEWER, outcome: 'ok' })
    expect(job(bg)).toMatchObject({ state: 'done', outcome: 'ok' })
    const bg2 = loadBg()
    await startScan(bg2)
    await cl(bg2, { type: 'ia-cl-finish', outcome: 'failed', note_code: 'rate_limited', http_status: 429, fields: ['data', 'BAD NAME', 'errors'], message: 'SECRET TEXT', extra: 1 })
    expect(bg2.of('/scan/77/finish')[0].body).toEqual({ viewer_id: BG_VIEWER, outcome: 'failed', note_code: 'rate_limited', http_status: 429, fields: ['data', 'errors'] })
    expect(job(bg2)).toMatchObject({ state: 'stopped', stopReason: 'rate_limited', outcome: 'failed' })
    expect(JSON.stringify(bg2.calls)).not.toContain('SECRET')
  })

  it('collections: available list goes to scan/{id}/collections; 422 is retried once with available:false (K-7); 409 changes nothing', async () => {
    let n = 0
    const bg = loadBg({ route: (p) => { if (/\/collections$/.test(p) && ++n === 1) return { status: 422, data: {} } } })
    await startScan(bg)
    await cl(bg, { type: 'ia-cl-collections', available: true, collections: [{ collection_id: '17890000000000001', name: 'Seyahat', cover: 'x' }] })
    const calls = bg.of('/collections')
    expect(calls.map(c => c.body)).toEqual([
      { viewer_id: BG_VIEWER, available: true, collections: [{ collection_id: '17890000000000001', name: 'Seyahat' }] },
      { viewer_id: BG_VIEWER, available: false, note_code: 'collections_unavailable' },
    ])
    expect(job(bg).state).toBe('running')
  })

  it('collections with a bad shape or more than 200 items are sent as available:false', async () => {
    const bg = loadBg()
    await startScan(bg)
    await cl(bg, { type: 'ia-cl-collections', available: true, collections: [{ collection_id: 'abc', name: 'x' }] })
    await cl(bg, { type: 'ia-cl-collections', available: true, collections: Array.from({ length: 201 }, (_, i) => ({ collection_id: String(i + 1), name: 'k' })) })
    expect(bg.of('/collections').map(c => c.body.available)).toEqual([false, false])
  })

  it('user stop during a scan ends it: finish(failed|partial, user_stop) and the tab is told to abort', async () => {
    const bg = loadBg()
    await startScan(bg)
    await page(bg, 1)
    await bg.ask({ type: 'ia-stop' })
    expect(bg.of('/scan/77/finish')[0].body).toMatchObject({ outcome: 'partial', note_code: 'user_stop' })
    expect(bg.tabMsgs.some(m => m.type === 'ia-cl-abort')).toBe(true)
    expect(job(bg).state).toBe('stopped')
  })

  it('scan report carries counts only', async () => {
    const bg = loadBg()
    await startScan(bg)
    await page(bg, 1, 3)
    await cl(bg, { type: 'ia-cl-finish', outcome: 'ok' })
    await vi.advanceTimersByTimeAsync(50)
    const rep = bg.of('/api/bridge/jobs')[0].body
    expect(rep).toMatchObject({ kind: 'saved_scan', outcome: 'ok', results: [] })
    expect(rep.message).toMatch(/^[0-9 /,.:]{0,200}$/)
    expect(JSON.stringify(bg.store.local.jobView)).not.toMatch(/Code\d0000|"media_id"/)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// T-10a: uçtan uca (content.js + background.js + cleanup-bg.js birlikte), ortak fixture, kalan §9 satırları
// ═══════════════════════════════════════════════════════════════════════════════

/** content.js ile arka planı birbirine bağlar: sekme mesajları arka plana, arka planın sekme mesajları içeriğe gider. */
function wire(o: { items?: Array<{ id: number; ref: string }>; route?: Route; ig: ReturnType<typeof ig>; allowExtra?: Msg }) {
  const bg: Bg = loadBg({
    items: o.items, route: o.route,
    tabHandler: (m, cb) => { for (const l of listeners) l({ ...m }, { id: 'ext' }, cb) },
  })
  boot((m) => (typeof m.type === 'string' && m.type.startsWith('ia-cl-') ? bg.ask(m, IG_SENDER) : undefined), o.ig.fetchImpl)
  return bg
}
const startWired = async (bg: Bg, ms = 900_000) => {
  const r = await startUnsave(bg)
  await vi.advanceTimersByTimeAsync(ms)
  return r
}
const igPosts = () => reqs.filter(r => r.url === '/api/graphql')
const appCalls = (bg: Bg, re: RegExp) => bg.of(re)

describe('T-10a end to end: content.js + cleanup-bg.js (fake Instagram, fake app)', () => {
  it('saves three posts: server result per item, no session token in any app request (AC-C18), tokens only to Instagram', async () => {
    const f = ig({ saved: ['5001', '5002', '5003'] })
    const bg = wire({ items: [{ id: 1, ref: '5001' }, { id: 2, ref: '5002' }, { id: 3, ref: '5003' }], ig: f })
    expect((await startWired(bg)).ok).toBe(true)
    expect(appCalls(bg, /\/result$/).map(c => c.body.outcome)).toEqual(['done', 'done', 'done'])
    expect(job(bg)).toMatchObject({ state: 'done', outcome: 'ok' })
    expect(igPosts()).toHaveLength(3)
    const toApp = JSON.stringify(bg.calls) + JSON.stringify(bg.store.local) + JSON.stringify(bg.notes)
    for (const t of Object.values(TOKENS)) expect(toApp).not.toContain(t)
    expect(toApp).not.toMatch(/www-claim|jazoest|fb_dtsg/i)
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('kill switch: precheck says off for the 2nd item -> no Instagram write for it, job ends, stop not called (AC-C14)', async () => {
    const f = ig({ saved: ['5011', '5012', '5013'] })
    const bg = wire({ items: [{ id: 1, ref: '5011' }, { id: 2, ref: '5012' }, { id: 3, ref: '5013' }], ig: f,
      route: (p) => { const m = p.match(/\/items\/(\d+)\/precheck$/); if (m && m[1] === '2') return { status: 200, data: { allow: false, item_id: 2, reason: 'off' } } } })
    await startWired(bg)
    expect(igPosts()).toHaveLength(1)                                           // yalnız 1. öğe yazıldı
    expect(f.st.saved.has('5012')).toBe(true)
    expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: 'off' })
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('account_mismatch on precheck: no write, job ends, no stop (AC-C4)', async () => {
    const f = ig({ saved: ['5021'] })
    const bg = wire({ items: [{ id: 1, ref: '5021' }], ig: f, route: (p) => (/\/precheck$/.test(p) ? { status: 409, data: { detail: { code: 'account_mismatch' } } } : undefined) })
    await startWired(bg)
    expect(igPosts()).toHaveLength(0)
    expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: 'account_mismatch' })
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('fresh read in a protected collection (F mode, allow empty): protected posted, precheck 0, Instagram POST 0 (AC-S16, AC-S23)', async () => {
    const f = ig({ saved: ['5031', '5032', '5033'], ids: { 5032: ['17890000000000001'] } })
    const bg = wire({ items: [{ id: 1, ref: '5031' }, { id: 2, ref: '5032' }, { id: 3, ref: '5033' }], ig: f })
    await startWired(bg)
    expect(appCalls(bg, /\/result$/).map(c => [c.body.outcome, c.body.note_code])).toEqual([['done', undefined], ['protected', 'in_collection'], ['done', undefined]])
    expect(appCalls(bg, /\/precheck$/).map(c => c.path.match(/items\/(\d+)/)![1])).toEqual(['1', '3'])
    expect(igPosts()).toHaveLength(2)
    expect(f.st.saved.has('5032')).toBe(true)
  })

  it('W mode: allow_collections from next lets a post in an unprotected collection through; the fresh ids go to precheck', async () => {
    let nexts = 0
    const f = ig({ saved: ['5041', '5042'], ids: { 5041: ['17890000000000002'], 5042: ['17890000000000001'] } })
    const bg = wire({ items: [{ id: 1, ref: '5041' }, { id: 2, ref: '5042' }], ig: f,
      route: (p, b) => { if (!p.endsWith('/saved/next')) return undefined; const first = ++nexts === 1; return { status: 200, data: { items: first ? [{ id: 1, ref: '5041', label: 'x' }, { id: 2, ref: '5042', label: 'y' }] : [], run_seq: b.run_seq, delay: [10, 20], stale_after_ms: 600000, allow_collections: ['17890000000000002'], reason: first ? null : 'empty' } } } })
    await startWired(bg)
    expect(appCalls(bg, /\/result$/).map(c => c.body.outcome)).toEqual(['done', 'protected'])
    expect(appCalls(bg, /\/precheck$/)[0].body.collection_ids).toEqual(['17890000000000002'])
  })

  it('429 is rate_limited, not blocked: result carries http_status 429, no pause is requested by the extension, the 2nd item is never read (AC-C46)', async () => {
    const f = ig({ saved: ['5051', '5052'] })
    f.st.unsave = () => GQL({ message: 'feedback_required' }, 429)
    const bg = wire({ items: [{ id: 1, ref: '5051' }, { id: 2, ref: '5052' }], ig: f,
      route: (p) => (/\/result$/.test(p) ? { status: 200, data: { ok: true, status: 'pending', retry: false, stopped: true } } : undefined) })
    await startWired(bg)
    expect(appCalls(bg, /\/result$/)[0].body).toMatchObject({ outcome: 'failed', note_code: 'rate_limited', http_status: 429 })
    expect(f.st.infoCount['5052']).toBeUndefined()
    expect(job(bg)).toMatchObject({ state: 'stopped', stopReason: 'rate_limited' })
    expect(stopsOf(bg)).toHaveLength(0)
  })

  it('mutation_unrecognised stops before a second write (AC-S17)', async () => {
    const f = ig({ saved: ['5061', '5062'] })
    f.st.unsave = () => GQL({ errors: [{ message: 'x' }] })
    const bg = wire({ items: [{ id: 1, ref: '5061' }, { id: 2, ref: '5062' }], ig: f,
      route: (p) => (/\/result$/.test(p) ? { status: 200, data: { ok: true, status: 'pending', retry: false, stopped: true } } : undefined) })
    await startWired(bg)
    expect(igPosts()).toHaveLength(1)
    expect(appCalls(bg, /\/result$/)[0].body).toMatchObject({ outcome: 'failed', note_code: 'mutation_unrecognised', fields: ['errors'] })
    expect(job(bg).stopReason).toBe('mutation_unrecognised')
  })

  it('no delay after a denied precheck: not_pending skips and the next read follows after the read gap only (AC-C15)', async () => {
    const f = ig({ saved: ['5071', '5072'] })
    const bg = wire({ items: [{ id: 1, ref: '5071' }, { id: 2, ref: '5072' }], ig: f,
      route: (p, b) => { if (p.endsWith('/saved/next')) return { status: 200, data: { items: [{ id: 1, ref: '5071', label: 'x' }, { id: 2, ref: '5072', label: 'y' }], run_seq: b.run_seq, delay: [60, 90], stale_after_ms: 600000, allow_collections: [], reason: null } }
        if (/\/items\/1\/precheck$/.test(p)) return { status: 200, data: { allow: false, item_id: 1, reason: 'not_pending' } } } })
    await startWired(bg)
    const t = (pk: string) => reqs.find(r => r.url.includes(`/media/${pk}/info/`))!.t
    expect(t('5072') - t('5071')).toBeGreaterThanOrEqual(3000)
    expect(t('5072') - t('5071')).toBeLessThan(10_000)
  })

  it('too_soon: the content waits retry_after, asks again, then writes; five too_soon end with stop(circuit_breaker) and zero writes (AC-C48, N-8)', async () => {
    let n = 0
    const f = ig({ saved: ['5081'] })
    const bg = wire({ items: [{ id: 1, ref: '5081' }], ig: f, route: (p) => { const m = p.match(/\/items\/(\d+)\/precheck$/); if (m && ++n <= 2) return { status: 200, data: { allow: false, item_id: 1, reason: 'too_soon', retry_after: 20 } } } })
    await startWired(bg)
    const pcs = appCalls(bg, /\/precheck$/)
    expect(pcs).toHaveLength(3)
    expect(igPosts()).toHaveLength(1)
    const f2 = ig({ saved: ['5082'] })
    const bg2 = wire({ items: [{ id: 1, ref: '5082' }], ig: f2, route: (p) => (/\/precheck$/.test(p) ? { status: 200, data: { allow: false, item_id: 1, reason: 'too_soon', retry_after: 5 } } : undefined) })
    await startWired(bg2)
    expect(igPosts()).toHaveLength(0)
    expect(stopsOf(bg2).map(s => s.body.reason)).toEqual(['circuit_breaker'])
  })

  it('user stop during the write delay: the wait is cut, stop(user_stop) is called once, the 2nd item is never read (AC-C40)', async () => {
    const f = ig({ saved: ['5091', '5092'] })
    let nexts = 0
    const bg = wire({ items: [], ig: f, route: (p, b) => (p.endsWith('/saved/next') ? { status: 200, data: { items: ++nexts === 1 ? [{ id: 1, ref: '5091', label: 'x' }, { id: 2, ref: '5092', label: 'y' }] : [], run_seq: b.run_seq, delay: [200, 300], stale_after_ms: 1_000_000, allow_collections: [], reason: nexts === 1 ? null : 'empty' } } : undefined) })
    await startUnsave(bg)
    await vi.advanceTimersByTimeAsync(40_000)                                    // 1. öğe yazıldı, 200-300 sn gecikme sürüyor
    expect(f.st.infoCount['5092']).toBeUndefined()
    await bg.ask({ type: 'ia-stop' })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(stopsOf(bg).map(s => s.body)).toEqual([{ reason: 'user_stop', run_seq: 3, viewer_id: BG_VIEWER }])
    expect(f.st.infoCount['5092']).toBeUndefined()
    expect(job(bg).state).toBe('stopped')
  })

  it('five already in a row end the job with already_streak and a stop call', async () => {
    const f = ig({ saved: [] })
    const bg = wire({ items: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, ref: String(5100 + i) })), ig: f })
    await startWired(bg)
    expect(appCalls(bg, /\/result$/)).toHaveLength(5)
    expect(stopsOf(bg).map(s => s.body.reason)).toEqual(['already_streak'])
    expect(igPosts()).toHaveLength(0)
  })
})

describe('T-10a shared fixture: allow_collections rule (AC-S21)', () => {
  const fx = JSON.parse(fixtureRaw) as { cases: Array<{ name: string; mode: string; allow: string[]; collection_ids: string[] | null; collections_unreadable: boolean; protected: boolean }> }

  it('the fixture was read from outside the frontend root (R18)', () => { expect(fx.cases.length).toBeGreaterThanOrEqual(8) })

  // Taramada (envanter): alan yoksa ya da okunamıyorsa eklenti ne gönderir
  it.each(fx.cases.map(c => [c.name, c] as const))('scan mapping for %s: unreadable -> collections_unreadable, null -> neither, array -> as is', async (_n, c) => {
    const b = bgScan()
    const ids = c.collections_unreadable ? ['abc'] : c.collection_ids === null ? undefined : c.collection_ids
    boot(b.handler, () => J({ items: [savedMedia('8801', { saved_collection_ids: ids })], more_available: false }))
    await run(RUN_SCAN)
    const out = b.pages[0].items[0]
    if (c.collections_unreadable) { expect(out.collections_unreadable).toBe(true); expect('collection_ids' in out).toBe(false) }
    else if (c.collection_ids === null) { expect('collection_ids' in out).toBe(false); expect('collections_unreadable' in out).toBe(false) }
    else expect(out.collection_ids).toEqual(c.collection_ids)
  })

  // Taze okumada: korunma = fixture; fixture'da null olan satır envanterde korunmaz, taze okumada alan yoksa korunur (AC-C52)
  it.each(fx.cases.map(c => [c.name, c] as const))('fresh read rule for %s matches the fixture (allow_collections from next)', async (_n, c) => {
    const f = ig({ saved: ['8802'] })
    const fresh = c.collections_unreadable ? ['abc'] : c.collection_ids
    f.st.info = pk => J({ items: [{ pk, has_viewer_saved: true, ...(fresh === null ? {} : { saved_collection_ids: fresh }) }] })
    const b = bgUnsave([{ id: 1, ref: '8802' }], { allow: c.allow })
    boot(b.handler, f.fetchImpl)
    await run(RUN_UNSAVE)
    const expectProtected = c.collection_ids === null && !c.collections_unreadable ? true : c.protected
    expect(b.results[0].outcome === 'protected', c.name).toBe(expectProtected)        // korunmayanda sonuç doğrulamaya bağlı (burada sahte okuma hep "kayıtlı")
    expect(b.prechecks.length).toBe(expectProtected ? 0 : 1)
    expect(writes().length).toBe(expectProtected ? 0 : 1)
  })
})

describe('T-10a regression guard (AC-C31)', () => {
  it('the four existing extension test files are listed here only to be run, never edited: this file does not import or patch them', () => {
    expect(typeof backgroundSrc).toBe('string')
    // Mevcut dosyaların değişmediği `git diff --stat` çıktısıyla gösterilir (rapor); bu test yalnız yükleme korumasını sınar.
    expect(backgroundSrc).toMatch(/typeof importScripts === 'function'\) importScripts\('cleanup-bg\.js'\)/)
    expect(backgroundSrc).toMatch(/if \(cmd && CLEANUP_KINDS\.includes\(cmd\.kind\)\) return cleanupCall\('startJob', cmd\)/)
  })

  it('the follow path still sets no deadAfterMs and keeps the 60 s default (job object shape unchanged)', () => {
    expect(backgroundSrc).toMatch(/running\.deadAfterMs \|\| API_DEAD_AFTER_MS/)
    expect(backgroundSrc).toMatch(/const API_DEAD_AFTER_MS = 60 \* 1000/)
  })
})
