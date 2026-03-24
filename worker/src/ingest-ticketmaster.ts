import { upsertEvents } from './db'
import type { Env, EventRow } from './types'

const PAGE_SIZE = 100
const BERLIN_LAT = 52.52
const BERLIN_LNG = 13.405
const RADIUS_KM = 50

// Ticketmaster segment → our categories
const SEGMENT_MAP: Record<string, string> = {
  'Music':            'Music',
  'Sports':           'Sports',
  'Arts & Theatre':   'Theater',
  'Film':             'Film',
  'Miscellaneous':    'Other',
  'Undefined':        'Other',
}

function fmtDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function fmtDate(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapCategory(classifications?: Array<{ segment?: { name?: string } }>): string {
  const segment = classifications?.[0]?.segment?.name
  if (!segment) return 'Other'
  return SEGMENT_MAP[segment] ?? 'Other'
}

interface TmEvent {
  id: string
  name: string
  description?: string
  info?: string
  pleaseNote?: string
  url?: string
  locale?: string
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string }
    end?: { localDate?: string; localTime?: string; dateTime?: string }
    access?: { startDateTime?: string }
    status?: { code?: string }
    spanMultipleDays?: boolean
  }
  classifications?: Array<{
    segment?: { name?: string }
    genre?: { name?: string }
    subGenre?: { name?: string }
  }>
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>
  sales?: { public?: { startDateTime?: string; endDateTime?: string } }
  images?: Array<{ url?: string; width?: number; height?: number; ratio?: string }>
  promoter?: { name?: string }
  _embedded?: {
    venues?: Array<{
      name?: string
      url?: string
      address?: { line1?: string }
      city?: { name?: string }
      postalCode?: string
      location?: { latitude?: string; longitude?: string }
    }>
    attractions?: Array<{
      name?: string
      url?: string
      description?: string
    }>
  }
}

interface TmResponse {
  _embedded?: { events?: TmEvent[] }
  page?: { totalPages?: number; number?: number; totalElements?: number }
}

function extractTags(ev: TmEvent): string | null {
  const c = ev.classifications?.[0]
  const tags: string[] = []
  if (c?.segment?.name) tags.push(c.segment.name)
  if (c?.genre?.name)   tags.push(c.genre.name)
  if (c?.subGenre?.name && c.subGenre.name !== c.genre?.name) tags.push(c.subGenre.name)
  return tags.length ? JSON.stringify(tags) : null
}

