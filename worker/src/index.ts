import { Hono }         from 'hono'
import { cors }         from 'hono/cors'
import { getEvents, getEvent, ensureLocationsForEvents } from './db'
import {
  createCommunityEvent, getCommunityEvents, getCommunityEvent,
  updateCommunityEvent, deleteCommunityEvent, uploadCommunityEventImage,
  voteCommunityEvent, moderateCommunityEvent,
} from './community-events'
import { ingestEvents } from './ingest'
import { ingestTicketmaster } from './ingest-ticketmaster'
import { ingestSongkick } from './ingest-songkick'
import { ingestOpenLigaDB } from './ingest-openligadb'
import { geocodeAll, geocodeAllLocations } from './geocoder'
import { ingestLocations } from './ingest-locations'
import { refreshGeodata } from './geodata'
import { ingestPOIs } from './poi-ingest'
import { ingestStreets } from './street-ingest'
import { ingestAddresses } from './address-ingest'
import { syncPOIsToVectorize } from './vectorize-sync'
import { semanticSearchPOIs } from './vector-search'
import { bboxToGeohashPrefixes } from './geohash'
import { POI_CATEGORIES } from './poi-queries'
import type { POICategoryGroup } from './poi-queries'
import { deduplicatePOIs } from './dedupe'

const OSM_CATEGORIES = new Set([
  'live_music', 'jazz', 'cinema', 'clubs', 'galleries', 'street_art', 'museum',
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
import { generateSmartNotifications } from './smart-notifications'
import { sendPushReminders } from './push-reminders'
import { enrichLocationsWithImages } from './enrich-images'
import { enrichPOIImages } from './enrich-poi-images'
import { enrichEventImages } from './enrich-event-images'
import { ingestCherryBlossoms } from './ingest-cherry-blossoms'
import {
  getListings, getListing, createListing, updateListing,
  deleteListing, uploadListingImage,
} from './listings'
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

app.get('/', c => c.json({ ok: true, service: 'citizen-berlin-worker' }))

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
  const { date, date_from, date_to, category, price_type, bbox, happening_soon, sort_lat, sort_lng, page = '1', limit = '50' } = c.req.query()

  // Auto-filter past events when viewing today (Berlin timezone)
  let timeAfter: string | undefined
  const berlinNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const berlinDate = `${berlinNow.getFullYear()}-${String(berlinNow.getMonth() + 1).padStart(2, '0')}-${String(berlinNow.getDate()).padStart(2, '0')}`
  const berlinTime = `${String(berlinNow.getHours()).padStart(2, '0')}:${String(berlinNow.getMinutes()).padStart(2, '0')}`

  // Only filter by time when the query includes today as single day or range start
  const queryDate = date_from || date
  if (queryDate === berlinDate && (!date_to || date_to === berlinDate)) {
    timeAfter = berlinTime
  }

  const result = await getEvents(c.env.DB, {
    date:       date       || undefined,
    date_from:  date_from  || undefined,
    date_to:    date_to    || undefined,
    category:   category   || undefined,
    price_type: price_type || undefined,
    bbox:       bbox       || undefined,
    happening_soon: happening_soon === 'true',
    time_after: timeAfter,
    sort_lat:   sort_lat ? parseFloat(sort_lat) : undefined,
    sort_lng:   sort_lng ? parseFloat(sort_lng) : undefined,
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
  }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' })
})

// ─── GET /api/events/for-you (auth required) ─────────────────────────────────

app.get('/api/events/for-you', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const user = await c.env.DB
    .prepare(`SELECT preferences FROM users WHERE id = ?`)
    .bind(auth.sub).first<{ preferences: string | null }>()

  let prefs: { categories?: string[]; boroughs?: string[] } = {}
  try { prefs = user?.preferences ? JSON.parse(user.preferences) : {} } catch { /* ignore */ }

  const cats = prefs.categories ?? []
  const boroughs = prefs.boroughs ?? []

  let results: Record<string, unknown>[] = []

  if (cats.length > 0 || boroughs.length > 0) {
    const conditions: string[] = [`date_start >= date('now')`]
    const params: (string | number)[] = []
    const orParts: string[] = []

    if (cats.length > 0) {
      orParts.push(`category IN (${cats.map(() => '?').join(',')})`)
      params.push(...cats)
    }
    if (boroughs.length > 0) {
      orParts.push(`borough IN (${boroughs.map(() => '?').join(',')})`)
      params.push(...boroughs)
    }

    conditions.push(`(${orParts.join(' OR ')})`)

    const { results: rows } = await c.env.DB
      .prepare(`SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY date_start ASC LIMIT 20`)
      .bind(...params).all<Record<string, unknown>>()
    results = rows
  }

  // Fall back to trending if no preferences or no results
  if (results.length === 0) {
    const { results: trending } = await c.env.DB.prepare(`
      SELECT e.* FROM events e
      INNER JOIN item_views iv ON iv.item_type = 'event' AND iv.item_id = e.id
      WHERE e.date_start >= date('now') AND iv.view_date >= date('now', '-7 days')
      GROUP BY e.id
      ORDER BY SUM(iv.count) DESC
      LIMIT 20
    `).all<Record<string, unknown>>()
    results = trending
  }

  return c.json({ data: results }, 200, {
    'Cache-Control': 'private, max-age=60',
  })
})

// ─── GET /api/events/weather-picks ───────────────────────────────────────────

app.get('/api/events/weather-picks', async c => {
  const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10)

  // Fetch weather for the date
  const weatherRes = await fetch(
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=52.52&longitude=13.41' +
    '&daily=weather_code,temperature_2m_max,precipitation_probability_max' +
    '&forecast_days=3' +
    '&timezone=Europe%2FBerlin'
  )
  const weatherData = await weatherRes.json() as {
    daily?: {
      time?: string[]
      weather_code?: number[]
      temperature_2m_max?: number[]
      precipitation_probability_max?: number[]
    }
  }

  const daily = weatherData.daily
  const dayIndex = daily?.time?.indexOf(date) ?? 0
  const weatherCode = daily?.weather_code?.[dayIndex] ?? 0
  const tempMax = daily?.temperature_2m_max?.[dayIndex] ?? 20
  const precipProb = daily?.precipitation_probability_max?.[dayIndex] ?? 0

  // Classify weather — indoor if rainy, snowy, foggy, or cold (<12°C)
  const RAINY_CODES = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99])
  const SNOW_CODES = new Set([71,73,75,77,85,86])
  const FOG_CODES = new Set([45,48])
  const isBadWeather = RAINY_CODES.has(weatherCode) || SNOW_CODES.has(weatherCode) || FOG_CODES.has(weatherCode) || precipProb > 60
  const isCold = tempMax < 12
  const isRainy = isBadWeather
  const recommendation = (isBadWeather || isCold) ? 'indoor' : 'outdoor'

  const WMO_LABELS: Record<number, string> = {
    0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',
    45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
    56:'Freezing drizzle',57:'Heavy freezing drizzle',
    61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',
    71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',
    80:'Light showers',81:'Showers',82:'Heavy showers',
    85:'Light snow showers',86:'Heavy snow showers',
    95:'Thunderstorm',96:'Thunderstorm with hail',99:'Heavy thunderstorm with hail',
  }
  const label = WMO_LABELS[weatherCode] ?? 'Unknown'

  // Pick events matching recommendation
  const indoorCats = ['Exhibition','Film','Theater','Music','Talks','Literature']
  const outdoorCats = ['Recreation','Tours','Sports','Kids']
  const targetCats = isRainy ? indoorCats : outdoorCats
  const placeholders = targetCats.map(() => '?').join(',')

  const { results: picks } = await c.env.DB
    .prepare(`
      SELECT * FROM events
      WHERE date_start = ? AND category IN (${placeholders})
      ORDER BY time_start ASC
      LIMIT 8
    `)
    .bind(date, ...targetCats)
    .all<Record<string, unknown>>()

  // Fall back to any events if no category match
  let finalPicks = picks
  if (picks.length === 0) {
    const { results: fallback } = await c.env.DB
      .prepare(`SELECT * FROM events WHERE date_start = ? ORDER BY time_start ASC LIMIT 8`)
      .bind(date).all<Record<string, unknown>>()
    finalPicks = fallback
  }

  return c.json({
    weather: { code: weatherCode, label, isRainy, tempMax, precipProb },
    picks: finalPicks,
    recommendation,
  }, 200, { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' })
})

// ─── GET /api/events/:id ──────────────────────────────────────────────────────

