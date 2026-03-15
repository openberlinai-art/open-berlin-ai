import { Hono }         from 'hono'
import { cors }         from 'hono/cors'
import { getEvents, getEvent } from './db'
import { ingestEvents } from './ingest'
import { geocodeAll, geocodeAllLocations } from './geocoder'
import { ingestLocations } from './ingest-locations'
import { refreshGeodata } from './geodata'

const OSM_CATEGORIES = new Set([
  'vintage', 'vinyl', 'books', 'cafe', 'craft_beer',
  'tattoo', 'bike', 'vegan', 'street_art',
])
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
import { enrichLocationsWithImages } from './enrich-images'
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

// ─── Rate limiter (D1-backed, best-effort) ────────────────────────────────────

async function checkRateLimit(
  db: D1Database, key: string, maxReqs: number, windowSecs: number
): Promise<boolean> {
  const now    = Date.now()
  const window = Math.floor(now / (windowSecs * 1000))
  const rkey   = `${key}:${window}`
  try {
    const row = await db.prepare(
      `INSERT INTO rate_limits (key, count, window) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`
    ).bind(rkey, window).first<{ count: number }>()
    return (row?.count ?? 1) <= maxReqs
  } catch {
    return true // fail open if table doesn't exist yet
  }
}

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
    c.env.DB.prepare(`SELECT id, title, date_start, time_start, category, price_type, description
                      FROM events WHERE location_id = ? AND date_start >= ?
                      ORDER BY date_start ASC LIMIT 100`)
      .bind(id, today).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT id, title, date_start, time_start, category, price_type, description
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

// ─── GET /api/geodata/osm/:category ───────────────────────────────────────────

app.get('/api/geodata/osm/:category', async c => {
  const cat = c.req.param('category') ?? ''
  if (!OSM_CATEGORIES.has(cat)) return c.json({ error: 'Unknown category' }, 400)
  const obj = await c.env.GEODATA.get(`osm-${cat}.geojson`)
  if (!obj) return c.json({ error: 'not ready' }, 503)
  return new Response(obj.body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
})

// ─── POST /api/vibe-check ─────────────────────────────────────────────────────

app.post('/api/vibe-check', async c => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const allowed = await checkRateLimit(c.env.DB, `vibe:${ip}`, 20, 600)
  if (!allowed) return c.json({ error: 'Too many requests' }, 429)

  const body = await c.req.json<{
    id?: string; name?: string; category?: string; description?: string; borough?: string
  }>().catch(() => null)

  if (!body?.id || !body.name || !body.category) {
    return c.json({ error: 'id, name, and category are required' }, 400)
  }

  const { id, name, category, description, borough } = body

  // Check D1 cache (30-day TTL)
  const cached = await c.env.DB
    .prepare(`SELECT vibe, generated_at FROM venue_vibes WHERE id = ?`)
    .bind(id)
    .first<{ vibe: string; generated_at: string }>()

  if (cached) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19)
    if (cached.generated_at > thirtyDaysAgo) {
      return c.json({ vibe: cached.vibe, cached: true })
    }
  }

  // Generate with Cloudflare AI
  const aiResult = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role:    'system',
        content: 'You write short, vivid, casual venue vibes for a Berlin culture app. 2-3 sentences max. Sound like a knowledgeable local friend, not a travel guide. Never use the word "vibe" itself.',
      },
      {
        role:    'user',
        content: `Write a vibe for: ${name} (${category}) in ${borough ?? 'Berlin'}. ${description ?? ''}`,
      },
    ],
    max_tokens: 120,
  }) as { response?: string }

  const vibe = aiResult.response?.trim() ?? 'A hidden gem worth discovering.'

  // Upsert into D1
  await c.env.DB.prepare(`
    INSERT INTO venue_vibes (id, name, vibe, generated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name         = excluded.name,
      vibe         = excluded.vibe,
      generated_at = excluded.generated_at
  `).bind(id, name, vibe).run()

  return c.json({ vibe, cached: false })
})

// ─── POST /api/translate ──────────────────────────────────────────────────────

const ALLOWED_LANGS = new Set(['tr', 'ar', 'ru', 'pl', 'vi', 'ro', 'en'])

