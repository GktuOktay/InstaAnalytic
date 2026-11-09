# SPEC-002 · Spec eleştirisi R1 (spec-critic, 2026-11-09)

> Bu dosyayı main session yazdı; içerik spec-critic raporundan alındı (yazma aracı yok).

**Özet:** Critical yok. İmzaya hazır değil: 2 High (PB-7 başarısızlık davranışı, karakterizasyon çelişki kuralı), CB-2 yazıldığı haliyle geçemez, §13'teki 6 soru CEO cevabı bekliyor.

| # | Önem | Yer | Bulgu | Öneri |
|---|---|---|---|---|
| 1 | High | §5 PB-7, §11, §13 S5 | Gerçek veri çözme denetiminde `cozulemeyen>0` davranışı, taban sayım ve komutun yeri tanımsız. | T-1'de eski imajla taban sayım; sonrası > taban ise T-3 durur, push yok, `git revert` + rebuild; komut spec'te tam, betik repoya girmez. |
| 2 | High | §5 giriş, PB-4/PB-5 | Karakterizasyon testi spec beklentisiyle çelişirse kural yok. | Test mevcut davranışı sabitler, fark raporlanır, kod değişmez; PB-5 preflight durum kodu sabitlenir. |
| 3 | Medium | §4 CB-2, §9 T-2 | `instagram.py:69` yorumu silme listesinde yok; `_WEB_HEADERS`/`_MOBILE_HEADERS` ölü; "`Client` yok" ifadesi `httpx.Client` ile çakışıyor. | 69-71 silme listesine; CB-2 ifadesi "`from instagrapi` importu ve `instagrapi.Client` kullanımı yok". |
| 4 | Medium | §11 geri dönüş, PB-1(c) | "Eski sürüm yeni token'ı okur" doğrudan test edilmiyor. | Yeni sürüm token'ını 42.0.7'li tek kullanımlık konteynerde çöz, ya da ifadeyi yumuşat. |
| 5 | Medium | PB-6 | CI'daki `ENCRYPTION_KEY` env değişkeni `.env`'i ezer; test CI'da kırmızı olur. | `monkeypatch.delenv` ile `ENCRYPTION_KEY`, `ENCRYPTION_KEY_OLD`, `API_TOKEN` temizlenir. |
| 6 | Medium | CB-3 ↔ §10 | `frontend` CI işi `npm audit` içeriyor; bu işin kapatamayacağı kriter. | "`backend` yeşil; `frontend`/`secrets` taban run 42491093608'den kötü değil". |
| 7 | Medium | CB-1/CB-3, §6, §11 | Birden çok commit var, kriter tek commit diyor. | Commit planı: T-1, T-2, T-4 ayrı; kriter push'un son commit'i; geri dönüş T-2 revert'i. |
| 8 | Medium | §5 giriş, §15 | Karakterizasyon testi yükseltme sonrası onaysız değiştirilebiliyor. | Main session onayı + T-6'da qa-engineer'a ayrı satır + diff raporda. |
| 9 | Medium | §12 | Cross-site multipart'ın token öncesi ayrıştırıcıya ulaşması sınıf olarak açık kalıyor; kabul eden yazılmamış. | İfadeyi düzelt; ertelemeyi CEO'ya sor ve Karar Kaydı'na işle ya da SPEC-003'e bağla. **(Tür 1)** |
| 10 | Medium | §2.1 | FastAPI "en son" ile pydantic "en az değişiklik" tutarsız. | "starlette ≥ 1.3.1'e izin veren en düşük FastAPI" ya da gerekçe. |
| 11 | Low | CB-1, T-3 | `pip-audit` imajda yok; komut belirsiz. | Tam komut yaz. |
| 12 | Low | PB-5 | Preflight istek başlıkları tanımsız. | `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: x-api-token`; harfe duyarsız karşılaştırma. |
| 13 | Low | PB-2, §15 | `skipped` artmaması kriter değil. | "`skipped` sonra ≤ önce". |
| 14 | Low | T-4 | Doküman listesi eksik (`docs/02-tech-stack.md:45`, `docs/07-development-phases.md:33`), satır numarası yanlış. | Tamamla. |
| 15 | Low | §8 diyagram | T-4b "done" çizilmiş; T-4 düğümü yok. | Düzelt. |
| 16 | Low | T-6 | quality-office yok. | Ekle ya da gerekçe yaz. |

İmzaya hazır: **hayır**.