app.get('/api/events/:id', async c => {
  const event = await getEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.json({ error: 'Not found' }, 404)

  // Fetch related events in parallel
  const today = new Date().toISOString().slice(0, 10)
  const [sameVenueRes, sameDateRes] = await Promise.all([
    event.location_id
      ? c.env.DB.prepare(`
          SELECT id, title, date_start, time_start, category, price_type
          FROM events
          WHERE location_id = ? AND id != ? AND date_start >= ?
          ORDER BY date_start ASC LIMIT 10
        `).bind(event.location_id, event.id, today).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    c.env.DB.prepare(`
      SELECT id, title, date_start, time_start, category, price_type, location_name
      FROM events
      WHERE category = ? AND date_start = ? AND id != ?
      ORDER BY time_start ASC LIMIT 10
    `).bind(event.category ?? '', event.date_start ?? today, event.id).all<Record<string, unknown>>(),
  ])

  return c.json({
    data: event,
    related: {
      sameVenue: sameVenueRes.results,
      sameDate:  sameDateRes.results,
    },
  }, 200, { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' })
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
  const cap   = Math.min(2000, Math.max(1, parseInt(limit, 10)))
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

  return c.json({ type: 'FeatureCollection', features }, 200, {
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
  })
})

// ─── GET /api/locations/:id ───────────────────────────────────────────────────

app.get('/api/locations/:id', async c => {
  const id  = c.req.param('id')
  const loc = await c.env.DB
    .prepare(`SELECT * FROM locations WHERE id = ?`).bind(id)
    .first<Record<string, unknown>>()
  if (!loc) return c.json({ error: 'Not found' }, 404)

  const today = new Date().toISOString().slice(0, 10)
  const [upcomingRes, pastRes, ratingRes] = await Promise.all([
    c.env.DB.prepare(`SELECT id, title, date_start, time_start, category, price_type, description
                      FROM events WHERE location_id = ? AND date_start >= ?
                      ORDER BY date_start ASC LIMIT 100`)
      .bind(id, today).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT id, title, date_start, time_start, category, price_type, description
                      FROM events WHERE location_id = ? AND date_start < ?
                      ORDER BY date_start DESC LIMIT 50`)
      .bind(id, today).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE item_type = 'location' AND item_id = ?`)
      .bind(id).first<{ avg_rating: number | null; review_count: number }>(),
  ])

  return c.json({ data: {
    ...loc,
    events: upcomingRes.results,
    pastEvents: pastRes.results,
    avg_rating: ratingRes?.avg_rating ? Math.round(ratingRes.avg_rating * 10) / 10 : null,
    review_count: ratingRes?.review_count ?? 0,
  } }, 200, {
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
  })
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

// ─── GET /api/geodata/parks/:id ───────────────────────────────────────────────

app.get('/api/geodata/parks/:id', async c => {
  const obj = await c.env.GEODATA.get('parks-points.geojson')
  if (!obj) return c.json({ error: 'not found' }, 404)
  const fc = await obj.json<{ features: Array<{ properties: Record<string, unknown>; [k: string]: unknown }> }>()
  const id = c.req.param('id')
  const feature = fc.features.find(
    f => f.properties?.gml_id === id || f.properties?.fid === id
  )
  if (!feature) return c.json({ error: 'not found' }, 404)
  return c.json(feature, 200, { 'Cache-Control': 'public, max-age=3600' })
})

// ─── GET /api/geodata/playgrounds/:id ─────────────────────────────────────────

app.get('/api/geodata/playgrounds/:id', async c => {
  const obj = await c.env.GEODATA.get('playgrounds-points.geojson')
  if (!obj) return c.json({ error: 'not found' }, 404)
  const fc = await obj.json<{ features: Array<{ properties: Record<string, unknown>; [k: string]: unknown }> }>()
  const id = c.req.param('id')
  const feature = fc.features.find(
    f => f.properties?.gml_id === id || f.properties?.fid === id
  )
  if (!feature) return c.json({ error: 'not found' }, 404)
  return c.json(feature, 200, { 'Cache-Control': 'public, max-age=3600' })
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

// ─── GET /api/geodata/cherry-blossoms ─────────────────────────────────────────

app.get('/api/geodata/cherry-blossoms', async c => {
  const obj = await c.env.GEODATA.get('cherry-blossoms.geojson')
  if (!obj) return c.json({ error: 'Not yet generated — trigger /api/ingest-cherry-blossoms' }, 503)
  return new Response(obj.body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
})

// ─── GET /api/geodata/osm/:category ───────────────────────────────────────────

interface OsmVenueRow {
  id:            string
  category:      string
  name:          string | null
  lat:           number
  lng:           number
  address:       string | null
  website:       string | null
  phone:         string | null
  opening_hours: string | null
  description:   string | null
  operator:      string | null
}

app.get('/api/geodata/osm/:category', async c => {
  const category = c.req.param('category') ?? ''
  if (!OSM_CATEGORIES.has(category)) return c.json({ error: 'Unknown category' }, 400)

  const bbox = c.req.query('bbox')
  let query = 'SELECT * FROM osm_venues WHERE category = ?'
  const params: unknown[] = [category]

  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number)
    if (!isNaN(minLat)) {
      query += ' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?'
      params.push(minLat, maxLat, minLng, maxLng)
    }
  }

  const rows = await c.env.DB.prepare(query).bind(...params).all()
  const features = (rows.results as OsmVenueRow[]).map(row => ({
    type:     'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] },
    properties: {
      id:            row.id,
      name:          row.name,
      category:      row.category,
      address:       row.address,
      website:       row.website,
      phone:         row.phone,
      opening_hours: row.opening_hours,
      description:   row.description,
      operator:      row.operator,
    },
  }))

  return c.json({ type: 'FeatureCollection', features }, 200, {
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
  })
})

// ─── GET /api/pois ─────────────────────────────────────────────────────────────
// ?bbox=minLng,minLat,maxLng,maxLat (required) &group=heritage (required)
// &category=castle (optional) &region=berlin|brandenburg (optional) &limit=300

const POI_GROUPS_SET = new Set<string>([
  'heritage','monuments','worship','tourism','nature','transport',
  'food_drink','sports','services','nightlife','shopping','accommodation',
  'culture','wellness','education','quirky',
])

app.get('/api/pois', async c => {
  const { bbox, group, category, region, limit = '300' } = c.req.query()

  if (!bbox || !group) return c.json({ error: 'bbox and group are required' }, 400)
  if (!POI_GROUPS_SET.has(group)) return c.json({ error: 'Unknown group' }, 400)

  const parts = bbox.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => isNaN(n))) {
    return c.json({ error: 'Invalid bbox format' }, 400)
  }
  const [minLng, minLat, maxLng, maxLat] = parts
  const cap = Math.min(2000, Math.max(1, parseInt(limit, 10)))

  // Try geohash-based query first
  const prefixes = bboxToGeohashPrefixes(minLat, minLng, maxLat, maxLng)

  let query: string
  const params: (string | number)[] = []

  if (prefixes.length <= 20 && prefixes.length > 0) {
    // Fast path: geohash prefix lookup (prefixes are shorter than stored 6-char hashes)
    const prefixLen = prefixes[0].length
    const placeholders = prefixes.map(() => '?').join(',')
    if (category) {
      query = `SELECT * FROM pois WHERE category = ? AND substr(geohash, 1, ${prefixLen}) IN (${placeholders}) AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
      params.push(category, ...prefixes, minLat, maxLat, minLng, maxLng)
    } else {
      query = `SELECT * FROM pois WHERE category_group = ? AND substr(geohash, 1, ${prefixLen}) IN (${placeholders}) AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
      params.push(group, ...prefixes, minLat, maxLat, minLng, maxLng)
    }
  } else {
    // Fallback: bbox-only query for wide zoom
    if (category) {
      query = `SELECT * FROM pois WHERE category = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
      params.push(category, minLat, maxLat, minLng, maxLng)
    } else {
      query = `SELECT * FROM pois WHERE category_group = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
      params.push(group, minLat, maxLat, minLng, maxLng)
    }
  }

  if (region && (region === 'berlin' || region === 'brandenburg')) {
    query += ' AND region = ?'
    params.push(region)
  }

  query += ' LIMIT ?'
  params.push(cap)

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Record<string, unknown>>()

  const features = results.map(row => ({
    type:     'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] },
    properties: {
      id:             row.id,
      name:           row.name,
      category_group: row.category_group,
      category:       row.category,
      region:         row.region,
      address:        row.address,
      website:        row.website,
      phone:          row.phone,
      opening_hours:  row.opening_hours,
      description:    row.description,
      operator:       row.operator,
      tags_json:      row.tags_json,
      image_url:      row.image_url,
    },
  }))

  return c.json(
    { type: 'FeatureCollection', features, truncated: results.length >= cap },
    200,
    { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  )
})

// ─── GET /api/pois/batch ──────────────────────────────────────────────────────

app.get('/api/pois/batch', async c => {
  const { groups, bbox, limit = '300' } = c.req.query()
  if (!groups || !bbox) return c.json({ error: 'groups and bbox are required' }, 400)

  const groupList = groups.split(',').filter(g => POI_GROUPS_SET.has(g))
  if (groupList.length === 0) return c.json({ error: 'No valid groups' }, 400)

  const parts = bbox.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => isNaN(n))) {
    return c.json({ error: 'Invalid bbox format' }, 400)
  }
  const [minLng, minLat, maxLng, maxLat] = parts
  const cap = Math.min(2000, Math.max(1, parseInt(limit, 10)))

  const prefixes = bboxToGeohashPrefixes(minLat, minLng, maxLat, maxLng)

  const groupPlaceholders = groupList.map(() => '?').join(',')
  let query: string
  const params: (string | number)[] = []

  if (prefixes.length <= 20 && prefixes.length > 0) {
    const prefixLen = prefixes[0].length
    const prefixPlaceholders = prefixes.map(() => '?').join(',')
    query = `SELECT * FROM pois WHERE category_group IN (${groupPlaceholders}) AND substr(geohash, 1, ${prefixLen}) IN (${prefixPlaceholders}) AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT ?`
    params.push(...groupList, ...prefixes, minLat, maxLat, minLng, maxLng, cap)
  } else {
    query = `SELECT * FROM pois WHERE category_group IN (${groupPlaceholders}) AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT ?`
    params.push(...groupList, minLat, maxLat, minLng, maxLng, cap)
  }

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Record<string, unknown>>()

  const features = results.map(row => ({
    type:     'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] },
    properties: {
      id:             row.id,
      name:           row.name,
      category_group: row.category_group,
      category:       row.category,
      region:         row.region,
      address:        row.address,
      website:        row.website,
      phone:          row.phone,
      opening_hours:  row.opening_hours,
      description:    row.description,
      operator:       row.operator,
      tags_json:      row.tags_json,
      image_url:      row.image_url,
    },
  }))

  return c.json(
    { type: 'FeatureCollection', features, truncated: results.length >= cap },
    200,
    { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  )
})

// ─── GET /api/pois/categories ─────────────────────────────────────────────────

app.get('/api/pois/categories', async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT category_group, category, COUNT(*) as count FROM pois GROUP BY category_group, category ORDER BY category_group, category`
  ).all<{ category_group: string; category: string; count: number }>()

  return c.json({ data: results }, 200, {
    'Cache-Control': 'public, max-age=3600',
  })
})

// ─── GET /api/pois/:id ───────────────────────────────────────────────────────

app.get('/api/pois/:id', async c => {
  // ID comes as "node_12345" — convert underscore back to slash
  const rawId = c.req.param('id')
  const id = rawId.replace('_', '/')

  const [row, ratingRes] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM pois WHERE id = ?`).bind(id)
      .first<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE item_type = 'poi' AND item_id = ?`)
      .bind(id).first<{ avg_rating: number | null; review_count: number }>(),
  ])
  if (!row) return c.json({ error: 'Not found' }, 404)

  return c.json({ data: {
    ...row,
    avg_rating: ratingRes?.avg_rating ? Math.round(ratingRes.avg_rating * 10) / 10 : null,
    review_count: ratingRes?.review_count ?? 0,
  } }, 200, {
    'Cache-Control': 'public, max-age=3600',
  })
})

// ─── POST /api/ingest-pois (protected) ────────────────────────────────────────

app.post('/api/ingest-pois', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const region = (c.req.query('region') ?? 'berlin') as 'berlin' | 'brandenburg'
  const group  = c.req.query('group') as POICategoryGroup | undefined

  if (region !== 'berlin' && region !== 'brandenburg') {
    return c.json({ error: 'region must be berlin or brandenburg' }, 400)
  }
  if (group && !POI_GROUPS_SET.has(group)) {
    return c.json({ error: 'Unknown group' }, 400)
  }

  c.executionCtx.waitUntil(
    ingestPOIs(c.env, region, group)
      .then(r => console.log(`[poi-ingest:manual] ${region}/${group ?? 'all'}: ${r.total} rows, ${r.categories} categories`))
      .catch(err => console.error('[poi-ingest:manual] failed:', err))
  )

  return c.json({ ok: true, message: `POI ingest started: region=${region}, group=${group ?? 'all'}` })
})

// ─── GET /api/streets ──────────────────────────────────────────────────────────

app.get('/api/streets', async c => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json([])

  const limit = Math.min(20, Math.max(1, Number(c.req.query('limit') ?? '10')))
  const { street, number } = parseAddressQuery(q)
  const norm = normalizeQ(street)
  const prefix = `${norm}%`
  const contains = `%${norm}%`

  // Prefix match first (uses index), then contains match, deduplicated
  const { results: streets } = await c.env.DB.prepare(`
    SELECT name, lat, lng, postcode, borough FROM streets
    WHERE name_norm LIKE ? OR name_norm LIKE ?
    ORDER BY CASE WHEN name_norm LIKE ? THEN 0 ELSE 1 END, name
    LIMIT ?
  `).bind(prefix, contains, prefix, limit).all<{
    name: string; lat: number; lng: number; postcode: string | null; borough: string | null
  }>()

  // If a house number was detected, also query the addresses table
  if (number) {
    const { results: addresses } = await c.env.DB.prepare(`
      SELECT street, housenumber, lat, lng, postcode FROM addresses
      WHERE street_norm LIKE ? AND housenumber = ?
      LIMIT ?
    `).bind(prefix, number, limit).all<{
      street: string; housenumber: string; lat: number; lng: number; postcode: string | null
    }>()

    c.header('Cache-Control', 'public, max-age=3600')
    return c.json({
      streets,
      addresses: addresses.map(a => ({
        street: a.street,
        housenumber: a.housenumber,
        display: `${a.street} ${a.housenumber}${a.postcode ? `, ${a.postcode}` : ''}`,
        lat: a.lat,
        lng: a.lng,
        postcode: a.postcode,
        type: 'address' as const,
      })),
    })
  }

  c.header('Cache-Control', 'public, max-age=3600')
  return c.json(streets)
})

// ─── POST /api/ingest-streets (protected) ────────────────────────────────────

app.post('/api/ingest-streets', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.executionCtx.waitUntil(
    ingestStreets(c.env)
      .then(r => console.log(`[street-ingest:manual] ${r.total} streets`))
      .catch(err => console.error('[street-ingest:manual] failed:', err))
  )

  return c.json({ ok: true, message: 'Street ingest started' })
})

// ─── POST /api/ingest-addresses (protected) ──────────────────────────────────

app.post('/api/ingest-addresses', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const prefix = c.req.query('prefix') || undefined
  const clear = c.req.query('clear') === 'true'

  if (clear) {
    await c.env.DB.prepare('DELETE FROM addresses').run()
  }

  c.executionCtx.waitUntil(
    ingestAddresses(c.env, { prefix: prefix ?? undefined })
      .then(r => console.log(`[address-ingest:manual] ${r.total} addresses`))
      .catch(err => console.error('[address-ingest:manual] failed:', err))
  )

  return c.json({ ok: true, message: `Address ingest started${prefix ? ` (prefix=${prefix})` : ''}${clear ? ' (table cleared)' : ''}` })
})

// ─── POST /api/vectorize-sync (protected) ────────────────────────────────────

app.post('/api/vectorize-sync', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const forceAll = c.req.query('force') === 'true'

  c.executionCtx.waitUntil(
    syncPOIsToVectorize(c.env, { forceAll })
      .then(r => console.log(`[vectorize-sync:manual] synced=${r.synced} skipped=${r.skipped}`))
      .catch(err => console.error('[vectorize-sync:manual] failed:', err))
  )

  return c.json({ ok: true, message: 'Vectorize sync started' })
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

const ALLOWED_LANGS = new Set(['tr', 'ar', 'ru', 'pl', 'vi', 'ro', 'en', 'es', 'it', 'fr', 'zh', 'ja'])

// ─── Shared bulk-translation helper ──────────────────────────────────────────

async function translateTexts(
  env: Env,
  langs: string[],
  texts: (string | null | undefined)[],
): Promise<{ translated: number; skipped: number }> {
  const entries: Array<{ lang: string; text: string; cacheId: string }> = []
  const seen = new Set<string>()
  for (const lang of langs) {
    for (const raw of texts) {
      if (!raw) continue
      const cacheId = await hashKey(lang, raw)
      if (!seen.has(cacheId)) {
        seen.add(cacheId)
        entries.push({ lang, text: raw, cacheId })
      }
    }
  }
  if (!entries.length) return { translated: 0, skipped: 0 }

  // Batch-check D1 cache (chunks of 99 to stay within SQLite param limit)
  const allIds = entries.map(e => e.cacheId)
  const cachedSet = new Set<string>()
  for (let i = 0; i < allIds.length; i += 99) {
    const chunk = allIds.slice(i, i + 99)
    const res = await env.DB
      .prepare(`SELECT id FROM translations WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ id: string }>()
    for (const r of res.results) cachedSet.add(r.id)
  }

  const misses = entries.filter(e => !cachedSet.has(e.cacheId))
  const CONCURRENCY = 20
  let translated = 0
  for (let i = 0; i < misses.length; i += CONCURRENCY) {
    const chunk = misses.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(async ({ lang, text, cacheId }) => {
        const result = await env.AI.run(
          '@cf/meta/m2m100-1.2b' as Parameters<typeof env.AI.run>[0],
          { text, source_lang: 'de', target_lang: lang } as Parameters<typeof env.AI.run>[1],
        ) as { translated_text?: string }
        const out = result.translated_text?.trim() ?? text
        await env.DB
          .prepare(`INSERT OR IGNORE INTO translations (id, lang, source, translated) VALUES (?, ?, ?, ?)`)
          .bind(cacheId, lang, text, out)
          .run()
      })
    )
    translated += results.filter(r => r.status === 'fulfilled').length
  }
  return { translated, skipped: entries.length - misses.length }
}

