Capacity report: SPEC-001 v1.6 (Faz 0 + Faz 1, §12.3, CK-22) | Date: 2026-11-08 | Data: n=0 scorecard (docs/scorecards/ yok; "insufficient data (n=0)")

Not: Öneri belgesidir. Birim, rol, araç, playbook eklemez/değiştirmez; spec'e dokunulmadı. Karar CEO'nundur. Önceki görüşler: `docs/talent/SPEC-001-kapasite-gorusu.md`, `docs/talent/SPEC-001-v1.2-kapasite.md`.

## Kapasite görüşü

- **F modu (29,1 g, tavan 30 g): FITS, dar.** Tampon 0,9 g = tavanın %3,0 (hesap bana ait). Sayısal 1,5x/3x testi uygulanamaz (gerçekleşen yok, n=0). Aşağıdaki "pay yeterli mi" bölümü okunmalı.
- **W modu (33,3 g, tavan 30 g): tavan aşımı.** Ne "iyimser" ne "şişirilmiş" denebilir (veri yok). Tavan yükseltilmeden başlamamalı; spec bunu zaten kural yapmış (CK-22).
- **CK-22 önerisi A: mantıklı, iki koşulla** (aşağıda). B'den tamamen üstün değil.

## 1. Aritmetik doğrulaması

Kaynak: spec §12.1, §12.2, §12.2.1, §12.3; hesap bana ait.

| Kalem | Spec | Benim hesabım | Sonuç |
|---|---|---|---|
| Faz 0 (1 + 0,25 + 0,25 + 0,5 + 0,25) | 2,25 | 2,25 | Tutuyor |
| Faz 1, F (18 satır) | 20,75 | 20,75 | Tutuyor |
| W ekleri (10 satır) | 3,5 | 3,5 | Tutuyor |
| Pay %20: 0,45 / 4,15 / 4,85 | aynı | aynı | Tutuyor |
| Toplam F: 23,0 + 1,5 + 4,6 | 29,1 | 29,1 | Tutuyor |
| Toplam W: 26,5 + 1,5 + 5,3 | 33,3 | 33,3 | Tutuyor |
| v1.5 -> v1.6 farkı (+0,25 +0 +0,25 +0,25 +0,5 +0 +0,25) | +1,5 | +1,5 | Tutuyor |
| Tampon F: 30 - 29,1; A: 34,5 - 33,3 | 0,9; 1,2 | 0,9; 1,2 | Tutuyor |

Aritmetik hata yok.

## 2. Tahminler gerçekçi mi?

Veri: gerçekleşen yok (plan §"gerçekleşen süre STATE.md ve scorecard'a yazılır" der, henüz kayıt yok). Bu yüzden "gerçekçi" kararını **gerçekleşenle** veremem; yalnız yapısal gözlemler:

1. **Tahmin sürüklenmesi (tek iş, trend değil):** Faz 1 yapımı v1.2 14,75 -> v1.3 18,0 -> v1.4 19,0 -> v1.5 19,25 -> v1.6 20,75 g (+%41, spec §12.3 değişim tabloları). Her revizyonda yukarı gitti, hiç aşağı gitmedi. Bu, ilk tahminlerin düşük kaldığını düşündürür ama tahmin-tahmin karşılaştırmasıdır, gerçekleşen değil. Trend sayılmaz (n=1 iş).
2. **Kritik risk satırları belirsizliğin yüksek olduğu yerde:** T-8a 1,5 g (GraphQL unsave, `UNSAVE_DOC_ID` T-0c'den gelecek, yanıt şekli canlı Instagram'a bağlı), T-4c 2,0 g (en çok iş durumu), T-13b 0,5 g (canlı hesapta duman testi). Bu üçü dış sistem davranışına bağlı; tahmin hataları buradan gelir. Kanıt: spec §12.2 satırları, §6.9 şekil farkı.
3. **Test satırları AC sayısına göre ince olabilir:** 117 etkin AC (spec satır 767: playbook sınırı 15). Test görevleri T-6 2,25 + T-10a 1,25 + T-12a 1,25 = 4,75 g. Spec çoğu AC'nin parametrik test olduğunu söylüyor (§14.5); bu doğrulanmadı, "not verified".
4. **Faz 0 zaten gerçekleşiyor:** T-pre (commit c852523), T-ADR, T-0a (commit 2409727) yapıldı. Faz 0 payı (0,45 g) büyük kısmı bitmiş işe uygulanmış durumda. Spec bunu kendisi söylüyor (§12.3 "gerçekleşenle değiştirilmeli"). Gerçekleşen süre elimde yok: "insufficient data".
5. **T-0s isteğe bağlı:** yapılmazsa F 28,8 g, W 33,0 g (spec §12.3). Tampon F'de 1,2 g'ye çıkar.

