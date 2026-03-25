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
  // Exhibitions & Art
  exhibitions:       'Exhibitions',
  ausstellung:       'Exhibitions',
  ausstellungen:     'Exhibitions',
  art:               'Art',
  kunst:             'Art',
  galerie:           'Art',
  gallery:           'Art',
  malerei:           'Art',
  painting:          'Art',
  skulptur:          'Art',
  sculpture:         'Art',
  fotografie:        'Art',
  photography:       'Art',
  installation:      'Art',
  // Music
  music:             'Music',
  musik:             'Music',
  konzert:           'Music',
  concert:           'Music',
  choir:             'Music',
  chor:              'Music',
  oper:              'Music',
  opera:             'Music',
  singen:            'Music',
  // Dance
  dance:             'Dance',
  tanz:              'Dance',
  ballett:           'Dance',
  ballet:            'Dance',
  // Theater
  theater:           'Theater',
  theatre:           'Theater',
  schauspiel:        'Theater',
  performance:       'Theater',
  kabarett:          'Theater',
  cabaret:           'Theater',
  comedy:            'Theater',
  puppentheater:     'Theater',
  varieté:           'Theater',
  // Film
  film:              'Film',
  kino:              'Film',
  cinema:            'Film',
  // Talks & Literature
  talks:             'Talks',
  vortrag:           'Talks',
  vortrage:          'Talks',
  lesung:            'Talks',
  literature:        'Talks',
  literatur:         'Talks',
  lectures:          'Talks',
  diskussion:        'Talks',
  discussion:        'Talks',
  conferences:       'Talks',
  konferenz:         'Talks',
  podium:            'Talks',
  informationevents: 'Talks',
  // Education
  education:         'Education',
  bildung:           'Education',
  workshop:          'Education',
  seminar:           'Education',
  kurs:              'Education',
  course:            'Education',
  fortbildung:       'Education',
  training:          'Education',
  // Kids & Family
  kids:              'Kids',
  kinder:            'Kids',
  jugend:            'Kids',
  children:          'Kids',
  family:            'Kids',
  familie:           'Kids',
  // Sports & Fitness
  sports:            'Sports',
  sport:             'Sports',
  fitness:           'Sports',
  gymnastik:         'Sports',
  yoga:              'Sports',
  volleyball:        'Sports',
  // Recreation
  recreation:        'Recreation',
  freizeit:          'Recreation',
  walks:             'Recreation',
  spaziergang:       'Recreation',
  wanderung:         'Recreation',
  festivals:         'Recreation',
  fest:              'Recreation',
  markt:             'Recreation',
  market:            'Recreation',
  flohmarkt:         'Recreation',
  // Tours
  tours:             'Tours',
  fuehrung:          'Tours',
  führung:           'Tours',
  stadtfuehrung:     'Tours',
  rundgang:          'Tours',
  tour:              'Tours',
  // Health & Wellness (map to Recreation)
  health:            'Recreation',
  gesundheit:        'Recreation',
  wellness:          'Recreation',
}

