import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// findBy*/waitFor varsayılanı 1 sn; yüklü makinede (tam suite, paralel işçiler) ilk render bunu aşıp testi flaky yapıyordu.
configure({ asyncUtilTimeout: 5000 })

// Node 25+ kendi (bozuk) global localStorage'ını getirir ve jsdom'unkini gölgeler
// (`localStorage.clear is not a function`, IA D-02). Çalışmıyorsa bellek içi bir Storage koyarız;
// Node 20/22'de bu blok hiç çalışmaz.
function storageBroken(): boolean {
  try { return typeof globalThis.localStorage?.clear !== 'function' } catch { return true }
}
if (storageBroken()) {
  const mem = new Map<string, string>()
  const shim = {
    get length() { return mem.size },
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    getItem: (k: string) => (mem.has(String(k)) ? mem.get(String(k))! : null),
    setItem: (k: string, v: string) => { mem.set(String(k), String(v)) },
    removeItem: (k: string) => { mem.delete(String(k)) },
    clear: () => { mem.clear() },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true, writable: true })
  if (typeof window !== 'undefined') Object.defineProperty(window, 'localStorage', { value: shim, configurable: true, writable: true })
}

afterEach(() => { cleanup(); localStorage.clear() })
