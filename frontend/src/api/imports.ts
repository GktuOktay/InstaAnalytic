import api from './client'

export interface ImportSummary {
  snapshot_id: string
  followers: { count: number; gained: number; lost: number } | null
  following: { count: number; gained: number; lost: number } | null
  followers_lost: string[]
  followers_gained: string[]
  following_lost: string[]
  following_gained: string[]
}

export interface ScanStatus {
  used_hour: number
  limit_hour: number
  used_day: number
  limit_day: number
  cooldown_until: number | null
  strikes: number
  can_scan: boolean
  next_available_at: number | null
  running: boolean
  paused: { followers: boolean; following: boolean }
}

export const importApi = {
  uploadZip: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<ImportSummary>(`/sessions/${id}/import/zip`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      })
      .then(r => r.data)
  },
  scanStatus: (id: string) => api.get<ScanStatus>(`/sessions/${id}/scan/status`).then(r => r.data),
  resetProgress: (id: string, kind: 'followers' | 'following') =>
    api.delete(`/sessions/${id}/scan/${kind}/progress`).then(() => undefined),
}
