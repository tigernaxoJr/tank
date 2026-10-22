/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    // PWA：可安裝到手機桌面、全螢幕橫向遊玩；素材全部預先快取，離線也能玩單機練習
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png', 'icons/splash-*.png'],
      manifest: {
        name: 'Tank Artillery 空域砲決',
        short_name: '空域砲決',
        description: '回合制砲擊對戰：單機練習或用房號連線對打',
        lang: 'zh-Hant',
        id: './',
        start_url: './?source=pwa',
        scope: './',
        display: 'standalone',
        // 不在 manifest 宣告 orientation：Android 的 WebAPK 若在直拿時被強制橫向啟動，會卡在啟動畫面
        // 沒有反應；橫向改由 main.ts 啟動後鎖定，直拿時由 #rotate-hint 提示
        background_color: '#bfe4ff',
        theme_color: '#4cb2ff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,webp,jpg,mp3,ogg,wav,json}'],
        // 啟動畫面只給 iOS 用，不必預先快取
        globIgnores: ['icons/splash-*.png'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // 字型來自 Google Fonts：離線 / 弱網時走快取，不讓字型請求拖住啟動
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
})
