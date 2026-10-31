import { z } from 'zod'
import type { Lang } from '../i18n'

const MSG = {
  tr: {
    required: 'Kullanıcı adını yaz.',
    tooLong: 'Instagram kullanıcı adları en fazla 30 karakterdir.',
    chars: 'Kullanıcı adı yalnızca harf, rakam, nokta ve alt çizgi içerebilir.',
  },
  en: {
    required: 'Enter your username.',
    tooLong: 'Instagram usernames are at most 30 characters.',
    chars: 'Usernames use letters, numbers, dots and underscores only.',
  },
}

/** Kullanıcıya ham teknik mesaj göstermemek için mesajlar dile göre burada tanımlı. */
export function usernameSchema(lang: Lang) {
  const m = MSG[lang]
  return z
    .string()
    .trim()
    .transform(v => v.replace(/^@/, ''))
    .pipe(
      z.string()
        .min(1, m.required)
        .max(30, m.tooLong)
        .regex(/^[A-Za-z0-9._]+$/, m.chars),
    )
}

export function validateUsername(raw: string, lang: Lang): { ok: true; value: string } | { ok: false; message: string } {
  const r = usernameSchema(lang).safeParse(raw)
  return r.success ? { ok: true, value: r.data } : { ok: false, message: r.error.issues[0].message }
}
