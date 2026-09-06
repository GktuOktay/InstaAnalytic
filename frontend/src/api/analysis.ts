import api from './client'

export interface RelationshipUser {
  id: number
  username: string
  full_name: string | null
  profile_pic_url: string | null
  is_private: boolean
  is_verified: boolean
  follower_count: number | null
  following_count: number | null
  we_follow: boolean
  they_follow: boolean
  last_checked_at: string | null
}

export interface AnalysisSummary {
  total_followers: number
  total_following: number
  mutual: number
  not_following_back: number
  not_followed_back: number
}

export interface SyncResponse {
  task_id: string
  job_id: string
  status: string
}

export interface TaskProgress {
  current: number
  total: number
  step?: string   // sync tasks: 'followers' | 'following' | 'posts'
  done?: number   // bulk_unfollow
  skipped?: number
}

export interface TaskStatus {
  task_id: string
  status: string
  progress: TaskProgress | null
  result: Record<string, unknown> | null
  error: string | null
}

const s = (id: string) => `/sessions/${id}`

export const analysisApi = {
  syncFollowers: (id: string) => api.post<SyncResponse>(`${s(id)}/sync/followers`).then(r => r.data),
  syncFollowing: (id: string) => api.post<SyncResponse>(`${s(id)}/sync/following`).then(r => r.data),
  summary: (id: string) => api.get<AnalysisSummary>(`${s(id)}/analysis/summary`).then(r => r.data),
  notFollowingBack: (id: string, page = 1) => api.get<RelationshipUser[]>(`${s(id)}/analysis/not-following-back?page=${page}&limit=100`).then(r => r.data),
  notFollowedBack: (id: string, page = 1) => api.get<RelationshipUser[]>(`${s(id)}/analysis/not-followed-back?page=${page}&limit=100`).then(r => r.data),
  mutual: (id: string, page = 1) => api.get<RelationshipUser[]>(`${s(id)}/analysis/mutual?page=${page}&limit=100`).then(r => r.data),
  followers: (id: string, page = 1) => api.get<RelationshipUser[]>(`${s(id)}/analysis/followers?page=${page}&limit=100`).then(r => r.data),
  following: (id: string, page = 1) => api.get<RelationshipUser[]>(`${s(id)}/analysis/following?page=${page}&limit=100`).then(r => r.data),
  taskStatus: (taskId: string) => api.get<TaskStatus>(`/tasks/${taskId}`).then(r => r.data),
}
