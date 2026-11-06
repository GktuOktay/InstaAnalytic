import type { Translations } from '../i18n/tr'
import { explainProblem } from './problems'

/**
 * Eklentinin takip / takipten çıkma sonucuna yazdığı notlar (sunucu bunları Türkçe saklar).
 * Genel hata sınıflandırıcıdan geçirmek yanlış etiket verir ("Profil düğmeleri bulunamadı" → "404 bulunamadı"),
 * bu yüzden bilinen notlar kendi anlamlarıyla, seçili dilde gösterilir.
 */
export type ActionNoteKey =
  | 'done' | 'alreadyNot' | 'alreadyFollowing' | 'alreadyRequested' | 'requestSent'
  | 'noButton' | 'buttonGone' | 'accountGone' | 'unverified' | 'blocked' | 'loggedOut' | 'ownAccount' | 'invalid'

const RULES: [ActionNoteKey, RegExp][] = [
  ['done',             /^Yapıldı\.?$/i],
  ['alreadyNot',       /Zaten takip etmiyorsunuz/i],
  ['alreadyFollowing', /Zaten takip ediyorsunuz/i],
  ['alreadyRequested', /Takip isteği zaten gönderilmiş/i],
  ['requestSent',      /Gizli hesap: takip isteği gönderildi/i],
  ['accountGone',      /Hesap bulunamadı/i],
  ['buttonGone',       /Takip düğmesi kayboldu/i],
  ['noButton',         /Profil düğmeleri bulunamadı|Takip düğmesi tanınmadı|Takip düğmesi bulunamadı/i],
  ['unverified',       /sonuç doğrulanamadı/i],
  ['blocked',          /kısıtlama uyarısı|işlemi engelledi/i],
  ['loggedOut',        /Instagram giriş sayfası/i],
  ['ownAccount',       /Kendi hesabınız için işlem yapılmaz/i],
  ['invalid',          /Geçersiz işlem/i],
]

export function actionNoteKey(raw: string | null | undefined): ActionNoteKey | null {
  const text = String(raw ?? '')
  for (const [k, re] of RULES) if (re.test(text)) return k
  return null
}

/** { title: seçili dilde kısa açıklama, detail: ham not (teknik ayrıntı) } */
export function describeActionNote(raw: string | null | undefined, T: Translations): { title: string; detail: string } {
  const key = actionNoteKey(raw)
  const detail = String(raw ?? '')
  if (key) return { title: T.actionLog.notes[key], detail }
  return { title: explainProblem(raw, T).title, detail }     // eklenti dışı kaynaklar (sunucu kuyruğu): eski davranış
}
