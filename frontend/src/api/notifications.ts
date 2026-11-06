import api from './client'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: number
  session_id: string | null
  kind: string
  level: NotificationLevel
  params: Record<string, string | number>
  link: string | null
  created_at: string | null
  read: boolean
}

export const notificationsApi = {
  list: (limit = 20) => api.get<{ unread: number; items: AppNotification[] }>('/notifications', { params: { limit } }).then(r => r.data),
  unread: () => api.get<{ unread: number }>('/notifications/unread-count').then(r => r.data.unread),
  read: (id: number) => api.post(`/notifications/${id}/read`).then(r => r.data),
  readAll: () => api.post('/notifications/read-all').then(r => r.data),
  clear: () => api.delete('/notifications').then(r => r.data),
}
