import api from './client'
import { SyncResponse } from './analysis'

export interface Post {
  id: number
  shortcode: string
  media_type: string | null
  thumbnail_url: string | null
  caption: string | null
  like_count: number
  comment_count: number
  view_count: number | null
  taken_at: string | null
  last_synced_at: string | null
}

export interface PostLiker {
  id: number
  username: string
  full_name: string | null
  profile_pic_url: string | null
  is_verified: boolean
}

export interface PostComment {
  ig_user_id: number
  username: string | null
  content: string | null
  interacted_at: string | null
}

export interface PostStats {
  total_posts: number
  total_likes: number
  total_comments: number
  avg_likes: number
  avg_comments: number
  top_post_shortcode: string | null
}

const s = (id: string) => `/sessions/${id}`

export const postsApi = {
  syncPosts: (id: string) => api.post<SyncResponse>(`${s(id)}/sync/posts`).then(r => r.data),
  syncInteractions: (id: string, shortcode: string) =>
    api.post<SyncResponse>(`${s(id)}/sync/post-interactions/${shortcode}`).then(r => r.data),
  syncAllInteractions: (id: string) =>
    api.post<SyncResponse>(`${s(id)}/sync/interactions-bulk`).then(r => r.data),
  list: (id: string, page = 1, limit = 100) => api.get<Post[]>(`${s(id)}/posts?page=${page}&limit=${limit}`).then(r => r.data),
  stats: (id: string) => api.get<PostStats>(`${s(id)}/posts/stats`).then(r => r.data),
  get: (id: string, shortcode: string) => api.get<Post>(`${s(id)}/posts/${shortcode}`).then(r => r.data),
  likers: (id: string, shortcode: string) => api.get<PostLiker[]>(`${s(id)}/posts/${shortcode}/likers`).then(r => r.data),
  comments: (id: string, shortcode: string) => api.get<PostComment[]>(`${s(id)}/posts/${shortcode}/comments`).then(r => r.data),
}
