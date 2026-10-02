CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  subscription TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  interval_value INTEGER NOT NULL,
  interval_unit TEXT NOT NULL,
  base_date TEXT NOT NULL,
  reminders TEXT NOT NULL DEFAULT '[]',
  server_overdue_notified INTEGER NOT NULL DEFAULT 0,
  server_notified_reminder_ids TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_items_device ON items(device_id);

-- One row per cron run ("cron") and per push attempt ("overdue"/"reminder"),
-- so "did it fire?" can be answered after the fact. Pruned to 30 days.
CREATE TABLE IF NOT EXISTS push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  device_id TEXT,
  item_id TEXT,
  item_name TEXT,
  result TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_log_created ON push_log(created_at);
