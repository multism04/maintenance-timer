import type { MaintenanceItem } from '../types'

const STORAGE_KEY = 'maintenance-timer:items'

export function loadItems(): MaintenanceItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveItems(items: MaintenanceItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}
