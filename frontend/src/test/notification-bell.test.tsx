import { describe as suite, expect, it } from 'vitest'
import { describe } from '../components/NotificationBell'
import tr from '../i18n/tr'
import en from '../i18n/en'
import type { AppNotification } from '../api/notifications'

const note = (kind: string, params: AppNotification['params']): AppNotification => ({
  id: 1, session_id: 's1', kind, level: 'success', params, link: '/monitor', created_at: null, read: false,
})

suite('NotificationBell describe(): saved-cleanup notifications carry no params.job (AC-C29)', () => {
  it('uses the saved_scan / saved_unsave fallback titles instead of an empty title (TR)', () => {
    const d = describe(tr, note('job_ok', { done: 4, total: 4, ok: 4, saved: 0 }))
    expect(d.title).toBe('Kaydedilenleri tarama / Kaydedilen temizleme bitti')
    expect(d.title.trim()).not.toBe('bitti')
  })

  it('same in English', () => {
    const d = describe(en, note('job_failed', { done: 0, total: 0, ok: 0, saved: 0 }))
    expect(d.title).toContain(en.notifications.jobs.saved_scan)
    expect(d.title).toContain(en.notifications.jobs.saved_unsave)
  })

  it('a known params.job still wins over the fallback', () => {
    expect(describe(tr, note('job_ok', { job: 'posts', done: 1, total: 1, ok: 1, saved: 0 })).title).toBe('Gönderi listesi bitti')
  })
})
