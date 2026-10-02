import { useCallback, useEffect, useState } from 'react'
import { reportPermission, subscribeToPush } from '../utils/sync'
import type { PermissionState } from '../utils/sync'

// All notifications come from the push backend (Cloudflare Worker cron).
// There is deliberately no in-app due check: the app can't know what the
// server already sent, so one would re-show every notification on launch.

const isNotificationSupported = typeof window !== 'undefined' && 'Notification' in window
const LAST_PERMISSION_KEY = 'maintenance-timer:lastPermission'

function currentPermission(): PermissionState {
  return isNotificationSupported ? Notification.permission : 'unsupported'
}

// Reports only when the state differs from what this device saw last time,
// so the backend log holds transitions (e.g. granted -> default) rather than
// one row per app launch.
function reportIfChanged(permission: PermissionState) {
  let previous: PermissionState | null = null
  try {
    previous = localStorage.getItem(LAST_PERMISSION_KEY) as PermissionState | null
    if (previous === permission) return
    localStorage.setItem(LAST_PERMISSION_KEY, permission)
  } catch {
    // localStorage unavailable: fall through and report this launch.
  }
  void reportPermission(permission, previous)
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    isNotificationSupported ? Notification.permission : 'denied',
  )

  useEffect(() => {
    const refresh = () => {
      const latest = currentPermission()
      reportIfChanged(latest)
      if (latest !== 'unsupported') {
        setPermission(latest)
        // Re-confirm the push subscription for a user who already granted
        // permission — cheap and idempotent, and covers the browser having
        // silently invalidated the old one.
        if (latest === 'granted') void subscribeToPush()
      }
    }

    refresh()
    // Permission can change while the app sits in the background (the user
    // fixes it in Chrome's settings, or Chrome resets it), so re-read it
    // whenever the app comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const requestPermission = useCallback(async () => {
    if (!isNotificationSupported) return
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      reportIfChanged(result)
      if (result === 'granted') {
        void subscribeToPush()
      }
    } catch (error) {
      console.error('Failed to request notification permission', error)
    }
  }, [])

  return { supported: isNotificationSupported, permission, requestPermission }
}
