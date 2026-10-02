import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ItemInput, MaintenanceItem, ReminderConfig } from '../types'
import type { IntervalUnit } from '../utils/time'
import { UNIT_LABELS, UNIT_OPTIONS, addInterval, formatDateTime } from '../utils/time'

interface ReminderDraft {
  key: string
  value: string
  unit: IntervalUnit
}

interface ReminderCheck {
  at?: Date
  error?: string
  warning?: string
}

const COUNT_ERROR = '1以上の数字を入力してください'

function toDrafts(reminders: ReminderConfig[]): ReminderDraft[] {
  return reminders.map((r) => ({ key: r.id, value: String(r.value), unit: r.unit }))
}

// Returns null instead of guessing — silently substituting a default here
// once saved an item with values the user never entered.
function parseCount(raw: string): number | null {
  const normalized = raw.normalize('NFKC').trim()
  if (!/^\d+$/.test(normalized)) return null
  const count = Number(normalized)
  return count >= 1 ? count : null
}

// A new row starts one unit finer than the interval (hours-scale timers
// default to 時間, not 日) — the old fixed 日 default produced a reminder
// longer than an hours-scale interval, which fired on registration.
const DEFAULT_REMINDER_UNIT: Record<IntervalUnit, IntervalUnit> = {
  hour: 'hour',
  day: 'hour',
  month: 'day',
  year: 'month',
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

  // Editing never moves the start point (only a reset does), so previews for
  // an existing item are computed from its original baseDate.
  const now = new Date()
  const startDate = initial ? new Date(initial.baseDate) : now

  const intervalCount = parseCount(intervalValue)
  const dueDate = intervalCount ? addInterval(startDate, intervalCount, intervalUnit) : null

  const reminderChecks: ReminderCheck[] = reminders.map((reminder) => {
    const count = parseCount(reminder.value)
    if (!count) return { error: COUNT_ERROR }
    if (!dueDate) return {}
    const at = addInterval(dueDate, -count, reminder.unit)
    if (at <= startDate) {
      return { error: 'お知らせの間隔より短くしてください（このままだと登録した瞬間に鳴ります）' }
    }
    if (at <= now) {
      return { at, warning: 'この時刻はもう過ぎているので、保存するとすぐに通知されます' }
    }
    return { at }
  })

  const hasErrors = !intervalCount || reminderChecks.some((check) => check.error)

  function addReminderRow() {
    setReminders((prev) => [
      ...prev,
      { key: nextDraftKey(), value: '1', unit: DEFAULT_REMINDER_UNIT[intervalUnit] },
    ])
  }

  function removeReminderRow(key: string) {
    setReminders((prev) => prev.filter((r) => r.key !== key))
  }

  function updateReminderRow(key: string, patch: Partial<ReminderDraft>) {
    setReminders((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || hasErrors || !intervalCount) return
    onSubmit({
      name: name.trim(),
      intervalValue: intervalCount,
      intervalUnit,
      reminders: reminders.map((r) => ({ value: parseCount(r.value) ?? 1, unit: r.unit })),
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

      <div className="field">
        <span>お知らせの間隔</span>
        <div className="inline-fields">
          <input
            type="text"
            inputMode="numeric"
            aria-label="お知らせの間隔（数）"
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
          />
          <select
            aria-label="お知らせの間隔（単位）"
            value={intervalUnit}
            onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
          >
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
          <span>ごと</span>
        </div>
        {initial && (
          <p className="field-hint">
            数え始め: {formatDateTime(startDate)}（編集しても変わりません。リセットすると今から数え直します）
          </p>
        )}
        {dueDate ? (
          <p className="field-hint">
            次のお知らせ: <strong>{formatDateTime(dueDate)}</strong>
            {dueDate <= now && '（もう過ぎています）'}
          </p>
        ) : (
          <p className="field-error">{COUNT_ERROR}</p>
        )}
      </div>

      <div className="field">
        <span>事前通知（次のお知らせより前にも知らせる）</span>
        <div className="reminder-list">
          {reminders.map((reminder, index) => {
            const check = reminderChecks[index]
            return (
              <div className="reminder-item" key={reminder.key}>
                <div className="inline-fields reminder-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="事前通知（数）"
                    value={reminder.value}
                    onChange={(e) => updateReminderRow(reminder.key, { value: e.target.value })}
                  />
                  <select
                    aria-label="事前通知（単位）"
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
                    aria-label="事前通知を削除"
                  >
                    ×
                  </button>
                </div>
                {check.error && <p className="field-error">{check.error}</p>}
                {check.at && (
                  <p className={check.warning ? 'field-warning' : 'field-hint'}>
                    {formatDateTime(check.at)} に通知
                    {check.warning && `（${check.warning}）`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <button type="button" className="secondary-button" onClick={addReminderRow}>
          ＋ 事前通知を追加
        </button>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="primary-button" disabled={hasErrors}>
          {initial ? '更新する' : '登録する'}
        </button>
      </div>
    </form>
  )
}