async function hashKey(lang: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(`${lang}:${text}`)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

app.post('/api/translate', async c => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const allowed = await checkRateLimit(c.env.DB, `translate:${ip}`, 30, 300)
  if (!allowed) return c.json({ error: 'Too many requests' }, 429)

  const body = await c.req.json<{ text?: string; targetLang?: string }>().catch(() => null)
  if (!body?.text || !body.targetLang) return c.json({ error: 'text and targetLang required' }, 400)
  if (!ALLOWED_LANGS.has(body.targetLang)) return c.json({ error: 'Unsupported language' }, 400)

  const { text, targetLang } = body
  const cacheId = await hashKey(targetLang, text)

  // Check D1 cache
  const cached = await c.env.DB
    .prepare(`SELECT translated FROM translations WHERE id = ?`)
    .bind(cacheId)
    .first<{ translated: string }>()

  if (cached) return c.json({ translated: cached.translated, cached: true })

  // Call AI translation model
  let translated: string
  try {
    const result = await c.env.AI.run('@cf/meta/m2m100-1.2b' as Parameters<typeof c.env.AI.run>[0], {
      text,
      source_lang: 'de',
      target_lang: targetLang,
    } as Parameters<typeof c.env.AI.run>[1]) as { translated_text?: string }
    translated = result.translated_text?.trim() ?? text
  } catch {
    // AI unavailable — return original text
    return c.json({ translated: text, cached: false })
  }

  // Store in cache
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO translations (id, lang, source, translated) VALUES (?, ?, ?, ?)`
  ).bind(cacheId, targetLang, text, translated).run()

  return c.json({ translated, cached: false })
})

// ─── GET /api/weather ─────────────────────────────────────────────────────────

app.get('/api/weather', async c => {
  const res = await fetch(
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=52.52&longitude=13.41' +
    '&current=temperature_2m,weather_code,wind_speed_10m' +
    '&timezone=Europe%2FBerlin'
  )
  const data = await res.json()
  return c.json(data, {
    headers: { 'Cache-Control': 'public, max-age=600' },
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
  if (!path || (
    !path.startsWith('/stops') &&
    !path.startsWith('/locations') &&
    !path.startsWith('/journeys') &&
    !path.startsWith('/radar')
  ))
    return c.json({ error: 'Invalid path' }, 400)
  const res = await fetch(`https://v6.bvg.transport.rest${path}`)
  if (!res.ok) return c.json({ error: `Upstream ${res.status}` }, 502)
  return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } })
})

// ─── POST /api/chat ───────────────────────────────────────────────────────────

app.post('/api/chat', async c => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const allowed = await checkRateLimit(c.env.DB, `chat:${ip}`, 10, 300)
  if (!allowed) return c.json({ error: 'Too many requests' }, 429)

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

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

app.get('/api/auth/me', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const user = await c.env.DB
    .prepare(`SELECT id, email, display_name, digest_opt_in, preferences FROM users WHERE id = ?`)
    .bind(auth.sub)
    .first<{ id: string; email: string; display_name: string | null; digest_opt_in: number; preferences: string | null }>()
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: user })
})

// ─── PATCH /api/auth/preferences ─────────────────────────────────────────────

app.patch('/api/auth/preferences', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'body required' }, 400)
  await c.env.DB.prepare(`UPDATE users SET preferences = ? WHERE id = ?`)
    .bind(JSON.stringify(body), auth.sub).run()
  return c.json({ ok: true })
})

// ─── GET /api/attendance ──────────────────────────────────────────────────────

app.get('/api/attendance', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const { results } = await c.env.DB
    .prepare(`
      SELECT
        ua.item_type, ua.item_id, ua.scheduled_for, ua.scheduled_time, ua.created_at,
        CASE ua.item_type WHEN 'event'    THEN e.title    WHEN 'location' THEN l.name    END AS title,
        CASE ua.item_type WHEN 'event'    THEN e.date_start                              END AS date_start,
        CASE ua.item_type WHEN 'event'    THEN e.time_start                              END AS time_start,
        CASE ua.item_type WHEN 'event'    THEN e.location_name WHEN 'location' THEN l.borough END AS subtitle
      FROM user_attendance ua
      LEFT JOIN events    e ON ua.item_type = 'event'    AND ua.item_id = e.id
      LEFT JOIN locations l ON ua.item_type = 'location' AND ua.item_id = l.id
      WHERE ua.user_id = ?
      ORDER BY ua.created_at DESC
    `)
    .bind(auth.sub)
    .all<{
      item_type: string; item_id: string
      scheduled_for: string | null; scheduled_time: string | null; created_at: string
      title: string | null; date_start: string | null; time_start: string | null; subtitle: string | null
    }>()
  return c.json({ data: results })
})

// ─── POST /api/attendance ─────────────────────────────────────────────────────

