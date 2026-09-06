import api from './client'

export interface Session {
  id: string
  ig_user_id: number
  ig_username: string
  plan_b_active: boolean
  created_at: string
  last_used_at: string | null
  last_verified_at: string | null
}

export interface VerifyResult {
  valid: boolean
  ig_username: string | null
  error: string | null
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
  scanBrowser: () => api.post<Session[]>('/sessions/scan-browser').then(r => r.data),
  togglePlanB: (id: string) => api.post<Session>(`/sessions/${id}/toggle-plan-b`).then(r => r.data),
}
