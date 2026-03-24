import { upsertEvents } from './db'
import type { Env, EventRow } from './types'

// Berlin metro area ID on Songkick
const BERLIN_METRO_ID = 28443

const PER_PAGE = 50

function fmtDate(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface SkVenue {
  displayName?: string
  lat?: number | null
  lng?: number | null
}

interface SkLocation {
  city?: string
  lat?: number
  lng?: number
}

interface SkEvent {
  id: number
  displayName: string
  uri?: string
  status?: string  // 'ok' | 'cancelled' | 'postponed'
  start?: { date?: string; time?: string }
  venue?: SkVenue
  location?: SkLocation
  performance?: Array<{ displayName?: string }>
}

interface SkResponse {
  resultsPage?: {
    totalEntries?: number
    perPage?: number
    page?: number
    results?: { event?: SkEvent[] }
  }
}

function transformSkEvent(ev: SkEvent): Omit<EventRow, 'created_at' | 'updated_at'> {
  const lat = ev.venue?.lat ?? ev.location?.lat ?? null
  const lng = ev.venue?.lng ?? ev.location?.lng ?? null

  const schedule_status = ev.status === 'cancelled' ? 'cancelled'
    : ev.status === 'postponed' ? 'postponed'
    : null

  return {
    id:               `sk:${ev.id}`,
    title:            ev.displayName,
    description:      null,
    date_start:       ev.start?.date ?? fmtDate(new Date()),
    date_end:         null,
    time_start:       ev.start?.time ?? null,
    time_end:         null,
    door_time:        null,
    category:         'Music',  // Songkick is music-only
    tags:             null,
    price_type:       'unknown',  // Songkick doesn't expose pricing
    price_min:        null,
    price_max:        null,
    admission_link:   ev.uri ?? null,
    location_name:    ev.venue?.displayName ?? null,
    address:          null,
    borough:          null,
    lat,
    lng,
    source_url:       ev.uri ?? null,
    attraction_id:    null,
    location_id:      null,
    schedule_status,
    please_note:      null,
    admission_note:   null,
    source_links:     null,
    registration_type: null,
    languages:        null,
    image_urls:       null,
  }
}

/** Check for likely duplicate Kulturdaten events already in DB */
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
     WHERE id NOT LIKE 'tm:%' AND id NOT LIKE 'sk:%'
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

export async function ingestSongkick(env: Env, days = 30): Promise<number> {
  const apiKey = env.SONGKICK_API_KEY
  if (!apiKey) return 0

  const now     = new Date()
  const minDate = fmtDate(now)
  const maxDate = fmtDate(new Date(now.getTime() + days * 864e5))

  let page  = 1
  let total = 0

  console.log(`[ingest:songkick] Starting — ${days} days`)

  while (true) {
    const params = new URLSearchParams({
      apikey:   apiKey,
      per_page: String(PER_PAGE),
      page:     String(page),
      min_date: minDate,
      max_date: maxDate,
    })

    const url = `https://api.songkick.com/api/3.0/metro_areas/${BERLIN_METRO_ID}/calendar.json?${params}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`[ingest:songkick] API error ${res.status}`)
      break
    }

    const data = await res.json() as SkResponse
    const events = data.resultsPage?.results?.event ?? []
    if (!events.length) break

    const transformed = events.map(transformSkEvent)

    // Dedup against existing Kulturdaten events
    const existing = await findExistingDateLocPairs(env.DB, transformed)
    const filtered = transformed.filter(e => !existing.has(dedupKey(e)))

    if (filtered.length) {
      await upsertEvents(env.DB, filtered)
    }
    total += filtered.length

    const totalEntries = data.resultsPage?.totalEntries ?? 0
    const totalPages   = Math.ceil(totalEntries / PER_PAGE)
    console.log(`[ingest:songkick] Page ${page}/${totalPages}: ${filtered.length} new (${events.length - filtered.length} deduped)`)

    if (events.length < PER_PAGE || page >= totalPages) break
    page++

    // Conservative rate limit — 1 req/sec
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`[ingest:songkick] Done — ${total} events`)
  return total
}
