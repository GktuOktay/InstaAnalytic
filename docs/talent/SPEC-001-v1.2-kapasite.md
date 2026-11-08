Capacity report: SPEC-001 v1.2 (Faz 0 + Faz 1) yeniden kontrol | Date: 2026-11-08 | Data: n=0 scorecard (docs/scorecards/ yok; "insufficient data (n=0)")

Not: Öneri belgesidir. Birim, rol, araç, playbook eklemez/değiştirmez; spec'e dokunulmadı. Karar CEO'nundur. Önceki görüş: docs/talent/SPEC-001-kapasite-gorusu.md.

## Kapasite görüşü

**FITS, koşullu: tavan 22 g olursa.** 21 g tavanda tahmin (21,2 g) tavanın %101'idir, yani aşım; bu durum "tavan aşımı CEO'ya gider" kuralını tetikler ve spec bunu zaten CK-14 ile yapmıştır. 22 g'de pay 0,8 g (%3,8). Sayısal "iyimser/şişirilmiş" testi (1,5x / 3x gerçekleşen) uygulanamaz: scorecard yok, "insufficient data (n=0)". Karar yapısal gözleme dayanır, trend değildir.

## Satır toplamı doğrulaması

Kaynak: spec §12.1, §12.2, §12.3 satırları; hesap bana aittir.

| Kalem | Spec yazıyor | Benim hesabım | Sonuç |
|---|---|---|---|
| Faz 0 yapım: T-pre 1 + T-ADR 0,25 + T-0s 0,25 + T-0a 0,5 | 2,0 | 2,0 | Tutuyor |
| Faz 1 yapım (18 satır: T-1 0,75, T-2b 0,75, T-2 0,5, T-4a 0,75, T-4b 1,25, T-4c 1, T-5 1, T-6 1,25, T-7a 0,25, T-7b 0,25, T-8a 0,75, T-9 1, T-10a 0,75, T-11a 1,25, T-11b 1,25, T-12a 1, T-13a 0,5, T-13b 0,5) | 14,75 | 14,75 | Tutuyor |
| Teslim zinciri | 1,5 | (girdi, doğrulanamaz) | Satır tahmini yok, tek kalem |
| Düzeltme payı %20 x 14,75 | 2,95 | 2,95 | Tutuyor |
| Faz 1 toplam: 14,75 + 1,5 + 2,95 | 19,2 | 19,2 | Tutuyor |
| Genel: 2,0 + 19,2 (yapım 16,75 + 1,5 + 2,95) | 21,2 | 21,2 | Tutuyor |
| v1.1'den fark: -1,0 (4 x 0,25) + 2,75 (0,75+0,25+0,25+0,5+0,25+0,25+0,25+0,25) | +1,75; 13,0 -> 14,75 | +1,75 | Tutuyor |
| Yük: polyglot 7,5 (T-1,2b,2,4a,4b,4c,5,6,7a); react 6,25 (T-7b,8a,9,10a,11a,11b,12a); tech-comms + qa 1 | aynı | aynı | Tutuyor (T-0a 0,5 ve T-pre 1 devops/CEO tarafında ayrı) |
| Kritik yol 9,75 (T-pre 1, T-0a 0,5, T-1 0,75, T-2 0,5, T-4a 0,75, T-4b 1,25, T-4c 1, T-5 1, T-8a 0,75, T-9 1, T-10a 0,75, T-13b 0,5) | 9,75 | 9,75 | Tutuyor |

Aritmetik hatası yok. v1.0 görüşündeki "satır toplamı başlıkla uyuşmuyor" bulgusu giderilmiş.

Yapısal gözlemler (hata değil):
- Düzeltme payı yalnız Faz 1 yapımına uygulanmış; Faz 0 (2,0 g) payı yok. Faz 0'da en belirsiz kalem T-pre (yeni ortam işi, Node/pytest/Docker profili) ve CEO'nun yürüttüğü T-0a var. Faz 0'a %20 uygulanırsa +0,4 g (benim hesabım); 22 g tavan bunu karşılar (21,2 + 0,4 = 21,6).
- Teslim zinciri 1,5 g tek kalem; dört birim (qa, appsec durak B, internal-auditor, quality-office) için kırılım yok. Doğrulanamaz: "insufficient data".
- %20 pay bir varsayımdır (spec de "scorecard yok n=0" diyor). Kanıt yok.

