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

export type ImportStage = 'reading' | 'saving' | 'done' | 'error' | string

export interface ImportJob {
  stage: ImportStage            // reading | saving[:followers|following|finalize] | done | error
  scanned: number
  total: number
  followers_found: number
  following_found: number
  bytes_total: number
  elapsed_s: number
  error: string
  result: ImportSummary | null
}

export interface DimStatus { count: number; oldest: string | null; newest: string | null; dated: number }
export interface DataStatus {
  source: 'zip' | 'browser'
  followers: DimStatus
  following: DimStatus
  last_import_at: string | null
  last_scan_at: string | null
  imports: number
  warnings: Array<'followers_range_short' | 'no_followers'>
}
export interface SnapshotRow {
  id: string; source: string; created_at: string
  followers_count: number | null; following_count: number | null
  followers_gained: string[]; followers_lost: string[]; following_gained: string[]; following_lost: string[]
}

export const importApi = {
  dataStatus: (id: string) => api.get<DataStatus>(`/sessions/${id}/data-status`).then(r => r.data),
  snapshots: (id: string, limit = 5) =>
    api.get<SnapshotRow[]>(`/sessions/${id}/import/snapshots`, { params: { limit } }).then(r => r.data),
  /** ZIP ve/veya JSON dosyalarını yükler (yükleme yüzdesi onProgress ile), arka plan iş kimliğini döner. */
  uploadFiles: (id: string, files: File[], onProgress?: (loaded: number, total: number) => void) => {
    const form = new FormData()
    files.forEach(f => form.append('files', f, f.name))
    const size = files.reduce((a, f) => a + f.size, 0)
    return api
      .post<{ job_id: string }>(`/sessions/${id}/import/zip`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0,
        onUploadProgress: e => onProgress?.(e.loaded, e.total ?? size),
      })
      .then(r => r.data.job_id)
  },
  job: (id: string, jobId: string) =>
    api.get<ImportJob>(`/sessions/${id}/import/jobs/${jobId}`).then(r => r.data),
  activeJob: (id: string) =>
    api.get<{ job_id: string | null }>(`/sessions/${id}/import/active`).then(r => r.data.job_id),
  scanStatus: (id: string) => api.get<ScanStatus>(`/sessions/${id}/scan/status`).then(r => r.data),
  resetProgress: (id: string, kind: 'followers' | 'following') =>
    api.delete(`/sessions/${id}/scan/${kind}/progress`).then(() => undefined),
}
