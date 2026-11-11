# SPEC-001 ve SPEC-002: kalite ofisi kaydı (izlenebilirlik ve uyum)

Tarih: 2026-11-11. Birim: quality-office. Taban commit: `a2e859e` (HEAD). Çalışma ağacı kirli: README.md, `backend/tests/test_cleanup_budget.py`, `frontend/extension/content.js`, `SavedTab.tsx`, `extension-cleanup.test.ts`, `extras.test.tsx`, `setup.ts`, `users-queue.test.tsx` commit edilmemiş değişiklik taşıyor.
Kapsam: SPEC-001 v1.6 (Faz 0 + Faz 1, imzalı 2026-11-08) ve SPEC-002 (imzalı 2026-11-09, K-26). Ek A (DM silme) imza kapsamı dışıdır; bu kayıtta yalnız "DM içeriği saklanmaz" ilkesi açısından ele alınır.
Bu belge hukuki görüş değildir. "Avukat gerekir" işaretli maddeleri avukat değerlendirir.
Kural: QA tablosu tekrar yazılmadı. Kriter ↔ test ↔ kanıt için tek kaynak `docs/raporlar/SPEC-001-qa.md` §3 (119 etkin kriter, her biri `dosya:satır` ile). Bu belge yalnız o zincirin üstündeki ve kopuk halkaları kaydeder. QA kanıtını ben üretmedim; yeniden koşmadım (araç alanım salt okunur sorgu).

## Bölüm 1. İzlenebilirlik

### 1.1 Zincir: gereksinim (REQ) → kriter (AC) → test → kanıt

Spec'in kendisi REQ ile AC arasında açık bağ tutmuyor (§3 REQ listesi, §5 AC listesi; AC metinlerinde `REQ-n` ifadesi geçmiyor, §5.5 yalnız Faz eşlemesi veriyor). Aşağıdaki REQ → AC eşlemesi kalite ofisinin AC başlıklarını okuyarak yaptığı **çıkarımdır**, spec'te yazılı değildir. Test ve kanıt kolonu QA §3'e atıftır.

Durum etiketi: `PASSED*` QA'nın okuyarak onayladığı (yıldız: bozarak denenmediyse); `MUTATED` QA bozarak denedi (M1..M8); `UNPROVEN` kanıt eksik (neden yazılı). Taban: QA koşusu kirli ağaçta yapıldı (bkz. 1.3).

