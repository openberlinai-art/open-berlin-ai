// Berlin open data fetchers
// Parks/Playgrounds → Worker R2 (CDN cached)
// Venues           → Worker D1 (bbox query)
// Transit/Departures → BVG API (via proxy fallback)

import type { Location, Event } from './types'

// Client-side: use relative path (Next.js rewrites /api/* → worker), avoids CORS
// Server-side: call worker directly
const WORKER = typeof window === 'undefined'
  ? (process.env.WORKER_API_URL ?? 'https://citizen-berlin-worker.openberlinai.workers.dev')
  : ''
const VBB_BASE  = 'https://v6.bvg.transport.rest'
const VBB_PROXY = '/api/proxy/vbb'

// ─── Venue locations (D1 bbox query) ─────────────────────────────────────────

export async function fetchVenuesByBbox(bbox: string, category?: string): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ bbox, limit: '2000' })
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
  const params = new URLSearchParams({ bbox, limit: '2000' })
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

export interface RelatedEvents {
  sameVenue: Array<{ id: string; title: string; date_start: string; time_start: string | null; category: string | null; price_type: string | null }>
  sameDate:  Array<{ id: string; title: string; date_start: string; time_start: string | null; category: string | null; price_type: string | null; location_name: string | null }>
}

export async function fetchEvent(id: string): Promise<Event & { related?: RelatedEvents }> {
  const res = await fetch(`${WORKER}/api/events/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as { data: Event; related?: RelatedEvents }
  return { ...json.data, related: json.related }
}

// ─── Transit stops (VBB) ─────────────────────────────────────────────────────

export interface VBBStop {
  id:   string
  name: string
  lat:  number
  lng:  number
  type: 'subway' | 'suburban' | 'tram' | 'bus'
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
    bus:       'true',
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
    const { subway, suburban, tram: isTram, bus } = stop.products ?? {}
    if (!subway && !suburban && !isTram && !bus) continue
    const type: VBBStop['type'] = subway ? 'subway' : suburban ? 'suburban' : isTram ? 'tram' : 'bus'
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

// ─── OSM cultural venues (D1, bbox-filtered) ─────────────────────────────────

export async function fetchOSMVenues(category: string, bbox?: string | null): Promise<GeoJSON.FeatureCollection> {
  const url = bbox
    ? `${WORKER}/api/geodata/osm/${category}?bbox=${encodeURIComponent(bbox)}`
    : `${WORKER}/api/geodata/osm/${category}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

// ─── POIs (expanded categories — D1 bbox + geohash query) ──────────────────

export async function fetchPOIs(
  group: string,
  bbox: string,
  category?: string,
  region?: string,
): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ group, bbox, limit: '2000' })
  if (category) params.set('category', category)
  if (region) params.set('region', region)
  const res = await fetch(`${WORKER}/api/pois?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

export interface POIDetail {
  id:             string
  category_group: string
  category:       string
  name:           string | null
  lat:            number
  lng:            number
  geohash:        string
  region:         string
  address:        string | null
  website:        string | null
  phone:          string | null
  opening_hours:  string | null
  description:    string | null
  operator:       string | null
  tags_json:      string | null
  image_url:      string | null
  refreshed_at:   string
}

export async function fetchPOIDetail(id: string): Promise<POIDetail> {
  const res = await fetch(`${WORKER}/api/pois/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as { data: POIDetail }
  return json.data
}

// ─── POIs batch (multiple groups in one request) ───────────────────────────

export async function fetchPOIsBatch(
  groups: string[],
  bbox: string,
): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ groups: groups.join(','), bbox, limit: '2000' })
  const res = await fetch(`${WORKER}/api/pois/batch?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

// ─── Streets (D1 autocomplete) ──────────────────────────────────────────────

export interface StreetSuggestion {
  name:     string
  lat:      number
  lng:      number
  postcode: string | null
  borough:  string | null
}

export async function fetchStreetSuggestions(
  query: string,
  limit = 10,
): Promise<StreetSuggestion[]> {
  if (query.length < 2) return []
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const res = await fetch(`${WORKER}/api/streets?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<StreetSuggestion[]>
}

