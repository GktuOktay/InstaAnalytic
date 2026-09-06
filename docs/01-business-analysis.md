# Instapp — İş Analizi Dokümanı

**Versiyon:** 1.0  
**Tarih:** 2026-09-06  
**Durum:** Taslak

---

## 1. Proje Amacı

Instagram hesabının takipçi/takip ilişkilerini ve içerik etkileşimlerini merkezi bir arayüzden yönetmek. Kullanıcı, Instagram uygulamasına veya tarayıcısına ayrıca girmeden tüm iş süreçlerini bu uygulama üzerinden yürütecek.

---

## 2. Paydaşlar

| Paydaş | Rol | Beklenti |
|--------|-----|----------|
| Instagram Hesap Sahibi | Son kullanıcı | Takipçi analizi, toplu aksiyon, etkileşim raporu |
| İş Hesabı Yöneticisi | Son kullanıcı | İçerik performansı, ilişki yönetimi |

---

## 3. İş Gereksinimleri (EARS Syntax)

### 3.1 Oturum Yönetimi

- **BR-001:** Sistem, kullanıcı tarafından sağlanan Instagram session bilgisini (sessionid cookie veya script çıktısı) saklayabilmeli ve geçerliliğini doğrulayabilmelidir.
- **BR-002:** Oturum geçersiz olduğunda sistem kullanıcıyı uyarmalı ve yeniden session girişine yönlendirmelidir.
- **BR-003:** Birden fazla Instagram hesabı aynı anda sisteme eklenebilmelidir.

### 3.2 Takipçi Analizi

- **BR-010:** Sistem, oturumdaki hesabın tüm takipçi (followers) listesini çekebilmelidir.
- **BR-011:** Sistem, oturumdaki hesabın tüm takip ettiği (following) listesini çekebilmelidir.
- **BR-012:** Sistem, takip edilen ama geri takip etmeyen kullanıcıları tespit edebilmelidir.
- **BR-013:** Sistem, takip eden ama henüz takip edilmeyen kullanıcıları tespit edebilmelidir.
- **BR-014:** Analizler filtrelenebilir olmalıdır (örn. hesap yaşı, etkileşim geçmişi, özel/açık hesap).

### 3.3 Takip / Takipten Çıkma Aksiyonları

- **BR-020:** Kullanıcı, uygulama üzerinden tek tek kullanıcıyı takip edebilmeli / takipten çıkabilmelidir.
- **BR-021:** Kullanıcı, filtrelenmiş listeye toplu takipten çıkma işlemi uygulayabilmelidir.
- **BR-022:** Toplu işlemler rate limit kurallarına uygun şekilde arka planda çalışmalı, kullanıcı ilerlemeyi takip edebilmelidir.
- **BR-023:** Aksiyon geçmişi (kim, ne zaman, ne yapıldı) kaydedilmelidir.

### 3.4 Gönderi Analizi

- **BR-030:** Sistem, oturumdaki hesabın tüm gönderilerini çekebilmelidir.
- **BR-031:** Her gönderi için like sayısı, yorum sayısı ve erişim istatistikleri görüntülenebilmelidir.
- **BR-032:** Hangi kullanıcıların hangi gönderiye like attığı listelenebilmelidir.
- **BR-033:** Yorumlar gönderi bazlı listelenebilmeli, yorum içerikleri görüntülenebilmelidir.
- **BR-034:** Gönderi performansı zaman serisi olarak grafik üzerinde görüntülenebilmelidir.

### 3.5 Kullanıcı Havuzu

- **BR-040:** Herhangi bir etkileşim yaşanan tüm kullanıcılar (takipçi, takip edilen, likeçı, yorumcu) otomatik olarak kullanıcı havuzuna eklenmelidir.
- **BR-041:** Her kullanıcı için etkileşim skoru hesaplanmalıdır.
- **BR-042:** Kullanıcı havuzu aranabilir, filtrelenebilir ve sıralanabilir olmalıdır.

### 3.6 Etkileşim Raporu

- **BR-050:** Her havuz kullanıcısı için şu veriler raporlanmalıdır: mutual follow durumu, toplam like sayısı, toplam yorum sayısı, son etkileşim tarihi, ilk görülme tarihi, etkileşim skoru.
- **BR-051:** Raporlar CSV olarak dışa aktarılabilmelidir.
- **BR-052:** Graf görselleştirmesi ile kullanıcılar arası ilişki ağı görüntülenebilmelidir (Graphify entegrasyonu).

---

## 4. Kabul Kriterleri (Gherkin)

```gherkin
Feature: Takipçi Analizi

  Scenario: Geri takip etmeyen listesi
    Given oturum geçerli bir Instagram hesabına aittir
    When kullanıcı "Geri takip etmeyenler" analizini başlatır
    Then sistem 60 saniye içinde listeyi döndürür
    And her kayıt: kullanıcı adı, profil fotoğrafı, takip başlangıç tarihi içerir
    And liste büyüklük azalan sıraya göre sıralanır

  Scenario: Toplu takipten çıkma
    Given kullanıcı takipten çıkılacak listeyi seçmiştir
    When "Toplu Takipten Çık" aksiyonunu başlatır
    Then sistem saat başı maksimum 60 kullanıcıyı takipten çıkarır
    And her aksiyon aksiyon geçmişine kaydedilir
    And kullanıcı ilerleme yüzdesini görebilir

Feature: Kullanıcı Havuzu

  Scenario: Otomatik havuz güncelleme
    Given gönderi analizi tamamlanmıştır
    When yeni bir like veya yorum tespit edilir
    Then ilgili kullanıcı havuza eklenir veya güncellenir
    And etkileşim skoru yeniden hesaplanır
```

---

## 5. Kısıtlar ve Riskler

| ID | Risk | Olasılık | Etki | Önlem |
|----|------|----------|------|-------|
| R-001 | Instagram API ban / rate limit | Yüksek | Yüksek | Plan B: script tabanlı tarama, rastgele delay |
| R-002 | Session cookie süresi dolma | Orta | Orta | Otomatik geçerlilik kontrolü + uyarı |
| R-003 | Instagram arayüz değişikliği (Plan B için) | Orta | Yüksek | Selector-bağımsız veri çekme stratejisi |
| R-004 | Büyük hesaplarda veri hacmi | Düşük | Orta | Sayfalı veri çekme, Celery worker |

---

## 6. Kapsam Dışı (v1.0)

- Instagram Direct Message yönetimi
- Hikaye (Story) analizi
- Reel analizi
- Çoklu hesap eş zamanlı bulk aksiyon
- Otomatik içerik planlama / yayınlama
