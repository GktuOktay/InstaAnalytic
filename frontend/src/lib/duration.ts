/** Dakikayı "2 sa 10 dk" gibi okunur hâle getirir. */
export function formatMinutes(min: number, lang: 'tr' | 'en' = 'tr'): string {
  const h = Math.floor(min / 60)
  const m = Math.max(1, Math.round(min % 60))
  const hh = lang === 'en' ? 'h' : 'sa'
  const mm = lang === 'en' ? 'min' : 'dk'
  if (min < 1) return `1 ${mm}`
  return h > 0 ? `${h} ${hh}${m ? ` ${m} ${mm}` : ''}` : `${m} ${mm}`
}
