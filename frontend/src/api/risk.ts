import api from './client'

export type RiskKey = 'safe' | 'balanced' | 'aggressive'

export interface RiskProfileInfo {
  key: RiskKey
  scan_pages_per_hour: number
  scan_pages_per_day: number
  scan_users_per_day: number
  scan_delay: [number, number]
  cooldown_minutes: number[]
  interactions_max_posts: number
  action_hourly: number
  action_daily: number
  action_delay: [number, number]
}

export interface RiskProfileState {
  profile: RiskKey
  profiles: RiskProfileInfo[]
}

export const riskApi = {
  get: (id: string) => api.get<RiskProfileState>(`/sessions/${id}/risk-profile`).then(r => r.data),
  set: (id: string, profile: RiskKey, acknowledge = false) =>
    api.put(`/sessions/${id}/risk-profile`, { profile, acknowledge }).then(r => r.data),
}