async function hashKey(lang: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(`${lang}:${text}`)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

app.post('/api/translate', async c => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const allowed = await checkRateLimit(c.env.DB, `translate:${ip}`, 200, 300)
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

// ─── POST /api/pretranslate (protected) ──────────────────────────────────────

app.post('/api/pretranslate', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const offset      = Math.max(0, parseInt(c.req.query('offset') ?? '0', 10))
  const batchSize   = Math.min(30, Math.max(1, parseInt(c.req.query('batch') ?? '10', 10)))
  const includeDesc = c.req.query('desc') === '1'
  const langs       = [...ALLOWED_LANGS]

  const [rows, totalRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT title, description FROM events WHERE date_start >= date('now') ORDER BY date_start ASC LIMIT ? OFFSET ?`
    ).bind(batchSize, offset).all<{ title: string | null; description: string | null }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM events WHERE date_start >= date('now')`
    ).first<{ n: number }>(),
  ])

  const texts = rows.results.flatMap(r => [r.title, includeDesc ? r.description : null])
  const { translated, skipped } = await translateTexts(c.env, langs, texts)

  const next  = offset + rows.results.length
  const total = totalRow?.n ?? 0

  return c.json({
    offset,
    next,
    total,
    done:      rows.results.length < batchSize,
    translated,
    skipped,
    remaining: Math.max(0, total - next),
  })
})

// ─── GET /api/weather ─────────────────────────────────────────────────────────

