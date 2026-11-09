Kapasite raporu: SPEC-002 v0.1 (bağımlılık güvenlik yükseltmesi) | Tarih: 2026-11-09 | Veri: n=0 scorecard (`docs/scorecards/*.md` yok; Glob sonucu boş)

Kapasite görüşü: **FITS (koşullu)**. Tahmin 2,1 g, tavan 2,5 g (tampon 0,4 g, %19). Spec §9 görev toplamı: 0,5 + 0,5 + 0,25 + 0,25 + 0,1 + 0,5 = 2,1 g, doğru toplanmış. 1,5x / 3x "iyimser / şişirilmiş" testi uygulanamaz: benzer iş scorecard'ı yok, gerçekleşenler "bilinmiyor" (SPEC-001 planı §1: Faz 0 gerçekleşenleri yazılmamış). Aşağıdaki değerlendirme veri değil, spec metninden çıkarılmış gerekçedir.

Tahmin gerçekçi mi (görev bazında, yargı; veri yok)
- T-1 (0,5 g): 4 yeni test dosyası, sabit token üretimi, taban ölçümü. Makul ama sıkı; PB-4 (6 alt durum) ve PB-5 (CORS + 3 router) tek başına ~0,25 g tutabilir.
- T-2 (0,5 g): **en belirsiz kalem.** Starlette 0.37 -> 1.x ve FastAPI atlaması var; spec kendisi kırıcı değişiklik listesini göremediğini yazıyor (§15). Kırık çıkarsa 0,5 g yetmez. Tampon (0,4 g) büyük ölçüde bu kaleme ayrılmış sayılmalı.
- T-3 (0,25 g): docker build + tam takım + migrate-check + pip-audit + duman testi + rapor. İyimser uçta; build/pull süresi ajan günü değil ama sıra bekleme getirir.
- T-6 (0,5 g, qa + appsec + auditor): hassas alan (şifreli oturum çerezi) için ince; SPEC-001 zincirinde aynı üç birim 1,25 g (plan §4, D-1..D-3). Küçük iş olduğu için kabul edilebilir.
- Genel: sapma olasılığı tek yönlü (T-2 kırığı). Tavanı aşma riski orta, tavan altında kalma olasılığı makul. Kota payı %5 "öneri"; doğrulanmadı.

Gerekli uzmanlık ve kapsama
| Alan | Kapsayan birim / playbook | Durum |
|---|---|---|
| Python/FastAPI bağımlılık yükseltmesi | polyglot-engineer (spec §9 sahibi) | var (spec'e göre; birim listesini `.claude/agents/` altında doğrulamadım) |
| cryptography / Fernet geriye uyum | polyglot-engineer (T-1) + appsec (T-6) | var |
| Tedarik zinciri / CVE erişilebilirlik | appsec | var |
| Docker rebuild, imaj içi `pip check` | polyglot-engineer yapıyor; devops-sre spec'te yok | kısmi (zorunlu değil, devops-sre T-3'e danışman olabilir) |
| Doküman / BookStack senkronu | tech-comms | var |
| Hash'li kilit dosyası | spec dışı (SPEC-003 adayı) | kapsam dışı |
Eksik uzmanlık: yok.

Darboğaz ve eğilim: insufficient data (n=0). Tek gözlem, eğilim değil: SPEC-001 plan §3 ve §4'e göre polyglot-engineer zincirinde T-4a -> T-5 arası seridir (2 polyglot örneğinden biri o aralıkta boşta); SPEC-002 bu kapasiteyle teknik olarak paralel koşabilir, ama sıra aşağıdaki nedenlerle seri öneriliyor.

Sıralama mantıklı mı: evet, çoğunlukla.
- Seri sıra (T-4b sonrası, T-4c öncesi) doğru: (1) SPEC-001 plan §3 "aynı anda yalnız bir DB'li pytest/migrate-check" kuralı; SPEC-002 T-1 ve T-3 aynı `instaanalytic_pytest` ve `instaanalytic_migcheck` veritabanlarını kullanıyor; (2) tek çalışma ağacında yarım T-4b/T-4c dosyaları PB-2 "tam takım yeşil" kanıtını bozar; (3) T-5/T-6 yeni FastAPI davranışı üzerine yazılmış olur, sonradan yeniden doğrulama gerekmez.
- Zayıf nokta: §8 tablosu T-4c'yi **CI yeşil**den sonra başlatıyor (adım 5-6: CEO push onayı + CI bekleme). T-4c, T-3 (yerel kanıt) bittiğinde başlayabilir; push ve CI beklemesi kritik yolu gereksiz uzatır. T-4 (tech-comms) ve T-6 (qa/appsec/auditor) da başka birimler olduğu için T-4c ile paralel koşabilir.
- "~2 g kayma" için hesap: SPEC-001 kritik yolunu yalnız polyglot T-1 + T-2 + T-3 (1,25 g) ve push/CI bekleme süresi uzatır; T-4 (0,25 g) ve T-6 (0,5 g) başka birimlerde. Yani kayma ≈ 1,25 g + CEO/CI bekleme süresi (bilinmiyor); ~2 g makul bir üst sınır, ancak bekleme >0,75 g sürerse aşılır. Bu bir hesap, ölçüm değil.

