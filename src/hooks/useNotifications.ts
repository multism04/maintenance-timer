import { useCallback, useEffect, useState } from 'react'
import { subscribeToPush } from '../utils/sync'

// All notifications come from the push backend (Cloudflare Worker cron).
// There is deliberately no in-app due check: the app can't know what the
// server already sent, so one would re-show every notification on launch.

const isNotificationSupported = typeof window !== 'undefined' && 'Notification' in window

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    isNotificationSupported ? Notification.permission : 'denied',
  )

  // Re-confirm the push subscription on every launch for a returning user
  // who already granted permission — cheap and idempotent, and covers the
  // case where the browser silently invalidated the old subscription.
  useEffect(() => {
    if (permission === 'granted') {
      void subscribeToPush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestPermission = useCallback(async () => {
    if (!isNotificationSupported) return
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        void subscribeToPush()
      }
    } catch (error) {
      console.error('Failed to request notification permission', error)
    }
  }, [])

  return { supported: isNotificationSupported, permission, requestPermission }
}
