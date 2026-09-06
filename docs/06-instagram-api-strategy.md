# Instapp — Instagram Erişim Stratejisi

**Versiyon:** 1.0  
**Tarih:** 2026-09-06

---

## Plan A — instagrapi (Mobile API)

### Nasıl Çalışır

`instagrapi`, Instagram'ın Android uygulamasının kullandığı private API endpoint'lerini Python üzerinden kullanır. Gerçek bir cihaz simüle eder.

### Session Kurulumu

Kullanıcı Instagram'a tarayıcıda giriş yapar, `sessionid` cookie'sini kopyalar ve uygulamaya girer. Backend bu değer ile session oluşturur:

```python
from instagrapi import Client

cl = Client()
cl.login_by_sessionid("ABC123sessionid...")
# veya
cl.load_settings(saved_session_json)
```

### Session Cookie Nasıl Alınır (Kullanıcı Rehberi)

1. Chrome/Firefox'ta instagram.com'a gir (oturum açık olmalı)
2. F12 → Application → Cookies → instagram.com
3. `sessionid` değerini kopyala
4. Uygulamanın Session Ekle ekranına yapıştır

### Rate Limit Yönetimi

| İşlem | Güvenli Limit |
|-------|---------------|
| Follower/Following çekme | 1 istek / 2 saniye |
| Follow | Max 60 / saat |
| Unfollow | Max 60 / saat |
| Like | Max 200 / gün (kullanılmıyor) |
| Post çekme | 1 istek / 1 saniye |

Celery worker'da her istek öncesi `time.sleep(random.uniform(1, 3))` uygulanır.

### Hata Kodları ve Tepkiler

| Exception | Tepki |
|-----------|-------|
| `LoginRequired` | Session geçersiz → kullanıcı uyarısı |
| `ChallengeRequired` | Instagram challenge istedi → Plan B |
| `PleaseWaitFewMinutes` | 10 dakika bekle, yeniden dene |
| `RateLimitError` (3x) | Plan B'ye geç |
| `UserNotFound` | DB'den sil / pasif işaretle |

---

## Plan B — Playwright Tabanlı Tarama

### Ne Zaman Aktif Olur

- Plan A'da `ChallengeRequired` exception
- Plan A'da 3 ardışık `RateLimitError`
- Kullanıcı manuel olarak Plan B'ye geçerse

Redis'te `plan_b_active:{session_id}` key'i set edilir. TTL: 24 saat. Sonra Plan A yeniden denenir.

### Nasıl Çalışır

Playwright, kullanıcının tarayıcısındaki mevcut oturumu kullanır. Yeni giriş gerektirmez.

```python
from playwright.async_api import async_playwright

async def scrape_followers(username: str, chrome_user_data: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=chrome_user_data,  # mevcut Chrome profili
            headless=True
        )
        page = await browser.new_page()
        await page.goto(f"https://www.instagram.com/{username}/followers/")
        # Infinite scroll + DOM parse
        # JSON çıktı → pipeline
```

### Chrome User Data Path

| OS | Default Path |
|----|-------------|
| macOS | `~/Library/Application Support/Google/Chrome/Default` |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data\Default` |

Kullanıcıdan uygulama kurulum sırasında bir kez alınır, `.env` dosyasına yazılır.

### Veri Çekme Yaklaşımı

Instagram sayfası infinite scroll kullandığından:
1. Sayfaya git
2. `window.scrollTo(0, document.body.scrollHeight)` ile aşağı kaydır
3. Yeni kullanıcı kartları DOM'a eklenene kadar bekle
4. Yeni kartları parse et, listene ekle
5. Değişiklik olmayana kadar tekrarla

DOM selector'lar kırılgan olabilir → fallback olarak `data-*` attribute'ları kullanılır. Selector değişirse sadece parse fonksiyonu güncellenir.

### Plan B Kısıtları

| Kısıt | Değer |
|-------|-------|
| Hız | Plan A'dan yavaş (~5 saniye/sayfa) |
| Ban riski | Daha düşük (gerçek tarayıcı) |
| Veri bütünlüğü | DOM parse hataları olabilir |
| Headless mod | Arka planda çalışır |

---

## Karşılaştırma

| Kriter | Plan A (instagrapi) | Plan B (Playwright) |
|--------|--------------------|--------------------|
| Hız | Hızlı | Yavaş |
| Kararlılık | API değişikliğine duyarlı | DOM değişikliğine duyarlı |
| Ban riski | Orta | Düşük |
| Kurulum | Basit | Chrome path gerekir |
| Veri zenginliği | Yüksek | Orta |

---

## Güvenlik Notları

- `sessionid` asla log'a yazılmaz
- `sessionid` DB'de AES-256 ile şifrelenir
- Chrome user-data-dir sadece okunur, yazılmaz
- Backend sadece localhost:8000'de bind edilir
