"""
İnsan ritmine benzeyen bekleme süreleri.

Sabit ya da düz (uniform) rastgele aralıklar makine gibi görünür: dar bir bantta sıkışır, molalar
aynı sıklıkta gelir. İnsan tıklamaları ise çoğu zaman ortada toplanır, ara sıra uzun sürer.
Burada log-normal dağılım kullanılır (çoğunlukla kısa, ara sıra uzun) ve molaların sıklığı da rastgeledir.

Güvenlik kuralı: bekleme hiçbir zaman verilen alt sınırın altına inmez; yalnızca üst tarafa doğru uzayabilir.
"""
from __future__ import annotations

import math
import random
from typing import Protocol


class _Rng(Protocol):
    def lognormvariate(self, mu: float, sigma: float) -> float: ...
    def uniform(self, a: float, b: float) -> float: ...
    def randint(self, a: int, b: int) -> int: ...


def between(rng: _Rng, lo: float, hi: float, sigma: float = 0.45, cap: float = 1.6) -> float:
    """[lo, hi] aralığının ortası civarında yoğunlaşan, bazen hi'nin (en çok cap katı) ötesine uzayan bekleme.
    lo'nun altına asla inmez."""
    if hi <= lo:
        return lo
    x = rng.lognormvariate(math.log(math.sqrt(lo * hi)), sigma)
    return min(max(x, lo), hi * cap)


def around(rng: _Rng, mean: float, sigma: float = 0.5, lo: float = 0.35, hi: float = 4.0) -> float:
    """Ortalaması yaklaşık `mean` olan log-normal bekleme (mean*lo ile mean*hi arasına kırpılır)."""
    mu = math.log(mean) - sigma ** 2 / 2
    return min(max(rng.lognormvariate(mu, sigma), mean * lo), mean * hi)


def random_cadence(rng: _Rng, every: int) -> int:
    """'Her N istekte bir' yerine N'nin yaklaşık %60 ile %150'si arasında rastgele bir sayı."""
    every = max(1, int(every))
    return rng.randint(max(1, int(every * 0.6)), max(1, int(every * 1.5)))


# Hayalet kontrolü için ritim ayarları
READ_EVERY = (8, 20)             # birkaç istekte bir kısa "bakınma" molası
READ_EXTRA = (1.5, 4.0)          # ortalama beklemenin katı olarak ek süre
BREAK_EVERY = (35, 70)           # daha seyrek uzun mola
BREAK_S = (120, 360)

# Bir yoklama başına ortalama ek yük (ortalama bekleme katsayısı, saniye): arayüzdeki "saatte ~N" tahmini için
READ_OVERHEAD = (sum(READ_EXTRA) / 2) / ((READ_EVERY[0] + READ_EVERY[1]) / 2)
BREAK_OVERHEAD_S = ((BREAK_S[0] + BREAK_S[1]) / 2) / ((BREAK_EVERY[0] + BREAK_EVERY[1]) / 2)


def effective_per_hour(interval_s: float) -> int:
    """Molalar dahil gerçekçi saatlik hız."""
    return int(3600 / (interval_s * (1 + READ_OVERHEAD) + BREAK_OVERHEAD_S))


default_rng = random
