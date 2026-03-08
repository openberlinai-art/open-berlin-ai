import type { Env, KulturdatenLocation } from './types'

// Maps kulturdaten tag strings → location categories
const CATEGORY_MAP: Record<string, string> = {
  'location.type.museum':  'museum',
  'location.type.gallery': 'gallery',
  'location.type.theatre': 'theatre',
  'location.type.library': 'library',
}

function mapCategory(tags: string[] | undefined): string {
  if (!tags) return 'other'
  for (const tag of tags) {
    if (CATEGORY_MAP[tag]) return CATEGORY_MAP[tag]
  }
  return 'other'
}

/**
 * Fetches all venues from kulturdaten.berlin /locations endpoint
 * and upserts them into the D1 `locations` table.
 * Returns total number of records processed.
 */
export async function ingestLocations(env: Env): Promise<number> {
  const baseUrl = env.KULTURDATEN_API_URL
  const pageSize = 500
  let page = 1
  let total = Infinity
  let ingested = 0

  while ((page - 1) * pageSize < total) {
    const res = await fetch(`${baseUrl}/locations?page=${page}&pageSize=${pageSize}`)
    if (!res.ok) {
      console.error(`[ingest-locations] page ${page} returned ${res.status}`)
      break
    }

    const body = await res.json() as {
      data: { locations: KulturdatenLocation[]; totalCount: number }
    }

    total = body.data.totalCount
    const locations = body.data.locations
    if (!locations?.length) break

    // Upsert in batches of 50
    const stmt = env.DB.prepare(`
      INSERT OR REPLACE INTO locations
        (id, name, lat, lng, category, address, borough, website, tags, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)

    for (let i = 0; i < locations.length; i += 50) {
      const batch = locations.slice(i, i + 50)
      await env.DB.batch(batch.map(loc => {
        const name     = loc.title?.de ?? loc.title?.en ?? null
        const lat      = loc.geo?.latitude  ?? null
        const lng      = loc.geo?.longitude ?? null
        const category = mapCategory(loc.tags)
        const address  = loc.address
          ? [loc.address.streetAddress, loc.address.postalCode, loc.address.addressLocality]
              .filter(Boolean).join(', ')
          : null
        const borough  = loc.borough  ?? null
        const website  = loc.website  ?? null
        const tags     = JSON.stringify(loc.tags ?? [])

        return stmt.bind(loc.identifier, name, lat, lng, category, address, borough, website, tags)
      }))

      ingested += batch.length
    }

    page++
  }

  console.log(`[ingest-locations] upserted ${ingested} of ${total} locations`)
  return ingested
}