app.get('/api/weather', async c => {
  const res = await fetch(
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=52.52&longitude=13.41' +
    '&current=temperature_2m,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,precipitation_probability_max' +
    '&forecast_days=3' +
    '&timezone=Europe%2FBerlin'
  )
  const data = await res.json()
  return c.json(data, {
    headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=1800' },
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

// ─── Haversine distance helper ────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // metres
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── GET /api/nearby ──────────────────────────────────────────────────────────

app.get('/api/nearby', async c => {
  const lat    = parseFloat(c.req.query('lat') ?? '')
  const lng    = parseFloat(c.req.query('lng') ?? '')
  const radius = Math.min(5000, Math.max(100, parseInt(c.req.query('radius') ?? '500', 10)))
  const limit  = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)))

  if (isNaN(lat) || isNaN(lng)) return c.json({ error: 'lat and lng are required' }, 400)

  // Compute bbox from radius
  const latDelta = radius / 111320
  const lngDelta = radius / (111320 * Math.cos(lat * Math.PI / 180))
  const minLat = lat - latDelta, maxLat = lat + latDelta
  const minLng = lng - lngDelta, maxLng = lng + lngDelta

  const today = new Date().toISOString().slice(0, 10)

  // Query events, pois, locations in parallel
  const [eventsRes, poisRes, locationsRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT id, title AS name, category, lat, lng, 'event' AS type
      FROM events
      WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND date_start >= ?
      LIMIT 100
    `).bind(minLat, maxLat, minLng, maxLng, today).all<{ id: string; name: string; category: string | null; lat: number; lng: number; type: string }>(),
    c.env.DB.prepare(`
      SELECT id, name, category, lat, lng, 'poi' AS type
      FROM pois
      WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
      LIMIT 100
    `).bind(minLat, maxLat, minLng, maxLng).all<{ id: string; name: string | null; category: string | null; lat: number; lng: number; type: string }>(),
    c.env.DB.prepare(`
      SELECT id, name, category, lat, lng, 'location' AS type
      FROM locations
      WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND lat IS NOT NULL
      LIMIT 100
    `).bind(minLat, maxLat, minLng, maxLng).all<{ id: string; name: string | null; category: string | null; lat: number; lng: number; type: string }>(),
  ])

  // Merge, compute distance, filter by radius, sort
  const all = [...eventsRes.results, ...poisRes.results, ...locationsRes.results]
    .map(item => ({
      type: item.type,
      id: item.id,
      name: item.name ?? 'Unnamed',
      category: item.category ?? undefined,
      lat: item.lat,
      lng: item.lng,
      distance_m: haversine(lat, lng, item.lat, item.lng),
    }))
    .filter(item => item.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit)

  return c.json({ results: all }, 200, {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  })
})

// ─── Reviews & Ratings ──────────────────────────────────────────────────────

app.get('/api/reviews', async c => {
  const itemType = c.req.query('item_type')
  const itemId = c.req.query('item_id')
  if (!itemType || !itemId) return c.json({ error: 'item_type and item_id required' }, 400)

  const [reviewsRes, aggRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT r.*, u.display_name, u.email
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.item_type = ? AND r.item_id = ?
      ORDER BY r.created_at DESC
      LIMIT 50
    `).bind(itemType, itemId).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as count
      FROM reviews WHERE item_type = ? AND item_id = ?
    `).bind(itemType, itemId).first<{ avg_rating: number | null; count: number }>(),
  ])

  return c.json({
    reviews: reviewsRes.results,
    aggregate: {
      avg_rating: aggRes?.avg_rating ? Math.round(aggRes.avg_rating * 10) / 10 : null,
      count: aggRes?.count ?? 0,
    },
  }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' })
})

app.post('/api/reviews', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    item_type?: string; item_id?: string; rating?: number; body?: string
  }>().catch(() => null)

  if (!body?.item_type || !body.item_id || !body.rating) {
    return c.json({ error: 'item_type, item_id, and rating required' }, 400)
  }
  if (!['location', 'poi'].includes(body.item_type)) {
    return c.json({ error: 'item_type must be location or poi' }, 400)
  }
  if (body.rating < 1 || body.rating > 5) {
    return c.json({ error: 'rating must be 1-5' }, 400)
  }

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  await c.env.DB.prepare(`
    INSERT INTO reviews (id, user_id, item_type, item_id, rating, body)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
      rating = excluded.rating,
      body = excluded.body,
      updated_at = datetime('now')
  `).bind(id, auth.sub, body.item_type, body.item_id, body.rating, body.body ?? null).run()

  return c.json({ ok: true }, 201)
})

app.delete('/api/reviews/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const result = await c.env.DB.prepare(`
    DELETE FROM reviews WHERE id = ? AND user_id = ?
  `).bind(c.req.param('id'), auth.sub).run()

  return result.meta.changes > 0
    ? c.json({ ok: true })
    : c.json({ error: 'Not found or not owner' }, 404)
})

// ─── Push subscription endpoints ─────────────────────────────────────────────

app.post('/api/push/subscribe', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    endpoint?: string; keys?: { p256dh?: string; auth?: string }
  }>().catch(() => null)

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: 'endpoint, keys.p256dh, and keys.auth required' }, 400)
  }

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  await c.env.DB.prepare(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `).bind(id, auth.sub, body.endpoint, body.keys.p256dh, body.keys.auth).run()

  return c.json({ ok: true }, 201)
})

// ─── PATCH /api/attendance/reminder ─────────────────────────────────────────

app.patch('/api/attendance/reminder', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    item_type?: string; item_id?: string; reminder_hours?: number | null
  }>().catch(() => null)

  if (!body?.item_type || !body.item_id) {
    return c.json({ error: 'item_type and item_id required' }, 400)
  }

  await c.env.DB.prepare(`
    UPDATE user_attendance SET reminder_hours = ?, reminder_sent = NULL
    WHERE user_id = ? AND item_type = ? AND item_id = ?
  `).bind(body.reminder_hours ?? null, auth.sub, body.item_type, body.item_id).run()

  return c.json({ ok: true })
})

// ─── POST /api/chat ───────────────────────────────────────────────────────────

app.post('/api/chat', async c => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const allowed = await checkRateLimit(c.env.DB, `chat:${ip}`, 10, 300)
  if (!allowed) return c.json({ error: 'Too many requests' }, 429)

  const body = await c.req.json<{
    messages: { role: string; content: string }[]
    date?: string
    viewport?: { lat: number; lng: number; zoom: number }
    conversation_id?: string
  }>().catch(() => null)
  if (!body?.messages?.length) {
    return c.json({ error: 'messages is required' }, 400)
  }

  // Use Berlin timezone for date reference
  const berlinNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const date = body.date ?? `${berlinNow.getFullYear()}-${String(berlinNow.getMonth() + 1).padStart(2, '0')}-${String(berlinNow.getDate()).padStart(2, '0')}`
  const berlinTime = `${String(berlinNow.getHours()).padStart(2, '0')}:${String(berlinNow.getMinutes()).padStart(2, '0')}`
  const weekEnd = (() => { const d = new Date(date); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
  const viewport = body.viewport

  // Optionally load user preferences for personalization
  let userPrefsSection = ''
  const chatAuth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET).catch(() => null)
  if (chatAuth) {
    try {
      const prefRow = await c.env.DB
        .prepare(`SELECT preferences FROM users WHERE id = ?`)
        .bind(chatAuth.sub).first<{ preferences: string | null }>()
      if (prefRow?.preferences) {
        const prefs = JSON.parse(prefRow.preferences) as { categories?: string[]; boroughs?: string[] }
        if (prefs.categories?.length || prefs.boroughs?.length) {
          userPrefsSection = `\n\n## USER PREFERENCES\nThis user prefers: categories=[${(prefs.categories ?? []).join(', ')}], boroughs=[${(prefs.boroughs ?? []).join(', ')}].\nPrioritise these in suggestions.`
        }
      }
    } catch { /* ignore */ }
  }

  // Fetch current weather for context
  let weatherSection = ''
  try {
    const wRes = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,weather_code&timezone=Europe%2FBerlin'
    )
    const wData = await wRes.json() as { current?: { temperature_2m?: number; weather_code?: number } }
    if (wData.current) {
      const temp = wData.current.temperature_2m ?? 0
      const code = wData.current.weather_code ?? 0
      const RAINY_CODES = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99])
      const isRainy = RAINY_CODES.has(code)
      const WMO: Record<number, string> = {0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',61:'Light rain',63:'Rain',65:'Heavy rain',80:'Showers',95:'Thunderstorm'}
      const desc = WMO[code] ?? (isRainy ? 'Rain' : 'Unknown')
      weatherSection = `\n\n## WEATHER\nCurrent: ${temp}°C, ${desc}.${isRainy ? '\nSuggest indoor events if weather is bad.' : ''}`
    }
  } catch { /* ignore */ }

  // Extract the latest user message for vector retrieval
  const latestUserMsg = [...body.messages].reverse().find(m => m.role === 'user')?.content ?? ''

  // Extract keywords from user message for D1 fallback search
  const keywords = latestUserMsg
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .slice(0, 5)

  // Compute viewport bbox for spatial event filtering
  let viewportBbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null = null
  if (viewport && viewport.lat && viewport.lng && viewport.zoom) {
    const span = 360 / Math.pow(2, viewport.zoom)
    viewportBbox = {
      minLat: viewport.lat - span / 2,
      maxLat: viewport.lat + span / 2,
      minLng: viewport.lng - span,
      maxLng: viewport.lng + span,
    }
  }

  // Fetch rich context in parallel (vector-retrieve venues, fall back to keyword D1 search)
  const [eventsRes, catRes, venuesRes, locationCountRes, parkCountRes, viewportEventsRes] = await Promise.all([
    // Events for the next 7 days (multi-day context for "this weekend" etc.)
    getEvents(c.env.DB, { date_from: date, date_to: weekEnd, limit: 150 }),
    // Category breakdown for the week
    c.env.DB
      .prepare(`SELECT category, COUNT(*) as n FROM events WHERE date_start >= ? AND date_start <= ? GROUP BY category ORDER BY n DESC`)
      .bind(date, weekEnd)
      .all<{ category: string | null; n: number }>(),
    // Vector-retrieve relevant POIs based on user's message, fall back to keyword search
    (c.env.VECTORIZE && latestUserMsg.length >= 3
      ? semanticSearchPOIs(c.env, latestUserMsg, { topK: 25 }).then(async matches => {
          if (matches.length === 0) throw new Error('no matches')
          const ids = matches.map(m => m.id)
          const placeholders = ids.map(() => '?').join(',')
          return c.env.DB.prepare(`
            SELECT id, name, category AS category, region AS borough, address
            FROM pois WHERE id IN (${placeholders})
          `).bind(...ids).all<{ id: string; name: string | null; category: string | null; borough: string | null; address: string | null }>()
        }).catch(() => null)
      : Promise.resolve(null)
    ).then(vectorRes => {
      if (vectorRes) return vectorRes
      // Fallback: keyword search on pois table
      if (keywords.length > 0) {
        const kw = `%${keywords[0]}%`
        return c.env.DB.prepare(`
          SELECT id, name, category, region AS borough, address FROM pois
          WHERE name LIKE ? OR category LIKE ? OR category_group LIKE ?
          LIMIT 25
        `).bind(kw, kw, kw).all<{ id: string; name: string | null; category: string | null; borough: string | null; address: string | null }>()
      }
      // Final fallback: random locations
      return c.env.DB
        .prepare(`SELECT id, name, category, borough, address FROM locations
                  WHERE lat IS NOT NULL ORDER BY RANDOM() LIMIT 25`)
        .all<{ id: string; name: string | null; category: string | null; borough: string | null; address: string | null }>()
    }),
    // Total locations count
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM locations`).first<{ n: number }>(),
    // Total upcoming events count (next 7 days)
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM events WHERE date_start >= ? AND date_start <= date(?, '+7 days')`)
      .bind(date, date)
      .first<{ n: number }>(),
    // Viewport-filtered events
    viewportBbox
      ? c.env.DB.prepare(`
          SELECT id, title, category, time_start, location_name, borough
          FROM events
          WHERE date_start = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
          LIMIT 15
        `).bind(date, viewportBbox.minLat, viewportBbox.maxLat, viewportBbox.minLng, viewportBbox.maxLng)
          .all<{ id: string; title: string; category: string | null; time_start: string | null; location_name: string | null; borough: string | null }>()
      : Promise.resolve(null),
  ])

  const { events, total } = eventsRes

  // Group events by date for multi-day context
  const eventsByDate: Record<string, typeof events> = {}
  for (const e of events) {
    (eventsByDate[e.date_start] ??= []).push(e)
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const eventsList = Object.entries(eventsByDate).slice(0, 7).map(([d, dayEvents]) => {
    const dt = new Date(d + 'T00:00:00')
    const label = d === date ? `Today (${dayNames[dt.getDay()]} ${d})` : `${dayNames[dt.getDay()]} ${d}`
    const listed = dayEvents.slice(0, 20).map(e =>
      `- [${e.title}](/events/${encodeURIComponent(e.id)}) | ${e.category ?? 'Other'} | ${e.time_start?.slice(0,5) ?? 'all day'} | ${e.location_name ?? '?'} | ${e.price_type}`
    ).join('\n')
    return `### ${label} (${dayEvents.length} events)\n${listed}`
  }).join('\n\n')

  const categoryBreakdown = catRes.results
    .map(r => `${r.category ?? 'Other'}: ${r.n}`)
    .join(', ')

  const venuesList = venuesRes.results
    .map(v => {
      const id = (v as { id?: string }).id
      const path = id
        ? (id.includes('/') ? `/pois/${id.replace('/', '_')}` : `/locations/${id}`)
        : null
      const name = v.name ?? '?'
      return path
        ? `- [${name}](${path}) (${v.category ?? 'other'}) — ${v.borough ?? '?'}`
        : `- ${name} (${v.category ?? 'other'}) — ${v.borough ?? '?'}`
    })
    .join('\n')

  const totalLocations = locationCountRes?.n ?? 0
  const weekEvents = parkCountRes?.n ?? 0

  // Viewport events section
  let viewportSection = ''
  if (viewportEventsRes?.results?.length) {
    viewportSection = `\n\n## EVENTS IN CURRENT MAP VIEW\n${viewportEventsRes.results.map(e =>
      `- [${e.title}](/events/${encodeURIComponent(e.id)}) | ${e.category ?? 'Other'} | ${e.time_start?.slice(0,5) ?? 'all day'} | ${e.location_name ?? '?'}, ${e.borough ?? '?'}`
    ).join('\n')}`
  }

  // Viewport context
  const viewportContext = viewport
    ? `\nThe user is viewing the map near [${viewport.lat.toFixed(4)}, ${viewport.lng.toFixed(4)}] at zoom ${viewport.zoom.toFixed(0)}.`
    : ''

  const systemPrompt = `You are Citizen.Berlin, a Berlin culture events assistant with access to a live database.
Today is ${date}, current Berlin time is ${berlinTime}.${viewportContext}

Available place types: heritage, monuments, nightlife, food_drink, culture, worship, tourism, nature, transport, sports, services, shopping, accommodation, wellness, education, quirky.

## EVENTS THIS WEEK (${total} total, ${date} to ${weekEnd})
Categories: ${categoryBreakdown}

${eventsList || 'No events found for this period.'}

## VENUES & PLACES (${totalLocations} total in database, 25 shown)
${venuesList}${viewportSection}

## OTHER DATA
- Parks: hundreds of Berlin parks are mapped (Grünanlagen from Berlin GDI). Users can enable the Parks layer on the map.
- Playgrounds: hundreds of Spielplätze are mapped. Enable the Playgrounds layer.

## INSTRUCTIONS
- Answer questions about events, venues, parks, and playgrounds in Berlin.
- You have events for the next 7 days. When asked about "this weekend", "tomorrow", "next Thursday" etc., use the relevant day's events.
- When mentioning events or venues, ALWAYS use the markdown link format from the lists above, e.g. [Event Name](/events/id) or [Venue Name](/pois/id). This creates clickable links for the user.
- For parks/playgrounds, explain users can see them on the map by enabling the Parks or Playgrounds toggle.
- Keep answers concise (2-4 sentences). Use bullet points with linked names when listing multiple suggestions.
- If asked about something outside Berlin culture, politely redirect.${userPrefsSection}${weatherSection}`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...body.messages.slice(-10).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  const aiResponse = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages,
    max_tokens: 800,
    stream: true,
  })

  // CF AI streaming returns a ReadableStream of SSE
  if (aiResponse instanceof ReadableStream) {
    return new Response(aiResponse as ReadableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // Fallback: non-stream response
  const resp = aiResponse as { response?: string }
  return c.json({
    response: resp.response ?? 'Sorry, I could not generate a response.',
  })
})

