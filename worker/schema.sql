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
  category        TEXT,
  tags            TEXT,                      -- JSON array
  price_type      TEXT    DEFAULT 'free'
                  CHECK(price_type IN ('free','paid','unknown')),
  price_min       REAL,
  price_max       REAL,
  location_name   TEXT,
  address         TEXT,
  borough         TEXT,
  lat             REAL,
  lng             REAL,
  source_url      TEXT,
  attraction_id   TEXT,
  location_id     TEXT,
  raw_json        TEXT,                      -- full source for debugging
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_date_start ON events(date_start);
CREATE INDEX IF NOT EXISTS idx_events_category   ON events(LOWER(category));
CREATE INDEX IF NOT EXISTS idx_events_price_type ON events(price_type);
CREATE INDEX IF NOT EXISTS idx_events_date_cat   ON events(date_start, category);
CREATE INDEX IF NOT EXISTS idx_events_borough    ON events(borough);
CREATE INDEX IF NOT EXISTS idx_events_updated    ON events(updated_at);

CREATE TABLE IF NOT EXISTS geocode_cache (
  address     TEXT    PRIMARY KEY,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  cached_at   TEXT    DEFAULT (datetime('now'))
);