function normalizeCategory(tags: string[], title?: string): string {
  // First try tag-based mapping
  for (const tag of tags) {
    const clean = tag
      .replace(/^attraction\.category\./i, '')
      .replace(/^event\.category\./i, '')
      .toLowerCase()
      .trim()
    const mapped = CATEGORY_MAP[clean]
    if (mapped) return mapped
  }
  // Fallback: keyword match on title
  if (title) {
    const t = title.toLowerCase()
    if (/\b(ausstellung|exhibition|galerie|gallery)\b/.test(t)) return 'Exhibitions'
    if (/\b(konzert|concert|musik|music|singen|chor|choir|oper|opera)\b/.test(t)) return 'Music'
    if (/\b(theater|theatre|schauspiel|kabarett|comedy|komödie)\b/.test(t)) return 'Theater'
    if (/\b(tanz|dance|ballett|ballet)\b/.test(t)) return 'Dance'
    if (/\b(film|kino|cinema)\b/.test(t)) return 'Film'
    if (/\b(lesung|vortrag|diskussion|lecture|podium|gespräch)\b/.test(t)) return 'Talks'
    if (/\b(workshop|seminar|kurs|fortbildung|course)\b/.test(t)) return 'Education'
    if (/\b(kinder|kids|family|familie|jugend)\b/.test(t)) return 'Kids'
    if (/\b(sport|fitness|gymnastik|yoga|turnier|volleyball)\b/.test(t)) return 'Sports'
    if (/\b(führung|rundgang|tour|stadtführung)\b/.test(t)) return 'Tours'
    if (/\b(fest|festival|markt|market|flohmarkt)\b/.test(t)) return 'Recreation'
    if (/\b(malerei|painting|skulptur|fotografie|kunst|art)\b/.test(t)) return 'Art'
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
  const title =
    attraction?.title?.de ??
    attraction?.title?.en ??
    raw.attractions[0]?.referenceLabel?.de ??
    'Untitled'

  const tags = attraction?.tags ?? []
  const category = normalizeCategory(tags, title)

  const description =
    attraction?.description?.de ??
    attraction?.description?.en ??
    attraction?.shortDescription?.de ??
    attraction?.shortDescription?.en ??
    null

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

  // Normalize scheduleStatus: strip 'event.' prefix
  const scheduleStatus = raw.scheduleStatus
    ? raw.scheduleStatus.replace(/^event\./i, '')  // 'event.cancelled' → 'cancelled'
    : null

  const pleaseNote = (
    raw.pleaseNote?.de ?? raw.pleaseNote?.en ??
    attraction?.pleaseNote?.de ?? attraction?.pleaseNote?.en ?? null
  )

  const admissionNote = (
    raw.admission?.note?.de ?? raw.admission?.note?.en ?? null
  )

  const sourceLinks = attraction?.externalLinks?.length
    ? JSON.stringify(attraction.externalLinks)
    : null

  // Strip 'registrationType.' prefix → 'required' | 'notRequired'
  const registrationType = raw.admission?.registrationType
    ? raw.admission.registrationType.replace(/^registrationType\./i, '')
    : null

  const languages = attraction?.inLanguages?.length
    ? JSON.stringify(attraction.inLanguages)
    : null

  const imageUrls: string[] = (attraction?.media ?? [])
    .filter(m => m.encodingFormat?.startsWith('image/') || m.type?.toLowerCase() === 'imageobject')
    .map(m => m.contentUrl ?? m.url)
    .filter((u): u is string => !!u)
    .slice(0, 6)

  return {
    id:              raw.identifier,
    title,
    description:     description || null,
    date_start:      raw.schedule.startDate,
    date_end:        raw.schedule.endDate || null,
    time_start:      raw.schedule.startTime || null,
    time_end:        raw.schedule.endTime   || null,
    door_time:       raw.schedule.doorTime  || null,
    category,
    tags:            JSON.stringify(tags.slice(0, 10)),
    price_type,
    price_min:       raw.admission?.priceMin     ?? null,
    price_max:       raw.admission?.priceMax     ?? null,
    admission_link:  raw.admission?.admissionLink ?? null,
    location_name:   location?.title?.de ?? location?.title?.en ?? raw.locations[0]?.referenceLabel?.de ?? null,
    address:         address || null,
    borough:         location?.borough ?? null,
    lat,
    lng,
    source_url:      attraction?.website ?? null,
    attraction_id:   raw.attractions[0]?.referenceId ?? null,
    location_id:     raw.locations[0]?.referenceId   ?? null,
    schedule_status:   scheduleStatus,
    please_note:       pleaseNote,
    admission_note:    admissionNote,
    source_links:      sourceLinks,
    registration_type: registrationType,
    languages,
    image_urls: imageUrls.length ? JSON.stringify(imageUrls) : null,
  }
}

export async function ingestEvents(env: Env, days = 30, offsetDays = 0): Promise<number> {
  const apiBase  = env.KULTURDATEN_API_URL
  const today    = new Date()
  const start    = fmtDate(new Date(today.getTime() + offsetDays * 864e5))
  const end      = fmtDate(new Date(today.getTime() + (offsetDays + days) * 864e5))

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
