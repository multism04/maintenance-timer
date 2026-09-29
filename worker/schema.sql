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
