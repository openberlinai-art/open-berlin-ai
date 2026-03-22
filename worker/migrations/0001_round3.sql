-- Round 3 migrations: Reviews, Push subscriptions, Attendance reminders

CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL REFERENCES users(id),
  item_type  TEXT NOT NULL CHECK(item_type IN ('location','poi')),
  item_id    TEXT NOT NULL,
  rating     INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  body       TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_item ON reviews(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id   TEXT NOT NULL REFERENCES users(id),
  endpoint  TEXT NOT NULL,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, endpoint)
);

-- Add reminder columns to user_attendance (safe for existing rows)
-- Note: ALTER TABLE ADD COLUMN is idempotent-safe with IF NOT EXISTS in newer SQLite,
-- but D1 may not support it. Run these and ignore errors if columns already exist.
ALTER TABLE user_attendance ADD COLUMN reminder_hours INTEGER DEFAULT NULL;
ALTER TABLE user_attendance ADD COLUMN reminder_sent INTEGER DEFAULT NULL;
