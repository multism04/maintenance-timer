import { useEffect, useState } from 'react'
import './App.css'
import { ItemForm } from './components/ItemForm'
import { ItemList } from './components/ItemList'
import { useItems } from './hooks/useItems'
import { useDueNotifications, useNotificationPermission } from './hooks/useNotifications'
import type { ItemInput } from './types'

const TICK_INTERVAL_MS = 30_000

function App() {
  const { items, addItem, updateItem, deleteItem, resetItem, markReminderNotified, markOverdueNotified } =
    useItems()
  const { supported, permission, requestPermission } = useNotificationPermission()
  useDueNotifications(items, permission, markReminderNotified, markOverdueNotified)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])

  const [isFormOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const editingItem = editingId ? items.find((item) => item.id === editingId) ?? null : null

  function openAddForm() {
    setEditingId(null)
    setFormOpen(true)
  }

  function openEditForm(id: string) {
    setEditingId(id)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
  }

  function handleSubmit(input: ItemInput) {
    if (editingId) {
      updateItem(editingId, input)
    } else {
      addItem(input)
    }
    closeForm()
  }

  function handleDelete(id: string) {
    const target = items.find((item) => item.id === id)
    if (target && window.confirm(`「${target.name}」を削除しますか？`)) {
      deleteItem(id)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-titles">
          <span className="eyebrow-label">Track. Remind. Reset.</span>
          <h1>メンテナンスタイマー</h1>
        </div>
        {supported && permission !== 'granted' && (
          <button type="button" className="secondary-button" onClick={requestPermission}>
            {permission === 'denied' ? '通知がブロックされています' : '通知を有効にする'}
          </button>
        )}
      </header>

      <main>
        <ItemList items={items} now={now} onEdit={openEditForm} onDelete={handleDelete} onReset={resetItem} />
      </main>

      <button type="button" className="fab" onClick={openAddForm} aria-label="項目を追加">
        ＋
      </button>

      {isFormOpen && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingItem ? '項目を編集' : '新規登録'}</h2>
            <ItemForm initial={editingItem} onSubmit={handleSubmit} onCancel={closeForm} />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
