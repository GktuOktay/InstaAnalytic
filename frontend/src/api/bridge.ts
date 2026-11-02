import api from './client'

export interface BridgeStatus {
  posts: number
  likers_done: number
  comments_done: number
  likers_incomplete?: number
  likers_saved?: number
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

export interface QueuedAction { id: number; ig_user_id: number; username: string; action: 'follow' | 'unfollow' }
export interface ActionQueue {
  enabled: boolean
  blocked: 'off' | 'paused' | null
  quiet_hours: boolean
  pending_count: number
  pending: QueuedAction[]
  done_hour: number
  done_day: number
  hourly_limit: number
  daily_limit: number
  delay: [number, number]
  paused_reason: string | null
}

export const bridgeApi = {
  actions: (id: string) => api.get<ActionQueue>(`/sessions/${id}/bridge/actions`).then(r => r.data),
  enqueueActions: (id: string, action: 'follow' | 'unfollow', user_ids: number[]) =>
    api.post<{ added: number; duplicate: number; skipped: number }>(`/sessions/${id}/bridge/actions`, { action, user_ids }).then(r => r.data),
  clearActions: (id: string) => api.delete<{ removed: number }>(`/sessions/${id}/bridge/actions`).then(r => r.data),
  status: (id: string) => api.get<BridgeStatus>(`/sessions/${id}/bridge/status`).then(r => r.data),
  todo: (id: string, limit = 8, kind: 'likers' | 'comments' = 'likers') =>
    api.get<BridgeTodo[]>(`/sessions/${id}/bridge/todo`, { params: { limit, kind } }).then(r => r.data),
  stop: (id: string) => api.post(`/sessions/${id}/bridge/stop`).then(r => r.data),
  resume: (id: string) => api.post(`/sessions/${id}/bridge/resume`).then(r => r.data),
}