## 3. Düzeltme payı yeterli mi?

Hayır, "yeterli" demek için veri yok; "kırılgan" demek için nedenler var:

- %20 pay varsayımdır (spec: "varsayım, n=0"). Doğrulanmadı.
- Pay yalnız yapıma uygulanıyor. **Teslim zinciri 1,5 g paysız** (qa 0,5, appsec 0,5, auditor 0,25, quality-office 0,25). Zincirde bulgu çıkarsa düzeltme turu ek maliyettir; pay bunu karşılıyor mu belirsiz, çünkü pay yapım işleri için tanımlı.
- Pay dışındaki gerçek tampon F'de yalnız 0,9 g (%3,0). Yani pay tamamen tüketilirse (yapım %20 aşarsa) sorun yoktur, ama yapım %23 aşarsa tavan aşılır: 0,9 / 23,0 = %3,9 ek. Hesabım: yapım 23,0 g x 1,239 = 28,5 g + zincir 1,5 = 30,0 g.
- Dış sisteme bağlı üç satır (madde 2) toplamda ≈ 4,0 g. Bunlar %50 aşarsa tek başına +2,0 g yapar ve payın (4,6 g) %43'ünü tüketir. Bu bir senaryo hesabıdır, tahmin değil.
- Kota: %30 abonelik kotası payı CEO kabulü; kota rakamı doğrulanmadı, "not verified". Paralellik takvimi kısaltır, kotayı kısaltmaz.

Sonuç: F'de pay sınırda yeterlidir, W'de de aynı. İlk %25 ve %50 kontrol noktalarında (plan §207) gerçekleşen/tahmin oranı bakılıp pay yeniden değerlendirilmeli.

## 4. CK-22 önerisi A mantıklı mı?

Spec: A = tavan 34,5 g (yalnız T-0c = W ise), tek teslim zinciri; B = F önce 30 g, sonra Faz 1b 5,5 g, toplam ≈ 34,1 g; C = hafifletme (önerilmiyor).

**Destekliyorum, koşullu.**

Lehine (spec §12.3 rakamları + hesabım):
- A, B'den ≈ 0,8 g ucuz ve tek migration, tek teslim zinciri (B'de ikinci zincir ≈ 0,75 g).
- Spec'e göre F önce, W sonra yaparsak aynı dosyalara iki kez dokunulur (T-4a, T-4c, T-8a, T-9, T-11 serisi); bu yeniden iş B'nin ek maliyetinin ana kalemi.
- T-0c imzadan önce yapılırsa soru muhtemelen çözülür (0,25 g). Bu en ucuz hamle.

Aleyhine/dikkat:
- A'da tampon 1,2 g = %3,5; F'deki ince tampondan farkı yok. Tavan 34,5 g, tahminin 4,2 g üstü ama pay zaten tahmine dahil. "Tavan yükseldi" demek tampon arttı demek değil.
- A, W'nin riskini F'ye bağlar: W'nin en belirsiz satırı T-8a [W] (doğrulanmamış `COLLECTIONS_DOC_ID` yolu, +0,5 g) ve T-11c (yeni panel, 0,75 g). W taşarsa F'nin tamponunu da yer.
- B'nin değeri: ana özellik ≈ 2 g erken gelir ve W ayrı tavanda ayrı karar noktasıdır (W ertelenebilir/iptal edilebilir). Bu opsiyon değeri 0,8 g'ye değer mi, CEO'nun kararı; değer rakamlandırılamaz (veri yok).
- Faz 1'de 117 AC, W ile ≈ 130+ (U27, U28, S20..S23). Playbook sınırı 15; W bu aşırı yüklenmeyi artırıyor (spec bunu B'nin gerekçelerinden biri saymış).

Koşullar:
1. **T-0c imzadan önce yapılsın** (spec zaten öneriyor). F çıkarsa CK-22 düşer, 0 g ek maliyet. Bu yapılmadan A/B tartışması erkendir.
2. **A seçilirse W için ayrı alt sınır:** F çekirdeği 30 g'de kalır, W ekleri (+5,3 g payla) ayrı izlenir; T-8a [W] ve T-11c bittiğinde kontrol noktası. Aşım W alt sınırında kalırsa F'nin payı tüketilmez, W kesilebilir.

## 5. Gerekli uzmanlık ve kapsama