## Önceki 5 önerinin durumu

| # | Önceki öneri | Durum | Kanıt |
|---|---|---|---|
| 1 | Tahmin/tavanı hizala; teslim zinciri ve düzeltme payı ayrı satır | **Karşılandı** | §12.3 tablosu: yapım, teslim zinciri 1,5, pay 2,95 ayrı; toplamlar tutuyor |
| 2 | DM-özgü backend T-0 sonrasına; §6.5 ile §12 çelişkisini gider | **Karşılandı** | DM, Ek A'ya (kapsam dışı) taşındı; T-1 bağımlılığı "T-pre, T-0a, T-ADR"; §6.5 "Spike'tan önce Faz 1 kodu yazılmaz"; no-go kuralı var |
| 3 | Test ortamı görevi (Node, pytest, zaman aşımı), sahibi devops-sre | **Karşılandı** | T-pre, 1 g, devops-sre, Node 22 LTS sabitleme, vitest zaman aşımı, pytest'li test profili. Önerim 0,5-1 g idi, spec üst sınırı almış. Çalışıp çalışmadığı doğrulanmadı (AC-C31, C36 koşturulabilirliği T-pre çıktısıdır) |
| 4 | Scout sorusu + Mimari kurul + DOM yedeği yeniden tahmin tetikleyicisi | **Kısmen karşılandı** | T-0s (isteğe bağlı Scout, 0,25 g) ve T-ADR var. DOM yedeği için ayrı yeniden-tahmin tetikleyicisi bulmadım; ancak listeleme/unsave doğrulanamazsa "Faz 1 başlamaz, karar CEO'ya gider" (§6.5), bu en kötü durumu kapatıyor. Uç noktalar çalışır ama şekil farklıysa yeniden tahmin kuralı yok |
| 5 | T-4, T-11, T-13'ü böl; faz kırılımı satırda | **Karşılandı** | T-4a/b/c, T-11a/b, T-13a/b; Faz 0 / Faz 1 sütunlu tablo |

