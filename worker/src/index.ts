import { Hono }         from 'hono'
import { cors }         from 'hono/cors'
import { getEvents, getEvent } from './db'
import { ingestEvents } from './ingest'
import { geocodeAll, geocodeAllLocations } from './geocoder'
import { ingestLocations } from './ingest-locations'
import { refreshGeodata } from './geodata'
import {
  sendMagicLink, verifyMagicToken, getOrCreateUser,
  getUserFromHeader, signJWT,
} from './auth'
import {
  getLists, getList, createList, updateList, deleteList,
  getListItems, addListItem, removeListItem,
  getNotifications, markNotificationRead, markAllNotificationsRead,
  shareList,
} from './lists'
import { sendWeeklyDigest } from './digest'
import type { Env, ChatRequest } from './types'

const app = new Hono<{ Bindings: Env }>()

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use('*', cors({
  origin: (origin, c) => {
    const allowed = c.env.ALLOWED_ORIGIN ?? ''
    if (!origin) return allowed
    if (origin.startsWith('http://localhost:')) return origin
    if (allowed.split(',').map(s => s.trim()).includes(origin)) return origin
    return allowed
  },
  allowHeaders:  ['Content-Type', 'Authorization'],
  allowMethods:  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge:        86400,
}))

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/', c => c.json({ ok: true, service: 'kulturpulse-worker' }))

// ─── GET /api/events ──────────────────────────────────────────────────────────

app.get('/api/events', async c => {
  const { date, date_from, date_to, category, price_type, bbox, page = '1', limit = '50' } = c.req.query()

  const result = await getEvents(c.env.DB, {
    date:       date       || undefined,
    date_from:  date_from  || undefined,
    date_to:    date_to    || undefined,
    category:   category   || undefined,
    price_type: price_type || undefined,
    bbox:       bbox       || undefined,
    page:       Math.max(1, parseInt(page, 10)),
    limit:      Math.min(500, Math.max(1, parseInt(limit, 10))),
  })

  return c.json({
    data: result.events,
    pagination: {
      total:       result.total,
      page:        result.page,
      limit:       result.limit,
      total_pages: Math.ceil(result.total / result.limit),
    },
  })
})

// ─── GET /api/events/:id ──────────────────────────────────────────────────────

app.get('/api/events/:id', async c => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: event })
})

// ─── GET /api/locations ───────────────────────────────────────────────────────
// ?bbox=minLon,minLat,maxLon,maxLat&category=museum&limit=500
// Returns GeoJSON FeatureCollection of cultural venue locations.

app.get('/api/locations', async c => {
  const { bbox, category, limit = '500' } = c.req.query()

  const conditions: string[] = ['lat IS NOT NULL', 'lng IS NOT NULL']
  const params: (string | number)[] = []

  if (bbox) {
    const parts = bbox.split(',').map(Number)
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      const [minLng, minLat, maxLng, maxLat] = parts
      conditions.push('lat BETWEEN ? AND ?')
      conditions.push('lng BETWEEN ? AND ?')
      params.push(minLat, maxLat, minLng, maxLng)
    }
  }

  if (category) {
    conditions.push('category = ?')
    params.push(category)
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  const cap   = Math.min(500, Math.max(1, parseInt(limit, 10)))
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM locations ${where} LIMIT ?`)
    .bind(...params, cap)
    .all<Record<string, unknown>>()

  const features = results.map(loc => ({
    type:       'Feature' as const,
    geometry:   { type: 'Point' as const, coordinates: [loc.lng, loc.lat] },
    properties: {
      id:       loc.id,
      name:     loc.name,
      category: loc.category,
      address:  loc.address,
      borough:  loc.borough,
      website:  loc.website,
    },
  }))

  return c.json({ type: 'FeatureCollection', features })
})

// ─── GET /api/locations/:id ───────────────────────────────────────────────────

app.get('/api/locations/:id', async c => {
  const id  = c.req.param('id')
  const loc = await c.env.DB
    .prepare(`SELECT * FROM locations WHERE id = ?`).bind(id)
    .first<Record<string, unknown>>()
  if (!loc) return c.json({ error: 'Not found' }, 404)

  const today = new Date().toISOString().slice(0, 10)
  const [upcomingRes, pastRes] = await Promise.all([
    c.env.DB.prepare(`SELECT id, title, date_start, time_start, category, price_type
                      FROM events WHERE location_id = ? AND date_start >= ?
                      ORDER BY date_start ASC LIMIT 100`)
      .bind(id, today).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT id, title, date_start, time_start, category, price_type
                      FROM events WHERE location_id = ? AND date_start < ?
                      ORDER BY date_start DESC LIMIT 50`)
      .bind(id, today).all<Record<string, unknown>>(),
  ])

  return c.json({ data: { ...loc, events: upcomingRes.results, pastEvents: pastRes.results } })
})

