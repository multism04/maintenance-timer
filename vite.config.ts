import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/maintenance-timer/',
  // Shown at the bottom of the app so it's possible to tell which build a
  // phone is actually running (an installed PWA can keep showing an old
  // version for a while after a deploy).
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // The default 2 MiB limit doesn't leave much headroom; the app
        // bundle is tiny, so this is just a safety margin, not a real cap.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
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