// ─── Listings (D1, bbox-filtered, GeoJSON) ──────────────────────────────────

export async function fetchListingsByBbox(
  bbox: string,
  type?: string,
  street?: string,
): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ bbox, format: 'geojson', limit: '2000' })
  if (type) params.set('type', type)
  if (street) params.set('street', street)
  const res = await fetch(`${WORKER}/api/listings?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<GeoJSON.FeatureCollection>
}

// ─── Weather (Open-Meteo via worker proxy) ────────────────────────────────────

export async function fetchWeather(): Promise<Record<string, unknown>> {
  const res = await fetch(`${WORKER}/api/weather`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
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
    bus:      'true',
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

  const data = await res.json() as {
    departures?: Array<{
      line?:      { name?: string }
      direction?: string
      when?:      string
      delay?:     number
    }>
  }

  return (data.departures ?? []).map(d => ({
    line:      d.line?.name ?? '',
    direction: d.direction ?? '',
    when:      d.when ?? '',
    delay:     d.delay ?? 0,
  }))
}

// ─── Journey planner (BVG) ───────────────────────────────────────────────────

export interface JourneyLeg {
  origin:      string
  destination: string
  departure:   string
  arrival:     string
  line:        string | null
  product:     string | null  // subway | suburban | tram | bus | regional | express
  direction:   string | null
  walking:     boolean
  distance:    number | null  // metres (walking legs only)
  originCoords:      [number, number] | null  // [lng, lat]
  destinationCoords: [number, number] | null  // [lng, lat]
  polyline:          GeoJSON.FeatureCollection | null
}

export interface Journey {
  duration:  number // minutes
  transfers: number
  legs:      JourneyLeg[]
}

export async function fetchJourney(
  fromLat: number,
  fromLng: number,
  toLat:   number,
  toLng:   number,
  options?: { departure?: string; arrival?: string },
): Promise<Journey[]> {
  const params = new URLSearchParams({
    'from.type':      'address',
    'from.latitude':  String(fromLat),
    'from.longitude': String(fromLng),
    'from.address':   'Your location',
    'to.type':        'address',
    'to.latitude':    String(toLat),
    'to.longitude':   String(toLng),
    'to.address':     'Destination',
    results:          '3',
    stopovers:        'false',
    polylines:        'true',
    remarks:          'false',
    language:         'en',
  })
  if (options?.arrival) {
    params.set('arrival', options.arrival)
  } else if (options?.departure) {
    params.set('departure', options.departure)
  }

  const path = `/journeys?${params}`
  let res: Response
  try {
    res = await fetch(`${VBB_BASE}${path}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    res = await fetch(`${VBB_PROXY}?path=${encodeURIComponent(path)}`)
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
  }

  const data = await res.json() as {
    journeys?: Array<{
      legs: Array<{
        origin?:      { name?: string; latitude?: number; longitude?: number; location?: { longitude?: number; latitude?: number } }
        destination?: { name?: string; latitude?: number; longitude?: number; location?: { longitude?: number; latitude?: number } }
        departure?:   string
        arrival?:     string
        line?:        { name?: string; product?: string }
        direction?:   string
        walking?:     boolean
        distance?:    number | null
        polyline?:    GeoJSON.FeatureCollection
      }>
    }>
  }

  return (data.journeys ?? []).map(j => {
    const legs: JourneyLeg[] = j.legs.map(leg => {
      const oLng = leg.origin?.location?.longitude ?? leg.origin?.longitude
      const oLat = leg.origin?.location?.latitude  ?? leg.origin?.latitude
      const dLng = leg.destination?.location?.longitude ?? leg.destination?.longitude
      const dLat = leg.destination?.location?.latitude  ?? leg.destination?.latitude
      return {
        origin:      leg.origin?.name ?? '',
        destination: leg.destination?.name ?? '',
        departure:   leg.departure ?? '',
        arrival:     leg.arrival ?? '',
        line:        leg.line?.name    ?? null,
        product:     leg.line?.product ?? null,
        direction:   leg.direction     ?? null,
        walking:     leg.walking       ?? false,
        distance:    leg.distance      ?? null,
        originCoords:      oLng != null && oLat != null ? [oLng, oLat] : null,
        destinationCoords: dLng != null && dLat != null ? [dLng, dLat] : null,
        polyline:          leg.polyline ?? null,
      }
    })

    const firstLeg = j.legs[0]
    const lastLeg  = j.legs[j.legs.length - 1]
    const depTime  = firstLeg?.departure ? new Date(firstLeg.departure).getTime() : 0
    const arrTime  = lastLeg?.arrival    ? new Date(lastLeg.arrival).getTime()    : 0
    const duration = depTime && arrTime ? Math.round((arrTime - depTime) / 60000) : 0
    const transfers = Math.max(0, j.legs.filter(l => !l.walking).length - 1)

    return { duration, transfers, legs }
  })
}