// ─── GET /api/geodata/parks ───────────────────────────────────────────────────
// Serves parks GeoJSON from R2 with 1h CDN cache.

app.get('/api/geodata/parks', async c => {
  const obj = await c.env.GEODATA.get('parks.geojson')
  if (!obj) return c.json({ error: 'Not yet generated — trigger /api/refresh-geodata' }, 503)
  return new Response(obj.body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
})

// ─── GET /api/geodata/playgrounds ─────────────────────────────────────────────

app.get('/api/geodata/playgrounds', async c => {
  const obj = await c.env.GEODATA.get('playgrounds.geojson')
  if (!obj) return c.json({ error: 'Not yet generated — trigger /api/refresh-geodata' }, 503)
  return new Response(obj.body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
})

// ─── GET /api/geodata/parks-points ────────────────────────────────────────────

app.get('/api/geodata/parks-points', async c => {
  const obj = await c.env.GEODATA.get('parks-points.geojson')
  if (!obj) return c.json({ error: 'Not yet generated — trigger /api/refresh-geodata' }, 503)
  return new Response(obj.body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
})

// ─── GET /api/geodata/playgrounds-points ──────────────────────────────────────

app.get('/api/geodata/playgrounds-points', async c => {
  const obj = await c.env.GEODATA.get('playgrounds-points.geojson')
  if (!obj) return c.json({ error: 'Not yet generated — trigger /api/refresh-geodata' }, 503)
  return new Response(obj.body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
})

// ─── GET /api/proxy/wfs ───────────────────────────────────────────────────────
// Kept as fallback CORS proxy (for local dev / seeding).

app.get('/api/proxy/wfs', async c => {
  const typeName = c.req.query('typeName')
  if (!typeName || !typeName.startsWith('gruenanlagen:'))
    return c.json({ error: 'Invalid typeName' }, 400)

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName,
    outputFormat: 'application/json',
  })
  const res = await fetch(`https://gdi.berlin.de/services/wfs/gruenanlagen?${params}`)
  if (!res.ok) return c.json({ error: `Upstream ${res.status}` }, 502)
  return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } })
})

// ─── GET /api/proxy/vbb ───────────────────────────────────────────────────────

app.get('/api/proxy/vbb', async c => {
  const path = c.req.query('path')
  if (!path || (!path.startsWith('/stops') && !path.startsWith('/locations')))
    return c.json({ error: 'Invalid path' }, 400)
  const res = await fetch(`https://v6.vbb.transport.rest${path}`)
  if (!res.ok) return c.json({ error: `Upstream ${res.status}` }, 502)
  return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } })
})

// ─── POST /api/chat ───────────────────────────────────────────────────────────

