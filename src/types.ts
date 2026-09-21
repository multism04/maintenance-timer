import type { IntervalUnit } from './utils/time'

export interface ReminderConfig {
  id: string
  value: number
  unit: IntervalUnit
}

export interface MaintenanceItem {
  id: string
  name: string
  intervalValue: number
  intervalUnit: IntervalUnit
  baseDate: string
  reminders: ReminderConfig[]
  notifiedReminderIds: string[]
  overdueNotified: boolean
  createdAt: string
}

export interface ItemInput {
  name: string
  intervalValue: number
  intervalUnit: IntervalUnit
  reminders: Array<Omit<ReminderConfig, 'id'>>
}
