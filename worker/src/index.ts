import { Hono }         from 'hono'
import { cors }         from 'hono/cors'
import { getEvents, getEvent } from './db'
import { ingestEvents } from './ingest'
import { geocodeAll, geocodeAllLocations } from './geocoder'
import { ingestLocations } from './ingest-locations'
import { refreshGeodata } from './geodata'
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
  allowMethods:  ['GET', 'POST', 'OPTIONS'],
  maxAge:        86400,
}))

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/', c => c.json({ ok: true, service: 'kulturpulse-worker' }))

// ─── GET /api/events ──────────────────────────────────────────────────────────

app.get('/api/events', async c => {
  const { date, category, price_type, bbox, page = '1', limit = '50' } = c.req.query()

  const result = await getEvents(c.env.DB, {
    date:       date       || undefined,
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

  const { results: events } = await c.env.DB
    .prepare(`SELECT id, title, date_start, time_start, category, price_type
              FROM events WHERE location_id = ? ORDER BY date_start LIMIT 20`)
    .bind(id).all<Record<string, unknown>>()

  return c.json({ data: { ...loc, events } })
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
  const { events } = await getEvents(c.env.DB, { date, limit: 20 })

  const eventsContext = events.slice(0, 15).map(e => ({
    title:    e.title,
    category: e.category,
    time:     e.time_start?.slice(0,5) ?? null,
    venue:    e.location_name,
    borough:  e.borough,
    price:    e.price_type,
  }))

  const systemPrompt = [
    'You are KulturPulse, a helpful Berlin culture events assistant.',
    `Today is ${date}.`,
    `There are ${events.length} events in Berlin today. Here is a sample:`,
    JSON.stringify(eventsContext, null, 2),
    'Answer questions about Berlin culture events concisely. Suggest events from the list when relevant.',
    'If asked about something outside Berlin culture, politely redirect.',
  ].join('\n')

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...body.messages.slice(-10).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages,
    max_tokens: 600,
  }) as { response?: string }

  return c.json({
    response: aiResponse.response ?? 'Sorry, I could not generate a response.',
  })
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
