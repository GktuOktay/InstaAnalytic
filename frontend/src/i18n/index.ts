import tr from './tr'
import en from './en'

export type Lang = 'tr' | 'en'
export type { Translations } from './tr'

export const translations = { tr, en }

export function t(lang: Lang) {
  return translations[lang]
}
