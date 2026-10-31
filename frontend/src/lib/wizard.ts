export type CountVerdict =
  | { kind: 'unknown' }
  | { kind: 'ok' }
  | { kind: 'missing'; n: number }
  | { kind: 'extra'; n: number }

/** Dosyadaki sayıyı kullanıcının Instagram'da gördüğü sayıyla karşılaştırır. Küçük sapmalar (silinen hesaplar vb.) normal. */
export function compareCount(inFile: number, onInstagram: number | null): CountVerdict {
  if (onInstagram === null || Number.isNaN(onInstagram) || onInstagram < 0) return { kind: 'unknown' }
  const tolerance = Math.max(3, Math.round(onInstagram * 0.03))
  const diff = onInstagram - inFile
  if (Math.abs(diff) <= tolerance) return { kind: 'ok' }
  return diff > 0 ? { kind: 'missing', n: diff } : { kind: 'extra', n: -diff }
}

export function parseCount(raw: string): number | null {
  const digits = raw.replace(/[.,\s]/g, '')          // "1.234" ve "1,234" ikisi de 1234
  return /^\d+$/.test(digits) ? Number(digits) : null
}

const KEY = 'ia:wizard'
export interface WizardState { step: number; sessionId: string | null }

export function loadWizard(): WizardState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && typeof v.step === 'number' && v.step >= 0 && v.step <= 3) return { step: v.step, sessionId: v.sessionId ?? null }
  } catch { /* depolama kapalıysa baştan başla */ }
  return { step: 0, sessionId: null }
}

export function saveWizard(s: WizardState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* sorun değil */ }
}
