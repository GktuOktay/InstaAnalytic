import api from './client'

export interface ActionResponse {
  success: boolean
  action_type: string
  ig_user_id: number
  error: string | null
  queued: boolean
  queue_position: number | null
}

export interface QueueStatus {
  queue_length: number
  processing: boolean
  hour_count: number
  day_count: number
  hourly_limit: number
  daily_limit: number
  items: Array<{ action: string; ig_user_id: number; queued_at: number }>
}

export interface BulkUnfollowResponse {
  task_id: string
  queued_count: number
  estimated_duration_minutes: number
}

export interface ActionLogEntry {
  id: number
  ig_user_id: number
  ig_username: string | null
  action_type: string
  status: string
  error_msg: string | null
  created_at: string
  executed_at: string | null
}

const s = (id: string) => `/sessions/${id}/actions`

export const actionsApi = {
  follow: (sessionId: string, userId: number) =>
    api.post<ActionResponse>(`${s(sessionId)}/follow/${userId}`).then(r => r.data),
  unfollow: (sessionId: string, userId: number) =>
    api.post<ActionResponse>(`${s(sessionId)}/unfollow/${userId}`).then(r => r.data),
  removeFollower: (sessionId: string, userId: number) =>
    api.post<ActionResponse>(`${s(sessionId)}/remove-follower/${userId}`).then(r => r.data),
  queueStatus: (sessionId: string) =>
    api.get<QueueStatus>(`${s(sessionId)}/queue`).then(r => r.data),
  clearQueue: (sessionId: string) =>
    api.delete(`${s(sessionId)}/queue`).then(r => r.data),
  bulkUnfollow: (sessionId: string, userIds: number[], delayMin = 45, delayMax = 90, hourlyLimit = 50) =>
    api.post<BulkUnfollowResponse>(`${s(sessionId)}/bulk-unfollow`, {
      user_ids: userIds,
      delay_min_seconds: delayMin,
      delay_max_seconds: delayMax,
      hourly_limit: hourlyLimit,
    }).then(r => r.data),
  log: (sessionId: string, page = 1) =>
    api.get<ActionLogEntry[]>(`${s(sessionId)}/log?page=${page}&limit=100`).then(r => r.data),
}
