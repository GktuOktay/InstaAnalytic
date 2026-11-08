# SPEC-001 · Spec eleştirisi R2 (v1.1, spec-critic, 2026-11-08)

Karar: **İmzaya hazır değil.** Critical 0 · High 2 · Medium 11 · Low 10. R1'in 29 bulgusu: 20 kapandı, 6 kısmen, 3 CEO'ya (CK-8/9/10), açık yok.

High (ikisi de CK-8 kendiliğinden devam mekanizmasında):
- Y1: "limit ile durdu" ile "onaylı, hiç başlatılmadı" sunucuda ayırt edilemiyor → açık Başlat olmadan yıkıcı iş başlayabilir. Öneri: `started_at`, `last_stop_reason`, onayda `auto_continue=false`.
- Y2: "Durdur" sunucuya ulaşmıyor; bekleme sırasında durdurulamıyor → kullanıcı durdurduktan sonra silme sürebilir. Öneri: `POST /batches/{id}/stop`.

Medium: Y3 hesap toplam tavanı takip kuyruğunu ve Celery yolunu kapsamıyor (en kötü 95/sa, 460/gün; CK-11 metni düzelmeli); Y4 `paused_reason` "Köprü:" önekiyle engel erkenden kalkabilir; Y5 lease/bilet yaşam döngüsü; Y6 R6 ↔ 422 şema reddi; Y7 next/scan/result için eklenti eşleme tablosu; Y8 hata zarfı biçimi; Y9 kod listeleri tutarsız; Y10 AC-C31 ↔ AC-C11 aynı test dosyası; Y11 Faz 1 AC alt kümeleri; Y12 eksik ekran durumları, `next_allowed_at`; Y13 sayfa doğrulama ayrıntısı.

Low: Y14 takılı tarama ekranı; Y15 saklama boşlukları; Y16 kalıcı hata kodları; Y17 devre kesici sayaç sıfırlama; Y18 semver karşılaştırma; Y19 durum değiştiren GET'ler; Y20 onaylanmamış partiye `next`; Y21 iptal sonrası gecikme; Y22 T-13a/T-9 dosya çakışması; Y23 anlık görüntü zamanı.
