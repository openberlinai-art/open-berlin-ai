import { upsertEvents } from './db'
import { geocode }      from './geocoder'
import type {
  Env,
  EventRow,
  KulturdatenEvent,
  KulturdatenAttraction,
  KulturdatenLocation,
} from './types'

const PAGE_SIZE = 500

// Maps kulturdaten category tags → display names
const CATEGORY_MAP: Record<string, string> = {
  exhibitions:   'Exhibitions',
  ausstellung:   'Exhibitions',
  music:         'Music',
  musik:         'Music',
  konzert:       'Music',
  dance:         'Dance',
  tanz:          'Dance',
  recreation:    'Recreation',
  freizeit:      'Recreation',
  kids:          'Kids',
  kinder:        'Kids',
  jugend:        'Kids',
  sports:        'Sports',
  sport:         'Sports',
  tours:         'Tours',
  fuehrung:      'Tours',
  führung:       'Tours',
  film:          'Film',
  kino:          'Film',
  theater:       'Theater',
  theatre:       'Theater',
  talks:         'Talks',
  vortrag:       'Talks',
  lesung:        'Talks',
  literature:    'Talks',
  education:     'Education',
  bildung:       'Education',
  workshop:      'Education',
  art:           'Art',
  kunst:         'Art',
}

function normalizeCategory(tags: string[]): string {
  for (const tag of tags) {
    const clean = tag
      .replace(/^attraction\.category\./i, '')
      .replace(/^event\.category\./i, '')
      .toLowerCase()
      .trim()
    const mapped = CATEGORY_MAP[clean]
    if (mapped) return mapped
  }
  return 'Other'
}

async function fetchJson<T>(url: string, apiKey?: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

async function batchFetch<T>(
  baseUrl: string,
  ids: string[],
  path: string,
  apiKey?: string
): Promise<Map<string, T>> {
  const CONCURRENCY = 20
  const result = new Map<string, T>()

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY)
    const fetched = await Promise.all(
      chunk.map(id =>
        fetchJson<{ data: Record<string, T> }>(
          `${baseUrl}/${path}/${id}`,
          apiKey
        ).then(d => {
          const key = path === 'attractions' ? 'attraction' : 'location'
          return { id, data: (d?.data as Record<string, T>)?.[key] ?? null }
        })
      )
    )
    for (const { id, data } of fetched) {
      if (data) result.set(id, data)
    }
  }

  return result
}

function transformEvent(
  raw: KulturdatenEvent,
  attraction: KulturdatenAttraction | undefined,
  location: KulturdatenLocation | undefined,
  coords: { lat: number; lng: number } | null
): Omit<EventRow, 'created_at' | 'updated_at'> {
  const tags = attraction?.tags ?? []
  const category = normalizeCategory(tags)

  const title =
    attraction?.title?.de ??
    attraction?.title?.en ??
    raw.attractions[0]?.referenceLabel?.de ??
    'Untitled'

  const description =
    ((attraction?.description?.de ?? attraction?.description?.en) ?? '').slice(0, 500)

  const isFree = raw.admission?.ticketType === 'ticketType.freeOfCharge'
  const price_type: 'free' | 'paid' | 'unknown' = raw.admission
    ? isFree ? 'free' : 'paid'
    : 'unknown'

  const address = location?.address
    ? [location.address.streetAddress, location.address.postalCode, 'Berlin']
        .filter(Boolean).join(', ')
    : ''

  // Prefer API-provided coords, fall back to geocoded
  const lat = location?.geo?.latitude  ?? coords?.lat ?? null
  const lng = location?.geo?.longitude ?? coords?.lng ?? null

  return {
    id:            raw.identifier,
    title,
    description:   description || null,
    date_start:    raw.schedule.startDate,
    date_end:      raw.schedule.endDate || null,
    time_start:    raw.schedule.startTime || null,
    time_end:      raw.schedule.endTime   || null,
    category,
    tags:          JSON.stringify(tags.slice(0, 10)),
    price_type,
    price_min:     raw.admission?.priceMin ?? null,
    price_max:     raw.admission?.priceMax ?? null,
    location_name: location?.title?.de ?? location?.title?.en ?? raw.locations[0]?.referenceLabel?.de ?? null,
    address:       address || null,
    borough:       location?.borough ?? null,
    lat,
    lng,
    source_url:    attraction?.website ?? null,
    attraction_id: raw.attractions[0]?.referenceId ?? null,
    location_id:   raw.locations[0]?.referenceId   ?? null,
  }
}

export async function ingestEvents(env: Env): Promise<number> {
  const apiBase  = env.KULTURDATEN_API_URL
  const today    = new Date()
  const start    = fmtDate(today)
  const end      = fmtDate(new Date(today.getTime() + 30 * 864e5)) // +30 days

  let page  = 1
  let total = 0

  console.log(`[ingest] Starting — range ${start} → ${end}`)

  while (true) {
    const params = new URLSearchParams({
      page:      String(page),
      pageSize:  String(PAGE_SIZE),
      startDate: start,
      endDate:   end,
    })

    const apiData = await fetchJson<{
      data: { events: KulturdatenEvent[]; totalCount: number }
    }>(`${apiBase}/events?${params}`)

    if (!apiData?.data?.events?.length) break

    const rawEvents     = apiData.data.events
    const totalCount    = apiData.data.totalCount

    // Collect unique IDs for this page
    const attractionIds = [
      ...new Set(rawEvents.flatMap(e => e.attractions.map(a => a.referenceId)).filter(Boolean)),
    ]
    const locationIds = [
      ...new Set(rawEvents.flatMap(e => e.locations.map(l => l.referenceId)).filter(Boolean)),
    ]

    // Batch fetch details
    const [attractions, locations] = await Promise.all([
      batchFetch<KulturdatenAttraction>(apiBase, attractionIds, 'attractions'),
      batchFetch<KulturdatenLocation>(apiBase, locationIds,   'locations'),
    ])

    // Transform + geocode
    const toUpsert: Omit<EventRow, 'created_at' | 'updated_at'>[] = []

    for (const raw of rawEvents) {
      const attraction = attractions.get(raw.attractions[0]?.referenceId ?? '')
      const location   = locations.get(raw.locations[0]?.referenceId   ?? '')

      let coords: { lat: number; lng: number } | null = null
      if (location && !location.geo?.latitude) {
        const addr = location.address
          ? [location.address.streetAddress, location.address.postalCode].filter(Boolean).join(', ')
          : ''
        if (addr) coords = await geocode(env.DB, addr)
      }

      toUpsert.push(transformEvent(raw, attraction, location, coords))
    }

    await upsertEvents(env.DB, toUpsert)
    total += toUpsert.length

    console.log(`[ingest] Page ${page}: upserted ${toUpsert.length} (${total}/${totalCount})`)

    if (total >= totalCount || rawEvents.length < PAGE_SIZE) break
    page++
  }

  console.log(`[ingest] Done — ${total} events`)
  return total
}

function fmtDate(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