SPEC-001 tavanını (37 g) etkiler mi
- Doğrudan: hayır. Spec §8 SPEC-002'nin kendi tavanını (2,5 g) kullandığını söylüyor; SPEC-001 harcaması değişmez. Takvim kayması ajan günü tüketmez.
- Dolaylı riskler (tampon yalnız 1,0 g imzalı / 1,3 g çalışma, plan §1 ve §8, R1):
  1. Yükseltme T-4a/T-4b'nin yazdığı (DB'li) testleri kırarsa, düzeltme kimin bütçesinden? Spec §9 T-2 bunu SPEC-002'ye yazıyor, ama SPEC-001 tarafındaki test düzeltmesi belirsiz.
  2. Pydantic zorunlu yükselirse (R-5) T-5 şemaları etkilenir; spec yalnız "T-5'e bildirilir" diyor, maliyet atanmamış.
  3. SPEC-002 tavanı aşarsa baskı SPEC-001 takvimine düşer; ortak kota: SPEC-001 en fazla %30 (CK-13) + SPEC-002 %5 = %35 (kota doğrulanmadı).
- Sonuç: SPEC-001 tavanı kendi kendine tehlikeye girmiyor; SPEC-001'in düzeltme payı (%20) bir bütçe sınırı olmadığı için hesap ayrı tutulmalı.

Playbook güncelleme önerileri: insufficient data (n=0).

Araç envanteri: insufficient data (n=0).

Öneriler (sıralı, en çok 5)
1. T-4c'yi T-3'ün yerel yeşilinden sonra başlat; push/CI beklemesini T-4c'nin ön koşulu yapma (§8 adım 5-6 değişsin) | kanıt: spec §8 tablosu, plan §4 T-4c bağımlılığı | maliyet: sıfır (sıra değişikliği) | yapılmazsa: kayma ~2 g'nin üstüne çıkar, CEO push saatine bağlı
2. SPEC-002 tavan aşımı SPEC-001 bütçesinden borçlanmasın; ayrı gerçekleşen kaydı tutulsun, %50'de (1,25 g) T-2 raporu gelsin | kanıt: spec başlık "tavan aşılırsa iş durur", plan §8 eşikler | maliyet: ~0,05 g raporlama | yapılmazsa: SPEC-001'in 1,0-1,3 g tamponu sessizce erir
3. Yükseltme SPEC-001 dosyalarında/testlerinde kırık çıkarsa kimin bütçesinden ve kimin onayıyla düzeltileceği spec'e yazılsın | kanıt: spec §9 T-2 "kırılan uygulama dosyası", §7 R-5 | maliyet: 1 cümle | yapılmazsa: yeniden iş SPEC-001 payına yazılır
4. T-2 için ön keşif: yükseltmeden önce FastAPI/Starlette sürüm notlarını okuyup kırıcı değişiklik listesi çıkar (spec §15 bunu T-2'ye bırakıyor); sonuç T-2 tahminini 0,5 g'den yukarı çekerse CEO'ya bildirilsin | kanıt: spec §15 son madde | maliyet: ~0,1 g, T-2 içinde | yapılmazsa: en belirsiz kalem tavanı zorlar
5. Bu iş kapanınca gerçekleşen süreler scorecard'a yazılsın (ilk scorecard); bugün hiç yok, sonraki kapasite görüşleri veri olmadan yargıya dayanıyor | kanıt: Glob `docs/scorecards/*.md` boş; plan §1 "bilinmiyor" | maliyet: ~0,05 g | yapılmazsa: tahmin/gerçekleşen oranı hiç ölçülemez

Doğrulanmadı / veri yetersiz
- Scorecard yok (n=0): tahmin/gerçekleşen oranı, eğilim, darboğaz, playbook sapması, araç kullanımı hesaplanamadı.
- Kota payları (%5 SPEC-002, %30 SPEC-001) doğrulanmadı.
- `.claude/agents/` birim listesi okunmadı; birim varlığı spec ve plan metnine dayanıyor.
- SPEC-001 planı satır 330'a kadar okundu (400 satır); kalan kısım (risk tablosu devamı) okunmadı.
- PyPI sürümleri ve Starlette 1.x kırıcı değişiklikleri doğrulanamadı (ağ yok).
- CEO push onayı ve CI bekleme süresi bilinmiyor; kayma hesabı buna bağlı.
