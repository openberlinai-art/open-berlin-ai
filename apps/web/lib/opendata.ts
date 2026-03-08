// Berlin open data fetchers — parks, playgrounds, transit stops

export interface TransitStop {
  id: number
  name: string
  lat: number
  lng: number
  type: 'ubahn' | 'sbahn' | 'both'
}

const WFS_BASE = 'https://gdi.berlin.de/services/wfs/gruenanlagen'
const WFS_PROXY = '/api/proxy/wfs'

async function fetchWFS(typeName: string): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName,
    outputFormat: 'application/json',
  })

  // Try direct fetch first; fall back to CORS proxy on failure
  try {
    const res = await fetch(`${WFS_BASE}?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<GeoJSON.FeatureCollection>
  } catch {
    const res = await fetch(`${WFS_PROXY}?typeName=${encodeURIComponent(typeName)}`)
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
    return res.json() as Promise<GeoJSON.FeatureCollection>
  }
}

export async function fetchParks(): Promise<GeoJSON.FeatureCollection> {
  return fetchWFS('gruenanlagen:gruenanlagen')
}

export async function fetchPlaygrounds(): Promise<GeoJSON.FeatureCollection> {
  return fetchWFS('gruenanlagen:spielplaetze')
}

export async function fetchTransitStops(
  lat: number,
  lng: number,
  radiusMeters = 800,
): Promise<TransitStop[]> {
  const query = `
[out:json][timeout:15];
(
  node["public_transport"="stop_position"]["network"~"VBB|BVG"]["railway"~"subway|light_rail"](around:${radiusMeters},${lat},${lng});
  node["railway"="station"]["station"~"subway|light_rail"](around:${radiusMeters},${lat},${lng});
  node["railway"="subway_entrance"](around:${radiusMeters},${lat},${lng});
);
out body;
`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)

  const data = await res.json() as {
    elements: Array<{
      id: number
      lat: number
      lon: number
      tags?: { name?: string; railway?: string }
    }>
  }

  // Deduplicate by name
  const seen = new Set<string>()
  const stops: TransitStop[] = []

  for (const el of data.elements) {
    const name = el.tags?.name
    if (!name || !el.lat || !el.lon) continue
    if (seen.has(name)) continue
    seen.add(name)

    const railway = el.tags?.railway ?? ''
    const type: TransitStop['type'] =
      railway === 'subway' ? 'ubahn' :
      railway === 'light_rail' ? 'sbahn' :
      name.startsWith('U ') ? 'ubahn' :
      name.startsWith('S ') ? 'sbahn' :
      'ubahn'

    stops.push({ id: el.id, name, lat: el.lat, lng: el.lon, type })
  }

  return stops
}

export interface VBBStop {
  id:   string
  name: string
  lat:  number
  lng:  number
  type: 'subway' | 'suburban' | 'tram'
}

export interface Departure {
  line:      string
  direction: string
  when:      string
  delay:     number
}

const VBB_BASE  = 'https://v6.vbb.transport.rest'
const VBB_PROXY = '/api/proxy/vbb'

export async function fetchVenues(): Promise<GeoJSON.FeatureCollection> {
  const query = `[out:json][timeout:25][bbox:52.33,13.09,52.68,13.76];
(
  node["tourism"~"^(museum|gallery|artwork)$"];
  node["amenity"~"^(arts_centre|theatre|cinema)$"];
  way["tourism"~"^(museum|gallery)$"];
  way["amenity"~"^(arts_centre|theatre)$"];
);
out center tags;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body:   query,
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)

  const data = await res.json() as {
    elements: Array<{
      id:      number
      type:    string
      lat?:    number
      lon?:    number
      center?: { lat: number; lon: number }
      tags?:   Record<string, string>
    }>
  }

  const features: GeoJSON.Feature[] = []
  for (const el of data.elements) {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null) continue
    features.push({
      type:       'Feature',
      geometry:   { type: 'Point', coordinates: [lon, lat] },
      properties: { ...el.tags, _osmId: el.id },
    })
  }
  return { type: 'FeatureCollection', features }
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

  const path = `/stops/nearby?${params}`
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
    products: { suburban?: boolean; subway?: boolean; tram?: boolean }
  }>

  const seen  = new Set<string>()
  const stops: VBBStop[] = []

  for (const stop of data) {
    if (seen.has(stop.id)) continue
    seen.add(stop.id)
    const { subway, suburban } = stop.products ?? {}
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
