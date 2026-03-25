import type { EventRow, EventFilters } from './types'
import { normalizedSimilarity, haversineDistance } from './dedupe'

export interface EventsResult {
  events: EventRow[]
  total:  number
  page:   number
  limit:  number
}

export async function getEvents(
  db: D1Database,
  filters: EventFilters = {}
): Promise<EventsResult> {
  const { date, date_from, date_to, category, price_type, bbox, happening_soon, sort_lat, sort_lng, page = 1, limit = 50 } = filters
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (happening_soon) {
    // Events starting within the next 2 hours (Berlin timezone)
    const now = new Date()
    const berlinNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
    const y = berlinNow.getFullYear()
    const m = String(berlinNow.getMonth() + 1).padStart(2, '0')
    const d = String(berlinNow.getDate()).padStart(2, '0')
    const today = `${y}-${m}-${d}`
    const hh = String(berlinNow.getHours()).padStart(2, '0')
    const mm = String(berlinNow.getMinutes()).padStart(2, '0')
    const nowTime = `${hh}:${mm}`
    const later = new Date(berlinNow.getTime() + 2 * 3600_000)
    const lhh = String(later.getHours()).padStart(2, '0')
    const lmm = String(later.getMinutes()).padStart(2, '0')
    const laterTime = `${lhh}:${lmm}`

    conditions.push('date_start = ?')
    params.push(today)
    conditions.push('time_start IS NOT NULL AND time_start >= ? AND time_start <= ?')
    params.push(nowTime, laterTime)
  } else if (date_from && date_to) {
    conditions.push('date_start >= ? AND date_start <= ?')
    params.push(date_from, date_to)
  } else if (date_from) {
    conditions.push('date_start >= ?')
    params.push(date_from)
  } else if (date_to) {
    conditions.push('date_start <= ?')
    params.push(date_to)
  } else if (date) {
    conditions.push('date_start = ?')
    params.push(date)
  }
  if (category && category !== 'all') {
    conditions.push('LOWER(category) = LOWER(?)')
    params.push(category)
  }
  if (price_type && price_type !== 'all') {
    if (price_type === 'paid') {
      // "Paid" includes paid + unknown (events without price info are likely not free)
      conditions.push("price_type IN ('paid', 'unknown')")
    } else {
      conditions.push('price_type = ?')
      params.push(price_type)
    }
  }
  if (bbox) {
    const parts = bbox.split(',').map(Number)
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      const [minLng, minLat, maxLng, maxLat] = parts
      conditions.push('lat IS NOT NULL AND lat BETWEEN ? AND ?')
      conditions.push('lng IS NOT NULL AND lng BETWEEN ? AND ?')
      params.push(minLat, maxLat, minLng, maxLng)
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  // Distance-based sort when coordinates provided
  const orderBy = sort_lat != null && sort_lng != null
    ? `ORDER BY ((lat - ${sort_lat}) * (lat - ${sort_lat}) + (lng - ${sort_lng}) * (lng - ${sort_lng})) ASC`
    : 'ORDER BY date_start ASC, (CASE WHEN admission_link IS NOT NULL THEN 0 ELSE 1 END) ASC, time_start ASC NULLS LAST, title ASC'

  const [countRow, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as n FROM events ${where}`)
      .bind(...params)
      .first<{ n: number }>(),
    db.prepare(
      `SELECT * FROM events ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all<EventRow>(),
  ])

  return {
    events: rows.results,
    total:  countRow?.n ?? 0,
    page,
    limit,
  }
}

export async function getEvent(
  db: D1Database,
  id: string
): Promise<EventRow | null> {
  return db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventRow>()
}

export async function upsertEvent(
  db: D1Database,
  e: Omit<EventRow, 'created_at' | 'updated_at'>
): Promise<void> {
  await db.prepare(`
    INSERT INTO events (
      id, title, description, date_start, date_end, time_start, time_end,
      category, tags, price_type, price_min, price_max,
      location_name, address, borough, lat, lng,
      source_url, attraction_id, location_id,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      COALESCE((SELECT created_at FROM events WHERE id = ?), datetime('now')),
      datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      title         = excluded.title,
      description   = excluded.description,
      date_start    = excluded.date_start,
      date_end      = excluded.date_end,
      time_start    = excluded.time_start,
      time_end      = excluded.time_end,
      category      = excluded.category,
      tags          = excluded.tags,
      price_type    = excluded.price_type,
      price_min     = excluded.price_min,
      price_max     = excluded.price_max,
      location_name = excluded.location_name,
      address       = excluded.address,
      borough       = excluded.borough,
      lat           = excluded.lat,
      lng           = excluded.lng,
      source_url    = excluded.source_url,
      updated_at    = datetime('now')
  `).bind(
    e.id, e.title, e.description, e.date_start, e.date_end, e.time_start, e.time_end,
    e.category, e.tags, e.price_type, e.price_min, e.price_max,
    e.location_name, e.address, e.borough, e.lat, e.lng,
    e.source_url, e.attraction_id, e.location_id,
    e.id  // for COALESCE subquery
  ).run()
}

