-- Citizen.Berlin D1 Schema
-- Run: wrangler d1 execute citizen-berlin-db --remote --file=worker/schema.sql

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
  image_credit    TEXT,                      -- attribution text for image source
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
  item_type TEXT NOT NULL CHECK(item_type IN ('event', 'location', 'listing')),
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
  item_type      TEXT NOT NULL CHECK(item_type IN ('event', 'location', 'listing')),
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

-- ─── OSM cultural venues (Overpass → D1, refreshed daily) ───────────────────

CREATE TABLE IF NOT EXISTS osm_venues (
  id            TEXT PRIMARY KEY,   -- "node/12345" or "way/67890"
  category      TEXT NOT NULL,
  name          TEXT,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  address       TEXT,
  website       TEXT,
  phone         TEXT,
  opening_hours TEXT,
  description   TEXT,
  operator      TEXT,
  refreshed_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_osm_venues_category ON osm_venues(category);
CREATE INDEX IF NOT EXISTS idx_osm_venues_geo      ON osm_venues(lat, lng);

-- ─── POIs (expanded OSM categories — Berlin + Brandenburg) ──────────────────

CREATE TABLE IF NOT EXISTS pois (
  id             TEXT    PRIMARY KEY,      -- "node/12345" or "way/67890"
  category_group TEXT    NOT NULL,         -- heritage, monuments, worship, etc.
  category       TEXT    NOT NULL,         -- castle, lake, restaurant, etc.
  name           TEXT,
  lat            REAL    NOT NULL,
  lng            REAL    NOT NULL,
  geohash        TEXT    NOT NULL,         -- 6-char geohash for spatial prefix queries
  region         TEXT    NOT NULL DEFAULT 'berlin',  -- 'berlin' | 'brandenburg'
  address        TEXT,
  website        TEXT,
  phone          TEXT,
  opening_hours  TEXT,
  description    TEXT,
  operator       TEXT,
  tags_json      TEXT,                     -- JSON: extra OSM tags (cuisine, sport, etc.)
  image_url      TEXT,                     -- resolved Wikimedia Commons thumbnail URL
  refreshed_at   TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pois_group_geohash ON pois(category_group, geohash);
CREATE INDEX IF NOT EXISTS idx_pois_cat_geohash   ON pois(category, geohash);
CREATE INDEX IF NOT EXISTS idx_pois_geo           ON pois(lat, lng);
CREATE INDEX IF NOT EXISTS idx_pois_category      ON pois(category);

-- ─── POI ingestion log ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poi_ingestion_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT    NOT NULL,
  region        TEXT    NOT NULL,
  status        TEXT    NOT NULL,   -- 'running','success','failed'
  row_count     INTEGER DEFAULT 0,
  started_at    TEXT    DEFAULT (datetime('now')),
  completed_at  TEXT,
  error_message TEXT
);

-- ─── Berlin streets (Overpass → D1, refreshed weekly) ─────────────────────────

CREATE TABLE IF NOT EXISTS streets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  name_norm    TEXT NOT NULL,   -- lowercase, diacritics-stripped for fast LIKE
  lat          REAL NOT NULL,   -- centroid
  lng          REAL NOT NULL,
  postcode     TEXT,
  borough      TEXT,
  region       TEXT NOT NULL DEFAULT 'berlin',
  osm_id       INTEGER,
  refreshed_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_streets_name_norm ON streets(name_norm);
CREATE INDEX IF NOT EXISTS idx_streets_region    ON streets(region);

-- ─── Item view tracking (trending) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS item_views (
  item_type TEXT NOT NULL,
  item_id   TEXT NOT NULL,
  view_date TEXT NOT NULL,
  count     INTEGER DEFAULT 1,
  PRIMARY KEY (item_type, item_id, view_date)
);

-- ─── POI duplicate detection ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poi_duplicates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  poi_id          TEXT NOT NULL,
  osm_venue_id    TEXT NOT NULL,
  distance_m      REAL,
  name_similarity REAL,
  status          TEXT DEFAULT 'pending',
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ─── Rate limiting (best-effort, per-IP per window) ───────────────────────────

CREATE TABLE IF NOT EXISTS rate_limits (
  key    TEXT    PRIMARY KEY,   -- "{prefix}:{ip}:{window}"
  count  INTEGER NOT NULL DEFAULT 1,
  window INTEGER NOT NULL       -- Math.floor(Date.now() / windowMs)
);

-- ─── Listings (Kleinanzeigen-style classifieds) ─────────────────────────────

CREATE TABLE IF NOT EXISTS listings (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             TEXT    NOT NULL CHECK(type IN ('apartment_rent','apartment_buy','item','service')),
  title            TEXT    NOT NULL,
  description      TEXT,
  price_cents      INTEGER,
  price_type       TEXT    NOT NULL DEFAULT 'fixed' CHECK(price_type IN ('fixed','negotiable','free','per_month')),
  currency         TEXT    NOT NULL DEFAULT 'EUR',
  category         TEXT,
  images           TEXT,                              -- JSON array of R2 keys
  lat              REAL,
  lng              REAL,
  address          TEXT,
  borough          TEXT,
  rooms            REAL,
  sqm              REAL,
  floor            INTEGER,
  contact_method   TEXT    NOT NULL DEFAULT 'email' CHECK(contact_method IN ('email','phone','both')),
  contact_info     TEXT,
  status           TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','sold','expired')),
  created_at       TEXT    DEFAULT (datetime('now')),
  expires_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_listings_user    ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_type    ON listings(type);
CREATE INDEX IF NOT EXISTS idx_listings_status  ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_geo     ON listings(lat, lng);
CREATE INDEX IF NOT EXISTS idx_listings_borough ON listings(borough);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at);

-- ─── Addresses (OSM house-number-level, refreshed monthly) ──────────────────

CREATE TABLE IF NOT EXISTS addresses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  street        TEXT NOT NULL,
  street_norm   TEXT NOT NULL,
  housenumber   TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  postcode      TEXT,
  osm_id        INTEGER,
  refreshed_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_addresses_street_norm ON addresses(street_norm);
CREATE INDEX IF NOT EXISTS idx_addresses_street_num  ON addresses(street_norm, housenumber);

-- ─── OSM edit suggestions (community contributions) ─────────────────────────

CREATE TABLE IF NOT EXISTS osm_suggestions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  suggestion_type TEXT NOT NULL,  -- add_place, edit_name, edit_address, edit_hours, report_closed, other
  osm_id          TEXT,
  poi_id          TEXT,
  category_group  TEXT,
  category        TEXT,
  data            TEXT NOT NULL,  -- JSON { name, address, opening_hours, website, phone, lat, lng, comment }
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, pushed
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_osm_suggestions_status ON osm_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_osm_suggestions_user   ON osm_suggestions(user_id);

-- ─── Community-submitted events ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_events (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  date_start      TEXT NOT NULL,
  date_end        TEXT,
  time_start      TEXT,
  time_end        TEXT,
  is_recurring    INTEGER NOT NULL DEFAULT 0,
  recurrence_day  TEXT,
  location_name   TEXT,
  address         TEXT,
  borough         TEXT,
  lat             REAL,
  lng             REAL,
  category        TEXT,
  tags            TEXT,
  is_free         INTEGER NOT NULL DEFAULT 0,
  ticket_url      TEXT,
  image_key       TEXT,
  submitter_name  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  votes_up        INTEGER NOT NULL DEFAULT 0,
  votes_down      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  approved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_community_events_status ON community_events(status);
CREATE INDEX IF NOT EXISTS idx_community_events_date   ON community_events(date_start);
CREATE INDEX IF NOT EXISTS idx_community_events_user   ON community_events(user_id);
CREATE INDEX IF NOT EXISTS idx_community_events_geo    ON community_events(lat, lng);

CREATE TABLE IF NOT EXISTS community_votes (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id  TEXT NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  vote      INTEGER NOT NULL CHECK(vote IN (-1, 1)),
  PRIMARY KEY (user_id, event_id)
);

-- ─── Chat conversations (persistent history) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages   TEXT NOT NULL DEFAULT '[]',   -- JSON array of {role, content, ts}
  title      TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_convos_user ON chat_conversations(user_id);

-- ─── Migration log (columns / indexes added after initial deploy) ─────────────
-- events:     registration_type, languages, image_urls (already in live DB)
-- locations:  description, phone, accessibility, opening_hours, opening_status,
--             extra_links, is_virtual, contact_email (already in live DB)
-- users:      digest_opt_in, preferences (already in live DB)
-- user_attendance: scheduled_for, scheduled_time (already in live DB)
-- New indexes (run if not exists):
--   wrangler d1 execute citizen-berlin-db --remote --command "CREATE INDEX IF NOT EXISTS idx_events_location_id ON events(location_id)"
--   wrangler d1 execute citizen-berlin-db --remote --command "CREATE INDEX IF NOT EXISTS idx_events_schedule_status ON events(schedule_status)"
--   wrangler d1 execute citizen-berlin-db --remote --command "CREATE INDEX IF NOT EXISTS idx_users_digest ON users(digest_opt_in)"
--   wrangler d1 execute citizen-berlin-db --remote --command "CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(LOWER(display_name))"
-- pois: embedded_at (vectorize sync tracking)
--   wrangler d1 execute citizen-berlin-db --remote --command "ALTER TABLE pois ADD COLUMN embedded_at TEXT"
