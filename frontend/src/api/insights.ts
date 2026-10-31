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

export const insightsApi = {
  fans: (id: string, limit = 500) =>
    api.get<FansResponse>(`/sessions/${id}/insights/fans?limit=${limit}`).then(r => r.data),
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
