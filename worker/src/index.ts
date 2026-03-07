import { Hono }         from 'hono'
import { cors }         from 'hono/cors'
import { getEvents, getEvent } from './db'
import { ingestEvents } from './ingest'
import { geocode }      from './geocoder'
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

  // Fetch events without coordinates that have an address
  const rows = await c.env.DB
    .prepare(`SELECT id, address FROM events WHERE lat IS NULL AND address IS NOT NULL LIMIT 30`)
    .all<{ id: string; address: string }>()

  let geocoded = 0
  for (const row of rows.results ?? []) {
    const coords = await geocode(c.env.DB, row.address)
    if (coords) {
      await c.env.DB
        .prepare(`UPDATE events SET lat = ?, lng = ? WHERE id = ?`)
        .bind(coords.lat, coords.lng, row.id)
        .run()
      geocoded++
    }
  }

  const remaining = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM events WHERE lat IS NULL AND address IS NOT NULL`)
    .first<{ n: number }>()

  return c.json({ geocoded, remaining: remaining?.n ?? 0 })
})

// ─── Exports ──────────────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env:    Env,
    ctx:    ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      ingestEvents(env).catch(err =>
        console.error('[scheduled] ingest failed:', err)
      )
    )
  },
}
