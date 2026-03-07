import { Hono }         from 'hono'
import { cors }         from 'hono/cors'
import { getEvents, getEvent } from './db'
import { ingestEvents } from './ingest'
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
  const body = await c.req.json<ChatRequest>().catch(() => null)
  if (!body?.message?.trim()) {
    return c.json({ error: 'message is required' }, 400)
  }

  // Load today's events for context
  const today = new Date()
  const date  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
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
    ...(body.history ?? []).slice(-10),            // keep last 10 messages
    { role: 'user'   as const, content: body.message },
  ]

  const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages,
    max_tokens: 600,
  }) as { response?: string }

  return c.json({
    message: {
      role:    'assistant',
      content: aiResponse.response ?? 'Sorry, I could not generate a response.',
    },
  })
})

// ─── POST /api/ingest (manual trigger, protected) ────────────────────────────

app.post('/api/ingest', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const count = await ingestEvents(c.env)
  return c.json({ ok: true, ingested: count })
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
