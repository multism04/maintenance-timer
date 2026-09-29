const DEVICE_ID_KEY = 'maintenance-timer:deviceId'

// A random per-installation id — no login, just enough for this device to
// identify itself to the push backend as "the same device" across syncs.
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}
