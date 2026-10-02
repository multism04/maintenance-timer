import { useEffect, useState } from 'react'
import type { ItemInput, MaintenanceItem } from '../types'
import { loadItems, saveItems } from '../utils/storage'
import { syncItems } from '../utils/sync'

function generateId(): string {
  return crypto.randomUUID()
}

export function useItems() {
  const [items, setItems] = useState<MaintenanceItem[]>(() => loadItems())

  useEffect(() => {
    saveItems(items)
  }, [items])

  // Best-effort sync to the push backend. items only changes on discrete
  // actions (add/edit/delete/reset), never per keystroke, so there's no
  // burst to debounce against — and debouncing here previously lost the
  // sync entirely when the app was closed right after making a change,
  // before the delayed request had a chance to fire.
  useEffect(() => {
    void syncItems(items)
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
        item.id === id ? { ...item, baseDate: new Date().toISOString() } : item,
      ),
    )
  }

  return {
    items,
    addItem,
    updateItem,
    deleteItem,
    resetItem,
  }
}
