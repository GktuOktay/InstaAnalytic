// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.instagram.com/ali/"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import contentSrc from '../../extension/content.js?raw'

/** content.js'i sahte bir Chrome ile çalıştırır; iş sekmesi gibi davranır ve "ia-job-done" mesajını yakalar. */
async function runAction(item: { id: number; username: string; action: 'follow' | 'unfollow' }) {
  const sent: any[] = []
  const chrome = {
    runtime: {
      id: 'ext',
      onMessage: { addListener: () => {} },
      sendMessage: vi.fn(async (m: any) => {
        if (m.type === 'ia-config') return { on: true, username: 'gktuoktay', tools: {}, job: { kind: 'actions', shortcode: item.username, item } }
        sent.push(m)
        return undefined
      }),
    },
    storage: { onChanged: { addListener: () => {} } },
  }
  // eslint-disable-next-line no-new-func
  new Function('chrome', contentSrc)(chrome)
  await vi.advanceTimersByTimeAsync(90_000)
  return sent.find(m => m.type === 'ia-job-done') as { error: string | null; outcome: string | null; note: string | null } | undefined
}

/** Profil başlığı: düğme metni ve tıklanınca ne olacağı. */
function profile(buttonText: string, onClick?: (btn: HTMLElement) => void) {
  document.body.innerHTML = '<header><section><button id="main">' + buttonText + '</button><button>Message</button></section></header>'
  const btn = document.getElementById('main') as HTMLElement
  if (onClick) btn.addEventListener('click', () => onClick(btn))
  return btn
}

function confirmDialog(label: string, then: () => void) {
  const d = document.createElement('div')
  d.setAttribute('role', 'dialog')
  d.innerHTML = `<button>${label}</button><button>Cancel</button>`
  document.body.appendChild(d)
  d.querySelector('button')!.addEventListener('click', () => { d.remove(); then() })
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'title', { configurable: true, get: () => 'ali (@ali) • Instagram', set: () => {} })
  history.replaceState({}, '', '/ali/')
})
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

describe('extension: follow / unfollow by clicking like a person', () => {
  it("recognises Instagram's real button, whose text carries the icon's accessible name", async () => {
    // Gerçek profil sayfasında düğme metni: "Takiptesin" + "Aşağı Ok Simgesi"; menüde doğrudan "Takibi Bırak" düğmesi var
    document.body.innerHTML = '<header><section><button id="main"><div>Takiptesin</div><svg aria-label="x"><title>Aşağı Ok Simgesi</title></svg></button><button>Mesaj Gönder</button></section></header>'
    const btn = document.getElementById('main') as HTMLElement
    btn.addEventListener('click', () => {
      const d = document.createElement('div')
      d.setAttribute('role', 'dialog')
      d.innerHTML = '<button>Kapat</button><button>Yakın arkadaşlar listesine ekleYakın arkadaş</button><button>Sessize AlSağ ok</button><button id="u">Takibi Bırak</button>'
      document.body.appendChild(d)
      d.querySelector('#u')!.addEventListener('click', () => { d.remove(); btn.innerHTML = '<div>Takip Et</div>' })
    })
    expect((await runAction({ id: 1, username: 'ali', action: 'unfollow' }))?.outcome).toBe('done')
  })

  it('also when the icon name is plain text next to the label (English: "Following" + "Down chevron icon")', async () => {
    profile('FollowingDown chevron icon', btn => confirmDialog('Unfollow', () => { btn.textContent = 'Follow' }))
    expect((await runAction({ id: 1, username: 'ali', action: 'unfollow' }))?.outcome).toBe('done')
  })

  it('a private account that asks for a second confirmation is still unfollowed', async () => {
    profile('Following', btn => confirmDialog('Unfollow', () => confirmDialog('Unfollow', () => { btn.textContent = 'Follow' })))
    expect((await runAction({ id: 1, username: 'ali', action: 'unfollow' }))?.outcome).toBe('done')
  })

  it('when no known button is found it says which buttons it saw (no silent failure)', async () => {
    document.body.innerHTML = '<header><button>Seçenekler</button><button>Mesaj Gönder</button></header>'
    const r = await runAction({ id: 1, username: 'ali', action: 'unfollow' })
    expect(r?.outcome).toBe('failed')
    expect(r?.note).toContain('Seçenekler | Mesaj Gönder')
  })

  it('unfollow: clicks "Following", confirms "Unfollow", verifies the button became "Follow"', async () => {
    profile('Following', btn => confirmDialog('Unfollow', () => { btn.textContent = 'Follow' }))
    const r = await runAction({ id: 1, username: 'ali', action: 'unfollow' })
    expect(r).toMatchObject({ outcome: 'done', error: null })
  })

  it('works with the Turkish interface too', async () => {
    profile('Takip Ediliyor', btn => confirmDialog('Takibi Bırak', () => { btn.textContent = 'Takip Et' }))
    expect((await runAction({ id: 1, username: 'ali', action: 'unfollow' }))?.outcome).toBe('done')
  })

  it('unfollow of someone you do not follow anymore clicks nothing and reports "already"', async () => {
    const click = vi.fn()
    profile('Follow', click)
    const r = await runAction({ id: 1, username: 'ali', action: 'unfollow' })
    expect(r?.outcome).toBe('already')
    expect(click).not.toHaveBeenCalled()
  })

  it('follow: clicks "Follow" and sees "Following"', async () => {
    profile('Follow', btn => { btn.textContent = 'Following' })
    expect((await runAction({ id: 1, username: 'ali', action: 'follow' }))?.outcome).toBe('done')
  })

  it('follow of a private account: the request is sent ("Requested") and counts as done', async () => {
    profile('Follow', btn => { btn.textContent = 'Requested' })
    const r = await runAction({ id: 1, username: 'ali', action: 'follow' })
    expect(r?.outcome).toBe('done')
    expect(r?.note).toContain('isteği')
  })

  it('follow when already following: nothing is clicked', async () => {
    const click = vi.fn()
    profile('Following', click)
    expect((await runAction({ id: 1, username: 'ali', action: 'follow' }))?.outcome).toBe('already')
    expect(click).not.toHaveBeenCalled()
  })

  it('reports "blocked" and does not continue when Instagram shows an Action Blocked notice', async () => {
    profile('Following', btn => {
      const d = document.createElement('div')
      d.setAttribute('role', 'dialog')
      d.textContent = 'Action Blocked. We restrict certain activity to protect our community. Try again later.'
      document.body.appendChild(d)
    })
    expect((await runAction({ id: 1, username: 'ali', action: 'unfollow' }))?.outcome).toBe('blocked')
  })

  it('a missing account is reported as not found, nothing is clicked', async () => {
    document.body.innerHTML = '<div>Sorry, this page isn\'t available.</div>'
    expect((await runAction({ id: 1, username: 'ali', action: 'unfollow' }))?.outcome).toBe('not_found')
  })

  it('does not claim success when the click changed nothing', async () => {
    profile('Following', () => { /* Instagram hiçbir şey yapmadı */ })
    expect((await runAction({ id: 1, username: 'ali', action: 'unfollow' }))?.outcome).toBe('failed')
  })

  it('never acts on your own account or on an invalid username', async () => {
    profile('Following')
    expect((await runAction({ id: 1, username: 'gktuoktay', action: 'unfollow' }))?.error).toContain('Kendi hesabınız')
    expect((await runAction({ id: 1, username: '../x', action: 'unfollow' }))?.error).toContain('Geçersiz')
  })
})
