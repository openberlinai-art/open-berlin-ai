import type { EventRow, EventFilters } from './types'

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
  const { date, category, price_type, page = 1, limit = 50 } = filters
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (date) {
    conditions.push('date_start = ?')
    params.push(date)
  }
  if (category && category !== 'all') {
    conditions.push('LOWER(category) = LOWER(?)')
    params.push(category)
  }
  if (price_type && price_type !== 'all') {
    conditions.push('price_type = ?')
    params.push(price_type)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const [countRow, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as n FROM events ${where}`)
      .bind(...params)
      .first<{ n: number }>(),
    db.prepare(
      `SELECT * FROM events ${where}
       ORDER BY time_start ASC NULLS LAST, title ASC
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
          title = excluded.title, description = excluded.description,
          date_start = excluded.date_start, date_end = excluded.date_end,
          time_start = excluded.time_start, time_end = excluded.time_end,
          category = excluded.category, tags = excluded.tags,
          price_type = excluded.price_type,
          location_name = excluded.location_name, address = excluded.address,
          borough = excluded.borough, lat = excluded.lat, lng = excluded.lng,
          source_url = excluded.source_url, updated_at = datetime('now')
      `).bind(
        e.id, e.title, e.description, e.date_start, e.date_end, e.time_start, e.time_end,
        e.category, e.tags, e.price_type, e.price_min, e.price_max,
        e.location_name, e.address, e.borough, e.lat, e.lng,
        e.source_url, e.attraction_id, e.location_id,
        e.id
      )
    )
    await db.batch(stmts)
  }
}
