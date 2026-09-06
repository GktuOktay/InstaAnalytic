# Instapp — Doküman İndeksi

**Proje:** Instagram İş Süreçleri Yönetim Uygulaması  
**Versiyon:** 1.0  
**Başlangıç:** 2026-09-06  
**Ortam:** localhost / Docker Compose

---

## Dokümanlar

| # | Dosya | İçerik |
|---|-------|---------|
| 01 | [01-business-analysis.md](01-business-analysis.md) | İş analizi, EARS gereksinimleri, kabul kriterleri, riskler |
| 02 | [02-tech-stack.md](02-tech-stack.md) | Seçilen teknolojiler, Plan A/B karşılaştırması, port haritası |
| 03 | [03-architecture.md](03-architecture.md) | Sistem mimarisi, veri akışları, servis sorumlulukları |
| 04 | [04-database-schema.md](04-database-schema.md) | Tablo DDL'leri, indeksler, engagement skoru hesabı |
| 05 | [05-api-endpoints.md](05-api-endpoints.md) | Tüm REST endpoint'leri, request/response örnekleri |
| 06 | [06-instagram-api-strategy.md](06-instagram-api-strategy.md) | Plan A (instagrapi) ve Plan B (Playwright) detayları |
| 07 | [07-development-phases.md](07-development-phases.md) | 8 fazlı geliştirme planı, tamamlanma kriterleri |

---

## Özet

**Ne yapıyor:**  
Instagram takipçi/takip ilişkilerini analiz eder, toplu aksiyon alır, gönderi etkileşimlerini raporlar.

**Nasıl erişim:**  
Kullanıcı kendi tarayıcısındaki Instagram `sessionid` cookie'sini uygulamaya girer.

**Stack:**  
React (frontend) + FastAPI + Celery (backend) + PostgreSQL + Redis (data) + Docker Compose

**Plan B:**  
instagrapi ban/challenge alırsa Playwright ile tarayıcı tabanlı scraping devreye girer.

**Graf görselleştirme:**  
react-force-graph ile ilişki ağı — Faz 7'de eklenir.
