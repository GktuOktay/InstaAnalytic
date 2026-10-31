import api from './client'

export interface BridgeStatus {
  posts: number
  likers_done: number
  comments_done: number
  waiting_young: number
  today: number
  daily_cap: number
  last_seen: string | null
  connected: boolean
  stopped: boolean
  wrong_account: string | null
  paused_until: string | null
  paused_reason: string | null
  next_at: string | null
}

export const bridgeApi = {
  status: (id: string) => api.get<BridgeStatus>(`/sessions/${id}/bridge/status`).then(r => r.data),
  stop: (id: string) => api.post(`/sessions/${id}/bridge/stop`).then(r => r.data),
  resume: (id: string) => api.post(`/sessions/${id}/bridge/resume`).then(r => r.data),
}
