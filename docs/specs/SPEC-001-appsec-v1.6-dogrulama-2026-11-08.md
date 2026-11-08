# SPEC-001 · AppSec v1.6 doğrulama (ikinci tur)

> Bu dosyayı main session yazdı; içerik AppSec raporundan alındı (AppSec'in yazma aracı yok).

Durak: A (spec, imza öncesi) | Taban: `2409727` + çalışma ağacındaki spec | Önceki rapor: `SPEC-001-appsec-v1.6-2026-11-08.md`

**Özet:** CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1 (S-32) · INFO 1 (I-20)
**Karar: PASS-koşullu.** S-28 ve S-30 imza koşulları karşılandı. S-27, S-29 ve I-16..I-19 kapandı. S-31'in "uygulanamaz" gerekçesi geçerli. Tek koşul S-32: §6.10 yöntem kuralına bir cümle; imzayı engellemez ama bir sonraki canlı okumadan (FB-1, T-13b, `doc_id` yenilemesi) önce işlenmeli.

## Kapanış doğrulaması

| Bulgu | Durum | Not |
|---|---|---|
| S-28 (1) gövde bekçisi | Kapandı | Sorgu adından bağımsız; `ia-observed` yolu ve `scanEmbedded` ikisi de `forward()`'a gidiyor (`content.js:50-54`, `:505`, `:518`). |
| S-28 (2) genelleşmiş `NEVER` | Kapandı, çakışma yok | Repodaki tüm sorgu adları `node` ile sınandı: `PolarisLikersSheetQuery`, `PolarisPostCommentsQuery`, `PolarisPostLikedByListDialogQuery`, `PolarisPostLikersQuery`, `PolarisProfilePostsQuery` iletilmeye devam ediyor. Kaydetme/koleksiyon/mailbox adları engelleniyor. |
| S-28 (3) sorgu adı kaydı | Yumuşatılmış haliyle kabul | Bağlayıcı önlem bekçide. |
| S-28 (4) testler | Kapandı | |
| S-27 | Kapandı | Token ayrımı önerildiği biçimde. |
| S-29 | Kapandı | Bekçi `DTSGInitialData` ve `"LSD",\[\]` desenlerini yakalıyor. |
| S-30 | Kapandı | §6.10 yöntem kuralı, §8 sınır 7, spike raporu düzeltildi. |
| S-31 | Uygulanamaz, gerekçe geçerli | Ortaklık alanı yok; koruma fail-closed; geri dönüş kuralı §13'te. |
| I-16..I-19 | Kapandı | |

Not: Kaydetme mutasyonları artık backend'e ulaşmadığı için bu yanıtlardaki 429'lar risk sinyali olarak sayılmayacak; bunlar kullanıcının kendi işlemleri, güvenlik kaybı yok.

## Bulgular

### S-32 [LOW] Yöntem kuralı hedef gövdenin araç çıktısına ham girmesini engellemiyor; DM ekranları kapsam dışında
- Yer: §6.10 kural 1 ve 2; §8 sınır 7.
- Kanıt: Kural, ayıklamanın nerede yapılacağını yazmıyor. Gövde araç çıktısına açılırsa oturum kaydına tüm değerleriyle düşer. Hedef gövdeler de kişisel veri taşıyor (gönderi sahiplerinin kullanıcı adları, koleksiyon adları). Kural DM yüzeyinde ekran görüntüsü ve sayfa metni okumayı anmıyor.
- Etki: Üçüncü kişi kullanıcı adları ve koleksiyon adları geliştirme makinesindeki oturum kaydına kalıcı yazılabilir.
- Düzeltme (kural 2'ye tek cümle): "Ayıklama sayfa içinde yapılır. Araç çıktısına yalnız anahtar yolları, sayılar ve `doc_id` döner; ham gövde, ekran görüntüsü ya da sayfa metni araç çıktısına alınmaz. `/direct/` ve DM bildirimi görünen yüzeylerde ekran görüntüsü ve sayfa metni okuması yapılmaz."
- Test: süreç önlemi; FB-1 ve T-13b raporlarına "yöntem kuralına uyuldu" satırı.

### I-20 [INFO] "Mevcut analizler etkilenmez" iddiası sentetik testlerle kanıtlanamaz
- `pageTokens()` ve `scanEmbedded()` aynı seçiciyi okuyor; gerçek sayfada token blokları ile gönderi verisi aynı bloktaysa bekçi gönderi bloğunu da atar (güvenli yön, ama sessiz işlev kaybı).
- Öneri: §14 madde 11 "sentetik testlerle gösterilir; gerçek sayfa FB-1'de gözlenir" olsun; FB-1'e `scanEmbedded` iletim sayısı ve bekçiye takılan blok sayısı ölçütü eklensin (yalnız sayılar).

### Sertleştirme önerileri (bulgu değil)
- Bekçiyi `forward()`'un içine koy (tek geçit).
- Bekçi desenine `"csrf_token"` ve AC-C54 sahte sayfasına `TEST_CSRF_789` taşıyan gömülü blok eklenebilir.

## Taranmayanlar
- Gerçek sayfada gömülü blok yapısı; gerçek ortam sorgu adlarının `NEVER` ile çakışması; mailbox yanıtını taşıyan isteğin sorgu adı; oturum kayıtları (talimat gereği açılmadı); bağımlılık, dinamik ve imaj taraması (Durak B'de).
