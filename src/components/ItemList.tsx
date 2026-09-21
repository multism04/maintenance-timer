import type { MaintenanceItem } from '../types'
import { addInterval } from '../utils/time'
import { ItemCard } from './ItemCard'

interface ItemListProps {
  items: MaintenanceItem[]
  now: Date
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onReset: (id: string) => void
}

export function ItemList({ items, now, onEdit, onDelete, onReset }: ItemListProps) {
  if (items.length === 0) {
    return <p className="empty-state">登録された項目はありません。右下の「＋」から追加してください。</p>
  }

  const sorted = [...items].sort((a, b) => {
    const dueA = addInterval(new Date(a.baseDate), a.intervalValue, a.intervalUnit).getTime()
    const dueB = addInterval(new Date(b.baseDate), b.intervalValue, b.intervalUnit).getTime()
    return dueA - dueB
  })

  return (
    <ul className="item-list">
      {sorted.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          now={now}
          onEdit={() => onEdit(item.id)}
          onDelete={() => onDelete(item.id)}
          onReset={() => onReset(item.id)}
        />
      ))}
    </ul>
  )
}
