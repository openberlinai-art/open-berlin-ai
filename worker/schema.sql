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
  registration_type TEXT,                   -- 'required'|'optional'|null
  languages       TEXT,                      -- JSON array of ISO language codes
  image_urls      TEXT,                      -- JSON array of image URLs
  raw_json        TEXT,                      -- full source for debugging
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_date_start      ON events(date_start);
CREATE INDEX IF NOT EXISTS idx_events_category        ON events(LOWER(category));
CREATE INDEX IF NOT EXISTS idx_events_price_type      ON events(price_type);
CREATE INDEX IF NOT EXISTS idx_events_date_cat        ON events(date_start, category);
CREATE INDEX IF NOT EXISTS idx_events_borough         ON events(borough);
CREATE INDEX IF NOT EXISTS idx_events_updated         ON events(updated_at);
CREATE INDEX IF NOT EXISTS idx_events_geo             ON events(lat, lng);
CREATE INDEX IF NOT EXISTS idx_events_location_id     ON events(location_id);     -- venue detail page
CREATE INDEX IF NOT EXISTS idx_events_schedule_status ON events(schedule_status); -- digest filter

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
  is_virtual     INTEGER NOT NULL DEFAULT 0,
  contact_email  TEXT,
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_locations_geo      ON locations(lat, lng);
CREATE INDEX IF NOT EXISTS idx_locations_category ON locations(category);
CREATE INDEX IF NOT EXISTS idx_locations_borough  ON locations(borough);

CREATE TABLE IF NOT EXISTS geocode_cache (
  address     TEXT    PRIMARY KEY,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  cached_at   TEXT    DEFAULT (datetime('now'))
);

-- ─── User accounts (magic-link auth) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,               -- UUID
  email         TEXT    NOT NULL UNIQUE,
  display_name  TEXT,
  digest_opt_in INTEGER NOT NULL DEFAULT 0,
  preferences   TEXT,                              -- JSON: { categories: string[], boroughs: string[] }
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_digest           ON users(digest_opt_in);          -- weekly digest query
CREATE INDEX IF NOT EXISTS idx_users_display_name     ON users(LOWER(display_name));    -- shareList lookup

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

-- ─── User attendance (calendar / going) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_attendance (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type      TEXT NOT NULL CHECK(item_type IN ('event', 'location')),
  item_id        TEXT NOT NULL,
  scheduled_for  TEXT,                             -- optional date override (YYYY-MM-DD)
  scheduled_time TEXT,                             -- optional time override (HH:MM)
  created_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON user_attendance(user_id);

-- ─── Translation cache (AI-translated text, keyed by lang+content hash) ──────

CREATE TABLE IF NOT EXISTS translations (
  id         TEXT PRIMARY KEY,  -- 16-hex sha256 of "lang:sourceText"
  lang       TEXT NOT NULL,
  source     TEXT NOT NULL,
  translated TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Rate limiting (best-effort, per-IP per window) ───────────────────────────

CREATE TABLE IF NOT EXISTS rate_limits (
  key    TEXT    PRIMARY KEY,   -- "{prefix}:{ip}:{window}"
  count  INTEGER NOT NULL DEFAULT 1,
  window INTEGER NOT NULL       -- Math.floor(Date.now() / windowMs)
);

-- ─── Migration log (columns / indexes added after initial deploy) ─────────────
-- events:     registration_type, languages, image_urls (already in live DB)
-- locations:  description, phone, accessibility, opening_hours, opening_status,
--             extra_links, is_virtual, contact_email (already in live DB)
-- users:      digest_opt_in, preferences (already in live DB)
-- user_attendance: scheduled_for, scheduled_time (already in live DB)
-- New indexes (run if not exists):
--   wrangler d1 execute kulturpulse-db --remote --command "CREATE INDEX IF NOT EXISTS idx_events_location_id ON events(location_id)"
--   wrangler d1 execute kulturpulse-db --remote --command "CREATE INDEX IF NOT EXISTS idx_events_schedule_status ON events(schedule_status)"
--   wrangler d1 execute kulturpulse-db --remote --command "CREATE INDEX IF NOT EXISTS idx_users_digest ON users(digest_opt_in)"
--   wrangler d1 execute kulturpulse-db --remote --command "CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(LOWER(display_name))"
