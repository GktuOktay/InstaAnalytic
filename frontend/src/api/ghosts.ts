import api from './client'
import type { RelationshipUser } from './analysis'

export type GhostState = 'idle' | 'running' | 'cooldown' | 'done' | 'stopped' | 'blocked' | 'failed'

export interface GhostStatus {
  job: {
    state: GhostState
    total: number; done: number; ok: number; unreachable: number; unknown: number
    message: string
    resume_at: number | null
    started_at: number | null
    updated_at: number | null
  }
  pace: { interval_s: number; per_hour: number; strikes: number; cooldown_until: number | null; day_count: number; day_cap: number }
  counts: { candidates: number; unchecked: number; ok: number; unreachable: number; unknown: number }
}

export const ghostsApi = {
  status: (id: string) => api.get<GhostStatus>(`/sessions/${id}/ghosts/status`).then(r => r.data),
  start: (id: string, recheck = false) =>
    api.post<{ status: string; total: number }>(`/sessions/${id}/ghosts/check`, { acknowledge: true, recheck }).then(r => r.data),
  stop: (id: string) => api.post(`/sessions/${id}/ghosts/stop`).then(r => r.data),
  list: (id: string, page = 1, limit = 100) =>
    api.get<RelationshipUser[]>(`/sessions/${id}/ghosts`, { params: { page, limit } }).then(r => r.data),
  mark: (id: string, userId: number, ghost: boolean | null) =>
    api.put(`/sessions/${id}/ghosts/${userId}`, { ghost }).then(r => r.data),
}