app.post('/api/attendance', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ item_type?: string; item_id?: string; scheduled_for?: string; scheduled_time?: string }>().catch(() => null)
  if (!body?.item_type || !body.item_id) return c.json({ error: 'item_type and item_id required' }, 400)
  if (body.item_type !== 'event' && body.item_type !== 'location') return c.json({ error: 'invalid item_type' }, 400)
  const id = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO user_attendance (id, user_id, item_type, item_id, scheduled_for, scheduled_time)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
      scheduled_for  = COALESCE(excluded.scheduled_for, scheduled_for),
      scheduled_time = COALESCE(excluded.scheduled_time, scheduled_time)
  `).bind(id, auth.sub, body.item_type, body.item_id, body.scheduled_for ?? null, body.scheduled_time ?? null).run()
  return c.json({ ok: true }, 201)
})

// ─── DELETE /api/attendance ───────────────────────────────────────────────────
// Uses query params to avoid slash-in-path issues with OSM IDs like "node/12345"

app.delete('/api/attendance', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const item_type = c.req.query('item_type')
  const item_id   = c.req.query('item_id')
  if (!item_type || !item_id) return c.json({ error: 'item_type and item_id required' }, 400)
  await c.env.DB.prepare(`
    DELETE FROM user_attendance WHERE user_id = ? AND item_type = ? AND item_id = ?
  `).bind(auth.sub, item_type, item_id).run()
  return c.json({ ok: true })
})

// ─── GET /api/lists ───────────────────────────────────────────────────────────

app.get('/api/lists', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const rows = await getLists(auth.sub, c.env.DB)
  // Single query for all item counts (avoids N+1)
  const counts = await c.env.DB
    .prepare(`SELECT list_id, COUNT(*) as n FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id = ?) GROUP BY list_id`)
    .bind(auth.sub)
    .all<{ list_id: string; n: number }>()
  const countMap = Object.fromEntries((counts.results ?? []).map(r => [r.list_id, r.n]))
  const withCount = rows.map(l => ({ ...l, item_count: countMap[l.id] ?? 0 }))
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

// Strip diacritics from a query string in JS (NFD decomposition)
function normalizeQ(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Build a SQLite REPLACE chain that strips common diacritics from a column
function normSql(col: string): string {
  const pairs: [string, string][] = [
    ['ä','a'],['ö','o'],['ü','u'],
    ['ș','s'],['ş','s'],['ț','t'],['ţ','t'],['ă','a'],['â','a'],['î','i'],
    ['é','e'],['è','e'],['ê','e'],['ë','e'],
    ['à','a'],['á','a'],['ã','a'],
    ['ì','i'],['í','i'],['ï','i'],
    ['ò','o'],['ó','o'],['ô','o'],['õ','o'],
    ['ù','u'],['ú','u'],['û','u'],
    ['ý','y'],['ÿ','y'],
    ['ñ','n'],['ç','c'],
    ['ę','e'],['ą','a'],['ś','s'],['ź','z'],['ż','z'],['ć','c'],['ń','n'],['ł','l'],
    ['ğ','g'],['ı','i'],
  ]
  let expr = `LOWER(${col})`
  for (const [from, to] of pairs) {
    expr = `REPLACE(${expr},'${from}','${to}')`
  }
  return expr
}

app.get('/api/search', async c => {
  const raw = (c.req.query('q') ?? '').trim()
  if (raw.length < 2) return c.json({ events: [], locations: [] })
  const norm    = normalizeQ(raw)
  const pattern = `%${norm}%`

  const [evRes, locRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT id, title, date_start, time_start, category, price_type,
             location_name, borough, lat, lng
      FROM events
      WHERE ${normSql('title')} LIKE ?
         OR ${normSql('location_name')} LIKE ?
         OR ${normSql('borough')} LIKE ?
      ORDER BY date_start ASC LIMIT 15
    `).bind(pattern, pattern, pattern).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT id, name, category, address, borough, lat, lng
      FROM locations
      WHERE (${normSql('name')} LIKE ?
          OR ${normSql('address')} LIKE ?
          OR ${normSql('borough')} LIKE ?)
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
  const days      = Number(c.req.query('days')      ?? 365)
  const offsetDays = Number(c.req.query('offsetDays') ?? 0)
  c.executionCtx.waitUntil(
    ingestEvents(c.env, days, offsetDays)
      .then(n => console.log(`[ingest:manual] done — ${n} events (offset=${offsetDays}, days=${days})`))
      .catch(err => console.error('[ingest:manual] failed:', err))
  )
  return c.json({ ok: true, message: `Ingest started: offset=${offsetDays} days, window=${days} days` })
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

// ─── POST /api/enrich-images (protected) ──────────────────────────────────────

app.post('/api/enrich-images', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const count = await enrichLocationsWithImages(c.env.DB)
  return c.json({ ok: true, matched: count })
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
      // Daily geodata refresh (R2) + location sync (D1) + image enrichment
      ctx.waitUntil(
        Promise.all([
          refreshGeodata(env).catch(e => console.error('[geodata]', e)),
          ingestLocations(env)
            .then(() => enrichLocationsWithImages(env.DB))
            .catch(e => console.error('[locations/enrich]', e)),
        ])
      )
    } else if (event.cron === '0 8 * * 1') {
      // Weekly digest — Monday 8am UTC
      ctx.waitUntil(
        sendWeeklyDigest(env)
          .then(() => console.log('[digest] done'))
          .catch(err => console.error('[digest] failed:', err))
      )
    } else if (event.cron === '0 3 * * *') {
      // Full sweep days 31–365 — hourly job already covers 0–30, so skip the overlap
      ctx.waitUntil(
        ingestEvents(env, 335, 30)
          .then(n => console.log(`[ingest:full] done — ${n} events`))
          .catch(err => console.error('[ingest:full] failed:', err))
      )
    } else {
      // Hourly ingest — next 30 days, fast (~7 pages)
      ctx.waitUntil(
        ingestEvents(env, 30)
          .then(n => console.log(`[ingest] done — ${n} events`))
          .catch(err => console.error('[ingest] failed:', err))
      )
    }
  },
}
