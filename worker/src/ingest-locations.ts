import type { Env, KulturdatenLocation } from './types'

// Derive category from German location name keywords
function mapCategory(name: string | null | undefined): string {
  if (!name) return 'other'
  const n = name.toLowerCase()
  if (/museum|ausstellung|ausstellungsraum|kunsthalle|sammlung|gedenkst|memorial|historisch|jüdisch/.test(n)) return 'museum'
  if (/galerie|gallery|kunstverein|projektraum|atelier|kunsthaus/.test(n)) return 'gallery'
  if (/theater|theatre|bühne|spielstätte|oper|varieté|kabarett|philharmonie|konzerthaus|konzerthalle|volksbühne|tanztheater/.test(n)) return 'theatre'
  if (/bibliothek|bücherei/.test(n))                         return 'library'
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

    // Upsert in batches of 50.
    // Use ON CONFLICT DO UPDATE (not INSERT OR REPLACE) so that enriched columns
    // like image_urls are preserved across ingest runs.
    // website uses COALESCE so a Wikidata-enriched website is never overwritten by NULL.
    const stmt = env.DB.prepare(`
      INSERT INTO locations
        (id, name, lat, lng, category, address, borough, website, tags,
         description, phone, accessibility, opening_hours, opening_status, extra_links,
         updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name           = excluded.name,
        lat            = excluded.lat,
        lng            = excluded.lng,
        category       = excluded.category,
        address        = excluded.address,
        borough        = excluded.borough,
        website        = COALESCE(locations.website, excluded.website),
        tags           = excluded.tags,
        description    = excluded.description,
        phone          = excluded.phone,
        accessibility  = excluded.accessibility,
        opening_hours  = excluded.opening_hours,
        opening_status = excluded.opening_status,
        extra_links    = excluded.extra_links,
        updated_at     = datetime('now')
    `)

    for (let i = 0; i < locations.length; i += 50) {
      const batch = locations.slice(i, i + 50)
      await env.DB.batch(batch.map(loc => {
        const name          = loc.title?.de ?? loc.title?.en ?? null
        const lat           = loc.geo?.latitude  ?? null
        const lng           = loc.geo?.longitude ?? null
        const category      = mapCategory(name)
        const address       = loc.address
          ? [loc.address.streetAddress, loc.address.postalCode, loc.address.addressLocality]
              .filter(Boolean).join(', ')
          : null
        const borough       = loc.borough        ?? null
        const website       = loc.website        ?? null
        const tags          = JSON.stringify(loc.tags ?? [])
        const description   = loc.description?.de ?? loc.description?.en ?? null
        const phone         = loc.contact?.telephone ?? null
        const accessibility = loc.accessibility?.length
          ? JSON.stringify(loc.accessibility.map(a =>
              a.replace(/^location\.accessibility\./i, '')
            ))
          : null
        const openingHours  = loc.openingHours?.length
          ? JSON.stringify(loc.openingHours)
          : null
        const openingStatus = loc.openingStatus ?? null
        const extraLinks    = loc.externalLinks?.length
          ? JSON.stringify(loc.externalLinks)
          : null

        return stmt.bind(
          loc.identifier, name, lat, lng, category, address, borough, website, tags,
          description, phone, accessibility, openingHours, openingStatus, extraLinks,
        )
      }))

      ingested += batch.length
    }

    page++
  }

  console.log(`[ingest-locations] upserted ${ingested} of ${total} locations`)
  return ingested
}
