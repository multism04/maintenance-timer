import { useCallback, useEffect, useState } from 'react'
import type { MaintenanceItem } from '../types'
import { addInterval, UNIT_LABELS } from '../utils/time'
import { subscribeToPush } from '../utils/sync'

const CHECK_INTERVAL_MS = 30_000

const isNotificationSupported = typeof window !== 'undefined' && 'Notification' in window

// iOS Safari (even for a home-screen-installed app) does not support the
// `new Notification()` constructor at all — only notifications shown via a
// service worker registration. Routing every notification through the
// registration when one is available keeps this working on iOS while
// changing nothing for desktop/Android, and the try/catch stops any
// platform quirk here from ever taking down the rest of the app.
async function showNotification(title: string, options: NotificationOptions) {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      if (registration.showNotification) {
        await registration.showNotification(title, options)
        return
      }
    }
    new Notification(title, options)
  } catch (error) {
    console.error('Failed to show notification', error)
  }
}

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
        // Fire-and-forget: registers this device with the push backend so
        // reminders can arrive even after the app is fully closed. The
        // foreground check below keeps working regardless of whether this
        // succeeds.
        void subscribeToPush()
      }
    } catch (error) {
      console.error('Failed to request notification permission', error)
    }
  }, [])

  return { supported: isNotificationSupported, permission, requestPermission }
}

export function useDueNotifications(
  items: MaintenanceItem[],
  permission: NotificationPermission,
  onReminderFired: (itemId: string, reminderId: string) => void,
  onOverdueFired: (itemId: string) => void,
) {
  useEffect(() => {
    if (!isNotificationSupported || permission !== 'granted') return

    function check() {
      const now = new Date()

      for (const item of items) {
        const dueDate = addInterval(new Date(item.baseDate), item.intervalValue, item.intervalUnit)

        if (now >= dueDate && !item.overdueNotified) {
          void showNotification('メンテナンス時期になりました', {
            body: item.name,
            tag: `overdue-${item.id}`,
          })
          onOverdueFired(item.id)
        }

        for (const reminder of item.reminders) {
          if (item.notifiedReminderIds.includes(reminder.id)) continue
          const reminderTime = addInterval(dueDate, -reminder.value, reminder.unit)
          if (now >= reminderTime && now < dueDate) {
            void showNotification('もうすぐメンテナンス時期です', {
              body: `${item.name}（あと${reminder.value}${UNIT_LABELS[reminder.unit]}）`,
              tag: `reminder-${reminder.id}`,
            })
            onReminderFired(item.id, reminder.id)
          }
        }
      }
    }

    check()
    const intervalId = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [items, permission, onReminderFired, onOverdueFired])
}