| REQ | Eşlenen AC (çıkarım) | Kanıt (QA §3 / §4) | Durum |
|---|---|---|---|
| REQ-1 varsayılan kapalı | C1 | QA §3 C1 | PASSED* |
| REQ-2 açma diyaloğu ve onay | C3, U1 | QA §3 | PASSED* (canlı gösterim yok: UNPROVEN-görsel, 1.2 madde 2) |
| REQ-3 kapalıyken yürütme yok | C2, C14 | QA §3 | PASSED* |
| REQ-4 takip anahtarından bağımsız | C24 | QA §3 | PASSED* |
| REQ-5 önizleme (dry-run) | C5, U7 | QA §3 | PASSED* |
| REQ-6 sayı yazılmadan kuyruk yok | C6 | QA §4 M1 | MUTATED |
| REQ-7 onay yalnız saklı liste | C7 | QA §3 | PASSED* |
| REQ-8 tek etkin parti, tek taslak | C5, C8 | QA §3 | PASSED* |
| REQ-9 parti tavanı 500 | C9 | QA §3 | PASSED* |
| REQ-10 seçim ve toplu çıkarma | S9, S10, S12, U19 | QA §3 | PASSED* |
| REQ-11 yazmadan önce yeniden denetim | C12, C26, C47, C48, S23 | QA §4 M2, M4 | MUTATED; M4 kısmi (QA B-2) |
| REQ-12 engelde 24 sa duraklatma | C13 | QA §3 | PASSED* |
| REQ-13 429 durdurur, 24 sa yok | C46 | QA §3 | PASSED* |
| REQ-14 ardışık 5 hata | C16 | QA §4 M7 | MUTATED |
| REQ-15 ayrı bütçe, sert tavan | C10, C11, C25, L9 | QA §3 | PASSED* |
| REQ-16 ayar dosyası, 30 sn | L1..L5, L7, L8, L10..L13 | QA §3 | PASSED* (17 etiketsiz kriterin çoğu burada) |
| REQ-17 sınırlar arayüzde salt okunur | L6 | QA §3 | PASSED* (görsel UNPROVEN) |
| REQ-18 ayar değişikliği kaydı | L10, L11, C35 | QA §3 | PASSED* |
| REQ-19 hesap eşleşmesi | C4 | QA §4 M8 | MUTATED |
| REQ-20 denetim kaydı | C17, C35 | QA §3 | PASSED* |
| REQ-21 iptal | C15, C45 | QA §3 | PASSED* |
| REQ-22 yalnız açık Başlat | C21, C40 | QA §3 | PASSED* |
| REQ-23 Durdur sunucuda | C40, C47 | QA §3 | PASSED* |
| REQ-24 eklenti sessizse otomatik durdurma | C30, C44 | QA §3 | PASSED* |
| REQ-25 tahmin | C43, U7 | QA §3 | PASSED* |
| REQ-26 sonraki başlatma zamanı | C42 | QA §3 | PASSED* |
| REQ-27 oturum anahtarı sınırı | C18, C54 | QA §3 | PASSED* |
| REQ-28 profil izolasyonu (IDOR) | C27 | QA §3 | PASSED* |
| REQ-29 serbest metin yok | C28, C29 | QA §3; sapma kaydı | C29 gevşetildi (1.4 madde 1) |
| REQ-30 kullanıcı adı ve kimlik saklanmaz (raporlar) | C29, C17 | QA §3 | PASSED* |
| REQ-31 saklama görevleri | C32, C44, C22, C23 | QA §3 | PASSED* |
| REQ-32 sayfa sayfa insan hızı | S1 | QA §3 | PASSED* |
| REQ-33 yalnız tanımlı alanlar saklanır | S2 | QA §3 | PASSED* |
| REQ-34 zaten kaydedilmemiş | S3, C50 | QA §3 | PASSED* |
| REQ-35 pasif gözleme iletilmez | S6, C55 | QA §3 | PASSED* |
| REQ-36 tarama sonrası işlenmişi işaretle | S15, C39 | QA §3 | PASSED* |
| REQ-37 korunan koleksiyon | S16, S21, S23, C57 | QA §4 M3 | MUTATED |
| REQ-38 reklam işareti | S19 | QA §3 | PASSED* |
| REQ-39 yalnız kendi isteğinin yanıtı | C55, S17, S18 | QA §4 M6 | MUTATED |
| REQ-40 tanınmayan istek → dur | C56, C57, S17 | QA §3 | PASSED* |
| REQ-41 koleksiyon koruma yönetimi | S20, S22, U27, U28 | QA §3 | PASSED* (W modu canlı doğrulaması yok) |

Kriter düzeyi: C1..C57 (C34 kaldırıldı), S1..S23, L1..L13, U1..U28 (U11 kaldırıldı) = 119 etkin kriter; QA tablosunda hepsinin satırı var. Bozarak denenen: C4, C6, C12, C16, C26 (kısmi), C47 (kısmi), C52, S16, S17, S21 (M1..M8). Kalan satırların çoğu "okundu" düzeyinde, yani test kodunun kriteri kapsadığı elle kontrol edildi, üretim kodu bozularak sınanmadı.

### 1.2 UNPROVEN ve kanıtı zayıf kalemler

