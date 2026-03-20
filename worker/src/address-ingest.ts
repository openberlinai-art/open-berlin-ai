import type { Env } from './types'

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id:   number
  lat?: number
  lon?: number
  tags?: Record<string, string>
}

type OverpassResult = {
  elements: OverpassElement[]
}

/** NFD decompose + strip combining marks + lowercase */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

async function fetchOverpassWithRetry(query: string, retries = 3): Promise<OverpassElement[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
      })

      if (res.status === 429 || res.status === 504) {
        const delay = Math.pow(2, attempt + 1) * 2000
        console.log(`[address-ingest] Overpass ${res.status}, retrying in ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      if (!res.ok) throw new Error(`Overpass returned ${res.status}`)
      const data = await res.json() as OverpassResult
      return data.elements
    } catch (err) {
      if (attempt === retries - 1) throw err
      const delay = Math.pow(2, attempt + 1) * 2000
      console.log(`[address-ingest] Overpass error, retrying in ${delay}ms:`, err)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return []
}

// Berlin postcode prefixes — each handled in a separate Worker call
export const BERLIN_POSTCODE_PREFIXES = [
  '101', '102', '103', '104', '105',
  '106', '107', '108', '109',
  '120', '121', '122', '123', '124', '125', '126', '127', '128', '129',
  '130', '131', '132', '133', '134', '135', '136', '137', '138', '139',
  '141',
  'none', // addresses without postcodes
]

/**
 * Ingest Berlin address points for a single postcode prefix.
 * Call once per prefix to stay within Worker CPU limits.
 * Use prefix='none' for addresses without postcodes.
 */
export async function ingestAddresses(
  env: Env,
  options?: { prefix?: string }
): Promise<{ total: number }> {
  const prefix = options?.prefix

  // If no prefix specified, do all sequentially (for cron — may hit limits)
  if (!prefix) {
    await env.DB.prepare('DELETE FROM addresses').run()
    let grandTotal = 0
    for (const p of BERLIN_POSTCODE_PREFIXES) {
      const r = await ingestAddressesForPrefix(env, p)
      grandTotal += r.total
    }
    return { total: grandTotal }
  }

  return ingestAddressesForPrefix(env, prefix)
}

async function ingestAddressesForPrefix(
  env: Env,
  prefix: string
): Promise<{ total: number }> {
  const isNone = prefix === 'none'

  const postcodeFilter = isNone
    ? '[!"addr:postcode"]'
    : `["addr:postcode"~"^${prefix}"]`

  const query = `[out:json][timeout:120];
area["name"="Berlin"]["boundary"="administrative"]["admin_level"="4"]->.berlin;
node["addr:housenumber"]["addr:street"]${postcodeFilter}(area.berlin);
out;`

  console.log(`[address-ingest] Fetching prefix=${prefix}...`)
  const elements = await fetchOverpassWithRetry(query)
  console.log(`[address-ingest] Prefix ${prefix}: ${elements.length} nodes`)

  const rows: Array<{
    street: string; street_norm: string; housenumber: string
    lat: number; lng: number; postcode: string | null; osm_id: number
  }> = []

  for (const el of elements) {
    const lat = el.lat
    const lon = el.lon
    if (lat == null || lon == null) continue

    const tags = el.tags ?? {}
    const street = tags['addr:street']
    const housenumber = tags['addr:housenumber']
    if (!street || !housenumber) continue

    rows.push({
      street,
      street_norm: normalize(street),
      housenumber: housenumber.trim(),
      lat,
      lng: lon,
      postcode: tags['addr:postcode'] ?? null,
      osm_id: el.id,
    })
  }

  // Delete existing rows for this prefix before inserting
  if (isNone) {
    await env.DB.prepare('DELETE FROM addresses WHERE postcode IS NULL').run()
  } else {
    await env.DB.prepare('DELETE FROM addresses WHERE postcode LIKE ?')
      .bind(`${prefix}%`).run()
  }

  // Batch insert in chunks of 100
  const stmt = env.DB.prepare(
    `INSERT INTO addresses (street, street_norm, housenumber, lat, lng, postcode, osm_id, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )

  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    await env.DB.batch(
      chunk.map(r =>
        stmt.bind(r.street, r.street_norm, r.housenumber, r.lat, r.lng, r.postcode, r.osm_id)
      )
    )
  }

  console.log(`[address-ingest] Prefix ${prefix} done — ${rows.length} addresses`)
  return { total: rows.length }
}
