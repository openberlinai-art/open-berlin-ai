import type { Env } from './types'

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id:   number
  center?: { lat: number; lon: number }
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
        console.log(`[street-ingest] Overpass ${res.status}, retrying in ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      if (!res.ok) throw new Error(`Overpass returned ${res.status}`)
      const data = await res.json() as OverpassResult
      return data.elements
    } catch (err) {
      if (attempt === retries - 1) throw err
      const delay = Math.pow(2, attempt + 1) * 2000
      console.log(`[street-ingest] Overpass error, retrying in ${delay}ms:`, err)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return []
}

/**
 * Ingest all Berlin street names from Overpass API.
 * Groups by (name, postcode) → average centroid → ~10-12k unique street entries.
 */
export async function ingestStreets(
  env: Env,
  region: 'berlin' = 'berlin',
): Promise<{ total: number }> {
  const query = `[out:json][timeout:180];
area["name"="Berlin"]["boundary"="administrative"]["admin_level"="4"]->.berlin;
way["highway"]["name"](area.berlin);
out center;`

  console.log(`[street-ingest] Fetching Berlin streets from Overpass...`)
  const elements = await fetchOverpassWithRetry(query)
  console.log(`[street-ingest] Got ${elements.length} raw ways`)

  // Group by (name, postcode) → compute average centroid
  const groups = new Map<string, {
    name: string
    postcode: string | null
    borough: string | null
    osmId: number
    lats: number[]
    lngs: number[]
  }>()

  for (const el of elements) {
    const lat = el.center?.lat
    const lon = el.center?.lon
    if (lat == null || lon == null) continue

    const tags = el.tags ?? {}
    const name = tags.name
    if (!name) continue

    const postcode = tags['addr:postcode'] ?? null
    const borough = tags['addr:suburb'] ?? tags['addr:city_district'] ?? null
    const key = `${name}|||${postcode ?? ''}`

    const existing = groups.get(key)
    if (existing) {
      existing.lats.push(lat)
      existing.lngs.push(lon)
      // Keep first borough found
      if (!existing.borough && borough) existing.borough = borough
    } else {
      groups.set(key, {
        name,
        postcode,
        borough,
        osmId: el.id,
        lats: [lat],
        lngs: [lon],
      })
    }
  }

  // Build rows with average centroids
  const rows: Array<{
    name: string; name_norm: string; lat: number; lng: number
    postcode: string | null; borough: string | null; osm_id: number
  }> = []

  for (const g of groups.values()) {
    const lat = g.lats.reduce((a, b) => a + b, 0) / g.lats.length
    const lng = g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length
    rows.push({
      name:      g.name,
      name_norm: normalize(g.name),
      lat,
      lng,
      postcode:  g.postcode,
      borough:   g.borough,
      osm_id:    g.osmId,
    })
  }

  console.log(`[street-ingest] Deduped to ${rows.length} unique streets`)

  // Delete all existing streets for this region
  await env.DB.prepare('DELETE FROM streets WHERE region = ?').bind(region).run()

  // Batch insert in chunks of 100
  const stmt = env.DB.prepare(
    `INSERT INTO streets (name, name_norm, lat, lng, postcode, borough, region, osm_id, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )

  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    await env.DB.batch(
      chunk.map(r =>
        stmt.bind(r.name, r.name_norm, r.lat, r.lng, r.postcode, r.borough, region, r.osm_id)
      )
    )
  }

  console.log(`[street-ingest] Done — ${rows.length} streets stored`)
  return { total: rows.length }
}