// ─── Chat save + history endpoints ───────────────────────────────────────────

app.post('/api/chat/save', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET).catch(() => null)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ conversation_id: string; messages: { role: string; content: string }[] }>()
  if (!body.conversation_id || !body.messages?.length) return c.json({ error: 'conversation_id and messages required' }, 400)
  const title = body.messages.find(m => m.role === 'user')?.content?.slice(0, 60) ?? 'Chat'
  const msgJson = JSON.stringify(body.messages.map(m => ({ role: m.role, content: m.content, ts: new Date().toISOString() })))
  await c.env.DB.prepare(`
    INSERT INTO chat_conversations (id, user_id, messages, title, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, updated_at = datetime('now')
  `).bind(body.conversation_id, auth.sub, msgJson, title).run()
  return c.json({ ok: true })
})

app.get('/api/chat/history', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET).catch(() => null)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const rows = await c.env.DB.prepare(
    `SELECT id, title, updated_at FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`
  ).bind(auth.sub).all<{ id: string; title: string | null; updated_at: string }>()
  return c.json({ data: rows.results })
})

app.get('/api/chat/history/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET).catch(() => null)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const row = await c.env.DB.prepare(
    `SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?`
  ).bind(c.req.param('id'), auth.sub).first<{ id: string; messages: string; title: string | null }>()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: { ...row, messages: JSON.parse(row.messages) } })
})

app.delete('/api/chat/history/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization'), c.env.JWT_SECRET).catch(() => null)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  await c.env.DB.prepare(
    `DELETE FROM chat_conversations WHERE id = ? AND user_id = ?`
  ).bind(c.req.param('id'), auth.sub).run()
  return c.json({ ok: true })
})

// ─── POST /api/views (view tracking) ─────────────────────────────────────────

app.post('/api/views', async c => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const allowed = await checkRateLimit(c.env.DB, `views:${ip}`, 60, 60)
  if (!allowed) return c.json({ error: 'Too many requests' }, 429)

  const body = await c.req.json<{ item_type?: string; item_id?: string }>().catch(() => null)
  if (!body?.item_type || !body?.item_id) return c.json({ error: 'item_type and item_id required' }, 400)
  if (!['event', 'location', 'poi'].includes(body.item_type)) return c.json({ error: 'Invalid item_type' }, 400)

  const viewDate = new Date().toISOString().split('T')[0]
  await c.env.DB.prepare(
    `INSERT INTO item_views (item_type, item_id, view_date, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(item_type, item_id, view_date) DO UPDATE SET count = count + 1`
  ).bind(body.item_type, body.item_id, viewDate).run()

  return c.json({ ok: true })
})

// ─── GET /api/trending ───────────────────────────────────────────────────────

app.get('/api/trending', async c => {
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query('limit') ?? '10', 10)))

  const { results } = await c.env.DB.prepare(`
    SELECT iv.item_type, iv.item_id, SUM(
      CASE WHEN iv.view_date >= date('now','-1 day') THEN iv.count*4
           WHEN iv.view_date >= date('now','-3 days') THEN iv.count*2
           ELSE iv.count END
    ) as score
    FROM item_views iv
    WHERE iv.view_date >= date('now','-7 days')
    GROUP BY iv.item_type, iv.item_id
    ORDER BY score DESC
    LIMIT ?
  `).bind(limit).all<{ item_type: string; item_id: string; score: number }>()

  // Enrich with titles
  const enriched = await Promise.all(results.map(async (row) => {
    let title: string | null = null
    let category: string | null = null
    let date_start: string | null = null
    try {
      if (row.item_type === 'event') {
        const ev = await c.env.DB.prepare(`SELECT title, category, date_start FROM events WHERE id = ?`).bind(row.item_id).first<{ title: string; category: string | null; date_start: string }>()
        if (ev) { title = ev.title; category = ev.category; date_start = ev.date_start }
      } else if (row.item_type === 'location') {
        const loc = await c.env.DB.prepare(`SELECT name, category FROM locations WHERE id = ?`).bind(row.item_id).first<{ name: string; category: string | null }>()
        if (loc) { title = loc.name; category = loc.category }
      } else if (row.item_type === 'poi') {
        const poi = await c.env.DB.prepare(`SELECT name, category FROM pois WHERE id = ?`).bind(row.item_id).first<{ name: string; category: string | null }>()
        if (poi) { title = poi.name; category = poi.category }
      }
    } catch { /* skip enrichment on error */ }
    return { ...row, title, category, date_start }
  }))

  return c.json({ data: enriched.filter(r => r.title) }, 200, {
    'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
  })
})

// ─── POST /api/dedupe-pois (protected) ───────────────────────────────────────

app.post('/api/dedupe-pois', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await deduplicatePOIs(c.env.DB as any)
    return c.json({ ok: true, matched: result.matched, venuesChecked: result.venuesChecked })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
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
    console.error('[magic-link]', err)
    return c.json({ error: 'Could not send sign-in link. Please try again.' }, 500)
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
        CASE ua.item_type WHEN 'event' THEN e.title WHEN 'location' THEN l.name WHEN 'listing' THEN li.title END AS title,
        CASE ua.item_type WHEN 'event' THEN e.date_start END AS date_start,
        CASE ua.item_type WHEN 'event' THEN e.time_start END AS time_start,
        CASE ua.item_type WHEN 'event' THEN e.location_name WHEN 'location' THEN l.borough WHEN 'listing' THEN li.borough END AS subtitle
      FROM user_attendance ua
      LEFT JOIN events    e  ON ua.item_type = 'event'    AND ua.item_id = e.id
      LEFT JOIN locations l  ON ua.item_type = 'location' AND ua.item_id = l.id
      LEFT JOIN listings  li ON ua.item_type = 'listing'  AND ua.item_id = li.id
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
  if (body.item_type !== 'event' && body.item_type !== 'location' && body.item_type !== 'listing') return c.json({ error: 'invalid item_type' }, 400)
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
  if (body.item_type !== 'event' && body.item_type !== 'location' && body.item_type !== 'listing') return c.json({ error: 'invalid item_type' }, 400)
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

  // Batch-fetch all titles/subtitles in a single D1 request
  const enriched = items.length === 0 ? [] : await (async () => {
    const stmts = items.map(item =>
      item.item_type === 'event'
        ? c.env.DB.prepare(`SELECT title, date_start, location_name FROM events WHERE id = ?`).bind(item.item_id)
        : item.item_type === 'listing'
        ? c.env.DB.prepare(`SELECT title, borough FROM listings WHERE id = ?`).bind(item.item_id)
        : c.env.DB.prepare(`SELECT name, borough FROM locations WHERE id = ?`).bind(item.item_id)
    )
    const results = await c.env.DB.batch(stmts)
    return items.map((item, i) => {
      const row = results[i].results[0] as Record<string, unknown> | undefined
      if (item.item_type === 'event') {
        return { ...item, title: (row?.title as string) ?? null, subtitle: [(row?.date_start as string), (row?.location_name as string)].filter(Boolean).join(' · ') || null }
      } else if (item.item_type === 'listing') {
        return { ...item, title: (row?.title as string) ?? null, subtitle: (row?.borough as string) ?? null }
      } else {
        return { ...item, title: (row?.name as string) ?? null, subtitle: (row?.borough as string) ?? null }
      }
    })
  })()

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
    .replace(/ß/g, 'ss')
    // Normalize German digraphs: ae→a, oe→o, ue→u (but also handle doubled letters)
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .replace(/tt/g, 't').replace(/ss/g, 's') // "spaetti"→"spati", "strasse"→"strase"
    .replace(/[-]/g, ' ')
}

