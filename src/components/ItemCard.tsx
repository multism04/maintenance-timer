import type { MaintenanceItem } from '../types'
import { UNIT_LABELS, addInterval, formatDateTime, formatRemaining } from '../utils/time'

interface ItemCardProps {
  item: MaintenanceItem
  now: Date
  onEdit: () => void
  onDelete: () => void
  onReset: () => void
}

export function ItemCard({ item, now, onEdit, onDelete, onReset }: ItemCardProps) {
  const dueDate = addInterval(new Date(item.baseDate), item.intervalValue, item.intervalUnit)
  const remainingMs = dueDate.getTime() - now.getTime()
  const overdue = remainingMs <= 0

  return (
    <li className={`item-card${overdue ? ' overdue' : ''}`}>
      <div className="item-card-main">
        <div className="item-card-header">
          <h3>{item.name}</h3>
          <span className="remaining-badge">{formatRemaining(remainingMs)}</span>
        </div>
        <p className="item-meta">
          周期: {item.intervalValue}
          {UNIT_LABELS[item.intervalUnit]} ／ 次回: {formatDateTime(dueDate)}
        </p>
        {item.reminders.length > 0 && (
          <p className="item-meta reminders-meta">
            リマインダー:{' '}
            {item.reminders
              .map((r) => `${r.value}${UNIT_LABELS[r.unit]}前`)
              .join('、')}
          </p>
        )}
      </div>
      <div className="item-card-actions">
        <button type="button" className="primary-button" onClick={onReset}>
          リセット
        </button>
        <button type="button" className="secondary-button" onClick={onEdit}>
          編集
        </button>
        <button type="button" className="secondary-button danger" onClick={onDelete}>
          削除
        </button>
      </div>
    </li>
  )
}