| Alan | Kapsayan birim/playbook | Durum |
|---|---|---|
| Backend (FastAPI/Celery/Alembic) | polyglot-engineer (T-1..T-7a) | present (spec ataması; birim dosyası bu kontrolde doğrulanmadı) |
| Eklenti MV3 + React | react-engineer (T-7b, T-8a..T-12a) | present (aynı not) |
| Instagram iç GraphQL (`doc_id`, token, yanıt şekli) | polyglot/react + T-0a/T-0c (CEO tarayıcısında, main session) | partial: doğrulama CEO'ya ve canlı hesaba bağlı; `doc_id` zamanla değişebilir, bakım maliyeti tahminde yok (kapsam dışı mı, belirsiz: "insufficient data") |
| Test ortamı | devops-sre (T-pre) | present (yapıldı, commit c852523; çıktı bu kontrolde yeniden doğrulanmadı) |
| Güvenlik | appsec (durak B) | present |
| Doküman | tech-comms | present |

Eksik uzmanlık: yok kanıtlanabilir. Instagram otomasyon/ToS riski için Scout (T-0s) isteğe bağlı kalmış; kapsama "partial".

## 6. Darboğaz ve yük

Kaynak: spec §12.3 yük ve kritik yol; hesap bana ait. Trend iddiası yok (n=0).

- Yük (yapım): F polyglot 11,0 / react 8,75; W polyglot 12,5 / react 10,75. Backend zinciri seri: T-pre -> T-2b -> T-2 -> T-4a -> T-4b -> T-4c -> T-5 = 8,75 g, W'de +1,0 g.
- Takvim: F ≈ 15 g, W ≈ 17 g (spec; düzeltme payı hariç).
- Darboğaz adayları: **T-0c** (CEO tarayıcısı, T-1 ve T-8a'yı bekletir), **T-13b** (CEO zamanı), polyglot-engineer zinciri. Hepsi yapısal gözlem, trend değil.

## Playbook update proposals

Insufficient data (n=0). Öneri yok.

## Tool inventory

Insufficient data / not verified. Kaldırılabilir araç önerisi yok.

## Recommendations (ordered, at most 5)

1. **T-0c'yi v1.6 imzasından önce yaptırın; sonuç F ise CK-22'yi kapatın.** | kanıt: spec §12.2 T-0c satırı, §14 CK-22, W aşımı 3,3 g | maliyet: 0,25 g | yapılmazsa: 4,2 g'lik W ekleri belirsiz bir sorgu (`COLLECTIONS_DOC_ID`) üzerinden bütçelenir.
2. **T-0c = W çıkarsa A'yı seçin (tavan 34,5 g), ama W eklerine ayrı alt sınır koyun; T-8a [W] ve T-11c sonunda kontrol noktası.** | kanıt: spec §12.3 A/B rakamları, tampon %3,5 | maliyet: BA'da bir cümle, delivery-manager'da iki ek kontrol | yapılmazsa: W'nin taşması F tamponunu yer, kesme noktası kalmaz.
3. **Teslim zincirine (1,5 g) pay ya da ayrı tampon tanımlayın, ve Faz 0 gerçekleşenlerini §12.3'e yazın.** | kanıt: pay yalnız yapıma; T-pre, T-ADR, T-0a bitti ama gerçekleşen yok | maliyet: ≈ 0,3 g (zincirin %20'si, benim hesabım) F'nin 0,9 g tamponundan | yapılmazsa: zincirde bir düzeltme turu tavanı aşırır.
4. **İlk scorecard'ı T-satırı bazında başlatın, %25 ve %50 noktasında tahmin/gerçekleşen oranını kapasite birimine verin.** | kanıt: n=0; plan satır 207 ve 213 | maliyet: delivery-manager'ın küçük kaydı | yapılmazsa: %20 pay ve 1,5x/3x testi kör kalır.
5. **Dış sisteme bağlı üç satırı (T-8a, T-4c, T-13b) için erken geri bildirim noktası koyun: T-8a bittiğinde canlı doğrulama sonucu rapora gelsin.** | kanıt: madde 2; kritik satırlar ≈ 4,0 g | maliyet: ≈ 0 g (zaten T-13b'de) | yapılmazsa: şekil farkı geç anlaşılır, yeniden tahmin tavana çarpar.

## Not verified / insufficient data

- Scorecard n=0: oran, trend, playbook ihlali, araç kullanımı hesaplanamadı.
- Faz 0 gerçekleşen süreleri (T-pre, T-0a) elimde yok; STATE.md/main session'dan gelmeli.
- Kota ve token rakamı doğrulanmadı; %30 kota payı CEO kabulüdür, ölçülmedi.
- Birim dosyaları (`.claude/agents/`) bu kontrolde yeniden doğrulanmadı.
- AC'lerin çoğunun parametrik test olduğu (§14.5) doğrulanmadı.
- "Senaryo" hesapları (yapım %23 aşımı, kritik satırlar %50 aşımı, zincir payı 0,3 g) benim varsayım/hesabımdır, veri değil.
- W için ≈ 130+ AC tahmini yaklaşık; kesin sayım spec §5'ten yapılmadı.
