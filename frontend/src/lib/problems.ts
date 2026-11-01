import type { Translations } from '../i18n/tr'

/**
 * Teknik hata ve uyarı metinlerini (Instagram yanıtları, HTTP kodları, sunucu mesajları) türlerine ayırır.
 * Arayüz türün sade açıklamasını gösterir; asıl metin "Teknik ayrıntı" olarak saklı kalır.
 */
export type ProblemKind =
  | 'rate_limit' | 'action_blocked' | 'verify' | 'logged_out' | 'not_found' | 'repeated_failures'
  | 'budget' | 'app_down' | 'app_error' | 'timeout' | 'too_large' | 'bad_input' | 'unknown'

const RULES: [ProblemKind, RegExp][] = [
  ['verify',            /challenge|checkpoint|doğrula|verify/i],
  ['action_blocked',    /feedback_required|action_blocked|spam|kısıtla/i],
  ['logged_out',        /login_required|require_login|oturum (kapan|süresi)|giriş yap|logged.?out|\b401\b/i],
  ['rate_limit',        /\b429\b|too many|rate.?limit|wait a few minutes|çok fazla istek|yavaşlat|risk sinyali|cooldown/i],
  ['budget',            /bütçe(si)? doldu|budget/i],
  ['repeated_failures', /üst üste|consecutive/i],
  ['not_found',         /\b404\b|bulunamad|not found/i],
  ['timeout',           /timeout|zaman aşım|timed out/i],
  ['too_large',         /\b413\b|çok büyük|too large/i],
  ['app_down',          /network error|failed to fetch|ulaşılamad|ECONNREFUSED/i],
  ['app_error',         /\b50[0-9]\b|internal server error/i],
]

export function classifyProblem(raw: string | null | undefined): ProblemKind {
  const text = String(raw ?? '')
  for (const [kind, re] of RULES) if (re.test(text)) return kind
  return 'unknown'
}

export interface Problem {
  kind: ProblemKind
  title: string
  body: string
  todo: string[]
  detail: string
}

export function explainProblem(raw: string | null | undefined, T: Translations): Problem {
  const kind = classifyProblem(raw)
  const p = T.problems[kind]
  return { kind, title: p.title, body: p.body, todo: [...p.todo], detail: String(raw ?? '') }
}

/** Sunucunun "detail" alanı dizi/nesne olabilir (doğrulama hataları); okunur metne çevir. */
function detailText(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(d => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : String(d))).join('; ')
  return null
}

// Sunucunun kendi Türkçe açıklamaları zaten son kullanıcı dilinde; ham teknik metinler değil
const TECHNICAL = /HTTP \d{3}|Traceback|Exception|Error:|status code|\bnull\b|undefined|\[object/i

/** Toast'lar için: axios hatasını tek cümlelik, son kullanıcı diline çevir. */
export function apiErrorMessage(e: any, T: Translations, fallback: string): string {
  const status: number | undefined = e?.response?.status
  const detail = detailText(e?.response?.data?.detail)
  if (status === 422) return T.problems.bad_input.title
  if (detail && (!status || status < 500) && !TECHNICAL.test(detail)) return detail
  if (!e?.response) {
    return e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '') ? T.problems.timeout.title : T.problems.app_down.title
  }
  if (status === 413) return T.problems.too_large.title
  if (status === 404) return T.problems.not_found.title
  if (status === 429) return T.problems.rate_limit.title
  if (status && status >= 500) return T.problems.app_error.title
  const kind = classifyProblem(detail ?? e?.message)
  return kind === 'unknown' ? fallback : T.problems[kind].title
}
