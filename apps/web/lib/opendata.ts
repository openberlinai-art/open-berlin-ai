// Berlin open data fetchers
// Parks/Playgrounds → Worker R2 (CDN cached)
// Venues           → Worker D1 (bbox query)
// Transit/Departures → VBB API (via proxy fallback)

import type { Location, Event } from './types'

const WORKER    = 'https://kulturpulse-worker.openberlinai.workers.dev'
const VBB_BASE  = 'https://v6.vbb.transport.rest'
const VBB_PROXY = '/api/proxy/vbb'

// ─── Venue locations (D1 bbox query) ─────────────────────────────────────────

export async function fetchVenuesByBbox(bbox: string, category?: string): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ bbox, limit: '500' })
  if (category) params.set('category', category)
  const res = await fetch(`${WORKER}/api/locations?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

// ─── Parks / Playgrounds (R2, CDN cached) ────────────────────────────────────

export async function fetchParks(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${WORKER}/api/geodata/parks-points`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

export async function fetchPlaygrounds(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${WORKER}/api/geodata/playgrounds-points`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

export async function fetchVenuesList(bbox: string, category?: string): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ bbox, limit: '200' })
  if (category) params.set('category', category)
  const res = await fetch(`${WORKER}/api/locations?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

// ─── Location detail ──────────────────────────────────────────────────────────

export async function fetchLocation(id: string): Promise<Location> {
  const res = await fetch(`${WORKER}/api/locations/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as { data: Location }
  return json.data
}

// ─── Event detail ─────────────────────────────────────────────────────────────

export async function fetchEvent(id: string): Promise<Event> {
  const res = await fetch(`${WORKER}/api/events/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as { data: Event }
  return json.data
}

// ─── Transit stops (VBB) ─────────────────────────────────────────────────────

export interface VBBStop {
  id:   string
  name: string
  lat:  number
  lng:  number
  type: 'subway' | 'suburban' | 'tram'
}

export async function fetchTransitStopsVBB(
  lat:    number,
  lng:    number,
  radius = 800,
): Promise<VBBStop[]> {
  const params = new URLSearchParams({
    latitude:  String(lat),
    longitude: String(lng),
    results:   '20',
    distance:  String(radius),
    suburban:  'true',
    subway:    'true',
    tram:      'true',
    bus:       'false',
    ferry:     'false',
  })

  const path = `/locations/nearby?${params}`
  let res: Response
  try {
    res = await fetch(`${VBB_BASE}${path}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    res = await fetch(`${VBB_PROXY}?path=${encodeURIComponent(path)}`)
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
  }

  const data = await res.json() as Array<{
    id:       string
    name:     string
    location: { latitude: number; longitude: number }
    products: { suburban?: boolean; subway?: boolean; tram?: boolean; bus?: boolean }
  }>

  const seen  = new Set<string>()
  const stops: VBBStop[] = []

  for (const stop of data) {
    if (seen.has(stop.id)) continue
    seen.add(stop.id)
    const { subway, suburban, tram: isTram } = stop.products ?? {}
    // Skip bus-only stops that may slip through despite bus=false query param
    if (!subway && !suburban && !isTram) continue
    const type: VBBStop['type'] = subway ? 'subway' : suburban ? 'suburban' : 'tram'
    stops.push({
      id:   stop.id,
      name: stop.name,
      lat:  stop.location.latitude,
      lng:  stop.location.longitude,
      type,
    })
  }
  return stops
}

// ─── Departures (VBB) ────────────────────────────────────────────────────────

export interface Departure {
  line:      string
  direction: string
  when:      string
  delay:     number
}

export async function fetchDepartures(stopId: string): Promise<Departure[]> {
  const params = new URLSearchParams({
    results:  '5',
    duration: '30',
    suburban: 'true',
    subway:   'true',
    tram:     'true',
    bus:      'false',
  })

  const path = `/stops/${encodeURIComponent(stopId)}/departures?${params}`
  let res: Response
  try {
    res = await fetch(`${VBB_BASE}${path}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    res = await fetch(`${VBB_PROXY}?path=${encodeURIComponent(path)}`)
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
  }

  const data = await res.json() as Array<{
    line?:      { name?: string }
    direction?: string
    when?:      string
    delay?:     number
  }>

  return data.map(d => ({
    line:      d.line?.name ?? '',
    direction: d.direction ?? '',
    when:      d.when ?? '',
    delay:     d.delay ?? 0,
  }))
}
