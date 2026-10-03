import { useEffect, useState } from 'react'
import './App.css'
import { ItemForm } from './components/ItemForm'
import { ItemList } from './components/ItemList'
import { useItems } from './hooks/useItems'
import { useNotificationPermission } from './hooks/useNotifications'
import type { ItemInput } from './types'
import { formatDateTime } from './utils/time'

const TICK_INTERVAL_MS = 30_000

function App() {
  const { items, addItem, updateItem, deleteItem, resetItem } = useItems()
  const { supported, permission, requestPermission } = useNotificationPermission()

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
      </header>

      {supported && permission !== 'granted' && (
        <div className="notice-banner" role="alert">
          <p>
            <strong>通知がオフです。</strong>
            このままだと、期限が来てもお知らせが届きません。
          </p>
          {permission === 'denied' ? (
            <p className="notice-sub">
              端末のChromeの設定（サイトの設定 → 通知）で、このサイトを「許可」にしてください。設定を変えてこの画面に戻ると、自動で反映されます。
            </p>
          ) : (
            <button type="button" className="primary-button" onClick={requestPermission}>
              通知を有効にする
            </button>
          )}
        </div>
      )}

      <main>
        <ItemList items={items} now={now} onEdit={openEditForm} onDelete={handleDelete} onReset={resetItem} />
      </main>

      <footer className="app-footer">
        版: {formatDateTime(new Date(__BUILD_TIME__))} ({__BUILD_SHA__})
      </footer>

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
