# SPEC-001 · Spec eleştirisi R6 (v1.6, yalnız Faz 0+1, spec-critic, 2026-11-08)

> Bu dosyayı main session yazdı. Spec-critic'in yazma aracı yoktu; içerik onun raporundan aynen alındı.

**Özet:** v1.6 imzaya hazır değil. Critical bulgu yok, ama 3 High bulgu var:
- H-1: v1.5'ten kalan F-only cümleler W kuralıyla çelişiyor.
- H-2: geçersiz ya da fazla koleksiyon kimliğinde fail-open yolu var.
- H-3: F modunda sunucunun kilit altında yeniden denetimi yapılıyor mu, belirsiz.

Ayrıca 4 Tür 1 madde CEO'ya sorulmalı: CK-22, Y-1, Y-2, Y-3.

Kontrol edilenler ve temiz çıkanlar:
- §12.3 aritmetiği tutuyor: F modu 29,1 g, W modu 33,3 g, aşım %111. Yük 11,0 / 8,75 g (W'de 12,5 / 10,75 g), takvim ≈ 15 g / ≈ 17 g, AC sayısı 117.
- `listener.js` `NEVER` genişletmesi mevcut `extension.test.ts` sorgu adlarıyla çakışmıyor.

| # | Önem | Bölüm | Bulgu | Etki | Öneri | Tür |
|---|---|---|---|---|---|---|
| H-1 | High | AC-C39; §4.4; §7.2 `saved_targets.collection_ids`; AC-S3 adım 2; §6.6 döngü adım 2; AC-S5 | Bu cümleler F'nin kuralını ("koleksiyondaki her gönderi korunur") iki mod için de bağlayıcı olarak yazıyor. W'de ise korumasız koleksiyondaki gönderi seçilebilir (§4.2, AC-S21 `[B]`). | Bağlayıcı AC'ler kendi aralarında çelişiyor. | Hepsini "koruma kuralına (§6.10, AC-S21) göre korunan" diye değiştir; "koleksiyondaki" sözcüğünü yalnız F bağlamında bırak. | düzeltilebilir |
| H-2 | High | AC-S18; §7.2.1 eşleme; AC-S23; AC-C52 | Dizi var ama öğeleri desene uymuyorsa ne olacağı yazılmamış. "Geçerli olanları al" kuralı diziyi `[]`'e indirirse gönderi korunmaz, yani F'de bile fail-open olur. 20'den fazla kimlikte kesme kuralı da belirsiz. | K-14 ihlali: koleksiyondaki bir gönderi çıkarılabilir. | Boş olmayan dizide tek bir geçersiz öğe ya da 20'den fazla öğe varsa gönderi korunur; eklenti diziyi süzmeden `protected` bildirir. AC-S21 ve AC-S16'ya sınamalar ekle. | düzeltilebilir |
| H-3 | High | §5.5 AC-S23; T-4c [W]; §14.5; REQ-37 | F derlemesinde `precheck` `collection_ids` alıp kuralı yeniden uyguluyor mu? Görev listesine göre hayır, AC eşlemesine göre evet. | Ya F tahmini eksik ya da "son söz sunucuda" güvencesi boş. | Sunucudaki yeniden denetim F'de de zorunlu olsun; çekirdek T-4c'ye taşınsın ve F tahmini buna göre güncellensin. | düzeltilebilir |
| M-1 | Medium | §7.2 `collections_mode`, `saved_collections`; T-1 [W]; §7.5; §7.8; AC-S20 | F derlemesinin şeması ve uçları belirsiz; mod bilgisinin nerede tutulduğu belli değil. | Aynı revizyon farklı şema üretebilir; mod uyuşmazlığı tanımsız. | F derlemesinin şemasını ve uçlarını tek tabloyla yaz; mod tek kaynaktan (`scan/start` yanıtı) gelsin. | düzeltilebilir |
| M-2 | Medium | §6.10; AC-S23; AC-C22 | `stopped` bir W partisi varken yeniden tarama yapılırsa `next` W, `precheck` F uygular. | Sessiz "korundu" sonuçları. | `next` ve `precheck` aynı mod fonksiyonunu kullansın; uyarı göster ya da engelle. | düzeltilebilir |
| M-3 | Medium | AC-S21 `known_ids`; §6.10 | `known_ids` tanımsız. | Fail-closed ilkesi delinebilir. | `known_ids` = güncel taramada görülen kimlikler; görülmeyenler "bilinmiyor → korunur". | düzeltilebilir |
| M-4 | Medium | AC-C55; §8; `listener.js:26`, `:65` | `get_slide_mailbox_for_iris_subscription` büyük olasılıkla bir sorgu adı değil, yanıttaki kök alan. `NEVER`'a sözcük eklemek yalnız sorgu adında işe yarar. | Hafifletme etkisiz kalabilir. | `emit` öncesine bir gövde kalıbı denetimi ekle ya da sorgu adını kaydet; AC'yi kesinleştir. | düzeltilebilir |
| M-5 | Medium | AC-C54; §7.2.1; `content.js:280-287` | `csrftoken` sınırı, listeleme ve doğrulama okumalarındaki mevcut kullanımla çelişiyor. | Test ya kırmızı kalır ya da gevşek yazılır. | `fb_dtsg`/`lsd`/`jazoest` yalnız `graphqlUnsave` ve `graphqlCollections` içinde okunur; `csrftoken` ve claim yalnız `www.instagram.com` kökenli dört isteğe gider. | düzeltilebilir |
| M-6 | Medium | §7.9.4 B satır 4; `content.js:314` | `doc_id` değişince gelen genel bir "try again later" metni `blocked` sayılabilir. | Gerçek bir engel olmadan hesap 24 saat durur. | B tablosundaki engel desenlerini dar tut; genel metin `mutation_unrecognised` ya da yeniden denenebilir sınıfa gitsin. | düzeltilebilir |
| M-7 | Medium | AC-S3 adım 4; §7.9.4 B | Doğrulama okuması 429, 401 ya da 404 dönerse ne olacağı yazılmamış. | 429'dan sonra ek istekler gider. | 429 → `rate_limited`, 401 → `login_required`, 404/410 → `not_found`; satır 6'da doğrulama yoksa `mutation_unrecognised`. | düzeltilebilir |
| M-8 | Medium | AC-S18; AC-U3 | Boş ilk sayfa `unrecognised_shape` hatasına düşüyor. | "Envanter boş" durumu hiç oluşamaz. | Kural yalnız `items.length > 0` olan sayfaya uygulansın. | düzeltilebilir |
| M-9 | Medium | AC-C52; §14.5 | `has_viewer_saved` yalnız gönderi bilgisi ucundan kalkarsa her öğe `already` olur. | Sessiz ve yanıltıcı başarı. | Ardışık 5 `already` → `unrecognised_shape`; okuma yanıtında `items[0].pk === ref` denetimi. | düzeltilebilir |
| M-10 | Medium | §6.10; §4.6; §8; §4.2 | Kaldırılan koruma süresiz geçerli; önizleme gönderinin koleksiyonunu göstermiyor. | K-14 artık riski büyür. | CEO'ya sor (Y-1). | Tür 1 (Y-1) |
| M-11 | Medium | §4.3 W varyantı; §4.6 diyalog; K-18 | W metinleri onaysız ve doğrulanmamış bir davranışı kesin bilgi gibi veriyor. | Yanlış bilgi. | CEO'ya sor (Y-2); metni yumuşat. | Tür 1 (Y-2) |
| M-12 | Medium | §12.1 T-0c; v1.5 imza kaydı | İmza kapsamındaki bir Faz 0 görevi imzadan önce yürütülmek isteniyor. | Süreç çelişkisi. | CEO'ya sor (Y-3). | Tür 1 (Y-3) |
| L-1 | Low | AC-S20 | 422 ile reddedilen çağrının tek seferlik hakkı harcayıp harcamadığı belirsiz. | Akış belirsiz. | Hakkı yalnız 2xx yanıt harcasın; 409 alınırsa F ile devam. | düzeltilebilir |
| L-2 | Low | §7.6 | Önizlemeden sonra koruma ayarı değişirse onay yine de geçiyor. | Sayı ile sonuç tutarsız görünür. | Sürüm sayacı; değiştiyse 409 `plan_changed`. | düzeltilebilir |
| L-3 | Low | AC-C20; §7.2 | `saved_collections` purge kapsamında değil. | Koleksiyon adları purge sonrası kalabilir. | AC-C20'yi genişlet. | düzeltilebilir |
| L-4 | Low | AC-C2; §7.5 | Yeni üç uç AC-C2'de yok. | Kapalı özellik davranışı sınanmaz. | AC-C2'ye ekle. | düzeltilebilir |
| L-5 | Low | AC-C31; §9 | §9 satırında `extension.test.ts` eksik. | Regresyon kanıtı izlenmez. | Ekle. | düzeltilebilir |
| L-6 | Low | AC-C55; §7.9.4 B | Yanıtın nasıl okunacağı AC ile sınıflama arasında çelişiyor. | Test belirsiz. | "Gövde yalnız eklentide yerel taranır, hiçbir değer iletilmez." | düzeltilebilir |
| L-7 | Low | §4.2; §7.8; §4.6 | Bilinmeyen koleksiyonun rozeti yok; aynı adlı koleksiyonlar ayırt edilemiyor. | Yanlış koleksiyonun koruması kaldırılabilir. | Metin ekle ve ayırt edici bilgi göster. | düzeltilebilir |
| L-8 | Low | §7.8 `first_seen_at`; §7.2 | Tabloda bu alan yok. | "Yeni" rozeti çizilemez. | Yanıta `is_new` ekle. | düzeltilebilir |
| L-9 | Low | §7.2; §6.10 | "Satır başına 200" ifadesi yanlış; aşım kuralı yok. | Tutarsız sınır. | "Profil başına 200" ve aşım kuralı. | düzeltilebilir |
| L-10 | Low | AC-C47 | `PUT saved/collections` kilit listesinde yok. | Yarış durumu. | PUT profil kilidini alsın. | düzeltilebilir |
| L-11 | Low | §7.9.5 `ack_required` | Metin, korumayı kaldırma bağlamında yanlış. | Yanlış ileti. | İki anahtar ya da genel metin. | düzeltilebilir |
| L-12 | Low | §4.2 | `mutation_unrecognised` ile duran partide Başlat'a basılınca bozuk `doc_id` ile yine POST gidiyor. | Gereksiz yazma denemeleri. | `ext_version` artana kadar `start` 409 dönsün. | düzeltilebilir |
| L-13 | Low | AC-C53; §6.8 | `protected` sonucunun okuma bütçesine sayılıp sayılmadığı iki yerde farklı. | Bütçe belirsiz. | Tek tanım yaz. | düzeltilebilir |

**İmza önerisi:** H-1..H-3 ve M-1..M-9 BA tarafından işlenmeli; Y-1..Y-3 ile CK-22 cevaplanmalı.

**Main session notu (Y-3):** T-0c, K-20'nin yazmasız yolu ile 2026-11-08'de yapıldı. Hesapta yazma işlemi olmadı; sonuç spike raporunda (W modu uygulanabilir). Yazmalı yedek yola gerek kalmadı. Y-3, CEO'ya bilgi olarak sunuldu.
