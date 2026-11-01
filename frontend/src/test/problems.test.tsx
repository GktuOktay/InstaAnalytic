import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { classifyProblem, apiErrorMessage, explainProblem } from '../lib/problems'
import ProblemNote from '../components/ProblemNote'
import tr from '../i18n/tr'
import en from '../i18n/en'
import { renderApp } from './utils'

describe('classifyProblem', () => {
  it.each([
    ['Köprü: Instagram uyarı verdi (HTTP 429, profil bilgisi isteği)', 'rate_limit'],
    ['Instagram uyarısı: feedback_required', 'action_blocked'],
    ['challenge_required', 'verify'],
    ['login_required', 'logged_out'],
    ['Üst üste 3 işlem başarısız oldu', 'repeated_failures'],
    ['Köprü: Instagram üst üste yanıt vermedi (HTTP 404)', 'repeated_failures'],
    ['Günlük tarama bütçesi doldu. (devam: 2026-11-02)', 'budget'],
    ['HTTP 429  — 60 dk cooldown', 'rate_limit'],
    ['Network Error', 'app_down'],
    ['Request failed with status code 500', 'app_error'],
    ['bambaşka bir şey', 'unknown'],
  ])('%s → %s', (raw, kind) => {
    expect(classifyProblem(raw)).toBe(kind)
  })

  it('every kind has a title, body and steps in both languages', () => {
    for (const T of [tr, en]) {
      for (const k of Object.keys(tr.problems).filter(k => typeof (tr.problems as any)[k] === 'object')) {
        const p = (T.problems as any)[k]
        expect(p.title.length).toBeGreaterThan(5)
        expect(p.body.length).toBeGreaterThan(5)
        expect(p.todo.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('apiErrorMessage', () => {
  const T = tr
  it('keeps the server\'s own Turkish explanation', () => {
    expect(apiErrorMessage({ response: { status: 409, data: { detail: 'Bu profil zaten var' } } }, T, 'x')).toBe('Bu profil zaten var')
  })
  it('never shows raw technical text', () => {
    expect(apiErrorMessage({ message: 'Network Error' }, T, 'x')).toBe(tr.problems.app_down.title)
    expect(apiErrorMessage({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' }, T, 'x')).toBe(tr.problems.timeout.title)
    expect(apiErrorMessage({ response: { status: 500, data: { detail: 'Traceback ...' } } }, T, 'x')).toBe(tr.problems.app_error.title)
    expect(apiErrorMessage({ response: { status: 422, data: { detail: [{ msg: 'field required' }] } } }, T, 'x')).toBe(tr.problems.bad_input.title)
    expect(apiErrorMessage({ response: { status: 400, data: { detail: 'HTTP 404 from upstream' } } }, T, 'yedek')).toBe(tr.problems.not_found.title)
  })
})

describe('ProblemNote', () => {
  it('shows plain words first and hides the technical text under a toggle', async () => {
    renderApp(<ProblemNote raw="Köprü: Instagram uyarı verdi (HTTP 429, profil bilgisi isteği)" extra="2.11.2026 01:59'a kadar" />)
    const box = screen.getByRole('alert')
    expect(box).toHaveTextContent(tr.problems.rate_limit.title)
    expect(box).toHaveTextContent('Ne yapmalısın?')
    const detail = screen.getByText(/HTTP 429/)
    expect(detail).not.toBeVisible()
    await userEvent.click(screen.getByText('Teknik ayrıntı'))
    expect(detail).toBeVisible()
  })

  it('budget is informational, not an alarm', () => {
    renderApp(<ProblemNote raw="Günlük tarama bütçesi doldu." />)
    expect(screen.getByRole('status')).toHaveTextContent(explainProblem('bütçe doldu', tr).title)
  })
})
