import { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../contexts/LangContext'
import { SessionProvider } from '../contexts/SessionContext'

export function renderApp(ui: ReactElement, { route = '/', lang = 'tr' } = {}) {
  localStorage.setItem('lang', lang)
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={[route]}>
        <SessionProvider>{ui}</SessionProvider>
      </MemoryRouter>
    </LangProvider>,
  )
}

export const makeSession = (over: Record<string, unknown> = {}) => ({
  id: 's1', ig_user_id: 1, ig_username: 'me', plan_b_active: false, allow_actions: false, source: 'zip' as const,
  paused_until: null, paused_reason: null, created_at: '2026-10-01T00:00:00Z', last_used_at: null, last_verified_at: null, ...over,
})
