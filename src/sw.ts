/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// The backend's Cron Trigger sends this when a reminder or overdue item is
// due — this is what lets a notification show up even with the app fully
// closed. Foreground notifications (see useNotifications.ts) go through
// registration.showNotification() directly and never hit this handler.
self.addEventListener('push', (event) => {
  let payload: { title?: string; body?: string; tag?: string } = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'メンテナンスタイマー', {
      body: payload.body,
      tag: payload.tag,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/maintenance-timer/')
    }),
  )
})
