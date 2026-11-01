import api from './client'

export interface BridgeStatus {
  posts: number
  likers_done: number
  comments_done: number
  today_posts: number
  today_people: number
  last_seen: string | null
  last_saved: string | null
  connected: boolean
  stopped: boolean
  // Instagram uyarısı: hiçbir şeyi durdurmaz, yalnızca gösterilir
  warning_until: string | null
  warning_reason: string | null
  warning_message?: string | null
  extension_version?: string | null
}

export interface BridgeTodo {
  id: string
  shortcode: string
  thumbnail_url: string | null
  like_count: number
  comment_count: number
  taken_at: string | null
}

export const bridgeApi = {
  status: (id: string) => api.get<BridgeStatus>(`/sessions/${id}/bridge/status`).then(r => r.data),
  todo: (id: string, limit = 8, kind: 'likers' | 'comments' = 'likers') =>
    api.get<BridgeTodo[]>(`/sessions/${id}/bridge/todo`, { params: { limit, kind } }).then(r => r.data),
  stop: (id: string) => api.post(`/sessions/${id}/bridge/stop`).then(r => r.data),
  resume: (id: string) => api.post(`/sessions/${id}/bridge/resume`).then(r => r.data),
}
