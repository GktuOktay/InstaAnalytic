import axios, { AxiosError } from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Retry transient failures (network errors, 5xx) up to 2 extra times
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as typeof error.config & { _retryCount?: number }
  if (!config) return Promise.reject(error)

  const isRetryable =
    !error.response || // network error
    (error.response.status >= 500 && error.response.status !== 501)

  if (!isRetryable) return Promise.reject(error)

  config._retryCount = (config._retryCount ?? 0) + 1
  if (config._retryCount > 2) return Promise.reject(error)

  await new Promise(r => setTimeout(r, 500 * config._retryCount!))
  return api(config)
})

export default api
