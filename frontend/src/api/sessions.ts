import api from './client'

export interface Session {
  id: string
  ig_user_id: number
  ig_username: string
  plan_b_active: boolean
  allow_actions: boolean
  source: 'browser' | 'zip'
  paused_until: string | null
  paused_reason: string | null
  created_at: string
  last_used_at: string | null
  last_verified_at: string | null
}

export interface VerifyResult {
  valid: boolean
  ig_username: string | null
  error: string | null
}

export interface BrowserCandidate {
  candidate_id: string
  browser: string
  ig_username: string
  full_name: string | null
  already_saved: boolean
}

export const sessionsApi = {
  list: () => api.get<Session[]>('/sessions').then(r => r.data),
  create: (ig_username: string, session_id_cookie: string, extra_cookies?: Record<string, string>) =>
    api.post<Session>('/sessions', { ig_username, session_id_cookie, extra_cookies }).then(r => r.data),
  delete: (id: string) => api.delete(`/sessions/${id}`),
  verify: (id: string) => api.post<VerifyResult>(`/sessions/${id}/verify`).then(r => r.data),
  updateUsername: (id: string, ig_username: string) =>
    api.patch<Session>(`/sessions/${id}/username`, { ig_username }).then(r => r.data),
  hostAgentStatus: () => api.get<{ connected: boolean }>('/sessions/host-agent-status').then(r => r.data),
  browsers: () => api.get<{ browsers: string[] }>('/sessions/browsers').then(r => r.data.browsers),
  scanBrowsers: (browsers: string[]) =>
    api.post<{ candidates: BrowserCandidate[]; errors: string[] }>('/sessions/scan-browser', { browsers }, { timeout: 45000 }).then(r => r.data),
  confirmBrowser: (candidate_ids: string[]) =>
    api.post<Session[]>('/sessions/scan-browser/confirm', { candidate_ids }).then(r => r.data),
  createZipOnly: (ig_username: string) => api.post<Session>('/sessions/zip-only', { ig_username }).then(r => r.data),
  setAllowActions: (id: string, allow_actions: boolean) =>
    api.post<Session>(`/sessions/${id}/allow-actions`, { allow_actions }).then(r => r.data),
  purge: (id: string) => api.delete(`/sessions/${id}/purge`).then(r => r.data),
  togglePlanB: (id: string) => api.post<Session>(`/sessions/${id}/toggle-plan-b`).then(r => r.data),
}
