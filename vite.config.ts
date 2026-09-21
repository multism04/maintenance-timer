import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/maintenance-timer/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        name: 'メンテナンスタイマー',
        short_name: 'メンテタイマー',
        description: '数週間〜数年単位の交換・メンテナンス時期を管理するタイマー',
        start_url: '/maintenance-timer/',
        scope: '/maintenance-timer/',
        display: 'standalone',
        background_color: '#132322',
        theme_color: '#132322',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
