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
