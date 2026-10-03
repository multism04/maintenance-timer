import type { MaintenanceItem } from '../types'
import { PUSH_API_BASE, VAPID_PUBLIC_KEY } from '../config'
import { getDeviceId } from './device'
import { addInterval } from './time'

// Best-effort sync to the push backend — the app must keep working purely
// from localStorage if the network or the Worker is unavailable, so every
// call here swallows its own errors.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

// Subscribes this browser to Web Push (if not already) and registers the
// subscription with the backend. Safe to call every time notification
// permission is (re-)confirmed — subscribing again with the same key just
// returns the existing subscription.
export async function subscribeToPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
    await syncSubscription(subscription)
  } catch (error) {
    console.error('Failed to subscribe to push', error)
  }
}

export async function syncSubscription(subscription: PushSubscription): Promise<void> {
  try {
    await fetch(`${PUSH_API_BASE}/devices/${getDeviceId()}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
  } catch (error) {
    console.error('Failed to sync push subscription', error)
  }
}

export type PermissionState = NotificationPermission | 'unsupported'

// Records a notification-permission change in the backend's push_log, to
// learn when and how often Chrome resets it behind the user's back.
export async function reportPermission(
  permission: PermissionState,
  previous: PermissionState | null,
): Promise<void> {
  try {
    await fetch(`${PUSH_API_BASE}/devices/${getDeviceId()}/permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      keepalive: true,
      body: JSON.stringify({
        permission,
        previous,
        standalone: window.matchMedia('(display-mode: standalone)').matches,
      }),
    })
  } catch (error) {
    console.error('Failed to report notification permission', error)
  }
}

export async function syncItems(items: MaintenanceItem[]): Promise<void> {
  // The due time and each reminder time are computed here, in the phone's
  // timezone, and sent as instants. The Worker used to redo this month/year
  // arithmetic in UTC, which disagrees with the phone for items registered
  // between 00:00 and 08:59 JST on the 1st of a month (e.g. +1 month from
  // 2/1 00:00 JST is 3/1 on the phone but 3/4 in UTC) — so the displayed
  // due date and the notification could be days apart.
  const payload = JSON.stringify(
    items.map((item) => {
      const dueAt = addInterval(new Date(item.baseDate), item.intervalValue, item.intervalUnit)
      return {
        id: item.id,
        name: item.name,
        intervalValue: item.intervalValue,
        intervalUnit: item.intervalUnit,
        baseDate: item.baseDate,
        dueAt: dueAt.toISOString(),
        reminders: item.reminders.map((r) => ({
          ...r,
          at: addInterval(dueAt, -r.value, r.unit).toISOString(),
        })),
      }
    }),
  )
  const url = `${PUSH_API_BASE}/devices/${getDeviceId()}/items`

  // sendBeacon queues the request with the browser/OS network stack so it
  // survives the page being torn down (e.g. swiped away from Android's
  // recent-apps list right after making a change) — a plain fetch() offers
  // no such guarantee and was confirmed to lose syncs in exactly that case.
  // It only supports POST, so the Worker's /items route accepts POST too.
  // The blob is typed text/plain (a CORS-safelisted content type) rather
  // than application/json purely to avoid a preflight OPTIONS round trip —
  // there's very little time left to complete one in this scenario. The
  // Worker parses the body as JSON regardless of the declared type.
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'text/plain' })
    if (navigator.sendBeacon(url, blob)) return
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })
  } catch (error) {
    console.error('Failed to sync items to push backend', error)
  }
}