app.post('/api/chat', async c => {
  const body = await c.req.json<{ messages: { role: string; content: string }[]; date?: string }>().catch(() => null)
  if (!body?.messages?.length) {
    return c.json({ error: 'messages is required' }, 400)
  }

  const date = body.date ?? new Date().toISOString().split('T')[0]

  // Fetch rich context in parallel
  const [eventsRes, catRes, venuesRes, locationCountRes, parkCountRes] = await Promise.all([
    // Up to 50 events for the date
    getEvents(c.env.DB, { date_from: date, date_to: date, limit: 50 }),
    // Category breakdown
    c.env.DB
      .prepare(`SELECT category, COUNT(*) as n FROM events WHERE date_start = ? GROUP BY category ORDER BY n DESC`)
      .bind(date)
      .all<{ category: string | null; n: number }>(),
    // Sample of venues/locations with useful info
    c.env.DB
      .prepare(`SELECT name, category, borough, address FROM locations
                WHERE lat IS NOT NULL ORDER BY RANDOM() LIMIT 25`)
      .all<{ name: string | null; category: string | null; borough: string | null; address: string | null }>(),
    // Total locations count
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM locations`).first<{ n: number }>(),
    // Total upcoming events count (next 7 days)
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM events WHERE date_start >= ? AND date_start <= date(?, '+7 days')`)
      .bind(date, date)
      .first<{ n: number }>(),
  ])

  const { events, total } = eventsRes

  const eventsList = events.slice(0, 40).map(e =>
    `- ${e.title} | ${e.category ?? 'Other'} | ${e.time_start?.slice(0,5) ?? 'all day'} | ${e.location_name ?? '?'}, ${e.borough ?? '?'} | ${e.price_type}`
  ).join('\n')

  const categoryBreakdown = catRes.results
    .map(r => `${r.category ?? 'Other'}: ${r.n}`)
    .join(', ')

  const venuesList = venuesRes.results
    .map(v => `- ${v.name ?? '?'} (${v.category ?? 'other'}) — ${v.borough ?? '?'}`)
    .join('\n')

  const totalLocations = locationCountRes?.n ?? 0
  const weekEvents = parkCountRes?.n ?? 0

  const systemPrompt = `You are KulturPulse, a Berlin culture events assistant with access to a live database.
Today is ${date}.

## EVENTS ON ${date} (${total} total)
Categories: ${categoryBreakdown}

Events (up to 40 listed):
${eventsList || 'No events found for this date.'}

## VENUES & LOCATIONS (${totalLocations} total in database, 25 shown)
${venuesList}

## OTHER DATA
- Parks: hundreds of Berlin parks are mapped (Grünanlagen from Berlin GDI). Users can enable the Parks layer on the map.
- Playgrounds: hundreds of Spielplätze are mapped. Enable the Playgrounds layer.
- Upcoming events (next 7 days): ~${weekEvents}

## INSTRUCTIONS
- Answer questions about events, venues, parks, and playgrounds in Berlin.
- Suggest specific events or venues from the lists above when relevant.
- For parks/playgrounds, explain users can see them on the map by enabling the Parks or Playgrounds toggle.
- Keep answers concise (2-4 sentences). Do not repeat the full event list unless asked.
- If asked about something outside Berlin culture, politely redirect.`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...body.messages.slice(-10).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages,
    max_tokens: 500,
  }) as { response?: string }

  return c.json({
    response: aiResponse.response ?? 'Sorry, I could not generate a response.',
  })
})

// ─── POST /api/auth/magic-link ────────────────────────────────────────────────

app.post('/api/auth/magic-link', async c => {
  const body = await c.req.json<{ email?: string }>().catch(() => null)
  if (!body?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return c.json({ error: 'Valid email required' }, 400)
  }
  try {
    const result = await sendMagicLink(body.email.toLowerCase(), c.env)
    return c.json({ ok: true, ...result })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

// ─── GET /api/auth/verify ─────────────────────────────────────────────────────

app.get('/api/auth/verify', async c => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'token required' }, 400)
  const email = await verifyMagicToken(token, c.env.DB)
  if (!email) return c.json({ error: 'Invalid or expired token' }, 400)
  const user = await getOrCreateUser(email, c.env.DB)
  const jwt  = await signJWT(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    c.env.JWT_SECRET,
  )
  return c.json({ token: jwt, user })
})

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

app.post('/api/auth/refresh', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const token = await signJWT(
    { sub: auth.sub, email: auth.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    c.env.JWT_SECRET,
  )
  return c.json({ token })
})

// ─── POST /api/auth/profile ───────────────────────────────────────────────────

app.post('/api/auth/profile', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ display_name?: string }>().catch(() => null)
  if (!body?.display_name) return c.json({ error: 'display_name required' }, 400)
  await c.env.DB.prepare(`UPDATE users SET display_name = ? WHERE id = ?`)
    .bind(body.display_name, auth.sub).run()
  return c.json({ ok: true })
})

// ─── PATCH /api/auth/profile ─────────────────────────────────────────────────

app.patch('/api/auth/profile', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ digest_opt_in?: boolean }>().catch(() => null)
  if (!body || body.digest_opt_in === undefined) return c.json({ error: 'digest_opt_in required' }, 400)
  await c.env.DB.prepare(`UPDATE users SET digest_opt_in = ? WHERE id = ?`)
    .bind(body.digest_opt_in ? 1 : 0, auth.sub).run()
  return c.json({ ok: true })
})

// ─── GET /api/lists ───────────────────────────────────────────────────────────

