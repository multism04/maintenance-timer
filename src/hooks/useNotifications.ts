import { useCallback, useEffect, useState } from 'react'
import type { MaintenanceItem } from '../types'
import { addInterval, UNIT_LABELS } from '../utils/time'

const CHECK_INTERVAL_MS = 30_000

const isNotificationSupported = typeof window !== 'undefined' && 'Notification' in window

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    isNotificationSupported ? Notification.permission : 'denied',
  )

  const requestPermission = useCallback(async () => {
    if (!isNotificationSupported) return
    const result = await Notification.requestPermission()
    setPermission(result)
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
          new Notification('メンテナンス時期になりました', {
            body: item.name,
            tag: `overdue-${item.id}`,
          })
          onOverdueFired(item.id)
        }

        for (const reminder of item.reminders) {
          if (item.notifiedReminderIds.includes(reminder.id)) continue
          const reminderTime = addInterval(dueDate, -reminder.value, reminder.unit)
          if (now >= reminderTime && now < dueDate) {
            new Notification('もうすぐメンテナンス時期です', {
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
