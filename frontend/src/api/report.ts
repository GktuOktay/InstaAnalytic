import api from './client'

export interface KpiStats {
  total_posts: number
  total_likes: number
  total_comments: number
  avg_likes: number
  avg_comments: number
  max_likes: number
  unique_interactors: number
  synced_interactions: number
}

export interface MonthlyPoint {
  month: string
  total_likes: number
  avg_likes: number
  post_count: number
}

export interface FollowerBreakdown {
  follower_likes: number
  outsider_likes: number
  follower_users: number
  outsider_users: number
}

export interface TopFan {
  username: string
  full_name: string | null
  like_count: number
  comment_count: number
  total: number
}

export interface TopPost {
  shortcode: string
  taken_at: string | null
  like_count: number
  comment_count: number
  synced_likes: number
  synced_comments: number
}

export interface TopCommenter {
  username: string
  full_name: string | null
  comment_count: number
  sample_comments: string[]
}

export interface InteractionReport {
  kpi: KpiStats
  monthly: MonthlyPoint[]
  follower_breakdown: FollowerBreakdown
  top_fans: TopFan[]
  top_posts: TopPost[]
  top_commenters: TopCommenter[]
}

export const reportApi = {
  interactions: (sessionId: string) =>
    api.get<InteractionReport>(`/sessions/${sessionId}/report`).then(r => r.data),
}
