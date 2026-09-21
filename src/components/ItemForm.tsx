import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ItemInput, MaintenanceItem, ReminderConfig } from '../types'
import type { IntervalUnit } from '../utils/time'
import { UNIT_LABELS, UNIT_OPTIONS } from '../utils/time'

interface ReminderDraft {
  key: string
  value: string
  unit: IntervalUnit
}

function toDrafts(reminders: ReminderConfig[]): ReminderDraft[] {
  return reminders.map((r) => ({ key: r.id, value: String(r.value), unit: r.unit }))
}

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

let draftKeySeq = 0
function nextDraftKey(): string {
  draftKeySeq += 1
  return `draft-${draftKeySeq}`
}

interface ItemFormProps {
  initial: MaintenanceItem | null
  onSubmit: (input: ItemInput) => void
  onCancel: () => void
}

export function ItemForm({ initial, onSubmit, onCancel }: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [intervalValue, setIntervalValue] = useState(String(initial?.intervalValue ?? 3))
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initial?.intervalUnit ?? 'month')
  const [reminders, setReminders] = useState<ReminderDraft[]>(
    initial ? toDrafts(initial.reminders) : [],
  )

  function addReminderRow() {
    setReminders((prev) => [...prev, { key: nextDraftKey(), value: '1', unit: 'day' }])
  }

  function removeReminderRow(key: string) {
    setReminders((prev) => prev.filter((r) => r.key !== key))
  }

  function updateReminderRow(key: string, patch: Partial<ReminderDraft>) {
    setReminders((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(),
      intervalValue: parsePositiveInt(intervalValue, 1),
      intervalUnit,
      reminders: reminders.map((r) => ({ value: parsePositiveInt(r.value, 1), unit: r.unit })),
    })
  }

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>項目名</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 浄水器フィルター交換"
          required
        />
      </label>

      <label className="field">
        <span>次にアラートを出すまでの期間</span>
        <div className="inline-fields">
          <input
            type="number"
            min={1}
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            required
          />
          <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}>
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
      </label>

      <div className="field">
        <span>リマインダー（期限より前に知らせる）</span>
        <div className="reminder-list">
          {reminders.map((reminder) => (
            <div className="inline-fields reminder-row" key={reminder.key}>
              <span className="reminder-prefix">期限の</span>
              <input
                type="number"
                min={1}
                value={reminder.value}
                onChange={(e) => updateReminderRow(reminder.key, { value: e.target.value })}
              />
              <select
                value={reminder.unit}
                onChange={(e) => updateReminderRow(reminder.key, { unit: e.target.value as IntervalUnit })}
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
              <span>前</span>
              <button
                type="button"
                className="icon-button danger"
                onClick={() => removeReminderRow(reminder.key)}
                aria-label="リマインダーを削除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="secondary-button" onClick={addReminderRow}>
          ＋ リマインダーを追加
        </button>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="primary-button">
          {initial ? '更新する' : '登録する'}
        </button>
      </div>
    </form>
  )
}
