import { useEffect, useRef, useState } from 'react'
import type { ItemInput, MaintenanceItem } from '../types'
import { loadItems, saveItems } from '../utils/storage'
import { syncItems } from '../utils/sync'

const SYNC_DEBOUNCE_MS = 1_000

function generateId(): string {
  return crypto.randomUUID()
}

export function useItems() {
  const [items, setItems] = useState<MaintenanceItem[]>(() => loadItems())

  useEffect(() => {
    saveItems(items)
  }, [items])

  // Best-effort sync to the push backend, debounced so a burst of edits
  // (e.g. typing) doesn't fire a request per keystroke-driven update.
  const syncTimeoutRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(syncTimeoutRef.current)
    syncTimeoutRef.current = window.setTimeout(() => {
      void syncItems(items)
    }, SYNC_DEBOUNCE_MS)
    return () => window.clearTimeout(syncTimeoutRef.current)
  }, [items])

  function addItem(input: ItemInput) {
    const now = new Date().toISOString()
    const newItem: MaintenanceItem = {
      id: generateId(),
      name: input.name,
      intervalValue: input.intervalValue,
      intervalUnit: input.intervalUnit,
      baseDate: now,
      reminders: input.reminders.map((r) => ({ ...r, id: generateId() })),
      notifiedReminderIds: [],
      overdueNotified: false,
      createdAt: now,
    }
    setItems((prev) => [...prev, newItem])
  }

  function updateItem(id: string, input: ItemInput) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        return {
          ...item,
          name: input.name,
          intervalValue: input.intervalValue,
          intervalUnit: input.intervalUnit,
          reminders: input.reminders.map((r) => ({ ...r, id: generateId() })),
          notifiedReminderIds: [],
        }
      }),
    )
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  function resetItem(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              baseDate: new Date().toISOString(),
              notifiedReminderIds: [],
              overdueNotified: false,
            }
          : item,
      ),
    )
  }

  function markReminderNotified(id: string, reminderId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, notifiedReminderIds: [...item.notifiedReminderIds, reminderId] }
          : item,
      ),
    )
  }

  function markOverdueNotified(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, overdueNotified: true } : item)),
    )
  }

  return {
    items,
    addItem,
    updateItem,
    deleteItem,
    resetItem,
    markReminderNotified,
    markOverdueNotified,
  }
}