/** Extra normalization patterns for fuzzy matching — returns additional LIKE patterns */
function fuzzyVariants(raw: string): string[] {
  const lower = raw.toLowerCase()
  const variants: string[] = []
  // If user typed ae/oe/ue, also try with ä/ö/ü (for DB columns that store originals)
  if (/ae|oe|ue/.test(lower)) {
    variants.push(`%${lower.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü')}%`)
  }
  // If user typed a/o/u, also try with ä/ö/ü
  if (/sp.t|sp.ti/i.test(lower)) {
    variants.push(`%spät%`)
  }
  return variants
}

function parseAddressQuery(q: string): { street: string; number: string | null } {
  const match = q.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?)$/)
  if (match) return { street: match[1].trim(), number: match[2].trim() }
  return { street: q, number: null }
}

// Build a SQLite REPLACE chain that strips common diacritics from a column
function normSql(col: string): string {
  const pairs: [string, string][] = [
    ['ß','ss'],['ä','a'],['ö','o'],['ü','u'],
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
  // Collapse German digraphs so "muehlen" matches "mühlen" (already ü→u above)
  expr = `REPLACE(${expr},'ae','a')`
  expr = `REPLACE(${expr},'oe','o')`
  expr = `REPLACE(${expr},'ue','u')`
  // Normalize hyphens to spaces so "martin opitz" matches "martin-opitz"
  expr = `REPLACE(${expr},'-',' ')`
  return expr
}

app.get('/api/search', async c => {
  const raw  = (c.req.query('q') ?? '').trim()
  const lang = c.req.query('lang') ?? 'de'
  if (raw.length < 2) return c.json({ events: [], locations: [], pois: [], streets: [] })

  // Translate the query to German so we always search the canonical German data
  let searchTerm = raw
  if (lang !== 'de' && ALLOWED_LANGS.has(lang)) {
    try {
      const cacheId = await hashKey(`${lang}-de`, raw)
      const cached = await c.env.DB
        .prepare(`SELECT translated FROM translations WHERE id = ?`)
        .bind(cacheId).first<{ translated: string }>()
      if (cached) {
        searchTerm = cached.translated
      } else {
        const result = await c.env.AI.run('@cf/meta/m2m100-1.2b' as Parameters<typeof c.env.AI.run>[0], {
          text: raw, source_lang: lang, target_lang: 'de',
        } as Parameters<typeof c.env.AI.run>[1]) as { translated_text?: string }
        const german = result.translated_text?.trim()
        if (german) {
          searchTerm = german
          await c.env.DB.prepare(
            `INSERT OR IGNORE INTO translations (id, lang, source, translated) VALUES (?, ?, ?, ?)`
          ).bind(cacheId, `${lang}-de`, raw, german).run()
        }
      }
    } catch { /* fall through: search with original query */ }
  }

  const norm    = normalizeQ(searchTerm)
  const pattern = `%${norm}%`

  const prefix = `${norm}%`

  const { street: addrStreet, number: addrNumber } = parseAddressQuery(searchTerm)
  const addrNorm = normalizeQ(addrStreet)
  const addrPrefix = `${addrNorm}%`

  const queries: Promise<unknown>[] = [
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
    (() => {
      const fv = fuzzyVariants(searchTerm)
      const fuzzyPattern = fv.length > 0 ? fv[0] : '%__NOMATCH__%'
      return c.env.DB.prepare(`
        SELECT id, name, category_group, category, region, address, lat, lng
        FROM pois
        WHERE ${normSql('name')} LIKE ?
           OR ${normSql('address')} LIKE ?
           OR ${normSql('category')} LIKE ?
           OR name LIKE ?
        LIMIT 30
      `).bind(pattern, pattern, pattern, fuzzyPattern).all<Record<string, unknown>>()
    })(),
    c.env.DB.prepare(`
      SELECT name, lat, lng, postcode, borough FROM streets
      WHERE name_norm LIKE ? OR name_norm LIKE ?
      ORDER BY CASE WHEN name_norm LIKE ? THEN 0 ELSE 1 END, name
      LIMIT 8
    `).bind(prefix, pattern, prefix).all<Record<string, unknown>>(),
    // Address query (only when house number detected)
    addrNumber
      ? c.env.DB.prepare(`
          SELECT street, housenumber, lat, lng, postcode FROM addresses
          WHERE street_norm LIKE ? AND housenumber = ?
          LIMIT 10
        `).bind(addrPrefix, addrNumber).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] }),
    // Semantic search (for queries 3+ chars, gracefully skip if Vectorize not bound)
    norm.length >= 3 && c.env.VECTORIZE
      ? semanticSearchPOIs(c.env, raw, { topK: 10 }).then(async matches => {
          if (matches.length === 0) return { results: [] }
          const ids = matches.map(m => m.id)
          const placeholders = ids.map(() => '?').join(',')
          const { results } = await c.env.DB.prepare(`
            SELECT id, name, category_group, category, region, address, lat, lng
            FROM pois WHERE id IN (${placeholders})
          `).bind(...ids).all<Record<string, unknown>>()
          // Preserve score ordering
          const byId = new Map(results.map(r => [r.id as string, r]))
          return { results: matches.map(m => byId.get(m.id)).filter(Boolean) }
        }).catch(() => ({ results: [] as Record<string, unknown>[] }))
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
  ]

  const [evRes, locRes, poiRes, streetRes, addrRes, semanticRes] = await Promise.all(queries) as [
    D1Result<Record<string, unknown>>,
    D1Result<Record<string, unknown>>,
    D1Result<Record<string, unknown>>,
    D1Result<Record<string, unknown>>,
    D1Result<Record<string, unknown>>,
    { results: Record<string, unknown>[] },
  ]

  return c.json({
    events: evRes.results,
    locations: locRes.results,
    pois: poiRes.results,
    streets: streetRes.results,
    addresses: (addrRes.results as Array<{ street: string; housenumber: string; lat: number; lng: number; postcode: string | null }>).map(a => ({
      street: a.street,
      housenumber: a.housenumber,
      display: `${a.street} ${a.housenumber}${a.postcode ? `, ${a.postcode}` : ''}`,
      lat: a.lat,
      lng: a.lng,
      postcode: a.postcode,
    })),
    semantic_pois: semanticRes.results,
  }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' })
})

// ─── GET /api/search/semantic ──────────────────────────────────────────────────

app.get('/api/search/semantic', async c => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 3) return c.json({ results: [] })
  if (!c.env.VECTORIZE) return c.json({ results: [], error: 'Vectorize not configured' })

  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '10')))
  const categoryGroup = c.req.query('category_group') || undefined

  const matches = await semanticSearchPOIs(c.env, q, {
    topK: limit,
    filter: categoryGroup ? { category_group: categoryGroup } : undefined,
  })

  if (matches.length === 0) return c.json({ results: [] })

  const ids = matches.map(m => m.id)
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(`
    SELECT id, name, category_group, category, region, address, lat, lng,
           website, phone, opening_hours, description, image_url
    FROM pois WHERE id IN (${placeholders})
  `).bind(...ids).all<Record<string, unknown>>()

  // Preserve score ordering and attach scores
  const byId = new Map(results.map(r => [r.id as string, r]))
  const enriched = matches
    .map(m => {
      const poi = byId.get(m.id)
      return poi ? { ...poi, score: m.score } : null
    })
    .filter(Boolean)

  return c.json({ results: enriched })
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

// ─── POST /api/ingest-ticketmaster (protected) ────────────────────────────────

app.post('/api/ingest-ticketmaster', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const days = Number(c.req.query('days') ?? 365)
  c.executionCtx.waitUntil(
    ingestTicketmaster(c.env, days)
      .then(n => console.log(`[ingest:ticketmaster:manual] done — ${n} events`))
      .catch(err => console.error('[ingest:ticketmaster:manual] failed:', err))
  )
  return c.json({ ok: true, message: `Ticketmaster ingest started: ${days} days` })
})

// ─── POST /api/ensure-locations (protected) ───────────────────────────────────

app.post('/api/ensure-locations', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.executionCtx.waitUntil(
    ensureLocationsForEvents(c.env.DB)
      .then(n => console.log(`[ensure-locations:manual] done — ${n} venues`))
      .catch(err => console.error('[ensure-locations:manual] failed:', err))
  )
  return c.json({ ok: true, message: 'Ensure locations started' })
})

// ─── POST /api/ingest-openligadb (protected) ──────────────────────────────────

app.post('/api/ingest-openligadb', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.executionCtx.waitUntil(
    ingestOpenLigaDB(c.env)
      .then(n => console.log(`[ingest:openligadb:manual] done — ${n} events`))
      .catch(err => console.error('[ingest:openligadb:manual] failed:', err))
  )
  return c.json({ ok: true, message: 'OpenLigaDB ingest started' })
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

// ─── POST /api/enrich-poi-images (protected) ─────────────────────────────────

app.post('/api/enrich-poi-images', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const count = await enrichPOIImages(c.env.DB)
  return c.json({ ok: true, enriched: count })
})

// ─── POST /api/ingest-cherry-blossoms (protected) ───────────────────────────

app.post('/api/ingest-cherry-blossoms', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const count = await ingestCherryBlossoms(c.env)
  return c.json({ ok: true, trees: count })
})

// ─── POST /api/enrich-event-images (protected) ──────────────────────────────

