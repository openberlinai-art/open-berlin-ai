import type { Env } from './types'

const BBOX = '52.338,13.088,52.675,13.761' // Berlin: south,west,north,east

type OsmCategory =
  | 'live_music' | 'jazz' | 'cinema' | 'clubs' | 'galleries' | 'street_art' | 'museum'

const QUERIES: Record<OsmCategory, string> = {
  live_music: `[out:json][timeout:25];
(node[amenity=concert_hall](${BBOX});
 node[amenity=music_venue](${BBOX});
 node[shop=musical_instrument](${BBOX});
 node[amenity=music_school](${BBOX});
 way[amenity=concert_hall](${BBOX});
 way[amenity=music_venue](${BBOX});
 way[shop=musical_instrument](${BBOX});
 way[amenity=music_school](${BBOX}););
out center;`,

  jazz: `[out:json][timeout:25];
(node[amenity=bar]["music:jazz"=yes](${BBOX});
 node[amenity=nightclub]["music:jazz"=yes](${BBOX});
 node[amenity=bar][name~"jazz",i](${BBOX});
 node[amenity=nightclub][name~"jazz",i](${BBOX});
 way[amenity=bar]["music:jazz"=yes](${BBOX});
 way[amenity=nightclub]["music:jazz"=yes](${BBOX}););
out center;`,

  cinema: `[out:json][timeout:25];
(node[amenity=cinema](${BBOX});
 way[amenity=cinema](${BBOX}););
out center;`,

  clubs: `[out:json][timeout:25];
(node[amenity=nightclub](${BBOX});
 way[amenity=nightclub](${BBOX}););
out center;`,

  galleries: `[out:json][timeout:25];
(node[tourism=gallery](${BBOX});
 node[art=gallery](${BBOX});
 way[tourism=gallery](${BBOX});
 way[art=gallery](${BBOX}););
out center;`,

  street_art: `[out:json][timeout:25];
(node[tourism=artwork][artwork_type=mural](${BBOX});
 node[tourism=artwork][artwork_type=graffiti](${BBOX});
 node[tourism=artwork][artwork_type=mosaic](${BBOX});
 node[tourism=artwork][artwork_type=sculpture](${BBOX});
 node[tourism=artwork][artwork_type=street_installation](${BBOX});
 way[tourism=artwork][artwork_type=mural](${BBOX});
 way[tourism=artwork][artwork_type=graffiti](${BBOX});
 way[tourism=artwork][artwork_type=mosaic](${BBOX});
 way[tourism=artwork][artwork_type=sculpture](${BBOX}););
out center;`,

  museum: `[out:json][timeout:25];
(node[tourism=museum](${BBOX});
 node[amenity=museum](${BBOX});
 way[tourism=museum](${BBOX});
 way[amenity=museum](${BBOX}););
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

type OsmFeature = {
  id:            string
  name:          string | null
  lat:           number
  lng:           number
  address:       string | null
  website:       string | null
  phone:         string | null
  opening_hours: string | null
  description:   string | null
  operator:      string | null
}

function buildAddress(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const street = tags['addr:street']
  const number = tags['addr:housenumber']
  const city   = tags['addr:city']
  const parts  = [street && number ? `${street} ${number}` : street, city].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

async function fetchCategory(category: OsmCategory): Promise<OsmFeature[]> {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    body:    QUERIES[category],
    headers: { 'Content-Type': 'text/plain' },
  })
  if (!res.ok) throw new Error(`Overpass ${category} returned ${res.status}`)

  const data    = await res.json() as OverpassResult
  const seen    = new Set<string>()
  const features: OsmFeature[] = []

  for (const el of data.elements) {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null) continue
    const id = `${el.type}/${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    const tags = el.tags ?? {}
    features.push({
      id,
      name:          tags.name ?? null,
      lat,
      lng:           lon,
      address:       buildAddress(tags),
      website:       tags.website ?? tags['contact:website'] ?? tags['url'] ?? null,
      phone:         tags.phone ?? tags['contact:phone'] ?? null,
      opening_hours: tags.opening_hours ?? null,
      description:   tags.description ?? null,
      operator:      tags.operator ?? tags.brand ?? null,
    })
  }

  return features
}

/**
 * Fetches 6 cultural venue categories from Overpass API and stores each
 * in the D1 osm_venues table (replacing stale rows per category).
 * Runs sequentially to respect Overpass rate limits.
 */
export async function enrichOSMVenues(env: Env): Promise<void> {
  const categories: OsmCategory[] = [
    'live_music', 'jazz', 'cinema', 'clubs', 'galleries', 'street_art', 'museum',
  ]

  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO osm_venues
     (id, category, name, lat, lng, address, website, phone, opening_hours, description, operator, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )

  for (const category of categories) {
    try {
      const features = await fetchCategory(category)

      // Remove stale rows for this category
      await env.DB.prepare('DELETE FROM osm_venues WHERE category = ?').bind(category).run()

      // Batch-insert in chunks of 100
      const CHUNK = 100
      for (let i = 0; i < features.length; i += CHUNK) {
        const chunk = features.slice(i, i + CHUNK)
        await env.DB.batch(
          chunk.map(f =>
            stmt.bind(f.id, category, f.name, f.lat, f.lng,
                      f.address, f.website, f.phone, f.opening_hours,
                      f.description, f.operator)
          )
        )
      }

      console.log(`[osm-venues] ${category}: ${features.length} rows stored in D1`)
    } catch (err) {
      console.error(`[osm-venues] ${category} failed:`, err)
    }
  }
}
