import api from './client'

export interface FanRow {
  ig_user_id: number
  username: string
  full_name: string | null
  follows_me: boolean
  likes: number
  comments: number
  posts_engaged: number
  engagement_rate: number
  score: number
  tier: 'super' | 'active' | 'occasional' | 'silent'
  trend: 'warming' | 'cooling' | 'steady' | 'new'
}

export interface FansResponse {
  total_posts: number
  scanned_posts: number
  enough_data: boolean
  fans: FanRow[]
}

export type CleanupGroup =
  'ghost' | 'one_way_silent' | 'mutual_silent' | 'silent_follower' | 'one_way_engaged' | 'occasional' | 'loyal'

export interface CleanupRow {
  ig_user_id: number
  username: string
  full_name: string | null
  i_follow: boolean
  follows_me: boolean
  likes: number
  comments: number
  posts_engaged: number
  engagement_rate: number
  last_engaged_at: string | null
  group: CleanupGroup
}

export interface CleanupResponse {
  total_posts: number
  scanned_posts: number
  min_posts: number
  enough_data: boolean
  followers_known: number
  following_known: number
  counts: Record<CleanupGroup, number>
  total_rows: number
  rows: CleanupRow[]
}

export const insightsApi = {
  fans: (id: string, limit = 500) =>
    api.get<FansResponse>(`/sessions/${id}/insights/fans?limit=${limit}`).then(r => r.data),
  cleanup: (id: string, p: { group?: CleanupGroup; q?: string; page?: number; limit?: number }) =>
    api.get<CleanupResponse>(`/sessions/${id}/insights/cleanup`, { params: p }).then(r => r.data),
}

// CSV'ler tarayıcıdan doğrudan indirildiği için token'lı axios ile çekip blob olarak kaydediyoruz
export async function downloadCsv(path: string, filename: string) {
  const res = await api.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