// ─── Route display data for map polylines ──────────────────────────────────

export interface RouteDisplayData {
  legs: Array<{
    geometry: GeoJSON.Feature<GeoJSON.LineString>
    product:  string | null
    walking:  boolean
  }>
  origin:      [number, number]  // [lng, lat]
  destination: [number, number]  // [lng, lat]
}

/** Fetch a proper pedestrian route from OSRM (free, no API key) */
async function fetchWalkingRoute(
  from: [number, number],
  to: [number, number],
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>
    }
    const coords = data.routes?.[0]?.geometry?.coordinates
    return coords && coords.length >= 2 ? coords : null
  } catch {
    return null
  }
}

export async function buildRouteDisplay(journey: Journey): Promise<RouteDisplayData | null> {
  const displayLegs: RouteDisplayData['legs'] = []

  for (const leg of journey.legs) {
    // Skip zero-duration transfers (same-station platform changes)
    if (leg.walking && leg.origin === leg.destination) {
      const mins = leg.departure && leg.arrival
        ? Math.round((new Date(leg.arrival).getTime() - new Date(leg.departure).getTime()) / 60000)
        : 0
      if (mins === 0) continue
    }

    let geometry: GeoJSON.Feature<GeoJSON.LineString> | null = null

    if (leg.polyline) {
      // BVG API returns polyline as a FeatureCollection of Point features
      // — collect all coordinates into a single LineString
      const coords: [number, number][] = []
      for (const f of leg.polyline.features ?? []) {
        if (f.geometry?.type === 'Point') {
          coords.push(f.geometry.coordinates as [number, number])
        } else if (f.geometry?.type === 'LineString') {
          for (const c of (f.geometry as GeoJSON.LineString).coordinates) {
            coords.push(c as [number, number])
          }
        }
      }
      if (coords.length >= 2) {
        geometry = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        }
      }
    }

    // Walking leg without polyline: use OSRM for a proper street-following route
    if (!geometry && leg.walking && leg.originCoords && leg.destinationCoords) {
      const walkCoords = await fetchWalkingRoute(leg.originCoords, leg.destinationCoords)
      if (walkCoords) {
        geometry = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: walkCoords },
        }
      }
    }

    // Final fallback: straight line (transit leg without any polyline data)
    if (!geometry && leg.originCoords && leg.destinationCoords) {
      geometry = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [leg.originCoords, leg.destinationCoords],
        },
      }
    }

    if (geometry) {
      displayLegs.push({
        geometry,
        product: leg.product,
        walking: leg.walking,
      })
    }
  }

  if (displayLegs.length === 0) return null

  // Derive origin from first leg, destination from last leg
  const firstLeg = journey.legs[0]
  const lastLeg  = journey.legs[journey.legs.length - 1]
  const origin      = firstLeg?.originCoords
  const destination = lastLeg?.destinationCoords

  if (!origin || !destination) return null

  return { legs: displayLegs, origin, destination }
}
