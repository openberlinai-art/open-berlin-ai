// Community-submitted event CRUD + moderation

export interface CommunityEventRow {
  id:             string
  user_id:        string
  title:          string
  description:    string | null
  date_start:     string
  date_end:       string | null
  time_start:     string | null
  time_end:       string | null
  is_recurring:   number
  recurrence_day: string | null
  location_name:  string | null
  address:        string | null
  borough:        string | null
  lat:            number | null
  lng:            number | null
  category:       string | null
  tags:           string | null  // JSON array
  is_free:        number
  ticket_url:     string | null
  image_key:      string | null
  submitter_name: string | null
  status:         'pending' | 'approved' | 'rejected'
  votes_up:       number
  votes_down:     number
  created_at:     string
  approved_at:    string | null
}

export async function createCommunityEvent(
  userId: string,
  body: Record<string, unknown>,
  db: D1Database,
): Promise<CommunityEventRow> {
  // Rate limit: max 5 pending per user per day
  const countRow = await db.prepare(
    `SELECT COUNT(*) as n FROM community_events
     WHERE user_id = ? AND status = 'pending'
       AND created_at > datetime('now', '-1 day')`
  ).bind(userId).first<{ n: number }>()

  if ((countRow?.n ?? 0) >= 5) {
    throw new Error('RATE_LIMIT')
  }

  // Duplicate check
  const title = String(body.title ?? '').trim()
  const dateStart = String(body.date_start ?? '')
  if (title && dateStart) {
    const dup = await db.prepare(
      `SELECT id FROM community_events
       WHERE date_start = ? AND LOWER(SUBSTR(title, 1, 30)) = LOWER(SUBSTR(?, 1, 30))
         AND status != 'rejected'`
    ).bind(dateStart, title).first<{ id: string }>()
    if (dup) throw new Error(`DUPLICATE:${dup.id}`)
  }

  const id = crypto.randomUUID()
  const description = body.description ? String(body.description).slice(0, 400) : null
  const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : null

  await db.prepare(`
    INSERT INTO community_events (
      id, user_id, title, description, date_start, date_end,
      time_start, time_end, is_recurring, recurrence_day,
      location_name, address, borough, lat, lng,
      category, tags, is_free, ticket_url, submitter_name, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).bind(
    id, userId, title, description,
    dateStart, body.date_end ?? null,
    body.time_start ?? null, body.time_end ?? null,
    body.is_recurring ? 1 : 0, body.recurrence_day ?? null,
    body.location_name ?? null, body.address ?? null, body.borough ?? null,
    body.lat ?? null, body.lng ?? null,
    body.category ?? null, tags,
    body.is_free ? 1 : 0, body.ticket_url ?? null,
    body.submitter_name ?? null,
  ).run()

  return (await db.prepare(`SELECT * FROM community_events WHERE id = ?`).bind(id).first()) as CommunityEventRow
}

export async function getCommunityEvents(
  db: D1Database,
  filters: { status?: string; date_from?: string; date_to?: string; bbox?: string; user_id?: string; page?: number; limit?: number },
): Promise<{ events: CommunityEventRow[]; total: number }> {
  const conditions: string[] = []
  const params: (string | number)[] = []
  const { status = 'approved', date_from, date_to, bbox, user_id, page = 1, limit = 50 } = filters

  conditions.push('status = ?')
  params.push(status)

  if (date_from) { conditions.push('date_start >= ?'); params.push(date_from) }
  if (date_to)   { conditions.push('date_start <= ?'); params.push(date_to) }
  if (user_id)   { conditions.push('user_id = ?'); params.push(user_id) }

  if (bbox) {
    const parts = bbox.split(',').map(Number)
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      const [minLng, minLat, maxLng, maxLat] = parts
      conditions.push('lat BETWEEN ? AND ?')
      conditions.push('lng BETWEEN ? AND ?')
      params.push(minLat!, maxLat!, minLng!, maxLng!)
    }
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  const offset = (page - 1) * limit

  const [countRow, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as n FROM community_events ${where}`).bind(...params).first<{ n: number }>(),
    db.prepare(`SELECT * FROM community_events ${where} ORDER BY date_start ASC, time_start ASC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset).all<CommunityEventRow>(),
  ])

  return { events: rows.results, total: countRow?.n ?? 0 }
}

export async function getCommunityEvent(db: D1Database, id: string): Promise<CommunityEventRow | null> {
  return db.prepare(`SELECT * FROM community_events WHERE id = ?`).bind(id).first<CommunityEventRow>()
}

export async function updateCommunityEvent(
  id: string, userId: string, fields: Record<string, unknown>, db: D1Database,
): Promise<boolean> {
  const existing = await db.prepare(
    `SELECT id FROM community_events WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first()
  if (!existing) return false

  const allowed = ['title', 'description', 'date_start', 'date_end', 'time_start', 'time_end',
    'is_recurring', 'recurrence_day', 'location_name', 'address', 'borough', 'lat', 'lng',
    'category', 'tags', 'is_free', 'ticket_url', 'submitter_name']

  const sets: string[] = []
  const vals: unknown[] = []
  for (const key of allowed) {
    if (key in fields) {
      if (key === 'tags' && Array.isArray(fields[key])) {
        sets.push(`${key} = ?`); vals.push(JSON.stringify(fields[key]))
      } else if (key === 'description') {
        sets.push(`${key} = ?`); vals.push(String(fields[key] ?? '').slice(0, 400))
      } else {
        sets.push(`${key} = ?`); vals.push(fields[key] as string | number | null)
      }
    }
  }
  if (!sets.length) return true

  await db.prepare(
    `UPDATE community_events SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  ).bind(...vals, id, userId).run()
  return true
}

export async function deleteCommunityEvent(
  id: string, userId: string, db: D1Database, r2: R2Bucket,
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT id, image_key FROM community_events WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first<{ id: string; image_key: string | null }>()
  if (!row) return false

  // Delete R2 image if exists
  if (row.image_key) {
    try { await r2.delete(row.image_key) } catch { /* ignore */ }
  }

  await db.prepare(`DELETE FROM community_events WHERE id = ?`).bind(id).run()
  return true
}

export async function uploadCommunityEventImage(
  eventId: string, userId: string,
  data: ArrayBuffer, filename: string, contentType: string,
  db: D1Database, r2: R2Bucket,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const row = await db.prepare(
    `SELECT id, image_key FROM community_events WHERE id = ? AND user_id = ?`
  ).bind(eventId, userId).first<{ id: string; image_key: string | null }>()
  if (!row) return { ok: false, error: 'Not found or not owner' }

  // Delete old image if replacing
  if (row.image_key) {
    try { await r2.delete(row.image_key) } catch { /* ignore */ }
  }

  const key = `community-events/${eventId}/${filename}`
  await r2.put(key, data, { httpMetadata: { contentType } })
  await db.prepare(`UPDATE community_events SET image_key = ? WHERE id = ?`).bind(key, eventId).run()

  return { ok: true, key }
}

export async function voteCommunityEvent(
  eventId: string, userId: string, vote: 1 | -1, db: D1Database,
): Promise<void> {
  // Upsert vote
  await db.prepare(`
    INSERT INTO community_votes (user_id, event_id, vote) VALUES (?, ?, ?)
    ON CONFLICT(user_id, event_id) DO UPDATE SET vote = excluded.vote
  `).bind(userId, eventId, vote).run()

  // Recount
  const [up, down] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as n FROM community_votes WHERE event_id = ? AND vote = 1`).bind(eventId).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) as n FROM community_votes WHERE event_id = ? AND vote = -1`).bind(eventId).first<{ n: number }>(),
  ])

  await db.prepare(`UPDATE community_events SET votes_up = ?, votes_down = ? WHERE id = ?`)
    .bind(up?.n ?? 0, down?.n ?? 0, eventId).run()
}

export async function moderateCommunityEvent(
  id: string, status: 'approved' | 'rejected', db: D1Database,
): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE community_events SET status = ?, approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE NULL END
    WHERE id = ?
  `).bind(status, status, id).run()
  return (result.meta?.changes ?? 0) > 0
}
