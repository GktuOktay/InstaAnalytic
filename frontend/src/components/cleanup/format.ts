import type { Translations } from '../../i18n'
import { fill } from '../../lib/text'
import { cleanupError, type CleanupError } from '../../api/cleanup'

type Vars = Record<string, string | number>

/** §7.9.5: kod -> metin. Bilinmeyen kod için genel metin; ham sunucu metni hiç gösterilmez. */
export function reasonText(T: Translations, code: string | null | undefined, vars: Vars = {}): string {
  const table = T.cleanup.reason
  const t = code && Object.prototype.hasOwnProperty.call(table, code) ? table[code] : T.cleanup.reason.invalid
  return fill(t, vars)
}

/** Saat: bugünse "14:05", yarınsa "yarın 14:05", başka gün için tarih + saat. */
export function formatAt(iso: string | null | undefined, T: Translations, lang: string, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR'
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(d) - day(now)) / 86_400_000)
  if (diff === 0) return time
  if (diff === 1) return `${T.cleanup.tomorrow} ${time}`
  return `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${time}`
}

/** Hata zarfını kullanıcıya gösterilecek yerelleştirilmiş metne çevirir (girdi ya da teknik ayrıntı sızmaz). */
export function errorText(T: Translations, e: unknown, fallback: string, lang = 'tr'): { code: string | null; text: string; err: CleanupError } {
  const err = cleanupError(e)
  if (!err.code) return { code: null, text: fallback, err }
  return {
    code: err.code, err,
    text: reasonText(T, err.code, {
      next_allowed_at: formatAt(err.next_allowed_at, T, lang), retry_after: err.retry_after ?? '', until: '',
    }),
  }
}

