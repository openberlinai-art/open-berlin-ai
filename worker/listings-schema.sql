-- Listings table migration
-- Run: wrangler d1 execute citizen-berlin-db --remote --file=worker/listings-schema.sql

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
