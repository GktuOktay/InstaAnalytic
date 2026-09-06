export function proxyImg(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}
