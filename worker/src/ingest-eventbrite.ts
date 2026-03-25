import { upsertEvents } from './db'
import type { Env, EventRow } from './types'

const BERLIN_LAT = 52.52
const BERLIN_LNG = 13.405
const MAX_DISTANCE_KM = 60  // Berlin + Brandenburg radius

// Eventbrite category IDs → our categories
const CATEGORY_MAP: Record<string, string> = {
  '103': 'Music',
  '101': 'Other',       // Business & Professional
  '110': 'Other',       // Food & Drink
  '113': 'Other',       // Community & Culture
  '105': 'Theater',     // Performing & Visual Arts
  '104': 'Film',        // Film, Media & Entertainment
  '108': 'Sports',      // Sports & Fitness
  '107': 'Other',       // Health & Wellness
  '102': 'Education',   // Science & Technology
  '109': 'Tours',       // Travel & Outdoor
  '111': 'Other',       // Charity & Causes
  '115': 'Kids',        // Family & Education
  '116': 'Other',       // Seasonal & Holiday
  '199': 'Other',       // Other
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function parseLocalDateTime(localStr?: string): { date: string; time: string | null } {
  if (!localStr) return { date: new Date().toISOString().slice(0, 10), time: null }
  const [datePart, timePart] = localStr.split('T')
  return {
    date: datePart ?? new Date().toISOString().slice(0, 10),
    time: timePart ? timePart.slice(0, 5) : null,
  }
}

interface EbEvent {
  id: string
  name?: { text?: string }
  description?: { text?: string }
  url?: string
  start?: { local?: string }
  end?: { local?: string }
  status?: string
  is_free?: boolean
  category_id?: string
  logo?: { url?: string; original?: { url?: string } }
  venue?: {
    name?: string
    address?: {
      address_1?: string
      address_2?: string
      city?: string
      region?: string
      postal_code?: string
      latitude?: string
      longitude?: string
    }
  }
  online_event?: boolean
  locale?: string
}

function transformEbEvent(ev: EbEvent): Omit<EventRow, 'created_at' | 'updated_at'> | null {
  if (ev.online_event && !ev.venue) return null

  const title = ev.name?.text
  if (!title) return null

  const lat = ev.venue?.address?.latitude ? parseFloat(ev.venue.address.latitude) : null
  const lng = ev.venue?.address?.longitude ? parseFloat(ev.venue.address.longitude) : null

  // Filter: must be within Berlin/Brandenburg radius
  if (lat != null && lng != null) {
    if (haversineKm(BERLIN_LAT, BERLIN_LNG, lat, lng) > MAX_DISTANCE_KM) return null
  } else {
    // No coordinates — check city name
    const city = (ev.venue?.address?.city ?? '').toLowerCase()
    const region = (ev.venue?.address?.region ?? '').toLowerCase()
    if (!city.includes('berlin') && !region.includes('berlin') && !region.includes('brandenburg')) {
      return null
    }
  }

  const start = parseLocalDateTime(ev.start?.local)
  const end = parseLocalDateTime(ev.end?.local)

  const addressParts = [
    ev.venue?.address?.address_1,
    ev.venue?.address?.address_2,
    ev.venue?.address?.postal_code,
    ev.venue?.address?.city ?? 'Berlin',
  ].filter(Boolean)

  const price_type: 'free' | 'paid' | 'unknown' = ev.is_free ? 'free' : 'paid'
  const imageUrl = ev.logo?.original?.url ?? ev.logo?.url ?? null
  const schedule_status = ev.status === 'canceled' ? 'cancelled' : null
  const date_end = start.date !== end.date ? end.date : null

  return {
    id:               `eb:${ev.id}`,
    title,
    description:      ev.description?.text?.slice(0, 2000) ?? null,
    date_start:       start.date,
    date_end,
    time_start:       start.time,
    time_end:         end.time,
    door_time:        null,
    category:         CATEGORY_MAP[ev.category_id ?? ''] ?? 'Other',
    tags:             null,
    price_type,
    price_min:        null,
    price_max:        null,
    admission_link:   ev.url ?? null,
    location_name:    ev.venue?.name ?? null,
    address:          addressParts.length ? addressParts.join(', ') : null,
    borough:          null,
    lat,
    lng,
    source_url:       ev.url ?? null,
    attraction_id:    null,
    location_id:      null,
    schedule_status,
    please_note:      null,
    admission_note:   null,
    source_links:     null,
    registration_type: null,
    languages:        ev.locale ? JSON.stringify([ev.locale.split('_')[0]]) : null,
    image_urls:       imageUrl ? JSON.stringify([imageUrl]) : null,
  }
}

/** Scrape event IDs from the public Eventbrite Berlin page */
async function scrapeEventIds(pages = 3): Promise<string[]> {
  const ids: string[] = []
  for (let page = 1; page <= pages; page++) {
    try {
      const url = `https://www.eventbrite.com/d/germany--berlin/events/?page=${page}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'citizen-berlin/1.0 (openberlinai.workers.dev)' },
      })
      if (!res.ok) break
      const html = await res.text()
      // Extract event IDs from URLs like /e/event-name-1234567890
      const matches = html.matchAll(/\/e\/[^"]*?-(\d{10,})/g)
      for (const m of matches) {
        if (m[1] && !ids.includes(m[1])) ids.push(m[1])
      }
    } catch (err) {
      console.warn(`[ingest:eventbrite] Scrape page ${page} failed:`, err)
      break
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return ids
}

/** Check for likely duplicate events already in DB */
async function findExistingDateLocPairs(
  db: D1Database,
  events: Array<Omit<EventRow, 'created_at' | 'updated_at'>>
): Promise<Set<string>> {
  const dates = [...new Set(events.map(e => e.date_start))]
  if (!dates.length) return new Set()

  const placeholders = dates.map(() => '?').join(',')
  const rows = await db.prepare(
    `SELECT date_start, LOWER(SUBSTR(title, 1, 20)) AS t20, LOWER(location_name) AS loc
     FROM events
     WHERE id NOT LIKE 'eb:%'
       AND date_start IN (${placeholders})`
  ).bind(...dates).all<{ date_start: string; t20: string; loc: string | null }>()

  const keys = new Set<string>()
  for (const r of rows.results) {
    keys.add(`${r.date_start}|${r.t20}|${r.loc ?? ''}`)
  }
  return keys
}

function dedupKey(e: Omit<EventRow, 'created_at' | 'updated_at'>): string {
  return `${e.date_start}|${(e.title ?? '').slice(0, 20).toLowerCase()}|${(e.location_name ?? '').toLowerCase()}`
}

export async function ingestEventbrite(env: Env, _days = 30): Promise<number> {
  const token = env.EVENTBRITE_TOKEN
  if (!token) return 0

  console.log('[ingest:eventbrite] Starting — scraping Berlin event IDs')

  // Step 1: Scrape event IDs from public Eventbrite Berlin pages
  const eventIds = await scrapeEventIds(5)
  if (!eventIds.length) {
    console.log('[ingest:eventbrite] No event IDs scraped')
    return 0
  }
  console.log(`[ingest:eventbrite] Scraped ${eventIds.length} event IDs`)

  // Step 2: Fetch each event via API with venue details
  const transformed: Array<Omit<EventRow, 'created_at' | 'updated_at'>> = []
  let fetched = 0

  for (const eid of eventIds) {
    // Check if already in DB
    const existing = await env.DB.prepare(
      `SELECT 1 FROM events WHERE id = ?`
    ).bind(`eb:${eid}`).first()
    if (existing) continue

    try {
      const res = await fetch(
        `https://www.eventbriteapi.com/v3/events/${eid}/?expand=venue`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        if (res.status === 429) {
          console.warn('[ingest:eventbrite] Rate limited, stopping')
          break
        }
        continue
      }
      const ev = await res.json() as EbEvent
      const row = transformEbEvent(ev)
      if (row) transformed.push(row)
      fetched++
    } catch (err) {
      console.warn(`[ingest:eventbrite] Fetch error for ${eid}:`, err)
    }

    // Respect rate limits (~3 req/sec)
    await new Promise(r => setTimeout(r, 350))
  }

  console.log(`[ingest:eventbrite] Fetched ${fetched} events, ${transformed.length} in Berlin/Brandenburg`)

  if (!transformed.length) return 0

  // Step 3: Dedup against existing events from other sources
  let existing: Set<string>
  try {
    existing = await findExistingDateLocPairs(env.DB, transformed)
  } catch {
    existing = new Set()
  }
  const filtered = transformed.filter(e => !existing.has(dedupKey(e)))

  if (filtered.length) {
    try {
      await upsertEvents(env.DB, filtered)
    } catch (err) {
      console.warn('[ingest:eventbrite] Upsert failed:', err)
      return 0
    }
  }

  console.log(`[ingest:eventbrite] Done — ${filtered.length} new events (${transformed.length - filtered.length} deduped)`)
  return filtered.length
}
