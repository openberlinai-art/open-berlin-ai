-- KulturPulse D1 Schema
-- Run: wrangler d1 execute kulturpulse-db --remote --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS events (
  id              TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL,
  description     TEXT,
  date_start      TEXT    NOT NULL,          -- YYYY-MM-DD
  date_end        TEXT,
  time_start      TEXT,                      -- HH:MM:SS
  time_end        TEXT,
  door_time       TEXT,                      -- doors-open time (HH:MM:SS)
  category        TEXT,
  tags            TEXT,                      -- JSON array
  price_type      TEXT    DEFAULT 'free'
                  CHECK(price_type IN ('free','paid','unknown')),
  price_min       REAL,
  price_max       REAL,
  admission_link  TEXT,                      -- ticket purchase URL
  location_name   TEXT,
  address         TEXT,
  borough         TEXT,
  lat             REAL,
  lng             REAL,
  source_url      TEXT,
  attraction_id   TEXT,
  location_id     TEXT,
  schedule_status TEXT,                      -- 'cancelled'|'postponed'|'rescheduled'|'scheduled'
  please_note     TEXT,                      -- important attendee info
  admission_note  TEXT,                      -- per-event admission note (e.g. age restrictions)
  source_links    TEXT,                      -- JSON array of {url, displayName?} from attraction externalLinks
  raw_json        TEXT,                      -- full source for debugging
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);
-- Migration: add new columns if they don't exist
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN door_time TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN admission_link TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN schedule_status TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN please_note TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN admission_note TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN source_links TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN registration_type TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE events ADD COLUMN languages TEXT"

CREATE INDEX IF NOT EXISTS idx_events_date_start ON events(date_start);
CREATE INDEX IF NOT EXISTS idx_events_category   ON events(LOWER(category));
CREATE INDEX IF NOT EXISTS idx_events_price_type ON events(price_type);
CREATE INDEX IF NOT EXISTS idx_events_date_cat   ON events(date_start, category);
CREATE INDEX IF NOT EXISTS idx_events_borough    ON events(borough);
CREATE INDEX IF NOT EXISTS idx_events_updated    ON events(updated_at);

-- Cultural venue locations from kulturdaten.berlin
CREATE TABLE IF NOT EXISTS locations (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  lat            REAL,
  lng            REAL,
  category       TEXT,   -- 'museum'|'gallery'|'theatre'|'library'|'other'
  address        TEXT,
  borough        TEXT,
  website        TEXT,
  tags           TEXT,   -- JSON array of raw kulturdaten tags
  description    TEXT,
  phone          TEXT,
  accessibility  TEXT,   -- JSON array of accessibility codes
  opening_hours  TEXT,   -- JSON array of {dayOfWeek, opens, closes, validFrom?, validThrough?}
  opening_status TEXT,   -- 'location.opened'|'location.closed'|'location.permanentlyClosed'
  extra_links    TEXT,   -- JSON array of {url, displayName?}
  updated_at     TEXT DEFAULT (datetime('now'))
);
-- Migration: add new columns if they don't exist (safe to run multiple times)
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN description TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN phone TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN accessibility TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN opening_hours TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN opening_status TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN extra_links TEXT"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN is_virtual INTEGER NOT NULL DEFAULT 0"
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE locations ADD COLUMN contact_email TEXT"
CREATE INDEX IF NOT EXISTS idx_locations_geo      ON locations(lat, lng);
CREATE INDEX IF NOT EXISTS idx_locations_category ON locations(category);
CREATE INDEX IF NOT EXISTS idx_locations_borough  ON locations(borough);

-- Geo index on events for bbox queries
CREATE INDEX IF NOT EXISTS idx_events_geo ON events(lat, lng);

CREATE TABLE IF NOT EXISTS geocode_cache (
  address     TEXT    PRIMARY KEY,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  cached_at   TEXT    DEFAULT (datetime('now'))
);

-- ─── User accounts (magic-link auth) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,               -- UUID
  email        TEXT NOT NULL UNIQUE,
  display_name TEXT,
  digest_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);
-- Migration: add digest_opt_in to existing deployments
-- wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE users ADD COLUMN digest_opt_in INTEGER NOT NULL DEFAULT 0"

CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL                     -- ISO timestamp, 15 min TTL
);

-- ─── Lists ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lists (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_public   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id);

CREATE TABLE IF NOT EXISTS list_items (
  id        TEXT PRIMARY KEY,
  list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('event', 'location')),
  item_id   TEXT NOT NULL,
  notes     TEXT,
  added_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(list_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);

-- ─── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,    -- 'list_shared' | 'invite'
  data       TEXT NOT NULL,    -- JSON payload
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

-- ─── Venue vibes (AI-generated, D1-cached 30 days) ───────────────────────────

CREATE TABLE IF NOT EXISTS venue_vibes (
  id           TEXT PRIMARY KEY,   -- "node/12345" or "kd:L_XXXXX"
  name         TEXT,
  vibe         TEXT NOT NULL,
  generated_at TEXT DEFAULT (datetime('now'))
);
-- Migration: wrangler d1 execute kulturpulse-db --remote --command "CREATE TABLE IF NOT EXISTS venue_vibes (id TEXT PRIMARY KEY, name TEXT, vibe TEXT NOT NULL, generated_at TEXT DEFAULT (datetime('now')))"

-- ─── User attendance (calendar / going) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_attendance (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK(item_type IN ('event', 'location')),
  item_id    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON user_attendance(user_id);
-- Migration: wrangler d1 execute kulturpulse-db --remote --command "CREATE TABLE IF NOT EXISTS user_attendance (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_type TEXT NOT NULL CHECK(item_type IN ('event','location')), item_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, item_type, item_id))"
-- Migration: wrangler d1 execute kulturpulse-db --remote --command "CREATE INDEX IF NOT EXISTS idx_attendance_user ON user_attendance(user_id)"

-- ─── User preferences ─────────────────────────────────────────────────────────
-- Migration (already run): wrangler d1 execute kulturpulse-db --remote --command "ALTER TABLE users ADD COLUMN preferences TEXT"
-- Migration (already run): wrangler d1 execute kulturpulse-db --remote --command "CREATE TABLE IF NOT EXISTS user_attendance (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_type TEXT NOT NULL CHECK(item_type IN ('event','location')), item_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, item_type, item_id))"
-- Migration (already run): wrangler d1 execute kulturpulse-db --remote --command "CREATE INDEX IF NOT EXISTS idx_attendance_user ON user_attendance(user_id)"
