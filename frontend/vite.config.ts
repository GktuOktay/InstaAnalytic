/// <reference types="vitest" />
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Eklenti dosyaları /extension/ altında sunulur: eklenti güncelleme denetimi /extension/manifest.json'u okur.
// Geliştirme sunucusu bunu kökten zaten sunar; üretim derlemesine de kopyalanır.
function copyExtension(): Plugin {
  return {
    name: 'copy-extension',
    apply: 'build',
    closeBundle() {
      const src = resolve(__dirname, 'extension')
      if (existsSync(src)) cpSync(src, resolve(__dirname, 'dist/extension'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), copyExtension()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        headers: { 'X-API-Token': process.env.API_TOKEN ?? '' },
        // SSE için buffering kapalı
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no'
            }
          })
        },
      },
    },
  },
})