/** Batch upsert using D1 batch API (max 50 statements per batch) */
export async function upsertEvents(
  db: D1Database,
  events: Omit<EventRow, 'created_at' | 'updated_at'>[]
): Promise<void> {
  const CHUNK = 50
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK)
    const stmts = chunk.map(e =>
      db.prepare(`
        INSERT INTO events (
          id, title, description, date_start, date_end, time_start, time_end, door_time,
          category, tags, price_type, price_min, price_max, admission_link,
          location_name, address, borough, lat, lng,
          source_url, attraction_id, location_id,
          schedule_status, please_note, admission_note, source_links,
          registration_type, languages, image_urls,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          COALESCE((SELECT created_at FROM events WHERE id = ?), datetime('now')),
          datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title, description = excluded.description,
          date_start = excluded.date_start, date_end = excluded.date_end,
          time_start = excluded.time_start, time_end = excluded.time_end,
          door_time = excluded.door_time,
          category = excluded.category, tags = excluded.tags,
          price_type = excluded.price_type,
          admission_link = excluded.admission_link,
          location_name = excluded.location_name, address = excluded.address,
          borough = excluded.borough,
          lat = COALESCE(excluded.lat, lat),
          lng = COALESCE(excluded.lng, lng),
          source_url = excluded.source_url,
          schedule_status = excluded.schedule_status,
          please_note = excluded.please_note,
          admission_note = excluded.admission_note,
          source_links = excluded.source_links,
          registration_type = excluded.registration_type,
          languages = excluded.languages,
          image_urls = excluded.image_urls,
          updated_at = datetime('now')
      `).bind(
        e.id, e.title, e.description, e.date_start, e.date_end, e.time_start, e.time_end, e.door_time,
        e.category, e.tags, e.price_type, e.price_min, e.price_max, e.admission_link,
        e.location_name, e.address, e.borough, e.lat, e.lng,
        e.source_url, e.attraction_id, e.location_id,
        e.schedule_status, e.please_note, e.admission_note, e.source_links,
        e.registration_type, e.languages, e.image_urls,
        e.id
      )
    )
    await db.batch(stmts)
  }
}

/**
 * Auto-create location records for events that have venue info but no location_id.
 * Generates a stable ID from the venue name, creates a minimal location record,
 * and backfills location_id on matching events.
 */
export async function ensureLocationsForEvents(db: D1Database): Promise<number> {
  // Find distinct venues from events that have no location_id but have location_name + coords
  const rows = await db.prepare(`
    SELECT DISTINCT location_name, address, borough, lat, lng
    FROM events
    WHERE location_id IS NULL
      AND location_name IS NOT NULL
      AND lat IS NOT NULL AND lng IS NOT NULL
    LIMIT 200
  `).all<{ location_name: string; address: string | null; borough: string | null; lat: number; lng: number }>()

  if (!rows.results.length) return 0

  // Load all existing locations for fuzzy matching (~0.00045° ≈ 50m search box)
  const DELTA = 0.005 // ~500m box to fetch candidates
  const MATCH_DIST = 150 // metres — venues can have slightly different pin positions
  const MIN_SIM = 0.55 // name similarity threshold

  let linked = 0
  let created = 0
  const CHUNK = 25

  for (let i = 0; i < rows.results.length; i += CHUNK) {
    const chunk = rows.results.slice(i, i + CHUNK)
    const stmts: D1PreparedStatement[] = []

    for (const v of chunk) {
      // Pass 1: Try to match against existing Kulturdaten/venue locations
      let matchedLocId: string | null = null
      try {
        const nearby = await db.prepare(`
          SELECT id, name, lat, lng FROM locations
          WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
            AND name IS NOT NULL
        `).bind(
          v.lat - DELTA, v.lat + DELTA,
          v.lng - DELTA, v.lng + DELTA,
        ).all<{ id: string; name: string; lat: number; lng: number }>()

        let bestScore = 0
        for (const loc of nearby.results) {
          const dist = haversineDistance(v.lat, v.lng, loc.lat, loc.lng)
          if (dist > MATCH_DIST) continue
          const sim = normalizedSimilarity(v.location_name, loc.name)
          if (sim < MIN_SIM) continue
          // Combined score: weight name similarity heavily, penalise distance
          const score = sim * 0.8 + (1 - dist / MATCH_DIST) * 0.2
          if (score > bestScore) {
            bestScore = score
            matchedLocId = loc.id
          }
        }
      } catch {
        // If lookup fails, fall through to venue creation
      }

      if (matchedLocId) {
        // Link events to the existing location
        stmts.push(db.prepare(`
          UPDATE events SET location_id = ?
          WHERE location_id IS NULL AND location_name = ? AND lat = ? AND lng = ?
        `).bind(matchedLocId, v.location_name, v.lat, v.lng))
        linked++
      } else {
        // Pass 2: Create a synthetic venue record
        const slug = v.location_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80)
        const locId = `venue:${slug}`

        const name = v.location_name.toLowerCase()
        const category = /theater|theatre|bühne|schaubühne/.test(name) ? 'theatre'
          : /kino|cinema|filmtheater/.test(name) ? 'cinema'
          : /museum/.test(name) ? 'museum'
          : /galerie|gallery/.test(name) ? 'gallery'
          : /bibliothek|bücherei/.test(name) ? 'library'
          : /club|lounge/.test(name) ? 'club'
          : /konzerthaus|philharmonie|arena|halle|stadion/.test(name) ? 'concert_hall'
          : 'other'

        stmts.push(db.prepare(`
          INSERT INTO locations (id, name, lat, lng, category, address, borough, is_virtual, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            lat = COALESCE(locations.lat, excluded.lat),
            lng = COALESCE(locations.lng, excluded.lng),
            address = COALESCE(locations.address, excluded.address),
            borough = COALESCE(locations.borough, excluded.borough),
            updated_at = datetime('now')
        `).bind(locId, v.location_name, v.lat, v.lng, category, v.address, v.borough))

        stmts.push(db.prepare(`
          UPDATE events SET location_id = ?
          WHERE location_id IS NULL AND location_name = ? AND lat = ? AND lng = ?
        `).bind(locId, v.location_name, v.lat, v.lng))

        created++
      }
    }

    if (stmts.length) await db.batch(stmts)
  }

  console.log(`[ensure-locations] linked=${linked} to existing, created=${created} new`)
  return linked + created
}
