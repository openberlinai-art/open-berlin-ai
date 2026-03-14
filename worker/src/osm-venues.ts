import type { Env } from './types'

const BBOX = '52.338,13.088,52.675,13.761' // Berlin: south,west,north,east

type OsmCategory =
  | 'vintage' | 'vinyl' | 'books' | 'cafe'
  | 'craft_beer' | 'tattoo' | 'bike' | 'vegan' | 'street_art'

const QUERIES: Record<OsmCategory, string> = {
  vintage: `[out:json][timeout:25];
(node[shop=vintage](${BBOX});
 node[shop=second_hand](${BBOX});
 way[shop=vintage](${BBOX});
 way[shop=second_hand](${BBOX}););
out center;`,

  vinyl: `[out:json][timeout:25];
(node[shop=music](${BBOX});
 node[shop=vinyl](${BBOX});
 way[shop=music](${BBOX});
 way[shop=vinyl](${BBOX}););
out center;`,

  books: `[out:json][timeout:25];
(node[shop=books](${BBOX});
 way[shop=books](${BBOX}););
out center;`,

  cafe: `[out:json][timeout:25];
(node[amenity=cafe](${BBOX});
 way[amenity=cafe](${BBOX}););
out center;`,

  craft_beer: `[out:json][timeout:25];
(node[amenity=bar][craft_beer=yes](${BBOX});
 node[amenity=bar][name~"brau|craft",i](${BBOX});
 way[amenity=bar][craft_beer=yes](${BBOX});
 way[amenity=bar][name~"brau|craft",i](${BBOX}););
out center;`,

  tattoo: `[out:json][timeout:25];
(node[shop=tattoo](${BBOX});
 way[shop=tattoo](${BBOX}););
out center;`,

  bike: `[out:json][timeout:25];
(node[shop=bicycle](${BBOX});
 way[shop=bicycle](${BBOX}););
out center;`,

  vegan: `[out:json][timeout:25];
(node[amenity=restaurant]["diet:vegan"=yes](${BBOX});
 node[amenity=restaurant]["diet:vegetarian"=yes](${BBOX});
 way[amenity=restaurant]["diet:vegan"=yes](${BBOX});
 way[amenity=restaurant]["diet:vegetarian"=yes](${BBOX}););
out center;`,

  street_art: `[out:json][timeout:25];
(node[tourism=artwork][artwork_type=mural](${BBOX});
 way[tourism=artwork][artwork_type=mural](${BBOX}););
out center;`,
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id:   number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

type OverpassResult = {
  elements: OverpassElement[]
}

function buildAddress(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const street = tags['addr:street']
  const number = tags['addr:housenumber']
  const city   = tags['addr:city']
  const parts  = [street && number ? `${street} ${number}` : street, city].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

async function fetchCategory(category: OsmCategory): Promise<string> {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    body:    QUERIES[category],
    headers: { 'Content-Type': 'text/plain' },
  })
  if (!res.ok) throw new Error(`Overpass ${category} returned ${res.status}`)

  const data    = await res.json() as OverpassResult
  const seen    = new Set<string>()
  const features = data.elements
    .map(el => {
      const lat = el.lat ?? el.center?.lat
      const lon = el.lon ?? el.center?.lon
      if (lat == null || lon == null) return null
      const id = `${el.type}/${el.id}`
      if (seen.has(id)) return null
      seen.add(id)
      const tags = el.tags ?? {}
      return {
        type:     'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: {
          id,
          name:          tags.name ?? null,
          category,
          address:       buildAddress(tags),
          website:       tags.website ?? tags['contact:website'] ?? tags['url'] ?? null,
          phone:         tags.phone ?? tags['contact:phone'] ?? null,
          opening_hours: tags.opening_hours ?? null,
          cuisine:       tags.cuisine ?? null,
          description:   tags.description ?? null,
          operator:      tags.operator ?? tags.brand ?? null,
        },
      }
    })
    .filter(Boolean)

  return JSON.stringify({ type: 'FeatureCollection', features })
}

/**
 * Fetches 9 hipster venue categories from Overpass API and stores each
 * as a GeoJSON FeatureCollection in R2 (osm-{category}.geojson).
 * Runs sequentially to respect Overpass rate limits.
 */
export async function enrichOSMVenues(env: Env): Promise<void> {
  const categories: OsmCategory[] = [
    'vintage', 'vinyl', 'books', 'cafe', 'craft_beer',
    'tattoo', 'bike', 'vegan', 'street_art',
  ]

  for (const category of categories) {
    try {
      const geojson = await fetchCategory(category)
      await env.GEODATA.put(`osm-${category}.geojson`, geojson, {
        httpMetadata: { contentType: 'application/json' },
      })
      console.log(`[osm-venues] ${category} stored in R2`)
    } catch (err) {
      console.error(`[osm-venues] ${category} failed:`, err)
    }
  }
}