1. **Canlı adımlar yok (FB-1, T-13b):** gerçek hesapla unsave, W modunda koleksiyonlu gönderinin unsave davranışı, "gerçek hesapla etkilenmez" ifadesi. UNPROVEN. (QA §5.)
2. **Arayüz kriterleri yalnız jsdom bileşen testiyle kanıtlı:** AC-U*, S7, S12, L6. Gerçek tarayıcı ekran görüntüsü yok. UNPROVEN (görsel).
3. **Erişilebilirlik (axe) taraması:** kanıt bulunamadı. UNPROVEN.
4. **AC-C26 / C47:** `FOR UPDATE` kapı kilidi yalnız SQL metnini arayan testle kanıtlı; eşzamanlılık testi ayrı bir kilide dayanıyor (QA M4, B-2). Davranışsal kanıt kısmi.
5. **AC-C29:** kriter metni "message yalnız sayı"; kod sabit kod dizesi dönüyor. Sapma kaydında gevşetildi (1.4). Spec metni değişmedi; kayıt yan belgede.
6. **Tam frontend suite yeşil değil:** QA koşusunda 592/593; kalan `users-queue.test.tsx` flaky (SPEC-001 öncesi dosya). Node 25 ile koşuldu, `.nvmrc` 22. `npm run build` adımı ayrı doğrulanmadı. Not: bu dosya şu an çalışma ağacında değişmiş durumda; düzeltme denenmiş olabilir, QA'nın yeniden koşusu görülmedi.
7. **Performans/yük:** spec'te ölçüt yok.

### 1.3 Kopuk halkalar

**Test var, gereksinim yok (orphan test):**
- `users-queue.test.tsx > when the start fails it does not retry in a loop`: SPEC-001'e bağlı değil (v2.8.x dönemi). Bilinen, kasıtlı olarak kapsam dışı; yalnız teslim kapısı sorunu.
- SPEC-001 etiketsiz 17 kriterin testleri (C37, C38, C41, L1..L5, L7, L8, L10..L13, S4, U5) elle eşlendi; test üzerinde `AC-x` etiketi yok. Gereksinim var, bağ yalnız QA tablosunda. Orphan değil ama etiket borcu.
- Orphan tespiti kapsamlı değil: depodaki tüm testleri tek tek AC'ye bağlayan bir tarama yapılmadı (QA yalnız AC'den teste doğru gitti). Test → AC yönü: UNPROVEN.

**Gereksinim var, kriter yok:**
- REQ → AC bağı spec'te hiç yazılı değil (yukarıda 1.1). Her REQ en az bir AC'ye çıkarımla bağlanabildi; bağlanamayan REQ yok. Ancak bağ resmi olmadığı için yeni bir REQ'in kriter dışı kalması kendiliğinden yakalanmaz. Öneri (BA'ya): REQ başına AC listesi ekle.

**Kriter var, test yok:**
- Bu çalışmada kriteri teste bağlanamayan AC yok (QA 119/119 satır doldurmuş). AC-C34 ve AC-U11 spec'te kaldırılmış; satır sayımına girmez.
- Spec §9 test adı tablosu: 155 `test_*` adından 54'ü depoda o adla yok. Testler konuya göre bölünmüş. Eşleme notu `SPEC-001-sapma-kaydi.md` B-3'te. Spec §9 metni güncellenmedi. Belge borcu.

**Eski kanıt (stale evidence):**
- QA kanıtı taban commit `a2e859e` üstüne çalışma ağacında uncommitted değişikliklerle alınmış görünüyor (git status: 8 değişiklik, `content.js`, `SavedTab.tsx` dahil; bunlar AC-S17, S6, S7, C54, C55, U6 gibi kriterlerin üretim kodu). QA raporu hangi ağaç durumunda koştuğunu ve commit karmasını yazmıyor. Bu değişiklikler commit edilince ya da QA'dan sonra yeni değişiklik yapılırsa kanıt eskir. Öneri: teslimden önce commit, sonra QA'nın taze koşusu ve rapora commit karması.
- AppSec S-33 (`SavedTab.tsx:386` `referrerPolicy`) düzeltmesi `SavedTab.tsx` değişikliği olabilir; düzeltme sonrası AC-S7 ve AppSec doğrulaması kayıtlı değil.
- AC-C31 kanıtı (`git diff --stat c0c2411~1 HEAD -- <6 dosya>` boş) commit `c0c2411~1` tabanına göre; QA'ya göre geçerli. Bu çalışmada tekrar çalıştırmadım.

### 1.4 Sapma kayıtları (spec değişmedi, yan belge)

`docs/specs/SPEC-001-sapma-kaydi.md` (untracked, commit edilmemiş):
1. AC-C29 gevşetildi (sayı ya da sunucu kod dizesi); karar "ana oturum, CEO yetki devri 2026-11-11". Imzalı spec metni değişmedi. Bu devrin CEO'nun kendi iletisi olduğunu kalite ofisi doğrulayamıyor; CEO teyidi gerekir (imza kaydı "yalnız CEO imzalar" kuralı).
2. D-1: `npm audit` bulgusu risk kabulü, aynı yetki devri. Aynı teyit gerekir.
Her iki kayıt untracked; commit edilmeden kanıt zincirinde yoktur.