app.get('/api/lists', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const rows = await getLists(auth.sub, c.env.DB)
  // Attach item_count
  const withCount = await Promise.all(rows.map(async l => {
    const cnt = await c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM list_items WHERE list_id = ?`).bind(l.id)
      .first<{ n: number }>()
    return { ...l, item_count: cnt?.n ?? 0 }
  }))
  return c.json({ data: withCount })
})

// ─── POST /api/lists ──────────────────────────────────────────────────────────

app.post('/api/lists', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ name?: string; description?: string; is_public?: boolean }>().catch(() => null)
  if (!body?.name) return c.json({ error: 'name required' }, 400)
  const list = await createList(auth.sub, body.name, body.description ?? null, !!body.is_public, c.env.DB)
  return c.json({ data: { ...list, item_count: 0 } }, 201)
})

// ─── PUT /api/lists/:id ───────────────────────────────────────────────────────

app.put('/api/lists/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ name?: string; description?: string; is_public?: boolean }>().catch(() => null)
  if (!body) return c.json({ error: 'body required' }, 400)
  const ok = await updateList(c.req.param('id'), auth.sub, body, c.env.DB)
  return ok ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)
})

// ─── DELETE /api/lists/:id ────────────────────────────────────────────────────

app.delete('/api/lists/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const ok = await deleteList(c.req.param('id'), auth.sub, c.env.DB)
  return ok ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)
})

// ─── GET /api/lists/:id/items ─────────────────────────────────────────────────

app.get('/api/lists/:id/items', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const items = await getListItems(c.req.param('id'), c.env.DB)
  return c.json({ data: items })
})

// ─── POST /api/lists/:id/items ────────────────────────────────────────────────

app.post('/api/lists/:id/items', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ item_type?: string; item_id?: string; notes?: string | null }>().catch(() => null)
  if (!body?.item_type || !body.item_id) return c.json({ error: 'item_type and item_id required' }, 400)
  if (body.item_type !== 'event' && body.item_type !== 'location') return c.json({ error: 'invalid item_type' }, 400)
  const item = await addListItem(c.req.param('id'), body.item_type, body.item_id, body.notes ?? null, c.env.DB)
  return c.json({ data: item }, 201)
})

// ─── DELETE /api/lists/:id/items/:itemId ──────────────────────────────────────

app.delete('/api/lists/:id/items/:itemId', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const ok = await removeListItem(c.req.param('itemId'), c.req.param('id'), c.env.DB)
  return ok ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)
})

// ─── POST /api/lists/:id/share ────────────────────────────────────────────────

app.post('/api/lists/:id/share', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ email?: string }>().catch(() => null)
  if (!body?.email) return c.json({ error: 'email required' }, 400)
  const result = await shareList(c.req.param('id'), auth.sub, body.email, c.env.DB)
  if (!result.ok) return c.json({ error: result.error }, result.error === 'Not authorised' ? 403 : 404)
  return c.json({ ok: true })
})

// ─── GET /api/lists/:id/public (no auth — public lists only) ─────────────────

app.get('/api/lists/:id/public', async c => {
  const list = await getList(c.req.param('id'), c.env.DB)
  if (!list) return c.json({ error: 'Not found' }, 404)
  const items = await getListItems(list.id, c.env.DB)

  // Enrich items with human-readable title + subtitle
  const enriched = await Promise.all(items.map(async item => {
    if (item.item_type === 'event') {
      const ev = await c.env.DB
        .prepare(`SELECT title, date_start, location_name FROM events WHERE id = ?`)
        .bind(item.item_id)
        .first<{ title: string | null; date_start: string | null; location_name: string | null }>()
      return {
        ...item,
        title:    ev?.title ?? null,
        subtitle: [ev?.date_start, ev?.location_name].filter(Boolean).join(' · ') || null,
      }
    } else {
      const loc = await c.env.DB
        .prepare(`SELECT name, borough FROM locations WHERE id = ?`)
        .bind(item.item_id)
        .first<{ name: string | null; borough: string | null }>()
      return {
        ...item,
        title:    loc?.name ?? null,
        subtitle: loc?.borough ?? null,
      }
    }
  }))

  return c.json({ data: { list, items: enriched } })
})

// ─── POST /api/lists/:id/copy ─────────────────────────────────────────────────

app.post('/api/lists/:id/copy', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const list = await getList(c.req.param('id'), c.env.DB)
  if (!list) return c.json({ error: 'Not found' }, 404)

  const items = await getListItems(list.id, c.env.DB)

  const newList = await createList(auth.sub, list.name, list.description, false, c.env.DB)
  for (const item of items) {
    await addListItem(newList.id, item.item_type, item.item_id, item.notes, c.env.DB)
  }

  return c.json({ data: { ...newList, item_count: items.length } }, 201)
})

// ─── GET /api/notifications ───────────────────────────────────────────────────

app.get('/api/notifications', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const data = await getNotifications(auth.sub, c.env.DB)
  return c.json({ data })
})

// ─── PATCH /api/notifications/:id ────────────────────────────────────────────

app.patch('/api/notifications/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')
  if (id === 'all') {
    await markAllNotificationsRead(auth.sub, c.env.DB)
  } else {
    await markNotificationRead(id, auth.sub, c.env.DB)
  }
  return c.json({ ok: true })
})

// ─── GET /api/search ─────────────────────────────────────────────────────────

app.get('/api/search', async c => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ events: [], locations: [] })
  const pattern = `%${q}%`

  const [evRes, locRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT id, title, date_start, time_start, category, price_type,
             location_name, borough, lat, lng
      FROM events
      WHERE title LIKE ? OR location_name LIKE ? OR borough LIKE ?
      ORDER BY date_start ASC LIMIT 15
    `).bind(pattern, pattern, pattern).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT id, name, category, address, borough, lat, lng
      FROM locations
      WHERE (name LIKE ? OR address LIKE ? OR borough LIKE ?)
        AND lat IS NOT NULL
      LIMIT 15
    `).bind(pattern, pattern, pattern).all<Record<string, unknown>>(),
  ])

  return c.json({ events: evRes.results, locations: locRes.results })
})

// ─── POST /api/ingest (protected) ─────────────────────────────────────────────

app.post('/api/ingest', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const count = await ingestEvents(c.env)
  return c.json({ ok: true, ingested: count })
})

// ─── POST /api/ingest-locations (protected) ───────────────────────────────────

app.post('/api/ingest-locations', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const count = await ingestLocations(c.env)
  return c.json({ ok: true, ingested: count })
})

// ─── POST /api/refresh-geodata (protected) ────────────────────────────────────

app.post('/api/refresh-geodata', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await refreshGeodata(c.env)
  return c.json({ ok: true })
})

// ─── POST /api/geocode-batch (protected) ──────────────────────────────────────

app.post('/api/geocode-batch', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const offset = parseInt(c.req.query('offset') ?? '0', 10)

  const geocodedEvents    = await geocodeAll(c.env.DB, offset)
  const geocodedLocations = await geocodeAllLocations(c.env.DB, offset)

  const remainingEvents = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM events WHERE lat IS NULL AND address IS NOT NULL`)
    .first<{ n: number }>()
  const remainingLocations = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM locations WHERE lat IS NULL AND address IS NOT NULL`)
    .first<{ n: number }>()

  return c.json({
    geocoded: { events: geocodedEvents, locations: geocodedLocations },
    remaining: { events: remainingEvents?.n ?? 0, locations: remainingLocations?.n ?? 0 },
  })
})

// ─── Exports ──────────────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(
    event: ScheduledEvent,
    env:   Env,
    ctx:   ExecutionContext
  ): Promise<void> {
    if (event.cron === '*/30 * * * *') {
      // Geocode-only pass — runs frequently to catch up after ingest (events + locations)
      ctx.waitUntil(
        Promise.all([
          geocodeAll(env.DB)
            .then(n => console.log(`[geocode] events: ${n}`))
            .catch(err => console.error('[geocode:events]', err)),
          geocodeAllLocations(env.DB)
            .then(n => console.log(`[geocode] locations: ${n}`))
            .catch(err => console.error('[geocode:locations]', err)),
        ])
      )
    } else if (event.cron === '0 2 * * *') {
      // Daily geodata refresh (R2) + location sync (D1)
      ctx.waitUntil(
        Promise.all([
          refreshGeodata(env).catch(e => console.error('[geodata]', e)),
          ingestLocations(env).catch(e => console.error('[locations]', e)),
        ])
      )
    } else if (event.cron === '0 8 * * 1') {
      // Weekly digest — Monday 8am UTC
      ctx.waitUntil(
        sendWeeklyDigest(env)
          .then(() => console.log('[digest] done'))
          .catch(err => console.error('[digest] failed:', err))
      )
    } else {
      // Full ingest every 6 hours
      ctx.waitUntil(
        ingestEvents(env)
          .then(n => console.log(`[ingest] done — ${n} events`))
          .catch(err => console.error('[ingest] failed:', err))
      )
    }
  },
}
