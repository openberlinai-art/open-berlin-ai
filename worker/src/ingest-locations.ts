import type { Env, KulturdatenLocation } from './types'

// Derive category from German location name + description keywords
function classifyText(text: string): string | null {
  if (/museum|ausstellung|ausstellungsraum|kunsthalle|sammlung|gedenkst|memorial|historisch|jüdisch|haus der kultur/i.test(text)) return 'museum'
  if (/galerie|gallery|kunstverein|projektraum|atelier|kunsthaus|kunst\s?raum|showroom/i.test(text)) return 'gallery'
  if (/kino|cinema|filmtheater|freiluftkino/i.test(text)) return 'cinema'
  if (/konzerthaus|konzerthalle|festsaal|columbiahalle|tempodrom|lido|astra|admiralspalast/i.test(text)) return 'concert_hall'
  if (/(?<!golf)club|techno|berghain|tresor|watergate|sisyphos/i.test(text)) return 'club'
  if (/theater|theatre|bühne|spielstätte|oper|varieté|kabarett|philharmonie|volksbühne|tanztheater|puppentheater|figurentheater|bka|hau\b|ballhaus/i.test(text)) return 'theatre'
  if (/bibliothek|bücherei/i.test(text)) return 'library'
  if (/stadtteilzentrum|bürgerhaus|kulturzentrum|familienzentrum|nachbarschafts|begegnungsstätte|gemeinschaftshaus/i.test(text)) return 'community_centre'
  if (/kirche|gemeinde.{0,20}(?:evangel|kathol)|moschee|synagoge|dom\b|kapelle/i.test(text)) return 'religious'
  if (/werkstatt|volkshochschule|\bvhs\b|akademie|bildungszentrum|lernwerkstatt/i.test(text)) return 'education'
  if (/strandbad|schwimmhalle|sporthalle|stadion|sportplatz|turnhalle/i.test(text)) return 'sports_venue'
  if (/freilichtbühne|open\s?air|waldbühne|zirkus|freiluft/i.test(text)) return 'open_air'
  if (/\bonline\b|\bzoom\b|\bdigital\b|livestream|virtuell/i.test(text)) return 'virtual'
  return null
}

function mapCategory(name: string | null | undefined, description?: string | null): string {
  if (name) {
    const cat = classifyText(name)
    if (cat) return cat
  }
  if (description) {
    const cat = classifyText(description)
    if (cat) return cat
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

    // Upsert in batches of 50.
    // Use ON CONFLICT DO UPDATE (not INSERT OR REPLACE) so that enriched columns
    // like image_urls are preserved across ingest runs.
    // website uses COALESCE so a Wikidata-enriched website is never overwritten by NULL.
    const stmt = env.DB.prepare(`
      INSERT INTO locations
        (id, name, lat, lng, category, address, borough, website, tags,
         description, phone, accessibility, opening_hours, opening_status, extra_links,
         is_virtual, contact_email,
         updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name           = excluded.name,
        lat            = COALESCE(excluded.lat, locations.lat),
        lng            = COALESCE(excluded.lng, locations.lng),
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
        is_virtual     = excluded.is_virtual,
        contact_email  = excluded.contact_email,
        updated_at     = datetime('now')
    `)

    for (let i = 0; i < locations.length; i += 50) {
      const batch = locations.slice(i, i + 50)
      await env.DB.batch(batch.map(loc => {
        const name          = loc.title?.de ?? loc.title?.en ?? null
        const description   = loc.description?.de ?? loc.description?.en ?? null
        const lat           = loc.geo?.latitude  ?? null
        const lng           = loc.geo?.longitude ?? null
        const category      = mapCategory(name, description)
        const address       = loc.address
          ? [loc.address.streetAddress, loc.address.postalCode, loc.address.addressLocality]
              .filter(Boolean).join(', ')
          : null
        const borough       = loc.borough        ?? null
        const website       = loc.website        ?? null
        const tags          = JSON.stringify(loc.tags ?? [])
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
        const isVirtual     = loc.isVirtual ? 1 : 0
        const contactEmail  = loc.contact?.email ?? null

        return stmt.bind(
          loc.identifier, name, lat, lng, category, address, borough, website, tags,
          description, phone, accessibility, openingHours, openingStatus, extraLinks,
          isVirtual, contactEmail,
        )
      }))

      ingested += batch.length
    }

    page++
  }

  console.log(`[ingest-locations] upserted ${ingested} of ${total} locations`)
  return ingested
}