function transformTmEvent(ev: TmEvent): Omit<EventRow, 'created_at' | 'updated_at'> {
  const venue = ev._embedded?.venues?.[0]
  const lat = venue?.location?.latitude  ? parseFloat(venue.location.latitude)  : null
  const lng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null

  const addressParts = [
    venue?.address?.line1,
    venue?.postalCode,
    venue?.city?.name ?? 'Berlin',
  ].filter(Boolean)

  const hasPricing = ev.priceRanges && ev.priceRanges.length > 0
  const price_type: 'free' | 'paid' | 'unknown' = hasPricing ? 'paid' : 'unknown'

  // Pick best images: prefer 16_9 ratio, sort by width desc, take top 6
  const images = (ev.images ?? [])
    .sort((a, b) => {
      if (a.ratio === '16_9' && b.ratio !== '16_9') return -1
      if (b.ratio === '16_9' && a.ratio !== '16_9') return 1
      return (b.width ?? 0) - (a.width ?? 0)
    })
    .map(i => i.url)
    .filter((u): u is string => !!u)
    .slice(0, 6)

  // Map status
  const statusCode = ev.dates?.status?.code?.toLowerCase()
  const schedule_status = statusCode === 'cancelled' ? 'cancelled'
    : statusCode === 'postponed' ? 'postponed'
    : statusCode === 'rescheduled' ? 'rescheduled'
    : null

  // End time from dates.end
  const time_end = ev.dates?.end?.localTime ?? null
  const date_end = ev.dates?.spanMultipleDays ? (ev.dates?.end?.localDate ?? null) : null

  // Ticketmaster's access.startDateTime is ticket sale access, not physical door time
  // No reliable door time available from the API
  const door_time: string | null = null

  // Collect external links (venue + attraction URLs)
  const links: Array<{ url: string; displayName?: string }> = []
  if (venue?.url) links.push({ url: venue.url, displayName: venue.name ?? 'Venue' })
  const attraction = ev._embedded?.attractions?.[0]
  if (attraction?.url) links.push({ url: attraction.url, displayName: attraction.name ?? 'Artist' })

  // Price note with currency
  const priceRange = ev.priceRanges?.[0]
  const admission_note = priceRange
    ? `${priceRange.currency ?? 'EUR'} ${priceRange.min ?? '?'}–${priceRange.max ?? '?'}`
    : null

  return {
    id:               `tm:${ev.id}`,
    title:            ev.name,
    description:      ev.description ?? ev.info ?? attraction?.description ?? null,
    date_start:       ev.dates?.start?.localDate ?? fmtDate(new Date()),
    date_end,
    time_start:       ev.dates?.start?.localTime ?? null,
    time_end,
    door_time,
    category:         mapCategory(ev.classifications),
    tags:             extractTags(ev),
    price_type,
    price_min:        priceRange?.min ?? null,
    price_max:        priceRange?.max ?? null,
    admission_link:   ev.url ?? null,
    location_name:    venue?.name ?? (addressParts.length ? addressParts[0]! : null),
    address:          addressParts.length ? addressParts.join(', ') : null,
    borough:          null,
    lat,
    lng,
    source_url:       ev.url ?? null,
    attraction_id:    null,
    location_id:      null,
    schedule_status,
    please_note:      ev.pleaseNote ?? null,
    admission_note,
    source_links:     links.length ? JSON.stringify(links) : null,
    registration_type: null,
    languages:        ev.locale ? JSON.stringify([ev.locale.split('-')[0]]) : null,
    image_urls:       images.length ? JSON.stringify(images) : null,
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

export async function ingestTicketmaster(env: Env, days = 30): Promise<number> {
  const apiKey = env.TICKETMASTER_API_KEY
  if (!apiKey) return 0

  const now = new Date()
  const startDateTime = fmtDateTime(now)
  const endDateTime   = fmtDateTime(new Date(now.getTime() + days * 864e5))

  let page  = 0
  let total = 0

  console.log(`[ingest:ticketmaster] Starting — ${days} days`)

  while (true) {
    const params = new URLSearchParams({
      apikey:        apiKey,
      latlong:       `${BERLIN_LAT},${BERLIN_LNG}`,
      radius:        String(RADIUS_KM),
      unit:          'km',
      countryCode:   'DE',
      size:          String(PAGE_SIZE),
      page:          String(page),
      startDateTime,
      endDateTime,
    })

    let res: Response
    try {
      res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`)
    } catch (err) {
      // Workers subrequest limit — save what we have so far
      console.warn(`[ingest:ticketmaster] Fetch error on page ${page + 1} (saved ${total} so far):`, err)
      break
    }
    if (!res.ok) {
      console.error(`[ingest:ticketmaster] API error ${res.status}`)
      break
    }

    const data = await res.json() as TmResponse
    const events = data._embedded?.events ?? []
    if (!events.length) break

    const transformed = events.map(transformTmEvent)

    // Dedup against existing Kulturdaten events
    let existing: Set<string>
    try {
      existing = await findExistingDateLocPairs(env.DB, transformed)
    } catch (err) {
      console.warn(`[ingest:ticketmaster] Dedup query failed on page ${page + 1}, upserting all:`, err)
      existing = new Set()
    }
    const filtered = transformed.filter(e => !existing.has(dedupKey(e)))

    if (filtered.length) {
      try {
        await upsertEvents(env.DB, filtered)
      } catch (err) {
        console.warn(`[ingest:ticketmaster] Upsert failed on page ${page + 1}:`, err)
        break
      }
    }
    total += filtered.length

    const totalPages = data.page?.totalPages ?? 1
    console.log(`[ingest:ticketmaster] Page ${page + 1}/${totalPages}: ${filtered.length} new (${events.length - filtered.length} deduped)`)

    page++
    if (page >= totalPages) break

    // Respect 5 req/sec rate limit
    await new Promise(r => setTimeout(r, 220))
  }

  console.log(`[ingest:ticketmaster] Done — ${total} events`)
  return total
}
