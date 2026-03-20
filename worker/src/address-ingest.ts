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

/**
 * Ingest all Berlin address points (house numbers) from Overpass API.
 * ~400-500k rows — node-level data with addr:housenumber + addr:street.
 */
export async function ingestAddresses(env: Env): Promise<{ total: number }> {
  const query = `[out:json][timeout:300];
area["name"="Berlin"]["boundary"="administrative"]["admin_level"="4"]->.berlin;
node["addr:housenumber"]["addr:street"](area.berlin);
out;`

  console.log(`[address-ingest] Fetching Berlin addresses from Overpass...`)
  const elements = await fetchOverpassWithRetry(query)
  console.log(`[address-ingest] Got ${elements.length} raw address nodes`)

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

  console.log(`[address-ingest] Parsed ${rows.length} valid addresses`)

  // Delete all existing addresses before re-inserting
  await env.DB.prepare('DELETE FROM addresses').run()

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

  console.log(`[address-ingest] Done — ${rows.length} addresses stored`)
  return { total: rows.length }
}