### 1.5 SPEC-002 izlenebilirliği

SPEC-002 kriterleri CB-1..CB-3, PB-1..PB-7. Kaynak: `docs/raporlar/SPEC-002-uygulama-notu.md` ve spec iz tablosu (satır 163-177).

| Kriter | Test/Komut | Kanıt | Durum |
|---|---|---|---|
| CB-1 (pip-audit temiz) | spec §4 komutları | Uygulama notu: 49.0.0'da PYSEC-2026-3552 açıktı (düzeltme 50.0.0), CB-1 kırmızı. Şimdi `requirements.txt` `cryptography==50.0.2`; AppSec durak B: `pip-audit: temiz`. Kalite ofisi komutu koşmadı (ağ yok). | MET kısmen: kanıt AppSec raporu, taze komut çıktısı yok |
| CB-2 (instagrapi kalktı) | `pip show`, grep | Uygulama notu: `Package(s) not found`, greplar boş. `requirements.txt` incelemesi: instagrapi satırı yok (benim kontrolüm). | MET |
| CB-3 (CI üç iş yeşil) | CI run bağlantısı | Kanıt yok. Taban run 42491093608 (backend kırmızı). Yeni run bağlantısı kayıtlı değil. | UNPROVEN |
| PB-1 a,b,c1,d | `test_security_compat.py`, `test_security.py` | Uygulama notu: 467 passed, 2 skipped (eski ve yeni imaj aynı) | PASSED* (cryptography 49 → 50.0.2 sonrası ayrı koşu: bilinmiyor) |
| PB-1 c2 | iki imaj, `--network none` | Not: yeni imajda üretilen token eski imajda çözüldü (cryptography 42.0.7). 49.0.0 ile; 50.0.2 ile tekrar kanıt yok | UNPROVEN (50.0.2 için) |
| PB-2 | `scripts/test.sh backend` | Not: 467 → 467 passed. QA taze koşusu: 600 passed, 2 skipped (SPEC-001 testleri dahil, kirli ağaç) | PASSED* |
| PB-3 | `scripts/migrate-check.sh` | Not ve QA: `up/down/up TAMAM` | PASSED* |
| PB-4, PB-5, PB-6 | `test_upload_contract.py`, `test_http_contract.py`, `test_settings_env.py` | Uygulama notu kapsamında; ayrı satır kanıtı yok, 467 toplamına dahil | PASSED* (dosya düzeyi; satır kanıtı yok) |
| PB-7 a,b,c | elle duman testi, gerçek DB | **Koşulmadı** (yığın Exited(255)); taban/son alınamadı | UNPROVEN |

SPEC-002 kopuk halkalar: (a) `cryptography` 49.0.0'dan 50.0.2'ye karar (spec kuralı "major'da kal" ile çelişiyor; CEO kararı not edilmiş mi, kayıt bulunamadı) ve commit `a3ad43a` (`kombu==5.6.2`, `packaging==26.3`) spec kapsamının dışında yeni pin; ikisi için spec güncellemesi/sapma kaydı yok. (b) `pydantic` 2.7.1 değişmedi (uygulama notundaki "2.7.1" ile spec §2.1 "2.7.1" tutarlı). (c) `ci.yml` CB-1 e (CI adım sırası) değişikliğinin diff kanıtı bu çalışmada bakılmadı: UNPROVEN.

---

## Bölüm 2. Uyum listesi (CMP)

Etiketler: `MET (kanıt)` / `NOT MET` / `LAVYER GEREKİR` (LAWYER REQUIRED) / `NOT APPLICABLE (neden)`.

### 2.1 Kişisel veri (KVKK / GDPR)

Kaynak veri tablosu: spec §7.2 (tablolar), REQ-29, REQ-30, REQ-33, §7.3, §7.4, §11, AC-C20.