app.post('/api/enrich-event-images', async c => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const count = await enrichEventImages(c.env.DB)
  return c.json({ ok: true, enriched: count })
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

// ─── Listings ─────────────────────────────────────────────────────────────────

app.get('/api/listings', async c => {
  const { type, borough, bbox, status, format, street, page = '1', limit = '50' } = c.req.query()
  const result = await getListings({
    type:    type    || undefined,
    borough: borough || undefined,
    bbox:    bbox    || undefined,
    status:  status  || undefined,
    format:  format  || undefined,
    street:  street  || undefined,
    page:    Math.max(1, parseInt(page, 10)),
    limit:   Math.min(2000, Math.max(1, parseInt(limit, 10))),
  }, c.env.DB)
  return c.json(result)
})

app.get('/api/listings/images/:key{.+}', async c => {
  const key = c.req.param('key')
  const obj = await c.env.GEODATA.get(key)
  if (!obj) return c.json({ error: 'Not found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type':  obj.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})

app.get('/api/listings/:id', async c => {
  const listing = await getListing(c.req.param('id'), c.env.DB)
  if (!listing) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: listing })
})

app.post('/api/listings', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization') ?? '', c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<Record<string, unknown>>()
  if (!body.type || !body.title) return c.json({ error: 'type and title required' }, 400)
  const listing = await createListing(auth.sub, body as Parameters<typeof createListing>[1], c.env.DB)
  return c.json({ data: listing }, 201)
})

app.patch('/api/listings/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization') ?? '', c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const fields = await c.req.json<Record<string, unknown>>()
  const ok = await updateListing(c.req.param('id'), auth.sub, fields, c.env.DB)
  if (!ok) return c.json({ error: 'Not found or not owner' }, 404)
  return c.json({ ok: true })
})

app.delete('/api/listings/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization') ?? '', c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const ok = await deleteListing(c.req.param('id'), auth.sub, c.env.DB, c.env.GEODATA)
  if (!ok) return c.json({ error: 'Not found or not owner' }, 404)
  return c.json({ ok: true })
})

app.post('/api/listings/:id/images', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization') ?? '', c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400)
  const buf = await file.arrayBuffer()
  const result = await uploadListingImage(
    c.req.param('id'), auth.sub,
    buf, file.name || `${Date.now()}.jpg`, file.type || 'image/jpeg',
    c.env.DB, c.env.GEODATA,
  )
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ key: result.key })
})

// ─── Seed listings ────────────────────────────────────────────────────────────

app.post('/api/seed-listings', async c => {
  const authHeader = c.req.header('Authorization') ?? ''
  if (authHeader !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Use a fixed "system" user ID — create one if needed
  const systemUserId = 'system-seed'
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, datetime('now'))`
  ).bind(systemUserId, 'seed@citizen.berlin', 'Citizen.Berlin').run()

  const listings = [
    {
      id: 'seed-apt-1', user_id: systemUserId, type: 'apartment_rent',
      title: 'Bright 2-room in Kreuzberg', description: 'Sunny 2-room apartment, 65m², Altbau with high ceilings. Close to Görlitzer Park. Available from April.',
      price_cents: 95000, price_type: 'per_month', category: '2-Room',
      lat: 52.4955, lng: 13.4370, address: 'Oranienstraße 42, Berlin',
      borough: 'Friedrichshain-Kreuzberg', rooms: 2, sqm: 65, floor: 3,
      contact_method: 'email', status: 'active',
    },
    {
      id: 'seed-apt-2', user_id: systemUserId, type: 'apartment_buy',
      title: 'Altbau 3-room Prenzlauer Berg', description: 'Beautiful Altbau apartment with balcony, parquet floors, and Berliner Zimmer. Top floor with elevator.',
      price_cents: 35000000, price_type: 'fixed', category: '3-Room',
      lat: 52.5390, lng: 13.4170, address: 'Kastanienallee 77, Berlin',
      borough: 'Pankow', rooms: 3, sqm: 95, floor: 5,
      contact_method: 'email', status: 'active',
    },
    {
      id: 'seed-item-1', user_id: systemUserId, type: 'item',
      title: 'IKEA KALLAX shelf white', description: '4x2 KALLAX shelf in white, good condition. Self-pickup in Mitte.',
      price_cents: 2500, price_type: 'fixed', category: 'Furniture',
      lat: 52.5233, lng: 13.4127, address: 'Torstraße 120, Berlin',
      borough: 'Mitte', contact_method: 'email', status: 'active',
    },
    {
      id: 'seed-item-2', user_id: systemUserId, type: 'item',
      title: 'Canyon road bike 56cm', description: 'Canyon Endurace AL 7.0, 56cm frame. Shimano 105, ~3000km ridden. Minor scratches.',
      price_cents: 80000, price_type: 'negotiable', category: 'Bikes',
      lat: 52.4811, lng: 13.4353, address: 'Karl-Marx-Straße 85, Berlin',
      borough: 'Neukölln', contact_method: 'both', status: 'active',
    },
    {
      id: 'seed-item-3', user_id: systemUserId, type: 'item',
      title: 'MacBook Pro M2 14"', description: '2023 MacBook Pro M2 Pro, 16GB RAM, 512GB SSD. AppleCare until 2025. Includes original charger.',
      price_cents: 120000, price_type: 'fixed', category: 'Electronics',
      lat: 52.5058, lng: 13.3225, address: 'Kantstraße 23, Berlin',
      borough: 'Charlottenburg-Wilmersdorf', contact_method: 'email', status: 'active',
    },
    {
      id: 'seed-item-4', user_id: systemUserId, type: 'item',
      title: 'Free moving boxes (20x)', description: '20 sturdy moving boxes, various sizes. Free for pickup in Schöneberg.',
      price_cents: null, price_type: 'free', category: 'Other',
      lat: 52.4885, lng: 13.3535, address: 'Hauptstraße 15, Berlin',
      borough: 'Tempelhof-Schöneberg', contact_method: 'email', status: 'active',
    },
    {
      id: 'seed-svc-1', user_id: systemUserId, type: 'service',
      title: 'Deep cleaning - apartments', description: 'Professional deep cleaning for apartments. Includes kitchen, bathroom, windows. All cleaning supplies provided.',
      price_cents: 3000, price_type: 'negotiable', category: 'Cleaning',
      lat: 52.5200, lng: 13.4050, address: 'Alexanderplatz 1, Berlin',
      borough: 'Mitte', contact_method: 'both', status: 'active',
    },
    {
      id: 'seed-svc-2', user_id: systemUserId, type: 'service',
      title: 'Bike repair mobile service', description: 'Mobile bike repair — I come to you! Flat tires, brake adjustments, gear tuning. Same-day service available.',
      price_cents: 2500, price_type: 'fixed', category: 'Repair',
      lat: 52.5010, lng: 13.4490, address: 'Warschauer Straße 58, Berlin',
      borough: 'Friedrichshain-Kreuzberg', contact_method: 'phone', status: 'active',
    },
  ]

  let inserted = 0
  for (const l of listings) {
    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO listings (id, user_id, type, title, description, price_cents, price_type, category, lat, lng, address, borough, rooms, sqm, floor, contact_method, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        l.id, l.user_id, l.type, l.title, l.description,
        l.price_cents, l.price_type, l.category,
        l.lat ?? null, l.lng ?? null, l.address ?? null, l.borough ?? null,
        l.rooms ?? null, l.sqm ?? null, l.floor ?? null,
        l.contact_method, l.status,
      ).run()
      inserted++
    } catch { /* already exists */ }
  }

  return c.json({ ok: true, inserted, total: listings.length })
})

// ─── Community Events ─────────────────────────────────────────────────────────

app.post('/api/community-events', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization') ?? '', c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const body = await c.req.json<Record<string, unknown>>()
    if (!body.title || !body.date_start) return c.json({ error: 'title and date_start required' }, 400)
    const event = await createCommunityEvent(auth.sub, body, c.env.DB)
    return c.json({ data: event }, 201)
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'RATE_LIMIT') return c.json({ error: 'Max 5 pending events per day' }, 429)
    if (msg.startsWith('DUPLICATE:')) return c.json({ error: 'Duplicate event', duplicate_id: msg.split(':')[1] }, 409)
    throw err
  }
})

app.get('/api/community-events', async c => {
  const { status, date_from, date_to, bbox, page = '1', limit = '50' } = c.req.query()
  const result = await getCommunityEvents(c.env.DB, {
    status: status || 'approved',
    date_from: date_from || undefined,
    date_to: date_to || undefined,
    bbox: bbox || undefined,
    page: Math.max(1, parseInt(page, 10)),
    limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
  })
  return c.json({ data: result.events, pagination: { total: result.total } })
})

app.get('/api/community-events/pending', async c => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || authHeader !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const result = await getCommunityEvents(c.env.DB, { status: 'pending', limit: 100 })
  return c.json({ data: result.events, total: result.total })
})

app.get('/api/community-events/:id', async c => {
  const event = await getCommunityEvent(c.env.DB, c.req.param('id'))
  if (!event) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: event })
})

app.patch('/api/community-events/:id', async c => {
  const authHeader = c.req.header('Authorization') ?? ''
  const isAdmin = authHeader === `Bearer ${c.env.INGEST_SECRET}`
  const auth = isAdmin ? null : await getUserFromHeader(authHeader, c.env.JWT_SECRET)
  if (!isAdmin && !auth) return c.json({ error: 'Unauthorized' }, 401)

  const fields = await c.req.json<Record<string, unknown>>()

  if (isAdmin) {
    // Admin can edit any event — bypass ownership check
    const existing = await c.env.DB.prepare('SELECT id FROM community_events WHERE id = ?').bind(c.req.param('id')).first()
    if (!existing) return c.json({ error: 'Not found' }, 404)
    const allowed = ['title', 'description', 'date_start', 'date_end', 'time_start', 'time_end',
      'is_recurring', 'recurrence_day', 'location_name', 'address', 'borough', 'lat', 'lng',
      'category', 'tags', 'is_free', 'ticket_url', 'submitter_name']
    const sets: string[] = []
    const vals: unknown[] = []
    for (const key of allowed) {
      if (key in fields) {
        if (key === 'tags' && Array.isArray(fields[key])) { sets.push(`${key} = ?`); vals.push(JSON.stringify(fields[key])) }
        else { sets.push(`${key} = ?`); vals.push(fields[key] as string | number | null) }
      }
    }
    if (sets.length) {
      await c.env.DB.prepare(`UPDATE community_events SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, c.req.param('id')).run()
    }
    return c.json({ ok: true })
  }

  const ok = await updateCommunityEvent(c.req.param('id'), auth!.sub, fields, c.env.DB)
  if (!ok) return c.json({ error: 'Not found or not owner' }, 404)
  return c.json({ ok: true })
})