Yeni açık nokta (öneri 4'ün kalıntısı): "uç nokta çalışır ama şekil beklenenden farklı" durumunda T-8a/T-9 için yeniden tahmin tetikleyicisi yok.

## CK-14: tavanın 22 g'ye çıkarılması hakkında görüş

**Destekliyorum, 22 g makul.** Gerekçe:
1. 21 g tavan tahminin altında (21,2 g, %101); tavanı değiştirmeden başlamak ilk günden "aşım" demektir.
2. Aşım yalnız 0,2 g değil: tavandaki tek pay %20 düzeltme payıdır (2,95 g). Tavan 21 g kalırsa pay fiilen 2,75 g'ye düşer (%18,6 x 14,75), yani gerçek pay 0,2 g erir.
3. Alternatif (T-0s'yi çıkar, tam 21,0 g): sıfır headroom, önerilmez. Katılıyorum.
4. 22 g'de headroom 0,8 g (%3,8): dar. Bunu "ek pay" değil sigorta olarak okuyun. Faz 0 payı (+0,4 g) ve teslim zincirindeki ilk düzeltme turu bunu tüketebilir.

Koşullar/uyarılar:
- 22 g bir tavandır, hedef değildir; tavan aşılırsa iş durur ve main session'a döner (spec zaten böyle diyor).
- Kota payı (%30) için kota rakamı doğrulanmadı, "not verified". Paralellik (polyglot + react) takvimi kısaltır, kota/token maliyetini kısaltmaz.
- Tavan günü agent iş günüdür; CEO'nun beklediği süre (T-0a, T-13b) bu hesaba girmez. Takvim ile iş günü ayrı okunmalı.
- 22 g'yi geçecek bir tetikleyici (örn. T-0a sonrası uç nokta şekil farkı) için yeniden tahmin kuralı eklenmesi iyi olur (aşağıda öneri 1).

## Gerekli uzmanlık (v1.0 'den değişenler)

| Alan | Kapsayan birim/playbook | Durum |
|---|---|---|
| Instagram saved uç noktaları | T-0s Scout (isteğe bağlı) + T-0a polyglot hazırlar, CEO yürütür | partial (doğrulama spike'a bağlı; "no-go" kapısı var) |
| DM protokolü | Ek A, kapsam dışı | kapsam dışı |
| Test ortamı | devops-sre (T-pre) | present (plan var, çıktı doğrulanmadı) |
| Diğer alanlar (backend, React, eklenti, appsec, dokümantasyon) | v1.0 görüşündeki eşleme geçerli | birim dosyaları bu kontrolde yeniden doğrulanmadı: "not verified" |

## Bottlenecks and trends

Insufficient data (n=0). Trend iddiası yok. Yapısal adaylar (tek gözlem, spec §12.3'ün kendi tespitiyle uyumlu): T-0a ve T-13b (CEO zamanı, test hesabı), T-pre (Faz 0'ın yeni ve payı olmayan kalemi). Yük dengesi polyglot 7,5 g / react 6,25 g, bir birimde yığılma yok.

## Playbook update proposals

Insufficient data (n=0). Öneri yok.

## Tool inventory

Insufficient data / not verified. Kaldırılabilir araç önerisi yok.

## Recommendations (ordered, at most 5)

1. **CK-14'ü kabul edin (tavan 22 g) ve spec'e bir yeniden-tahmin tetikleyicisi cümlesi ekletin: T-0a uç nokta şekli beklenenden farklıysa T-8a/T-9/T-4a yeniden tahminlenir.** | kanıt: §12.3 (21,2 g > 21 g), §6.5 no-go kuralı yalnız tam başarısızlığı kapsıyor | maliyet: BA'da bir cümle | yapılmazsa: şekil farkı çıkarsa tavan sessizce aşılır ya da kapsam kırpılır.
2. **Faz 0'a düzeltme payı verin ya da T-pre için 1 g'nin tavan olduğunu not edin.** | kanıt: §12.3 payı yalnız Faz 1'e uyguluyor; benim hesabım +0,4 g, 22 g içinde | maliyet: 0 g ek tavan (21,6 g) | yapılmazsa: T-pre taşarsa 0,8 g headroom tüketilir.
3. **Teslim zinciri 1,5 g'yi dört birime bölün (qa, appsec, auditor, quality-office).** | kanıt: tek kalem, kırılım yok, doğrulanamaz | maliyet: BA'da küçük düzenleme | yapılmazsa: bir birimin (örn. appsec durak B) gerçek maliyeti ölçülemez, ilk scorecard'a temel kalmaz.
4. **İlk scorecard'ı bu iş için tutun (gerçekleşen/tahmin, faz ve T-satırı bazında).** | kanıt: n=0; %20 pay varsayım | maliyet: delivery-manager'ın küçük kaydı | yapılmazsa: sonraki işlerde pay ve 1,5x/3x testi yine kör kalır.

## Not verified / insufficient data

- Scorecard n=0: oran, trend, playbook ihlali, araç kullanımı hesaplanamadı.
- Kota ve token rakamı doğrulanmadı; %30 kota payı CEO kabulüdür, ölçülmedi.
- Birim listesi (`.claude/agents/`) bu kontrolde yeniden doğrulanmadı.
- T-pre'nin (Node 22, pytest profili) gerçekten çalışacağı doğrulanmadı; çıktı gelince AC-C31/C36 ile kanıtlanır.
- Teslim zinciri 1,5 g kırılımı yok. %20 pay, +0,4 g Faz 0 payı ve 0,8 g headroom yorumum benim varsayım/hesabımdır, veri değil.
