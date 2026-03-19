import type { Env } from './types'
import { encodeGeohash } from './geohash'
import { POI_CATEGORIES, getOverpassQuery } from './poi-queries'
import type { POICategoryGroup } from './poi-queries'

const BERLIN_BBOX       = '52.338,13.088,52.675,13.761'
const BRANDENBURG_BBOX  = '51.36,11.27,53.56,14.77'

// Berlin bounding box for region classification
const BERLIN_MIN_LAT = 52.338, BERLIN_MAX_LAT = 52.675
const BERLIN_MIN_LNG = 13.088, BERLIN_MAX_LNG = 13.761

type OverpassElement = {
  type:    'node' | 'way' | 'relation'
  id:      number
  lat?:    number
  lon?:    number
  center?: { lat: number; lon: number }
  tags?:   Record<string, string>
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

function classifyRegion(lat: number, lng: number): 'berlin' | 'brandenburg' {
  if (lat >= BERLIN_MIN_LAT && lat <= BERLIN_MAX_LAT &&
      lng >= BERLIN_MIN_LNG && lng <= BERLIN_MAX_LNG) {
    return 'berlin'
  }
  return 'brandenburg'
}

// Extra tags worth preserving per category
const EXTRA_TAG_KEYS = [
  'cuisine', 'sport', 'denomination', 'religion', 'historic',
  'memorial:type', 'artwork_type', 'castle_type', 'tower:type',
  'network', 'capacity', 'fee', 'wheelchair', 'outdoor_seating',
  'building', 'heritage', 'protection_title',
  'craft', 'garden:type', 'nudism', 'musical_instrument',
  'musical_instrument:access', 'emergency', 'karaoke', 'cocktails', 'live_music',
  'wikidata', 'wikipedia',
]

function commonsThumbUrl(filename: string, width = 600): string {
  const name = filename.replace(/^File:/, '').replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`
}

function resolveImageUrl(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const img = tags['image']
  if (img) {
    if (img.startsWith('http')) return img
    if (img.startsWith('File:')) return commonsThumbUrl(img)
  }
  const commons = tags['wikimedia_commons']
  if (commons) {
    const file = commons.startsWith('File:') ? commons : `File:${commons}`
    return commonsThumbUrl(file)
  }
  return null
}

function extractExtraTags(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const extra: Record<string, string> = {}
  for (const key of EXTRA_TAG_KEYS) {
    if (tags[key]) extra[key] = tags[key]
  }
  return Object.keys(extra).length ? JSON.stringify(extra) : null
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
        // Rate limited or timeout — wait and retry
        const delay = Math.pow(2, attempt + 1) * 2000
        console.log(`[poi-ingest] Overpass ${res.status}, retrying in ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      if (!res.ok) throw new Error(`Overpass returned ${res.status}`)
      const data = await res.json() as OverpassResult
      return data.elements
    } catch (err) {
      if (attempt === retries - 1) throw err
      const delay = Math.pow(2, attempt + 1) * 2000
      console.log(`[poi-ingest] Overpass error, retrying in ${delay}ms:`, err)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return []
}

/**
 * Ingest POIs for a given region and optionally a single group.
 * Mirrors osm-venues.ts patterns: sequential categories, delete stale, batch INSERT.
 */
export async function ingestPOIs(
  env: Env,
  region: 'berlin' | 'brandenburg',
  group?: POICategoryGroup,
): Promise<{ total: number; categories: number }> {
  const bbox = region === 'berlin' ? BERLIN_BBOX : BRANDENBURG_BBOX
  const freshHours = region === 'berlin' ? 24 : 168 // 24h for Berlin, 7d for Brandenburg

  const cats = group
    ? POI_CATEGORIES.filter(c => c.group === group)
    : POI_CATEGORIES

  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO pois
     (id, category_group, category, name, lat, lng, geohash, region, address, website, phone, opening_hours, description, operator, tags_json, image_url, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )

  let totalRows = 0
  let catCount = 0

  for (const cat of cats) {
    // Check if recently ingested
    const recent = await env.DB.prepare(
      `SELECT id FROM poi_ingestion_log
       WHERE category = ? AND region = ? AND status = 'success'
         AND completed_at > datetime('now', '-${freshHours} hours')
       LIMIT 1`
    ).bind(cat.key, region).first()

    if (recent) {
      console.log(`[poi-ingest] Skipping ${cat.key}/${region} — ingested within ${freshHours}h`)
      continue
    }

    // Log start
    const logId = await env.DB.prepare(
      `INSERT INTO poi_ingestion_log (category, region, status) VALUES (?, ?, 'running') RETURNING id`
    ).bind(cat.key, region).first<{ id: number }>()

    try {
      const query = getOverpassQuery(cat.key, bbox)
      const elements = await fetchOverpassWithRetry(query)

      const seen = new Set<string>()
      const rows: Array<{
        id: string; name: string | null; lat: number; lng: number; geohash: string
        rowRegion: string; address: string | null; website: string | null; phone: string | null
        opening_hours: string | null; description: string | null; operator: string | null
        tags_json: string | null; image_url: string | null
      }> = []

      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat
        const lon = el.lon ?? el.center?.lon
        if (lat == null || lon == null) continue
        const id = `${el.type}/${el.id}`
        if (seen.has(id)) continue
        seen.add(id)

        const tags = el.tags ?? {}
        const rowRegion = classifyRegion(lat, lon)

        // For Brandenburg bbox, skip Berlin-region points (they'll be handled by Berlin ingest)
        if (region === 'brandenburg' && rowRegion === 'berlin') continue

        rows.push({
          id,
          name:          tags.name ?? null,
          lat,
          lng:           lon,
          geohash:       encodeGeohash(lat, lon, 6),
          rowRegion,
          address:       buildAddress(tags),
          website:       tags.website ?? tags['contact:website'] ?? tags['url'] ?? null,
          phone:         tags.phone ?? tags['contact:phone'] ?? null,
          opening_hours: tags.opening_hours ?? null,
          description:   tags.description ?? null,
          operator:      tags.operator ?? tags.brand ?? null,
          tags_json:     extractExtraTags(tags),
          image_url:     resolveImageUrl(tags),
        })
      }

      // Delete stale rows for this category + region
      await env.DB.prepare('DELETE FROM pois WHERE category = ? AND region = ?')
        .bind(cat.key, region).run()

      // Batch insert in chunks of 100
      const CHUNK = 100
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        await env.DB.batch(
          chunk.map(r =>
            stmt.bind(
              r.id, cat.group, cat.key, r.name, r.lat, r.lng, r.geohash,
              r.rowRegion, r.address, r.website, r.phone, r.opening_hours,
              r.description, r.operator, r.tags_json, r.image_url,
            )
          )
        )
      }

      totalRows += rows.length
      catCount++

      // Update log
      if (logId) {
        await env.DB.prepare(
          `UPDATE poi_ingestion_log SET status = 'success', row_count = ?, completed_at = datetime('now') WHERE id = ?`
        ).bind(rows.length, logId.id).run()
      }

      console.log(`[poi-ingest] ${cat.key}/${region}: ${rows.length} rows stored`)
    } catch (err) {
      console.error(`[poi-ingest] ${cat.key}/${region} failed:`, err)
      if (logId) {
        await env.DB.prepare(
          `UPDATE poi_ingestion_log SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`
        ).bind(String(err), logId.id).run()
      }
    }

    // 2-second delay between categories to respect Overpass rate limits
    await new Promise(r => setTimeout(r, 2000))
  }

  return { total: totalRows, categories: catCount }
}
