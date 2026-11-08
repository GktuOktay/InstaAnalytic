# SPEC-001 · Spec eleştirisi R7 (v1.6 ikinci tur, kısa doğrulama, spec-critic, 2026-11-08)

> Bu dosyayı main session yazdı; içerik spec-critic raporundan alındı (yazma aracı yok).

**Özet:** R6'nın H-1..H-3, M-1..M-9, L-1 ve L-3..L-13 bulguları kapandı. L-2'nin bilinçli olarak uygulanmaması kabul edilebilir. Yeni Critical ya da High bulgu yok. Yeni bulgular: 6 Medium (M6 doğrulanmadı) ve 7 Low. İmzaya hazır: **hayır**. Gerekçe: CK-23 açık; R7-M1 ve R7-M2 imzadan önce düzeltilmeli.

| # | Önem | Yer | Bulgu | Öneri |
|---|---|---|---|---|
| R7-M1 | Medium | AC-S21 SQL | SQL ifadesi `collections_unreadable` kısmını içermiyor; `collection_ids` null olunca ifade NULL döner, "seçilebilir" sorgusu ile `state` farklı sayı üretir. | `collections_unreadable OR (coalesce(jsonb_array_length(collection_ids),0) > 0 AND NOT (collection_ids <@ CAST(:allow AS jsonb)))`; null ve okunamayan satırlar için iki sorguyla sınama. |
| R7-M2 | Medium | §7.2 `last_stop_reason varchar(20)` | `mutation_unrecognised` 21 karakter; yazma başarısız olur, AC-C57'nin güvencesi devre dışı kalır. | `varchar(30)`; her durdurma kodunun ilgili kolona sığdığını sınayan bir test; kod kolonlarını gözden geçir. |
| R7-M3 | Medium | AC-S22 `is_new`, `in_last_scan`, `mode`, `scan_id` | "Güncel tarama" tanımsız; başarısız bir tarama da koleksiyon tablosunu güncelliyor. | Hepsini "güncel envanter taraması" (§7.1) üzerinden tanımla; başarısız taramanın koleksiyon güncellemesinin kalıcı olduğunu yaz. |
| R7-M4 | Medium | AC-C55 bekçisi; imza riski 11 | Bekçi, gönderi verisiyle aynı bloktaysa bütün gömülü bloğu düşürebilir; "etkilenmez" iddiasının kanıtı yok. | FB-1'de sayı ölçümü; riski yumuşat; gerekirse alt-blok düzeyinde bekçi. |
| R7-M5 | Medium | §6.4 sayım; REQ-15 | POST gitmiş ama `failed` dönen yazmalar bütçeye sayılmıyor; sert tavanlar gerçek yazma sayısında aşılabilir. | Bütçe, yazma yapılmış her izni saysın; AC-C26/C42'ye sınama. |
| R7-M6 | Medium (doğrulanmadı) | §7.2.1 `pk` | `pk` JSON sayısı gelirse 2^53 üstünde yuvarlanır. | `typeof pk === 'string'` kuralı; 19 haneli fixture. |
| R7-L1 | Low | AC-C52 `already_streak` metni | Gönderiler Instagram'da elle çıkarıldıysa yönlendirme döngüye giriyor. | Kalanları iptal et + yeniden tara + yeniden önizle yönlendirmesi. |
| R7-L2 | Low | §6.6 precheck tablosu | 422 durumu yok. | 422 → `failed` + `precheck_unavailable`. |
| R7-L3 | Low | §7.9.5 `in_collection` | Aynı metin farklı nedenlere kullanılıyor. | Metni genelleştir ya da ikinci kod ekle. |
| R7-L4 | Low | §9 AC-S21 | Eklenti tarafı testi adlandırılmamış. | Ortak JSON fixture ile TS testi. |
| R7-L5 | Low | §4.6 not | Çalışan işe etki ifadesi yanlış. | "Korumaya alma sıradaki gönderiden; korumayı kaldırma sonraki önizlemeden itibaren geçerli." |
| R7-L6 | Low | §6.10 L-2 gerekçesi | İki madde yer değiştirmiş gibi okunuyor. | İfadeyi düzelt. |
| R7-L7 | Low | §14.4, §14.5, §4.2 | T-0c öncesinden kalma eski ifadeler. | Güncelle. |

**Main session notu (R7-M6):** Spike'ta listeleme yanıtında `items[].media.pk` tipi **string** olarak ölçüldü (`typeof` = "string"). Kural yine de yazılmalı.
