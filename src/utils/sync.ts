import type { MaintenanceItem } from '../types'
import { PUSH_API_BASE, VAPID_PUBLIC_KEY } from '../config'
import { getDeviceId } from './device'

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

export async function syncItems(items: MaintenanceItem[]): Promise<void> {
  try {
    await fetch(`${PUSH_API_BASE}/devices/${getDeviceId()}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        items.map((item) => ({
          id: item.id,
          name: item.name,
          intervalValue: item.intervalValue,
          intervalUnit: item.intervalUnit,
          baseDate: item.baseDate,
          reminders: item.reminders,
        })),
      ),
    })
  } catch (error) {
    console.error('Failed to sync items to push backend', error)
  }
}