app.delete('/api/community-events/:id', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization') ?? '', c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const ok = await deleteCommunityEvent(c.req.param('id'), auth.sub, c.env.DB, c.env.GEODATA)
  if (!ok) return c.json({ error: 'Not found or not owner' }, 404)
  return c.json({ ok: true })
})

app.post('/api/community-events/:id/image', async c => {
  const authHeader = c.req.header('Authorization') ?? ''
  const isAdmin = authHeader === `Bearer ${c.env.INGEST_SECRET}`
  const auth = isAdmin ? null : await getUserFromHeader(authHeader, c.env.JWT_SECRET)
  if (!isAdmin && !auth) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400)
  const buf = await file.arrayBuffer()

  let result: { ok: true; key: string } | { ok: false; error: string }
  if (isAdmin) {
    // Admin upload — bypass ownership, write directly
    const eventId = c.req.param('id')
    const existing = await c.env.DB.prepare('SELECT id, image_key FROM community_events WHERE id = ?').bind(eventId).first<{ id: string; image_key: string | null }>()
    if (!existing) { result = { ok: false, error: 'Not found' } } else {
      if (existing.image_key) { try { await c.env.GEODATA.delete(existing.image_key) } catch { /* ignore */ } }
      const key = `community-events/${eventId}/${file.name || `${Date.now()}.jpg`}`
      await c.env.GEODATA.put(key, buf, { httpMetadata: { contentType: file.type || 'image/jpeg' } })
      await c.env.DB.prepare('UPDATE community_events SET image_key = ? WHERE id = ?').bind(key, eventId).run()
      result = { ok: true, key }
    }
  } else {
    result = await uploadCommunityEventImage(
      c.req.param('id'), auth!.sub,
      buf, file.name || `${Date.now()}.jpg`, file.type || 'image/jpeg',
      c.env.DB, c.env.GEODATA,
    )
  }
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ key: result.key })
})

app.post('/api/community-events/:id/vote', async c => {
  const auth = await getUserFromHeader(c.req.header('Authorization') ?? '', c.env.JWT_SECRET)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const { vote } = await c.req.json<{ vote: number }>()
  if (vote !== 1 && vote !== -1) return c.json({ error: 'vote must be 1 or -1' }, 400)
  await voteCommunityEvent(c.req.param('id'), auth.sub, vote, c.env.DB)
  return c.json({ ok: true })
})

app.patch('/api/community-events/:id/moderate', async c => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || authHeader !== `Bearer ${c.env.INGEST_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const { status } = await c.req.json<{ status: string }>()
  if (status !== 'approved' && status !== 'rejected') return c.json({ error: 'status must be approved or rejected' }, 400)
  const ok = await moderateCommunityEvent(c.req.param('id'), status, c.env.DB)
  if (!ok) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// ─── OSM Suggestions ──────────────────────────────────────────────────────────

app.post('/api/suggestions', async c => {
  const user = await getUserFromHeader(c.env.DB, c.env.JWT_SECRET, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Authentication required' }, 401)

  const body = await c.req.json<{
    suggestion_type: string
    osm_id?: string
    poi_id?: string
    category_group?: string
    category?: string
    data: Record<string, unknown>
  }>()

  if (!body.suggestion_type || !body.data) {
    return c.json({ error: 'suggestion_type and data are required' }, 400)
  }

  const validTypes = ['add_place', 'edit_name', 'edit_address', 'edit_hours', 'report_closed', 'other']
  if (!validTypes.includes(body.suggestion_type)) {
    return c.json({ error: `Invalid suggestion_type. Must be one of: ${validTypes.join(', ')}` }, 400)
  }

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO osm_suggestions (id, user_id, suggestion_type, osm_id, poi_id, category_group, category, data, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(
    id, user.id, body.suggestion_type,
    body.osm_id ?? null, body.poi_id ?? null,
    body.category_group ?? null, body.category ?? null,
    JSON.stringify(body.data),
  ).run()

  return c.json({ ok: true, id })
})

app.get('/api/suggestions', async c => {
  const user = await getUserFromHeader(c.env.DB, c.env.JWT_SECRET, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Authentication required' }, 401)

  const { status = 'pending', limit = '50' } = c.req.query()
  const rows = await c.env.DB.prepare(
    `SELECT * FROM osm_suggestions WHERE status = ? ORDER BY created_at DESC LIMIT ?`
  ).bind(status, Math.min(200, parseInt(limit, 10))).all()

  return c.json({ data: rows.results })
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
      // Push reminders — check every 30 min
      ctx.waitUntil(
        sendPushReminders(env)
          .then(r => r.sent > 0 && console.log(`[push-reminders] sent=${r.sent}`))
          .catch(err => console.error('[push-reminders]', err))
      )
      // External event sources — run at :30 only (own invocation, avoids subrequest limits)
      if (new Date().getUTCMinutes() >= 25) {
        if (env.TICKETMASTER_API_KEY) {
          ctx.waitUntil(
            ingestTicketmaster(env, 365)
              .then(n => console.log(`[ingest:ticketmaster] ${n} events`))
              .catch(err => console.error('[ingest:ticketmaster]', err))
          )
        }
        if (env.SONGKICK_API_KEY) {
          ctx.waitUntil(
            ingestSongkick(env, 365)
              .then(n => console.log(`[ingest:songkick] ${n} events`))
              .catch(err => console.error('[ingest:songkick]', err))
          )
        }
        // OpenLigaDB — no API key needed
        ctx.waitUntil(
          ingestOpenLigaDB(env)
            .then(n => console.log(`[ingest:openligadb] ${n} events`))
            .catch(err => console.error('[ingest:openligadb]', err))
        )
        // Auto-create venue pages for events without location records
        ctx.waitUntil(
          ensureLocationsForEvents(env.DB)
            .then(n => n > 0 && console.log(`[ensure-locations] created ${n} venue records`))
            .catch(err => console.error('[ensure-locations]', err))
        )
      }
    } else if (event.cron === '0 2 * * *') {
      // Daily geodata refresh (R2) + location sync (D1) + image enrichment + DB cleanup + POI Berlin + smart notifications
      ctx.waitUntil(
        generateSmartNotifications(env)
          .then(r => console.log(`[smart-notifs] sent=${r.sent}`))
          .catch(err => console.error('[smart-notifs]', err))
      )
      ctx.waitUntil(
        Promise.all([
          refreshGeodata(env).catch(e => console.error('[geodata]', e)),
          ingestLocations(env)
            .then(() => enrichLocationsWithImages(env.DB))
            .then(() => enrichEventImages(env.DB))
            .then(n => console.log(`[enrich-event-images:cron] ${n} events enriched`))
            .catch(e => console.error('[locations/enrich]', e)),
          // Purge expired auth tokens (15-min TTL) and stale rate-limit windows (all <24h old)
          env.DB.batch([
            env.DB.prepare(`DELETE FROM auth_tokens WHERE expires_at < datetime('now')`),
            env.DB.prepare(`DELETE FROM rate_limits WHERE 1=1`),
            env.DB.prepare(`DELETE FROM events WHERE date_end < date('now', '-30 days') OR (date_end IS NULL AND date_start < date('now', '-30 days'))`),
            env.DB.prepare(`DELETE FROM user_attendance WHERE item_type = 'event' AND item_id NOT IN (SELECT id FROM events)`),
            env.DB.prepare(`DELETE FROM item_views WHERE view_date < date('now', '-14 days')`),
          ]).then(([a, r, ev, att, iv]) => {
            const meta = (s: unknown) => (s as { meta: { changes: number } }).meta.changes
            console.log(`[cleanup] auth_tokens=${meta(a)} rate_limits=${meta(r)} stale_events=${meta(ev)} orphan_attendance=${meta(att)} old_views=${meta(iv)}`)
          })
            .catch(e => console.error('[cleanup]', e)),
          // POI ingest — Berlin (daily) + Wikidata image enrichment + Vectorize sync
          ingestPOIs(env, 'berlin')
            .then(r => console.log(`[poi-ingest:berlin] ${r.total} rows, ${r.categories} categories`))
            .then(() => enrichPOIImages(env.DB))
            .then(n => console.log(`[enrich-poi-images] ${n} POIs enriched`))
            .then(() => env.VECTORIZE ? syncPOIsToVectorize(env) : null)
            .then(r => r && console.log(`[vectorize-sync:cron] synced=${r.synced} skipped=${r.skipped}`))
            .catch(err => console.error('[poi-ingest:berlin]', err)),
        ])
      )
      // Street ingest — weekly on Sundays only
      if (new Date().getUTCDay() === 0) {
        ctx.waitUntil(
          ingestStreets(env)
            .then(r => console.log(`[street-ingest:cron] ${r.total} streets`))
            .catch(err => console.error('[street-ingest:cron]', err))
        )
      }
      // Address ingest — monthly on the 1st
      if (new Date().getUTCDate() === 1) {
        ctx.waitUntil(
          ingestAddresses(env)
            .then(r => console.log(`[address-ingest:cron] ${r.total} addresses`))
            .catch(err => console.error('[address-ingest:cron]', err))
        )
      }
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
      // Pre-translate titles of events ingested in the last 48h (catches newly added events)
      ctx.waitUntil(
        env.DB.prepare(
          `SELECT title FROM events WHERE date_start >= date('now') AND created_at >= datetime('now', '-2 days') LIMIT 300`
        ).all<{ title: string | null }>()
          .then(rows => translateTexts(env, [...ALLOWED_LANGS], rows.results.map(r => r.title)))
          .then(s => console.log(`[pretranslate:cron] translated=${s.translated} skipped=${s.skipped}`))
          .catch(e => console.error('[pretranslate:cron]', e))
      )
      // POI ingest — Brandenburg (only on Wednesdays)
      const dayOfWeek = new Date().getUTCDay()
      if (dayOfWeek === 3) { // Wednesday
        ctx.waitUntil(
          ingestPOIs(env, 'brandenburg')
            .then(r => console.log(`[poi-ingest:brandenburg] ${r.total} rows, ${r.categories} categories`))
            .catch(err => console.error('[poi-ingest:brandenburg]', err))
        )
      }
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
