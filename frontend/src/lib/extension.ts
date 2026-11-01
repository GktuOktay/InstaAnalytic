import manifestSrc from '../../extension/manifest.json?raw'

/** Uygulamayla birlikte gelen (en yeni) eklenti sürümü. */
export const LATEST_EXTENSION_VERSION: string = (() => {
  try { return String(JSON.parse(manifestSrc).version || '') } catch { return '' }
})()

export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

/** Eklenti bir sürüm bildirdiyse ve uygulamadakinden eskiyse true. */
export function extensionOutdated(reported: string | null | undefined): boolean {
  return !!reported && !!LATEST_EXTENSION_VERSION && cmpVersion(reported, LATEST_EXTENSION_VERSION) < 0
}