| Madde | Bulgu | Durum |
|---|---|---|
| DM içeriği | Kaydedilenler işi DM içeriği işlemez ve saklamaz. Spike'ta DM kutusu **meta verisi** (kimlikler, zaman damgası, okundu bilgisi; mesaj metni yok) gözlendi; kod önlemi: `NEVER` deseni (`save\|collection\|mailbox\|iris\|slide`) ve gövde bekçisi `content.js:54-66`, `listener.js:26` (AC-C55, AC-C54). AppSec durak B kodda kapandığını doğruladı; QA bu AC'leri PASSED*. Ek A (DM silme) imza dışı; kod yok. | MET (AC-C55, QA §3, AppSec durak B) |
| DM meta verisinin ajan oturum kaydına düşmesi (S-30) | T-0a sırasında DM kutusu meta yanıtı, geliştirici ajan oturum günlüğüne (`~/.claude/projects/...jsonl`, satır 356) yazıldı. Üçüncü kişi kimlikleri ve okundu bilgisi içeriyor. Silme kalıcı silmedir, CEO onayı ister. Spec §14.3 "imzayı engellemez" diyor; kararın verildiğine dair kayıt bulunamadı. Bu uygulamanın değil geliştirme sürecinin verisidir; hukuki nitelendirme (üçüncü kişi verisi, işleme dayanağı) avukat konusudur. | **NOT MET** (silme kararı bekliyor) + **LAVYER GEREKİR** (değerlendirme) |
| Kaydedilen gönderi meta verisi | `saved_targets` (REQ-33): gönderi kimliği, kısa kod, **sahibinin kullanıcı adı**, tür, reklam bayrağı, küçük resim adresi, koleksiyon kimlikleri, sıra. Açıklama ve yorum saklanmaz (AC-S2 testi, QA PASSED*). Sahibin kullanıcı adı üçüncü kişiye ait kişisel veri olarak işlenir; amaç: kullanıcının kendi kaydedilenlerini temizlemesi. Hukuki dayanak ve veri minimizasyonunun yeterliliği avukat konusu. | **LAVYER GEREKİR** |
| Koleksiyon adları ve kimlikleri (W modu) | Kullanıcının kendi koleksiyon adları saklanır, yalnız arayüzde gösterilir, kayda yazılmaz (REQ-29 istisnası, §11); purge kapsamında (AC-C20). Paylaşılan koleksiyonlarda başkalarının verisine dokunma riski: F modunda kesin, W modunda kullanıcı beyanına dayanır (AC-S22, U28). | **LAVYER GEREKİR** (paylaşılan koleksiyonda üçüncü kişi etkisi; W modu beyanın yeterliliği) |
| Saklama süresi | `saved_targets` yalnız güncel envanterde tutulur; yeni tarama bitince eski taramanın satırları silinir (AC-C22). Taslaklar `expired`/`cancelled` +1 gün sonra silinir; parti 7 gün ilerlemezse `expired`; tür başına son 20 tarama dışındakiler silinir (§7.4, AC-C23, C32, C44; `cleanup_retention` günlük). **`action_log` satırları ve tamamlanmış parti öğeleri kendiliğinden silinmez** (§7.3, `bridge_actions.py:191-192`); yalnız purge siler. Kullanıcı adı `action_log`'a yazılmıyor (REQ-30; AC-C17 etiket/ref/kullanıcı adı yok); ancak `cleanup_items` içinde gönderi kimliği kalıcı. Süreye hukuki gerekçe yazılmamış. | Teknik uygulama MET (AC-C22, C23, C32, C44, QA PASSED*). Sürenin yeterliliği **LAVYER GEREKİR** (süresiz tutulan `action_log` ve öğe satırları) |
| Silme yolu | `DELETE /sessions/{id}/purge`: `cleanup_scans`, `saved_targets`, `cleanup_batches`, `cleanup_items`, `saved_collections` sayılıp sıfırlanır (AC-C20, `test_cleanup_schema.py:307`). | MET (AC-C20, QA §3 PASSED*; bozarak denenmedi) |
| Üçüncü tarafa aktarım | Veri Instagram'a (kullanıcının kendi oturumuyla, kendi tarayıcısında) unsave isteği olarak gider; uygulama sunucusu dışarı veri göndermez, portlar 127.0.0.1. Küçük resimler Meta CDN'inden yüklenir (AppSec S-33: `referrerPolicy` yok, uygulama kökeni CDN'e gidiyor). Düzeltme önerildi; uygulandığına dair kanıt yok. | Aktarım yok (spec §11 "yeni üçüncü taraf bağımlılık yok"). S-33: **NOT MET** (açık LOW bulgu) |
| Aydınlatma metni gerekliliği | Self-hosted, yerel, kişisel kullanım (CK-1). Dağıtım yalnız yerel; üçüncü kişi (gönderi sahibi) kullanıcı adı işleniyor. Aydınlatma yükümlülüğünün doğup doğmadığı (kişisel kullanım istisnası, veri sorumlusu kimliği) avukat konusu. Kullanıcıya gösterilen risk metni §4.3 açma diyaloğundadır. | **LAVYER GEREKİR** |
| Özel alan | Kimlik, sağlık, ödeme, konum, çocuk verisi: spec veri tablosunda yok. Ancak kullanıcı adları (kimlik) ve ileride koleksiyon adları serbest metin; içeriği kontrol edilemez. | LAVYER GEREKİR (koleksiyon adı serbest metin, içerik sınıflandırılamaz) |
| `docs/09-guvenlik-ve-gizlilik.md` güncellemesi | `a2e859e` commit'i güncelledi (yazma işi, ayar dosyası, S-30 yöntem kuralı satır 103-105). | MET (commit a2e859e) |

### 2.2 Bağımlılık lisansları

Yöntem: frontend için yüklü `node_modules/<paket>/package.json` `license` alanı (yerel kurulum 246 paket, `package-lock.json` içindeki tüm girdiler okundu) ve `npm audit --offline`. Backend için `pip list` yalnız `cryptography 50.0.2` döndürdü; diğer Python paketleri bu makinede kurulu değil ve ağ erişimim yok; **backend lisansları kayıt defterinden okunamadı: "doğrulanmadı"**. Tahmin yazmıyorum.

**Yeni paket kontrolü:**
- SPEC-001 başlangıcından (`c0c2411~1`) HEAD'e `frontend/package.json` ve `package-lock.json` farkı: **boş**. Frontend'e yeni paket girmedi. Spec §11 "yeni üçüncü taraf bağımlılık yok" ile uyumlu: MET (git diff).
- Backend: SPEC-002 ile `requirements.txt` değişti: `fastapi` 0.111.0→0.133.0, `starlette` 1.10.0 (yeni açık pin), `cryptography` 42.0.7→50.0.2, `python-dotenv` 1.0.1→1.2.4, `python-multipart` 0.0.9→0.0.33, `instagrapi` kaldırıldı, `packaging==26.3` ve `kombu==5.6.2` yeni pin; yeni geçişli: `annotated-doc`, `typing-inspection`, `anyio` (uygulama notu). Sürüm sayıları değişti, yeni doğrudan bağımlılık yalnız `packaging` ve `starlette` (zaten geçişliydi) ve `kombu` (zaten geçişliydi). SPEC-001 kodu backend'e paket eklemedi.

**Frontend lisans dağılımı (yerel okuma, 246 paket):** MIT 260 (lock girdisi sayımı), ISC 31, Apache-2.0 7, BSD-3-Clause 5, BSD-2-Clause 2, MIT-0 2, OFL-1.1 1, CC-BY-4.0 1, CC0-1.0 1, BlueOak-1.0.0 1, `MIT AND ISC` 1. GPL, AGPL, SSPL, lisanssız ya da UNLICENSED paket **yok** (tarama deseni boş döndü).
Doğrudan bağımlılıklar: `@fontsource-variable/instrument-sans` OFL-1.1; `@zip.js/zip.js` BSD-3-Clause; `typescript` Apache-2.0; `axios`, `react`, `react-dom`, `react-force-graph-2d`, `react-router-dom`, `recharts`, `zod`, `zustand`, `@testing-library/*`, `@vitejs/plugin-react`, `autoprefixer`, `jsdom`, `postcss`, `tailwindcss`, `vite`, `vitest`: MIT; `lucide-react`: ISC.

| Madde | Durum |
|---|---|
| Frontend: GPL/AGPL/SSPL ya da lisanssız paket | MET (yerel `package.json` okuması, taranan desen boş) |
| Frontend: OFL-1.1 (yazı tipi), CC-BY-4.0 (bir geçişli paket, adı ayıklanmadı) atıf/lisans metni yükümlülükleri | **LAVYER GEREKİR** (dağıtım yerel olduğundan yükümlülük doğup doğmadığı; yorum avukatın) |
| Backend lisansları (fastapi, starlette, celery, kombu, flower, playwright, Pillow, psycopg2-binary, cryptography ve diğerleri) | **NOT VERIFIED**: registry çıktısı yok. Yapılacak: ağı olan bir makinede `pip-licenses` ya da registry sorgusu. Özellikle `psycopg2-binary`, `playwright`, `Pillow`, `cryptography` (çok lisanslı olabilir), `flower` gözden geçirilmeli; hangi lisans olduğunu yazmıyorum |
| Backend: `Pillow>=10.0.0` sabit değil | Tekrarlanabilirlik/tedarik zinciri riski (SPEC-002 §10 kapsamı dışı bırakmış); lisans açısından sürüm kayması riski. Bilgi |
| Güvenlik açığı: backend `pip-audit` | MET kısmen: AppSec durak B "temiz"; kalite ofisi koşmadı |
| Güvenlik açığı: frontend `npm audit` | **NOT MET** (açık, risk kabulü): `npm audit --offline` bu makinede "found 0 vulnerabilities" döndü, ancak çevrimdışı mod önbelleksiz sonuç verir, güvenilmez. AppSec durak B (çevrimiçi): 2 critical (vitest 2.1.9, tinypool 1.1.1, geliştirme bağımlılığı), 1 high (vite 5.4.21), 5 moderate; `--omit=dev` ile 2 moderate (react-router 6.30.6 açık yönlendirme). D-1 risk kabulü sapma kaydında; CEO teyidi gerekli (1.4). react-router moderate bulgusu üretim paketindedir; yeni SPEC önerilir |
| Eklenti (MV3) üçüncü taraf kütüphane | `frontend/extension/` düz JS dosyaları, paket yöneticisi yok; gömülü üçüncü taraf kod taranmadı: UNPROVEN |

### 2.3 Instagram kullanım koşulları riski

Hukuki görüş vermiyorum. Teknik/ürün olguları ve avukat gerektiren noktalar:

| Madde | Olgu | Durum |
|---|---|---|
| Otomatik işlem | Uygulama kaydedilenleri toplu çıkarmak için Instagram'ın iç GraphQL isteğini (`doc_id`) kullanıcının açık oturumunda, eklenti aracılığıyla, insan hızında gönderir. Imzalı spec risk 2: "otomatik işlem yasak; kısıtlama/kapatma riski kullanıcıdadır; garanti yok". Açma diyaloğunda yazılı (§4.3), onay kutusu zorunlu (AC-C3, QA PASSED*; U1 jsdom). | Risk uyarısı MET (AC-C3). Koşulların bu davranışla ilişkisi **LAVYER GEREKİR** |
| Belgelenmemiş iç arayüz | `doc_id` Instagram sürümüyle değişebilir (risk 6); değişince iş durur (AC-C57). Resmi API değil; kullanım izni ya da kabul edilebilirlik avukat konusu. | **LAVYER GEREKİR** |
| Üçüncü kişi verisi (paylaşılan koleksiyon) | W modunda koruması kaldırılan koleksiyon başkalarıyla paylaşılıyorsa onlar da etkilenebilir; kilit yok, kullanıcı beyanına dayanır (risk 8). | **LAVYER GEREKİR** |
| Kısıtlama/engel davranışı | Engel sinyalinde profilin tüm yazmaları 24 sa durur (REQ-12, AC-C13); 429'da durur ama zorunlu bekleme yok, art arda 429 riski artırır (risk 4). | Teknik önlem MET (AC-C13, C46). Yeterliliği: kullanıcı riski, avukat |
| Spike'ın gerçek (CEO) hesabıyla yapılması | CK-1 "test hesabı" şartından CEO onayıyla sapıldı (K-13); T-13b K-19'a göre. | Karar kayıtlı (K-13, K-19). Hesabın koşullara aykırılık riskinin değerlendirmesi **LAVYER GEREKİR** |
| Eklenti metni | `manifest.json` açıklaması (2.9.0) "Takipten çıkma ve kaydedilenleri temizleme işleri yalnız siz başlatınca... yapılır" diyor; spec §11 güncelleme maddesi karşılanmış görünüyor (kalite ofisi okudu). CLAUDE.md'deki bilinen tuzak (IA D-01: "hiçbir istek göndermez" ifadesi) eklenti **açıklamasında** düzeltilmiş; `popup.html` ve mağaza listesi metni kontrol edilmedi. | MET (manifest.json:6); popup/mağaza metni UNPROVEN |
| Mağaza kuralları (Chrome Web Store) | Eklenti yayını CEO onayına tabi (CLAUDE.md). Chrome Web Store kullanıcı verisi ve kabul edilebilir kullanım politikaları: kaynak getirilmedi, doğrulanmadı. | NOT VERIFIED (kaynak yok; Scout/Product getirmeli). Yayın kararı öncesi **LAVYER GEREKİR** |

### 2.4 Güvenlik ve erişilebilirlik referansı

| Madde | Durum |
|---|---|
| AppSec durak B (kod) | PASS (CRITICAL 0, HIGH 0, MEDIUM 1 = D-1, LOW 1 = S-33, INFO 3). `docs/raporlar/SPEC-001-appsec-durak-b.md`. Not: raporu AppSec değil ana oturum yazmış ("AppSec'in yazma aracı yok"); içerik AppSec'ten aktarılmış. Bağımsızlık zinciri tek halkalı. MET, not düşülmüş |
| S-33 (`referrerPolicy`) | NOT MET (açık, düzeltme + test önerilmiş) |
| axe erişilebilirlik sonucu | Kanıt yok. UNPROVEN |
| Mobil mağaza kuralları (App Store/Play) | NOT APPLICABLE (mobil iş yok) |

### 2.5 Sonuç satırı

**OPEN ITEMS (14)**

Açık kalemler (NOT MET, LAVYER GEREKİR, NOT VERIFIED/UNPROVEN dahil):
1. S-30: DM meta verisinin ajan oturum günlüğünden silinmesi: karar yok (NOT MET). CEO onayı gerekir.
2. S-33 `referrerPolicy` düzeltmesi yok (NOT MET).
3. D-1 `npm audit` (2 critical dev, 1 high, react-router moderate üretimde): risk kabulü CEO teyidi bekliyor; yeni SPEC.
4. Gönderi sahibi kullanıcı adı (üçüncü kişi): hukuki dayanak/minimizasyon: LAVYER GEREKİR.
5. Paylaşılan koleksiyon / W modu üçüncü kişi etkisi: LAVYER GEREKİR.
6. `action_log` ve tamamlanmış öğe satırlarının süresiz saklanması (saklama süresi): LAVYER GEREKİR.
7. Aydınlatma metni gerekliliği: LAVYER GEREKİR.
8. Instagram Kullanım Koşulları, belgelenmemiş iç arayüz, otomatik işlem, spike'ın gerçek hesapla yapılması: LAVYER GEREKİR.
9. OFL-1.1 ve CC-BY-4.0 atıf yükümlülüğü: LAVYER GEREKİR.
10. Backend lisansları doğrulanmadı (NOT VERIFIED).
11. Sapma kayıtlarında (AC-C29 gevşetme, D-1) "CEO yetki devri" teyidi; kayıtlar untracked.
12. Canlı doğrulama (FB-1, T-13b), UI ekran görüntüsü, axe: UNPROVEN.
13. SPEC-002: CB-3 (CI yeşil run), PB-7, PB-1 c2 (50.0.2 ile) UNPROVEN; cryptography 50.0.2 ve kombu/packaging pin için spec sapma kaydı yok.
14. QA kanıtı kirli ağaçta; commit karması ve taze koşu yok (stale riski); tam frontend suite 592/593 (flaky B-1), Node 22'de tekrar koşulmadı.

Teslimi durdurmuyorum; açık maddeler CEO'ya bildirilir. `COMPLIANCE READY` değildir.
