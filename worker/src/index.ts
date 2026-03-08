import { Hono }         from 'hono'
import { cors }         from 'hono/cors'
import { getEvents, getEvent } from './db'
import { ingestEvents } from './ingest'
import { geocode, geocodeAll } from './geocoder'
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
  const { date, category, price_type, page = '1', limit = '50' } = c.req.query()

  const result = await getEvents(c.env.DB, {
    date:       date       || undefined,
    category:   category   || undefined,
    price_type: price_type || undefined,
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

// ─── GET /api/proxy/wfs ───────────────────────────────────────────────────────

app.get('/api/proxy/wfs', async c => {
  const typeName = c.req.query('typeName')
  // Whitelist: only gruenanlagen: typenames allowed (prevent SSRF abuse)
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
  if (!path || !path.startsWith('/stops'))
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

// ─── POST /api/geocode-batch (protected) ──────────────────────────────────────
// Geocodes up to 30 events that are missing coordinates.
// Call repeatedly until { remaining: 0 }.

app.post('/api/geocode-batch', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const geocoded = await geocodeAll(c.env.DB)
  const remaining = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM events WHERE lat IS NULL AND address IS NOT NULL`)
    .first<{ n: number }>()

  return c.json({ geocoded, remaining: remaining?.n ?? 0 })
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
      // Geocode-only pass — runs frequently to catch up after ingest
      ctx.waitUntil(
        geocodeAll(env.DB)
          .then(n => console.log(`[geocode] geocoded ${n} events`))
          .catch(err => console.error('[geocode] failed:', err))
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
