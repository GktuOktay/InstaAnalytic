# Instapp — Geliştirme Fazları

**Versiyon:** 1.0  
**Tarih:** 2026-09-06

---

## Faz 1 — Altyapı İskeleti

**Hedef:** Tüm servisler ayağa kalksın, birbirleriyle konuşsun.

**Görevler:**
- [ ] Proje klasör yapısı oluştur
- [ ] `docker-compose.yml` yaz (postgres, redis, backend, frontend, worker, flower)
- [ ] Backend: FastAPI boilerplate, sağlık endpoint'i (`GET /health`)
- [ ] Backend: SQLAlchemy async engine + Alembic kurulumu
- [ ] DB: Tüm tabloları oluştur (migration)
- [ ] Frontend: Vite + React + TypeScript + Tailwind kurulumu
- [ ] Frontend: Axios client, temel layout
- [ ] Celery: Worker + Redis broker bağlantısı test
- [ ] `.env.example` dosyası

**Tamamlanma kriteri:** `docker compose up` ile tüm servisler yeşil. `GET /health` 200 döner.

---

## Faz 2 — Session Yönetimi

**Hedef:** Kullanıcı Instagram session ekleyebilsin, backend doğrulasın.

**Görevler:**
- [ ] `POST /api/sessions` endpoint
- [ ] instagrapi session doğrulama
- [ ] Session şifreleme (AES-256)
- [ ] Frontend: Session Ekle sayfası
- [ ] Frontend: Session durumu göstergesi (aktif/geçersiz)
- [ ] `GET /api/sessions/{id}/verify` endpoint

**Tamamlanma kriteri:** Geçerli sessionid ile session eklenir, geçersizde hata mesajı gösterilir.

---

## Faz 3 — Follower / Following Sync

**Hedef:** Takipçi ve takip edilen listeleri DB'ye çekilsin.

**Görevler:**
- [ ] Celery task: `sync_followers`
- [ ] Celery task: `sync_following`
- [ ] Rate limiting (Redis counter)
- [ ] `POST /api/sessions/{id}/sync/followers` endpoint
- [ ] `POST /api/sessions/{id}/sync/following` endpoint
- [ ] `GET /api/tasks/{task_id}` task durumu endpoint
- [ ] Frontend: Sync başlat butonu + ilerleme çubuğu
- [ ] Frontend: Takipçi analizi tablosu (4 kategori)

**Tamamlanma kriteri:** Sync tamamlandığında 4 liste (karşılıklı, geri takip etmeyen, vb.) doğru gösterilir.

---

## Faz 4 — Aksiyonlar

**Hedef:** Takip et / takipten çık işlemleri çalışsın.

**Görevler:**
- [ ] `POST /api/sessions/{id}/actions/follow/{user_id}`
- [ ] `POST /api/sessions/{id}/actions/unfollow/{user_id}`
- [ ] Celery task: `bulk_unfollow` (rate-limited, random delay)
- [ ] `POST /api/sessions/{id}/actions/bulk-unfollow`
- [ ] `action_log` tablosuna yazım
- [ ] Frontend: Her kullanıcı satırında aksiyon butonu
- [ ] Frontend: Toplu seçim + bulk unfollow modal
- [ ] Frontend: Aksiyon geçmişi sayfası

**Tamamlanma kriteri:** Tek unfollow anında çalışır. Bulk unfollow rate-limit'e uyar, ilerleme gösterilir.

---

## Faz 5 — Gönderi Analizi

**Hedef:** Kullanıcının gönderileri ve etkileşimleri görüntülensin.

**Görevler:**
- [ ] Celery task: `sync_posts`
- [ ] Celery task: `sync_post_interactions` (like + comment per post)
- [ ] `GET /api/sessions/{id}/posts` endpoint
- [ ] `GET /api/sessions/{id}/posts/{id}/likers`
- [ ] `GET /api/sessions/{id}/posts/{id}/comments`
- [ ] Frontend: Gönderi grid görünümü
- [ ] Frontend: Gönderi detay (likers, comments listesi)
- [ ] Frontend: Zaman serisi grafik (like/comment trendi) — recharts kullan

**Tamamlanma kriteri:** Gönderiler grid'de gösterilir, her biri için likers/comments açılır.

---

## Faz 6 — Kullanıcı Havuzu ve Raporlama

**Hedef:** Tüm etkileşim yaşanan kullanıcılar havuzda, rapor çıkartılabilsin.

**Görevler:**
- [ ] `user_engagement_scores` materialized view oluştur
- [ ] Materialized view refresh tetikleme (sync sonrası)
- [ ] `GET /api/sessions/{id}/users` (filtreli, sıralı)
- [ ] `GET /api/sessions/{id}/users/{id}/report`
- [ ] CSV export endpoint
- [ ] Frontend: Kullanıcı havuzu tablosu (arama, filtre, sıralama)
- [ ] Frontend: Kullanıcı detay sayfası (engagement raporu)
- [ ] Frontend: CSV export butonu

**Tamamlanma kriteri:** Havuzda en az 3 farklı kaynak kullanıcısı var (follower + liker + commenter). Rapor doğru veriler gösteriyor.

---

## Faz 7 — Graphify (Graf Görselleştirme)

**Hedef:** İlişki ağı graf üzerinde görüntülensin.

**Görevler:**
- [ ] `react-force-graph` kurulumu (terminal script)
- [ ] Backend: Graf veri endpoint — `GET /api/sessions/{id}/graph`
- [ ] Graf verisi formatı: `{nodes: [...], links: [...]}`
- [ ] Frontend: Graf bileşeni (node = kullanıcı, edge = ilişki türü)
- [ ] Node renk kodlaması: mutual=yeşil, tek yönlü=sarı, etkileşim var=mavi

**Tamamlanma kriteri:** Graf yüklenir, node'lara tıklayınca kullanıcı detayı açılır.

---

## Faz 8 — Plan B Entegrasyonu

**Hedef:** Plan A başarısız olduğunda Playwright devreye girsin.

**Görevler:**
- [ ] Playwright kurulumu (backend Docker image'ına ekle)
- [ ] Chrome user-data-dir konfigürasyonu
- [ ] Plan B follower scraper script
- [ ] Plan A → Plan B otomatik geçiş mantığı
- [ ] Frontend: Plan B aktif göstergesi

**Tamamlanma kriteri:** Plan A devre dışı bırakıldığında Plan B ile follower sync çalışır.

---

## Geliştirme Kuralları

- Her faz tamamlandıktan sonra ilgili doküman güncellenir
- Kod okunmaz, terminal çıktısı ile test edilir
- Her servis kendi log'unu yazar, `docker compose logs -f [servis]` ile takip
- DB migration her şema değişikliğinde commit edilir
- `.env` dosyası asla git'e girmez
