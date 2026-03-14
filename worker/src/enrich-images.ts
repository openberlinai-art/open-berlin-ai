/**
 * Enriches locations with image URLs from Wikidata/Wikimedia Commons.
 *
 * Matching strategy (in priority order):
 *   1. Coordinate proximity (< 0.001° ≈ 100m)
 *   2. Website domain equality
 *
 * Wikidata images come as "Special:FilePath" URLs → stored with ?width=800.
 * Locations already processed (image_urls IS NOT NULL) are skipped.
 * No-match locations get an empty JSON array [] so they're not retried daily.
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const SPARQL_QUERY = `
SELECT ?item ?label ?image ?coord ?website WHERE {
  ?item wdt:P625 ?coord ;
        wdt:P18  ?image ;
        wdt:P131* wd:Q64 .
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label)="de") }
}
LIMIT 4000
`

// ─── Types ────────────────────────────────────────────────────────────────────

interface WikidataItem {
  lat:     number
  lng:     number
  website: string | null
  images:  string[]       // up to 4 Commons image URLs
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse WKT "Point(lng lat)" from Wikidata P625 value. */
function parseWKT(wkt: string): { lat: number; lng: number } | null {
  const m = wkt.match(/Point\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/)
  if (!m) return null
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) }
}

/** Normalize a URL to its bare hostname (no www, no path). */
function hostname(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0].split('?')[0]
  }
}

/** Convert a Wikidata Commons file URL to a sized thumb URL. */
function commonsThumb(fileUrl: string, width = 800): string {
  return fileUrl.replace('http://', 'https://') + `?width=${width}`
}

// ─── Wikidata fetch ───────────────────────────────────────────────────────────

async function fetchWikidata(): Promise<Map<string, WikidataItem>> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(SPARQL_QUERY)}&format=json`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'KulturPulse Berlin/1.0 (https://kulturpulse.berlin)' },
    // cf: { cacheTtl: 3600 }  // Cache in Cloudflare for 1 hour
  })
  if (!res.ok) throw new Error(`Wikidata SPARQL HTTP ${res.status}`)

  const body = await res.json() as {
    results: {
      bindings: Array<{
        item:     { value: string }
        image:    { value: string }
        coord?:   { value: string }
        website?: { value: string }
        label?:   { value: string }
      }>
    }
  }

  const map = new Map<string, WikidataItem>()

  for (const b of body.results.bindings) {
    const qid    = b.item.value.replace('http://www.wikidata.org/entity/', '')
    const coords = parseWKT(b.coord?.value ?? '')
    if (!coords) continue   // skip items without coordinates (can't match)

    const imageUrl = commonsThumb(b.image.value)

    if (map.has(qid)) {
      const entry = map.get(qid)!
      if (entry.images.length < 4 && !entry.images.includes(imageUrl)) {
        entry.images.push(imageUrl)
      }
    } else {
      map.set(qid, {
        lat:     coords.lat,
        lng:     coords.lng,
        website: b.website?.value ?? null,
        images:  [imageUrl],
      })
    }
  }

  return map
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function enrichLocationsWithImages(db: D1Database): Promise<number> {
  console.log('[enrich-images] fetching Wikidata…')

  let wikiItems: Map<string, WikidataItem>
  try {
    wikiItems = await fetchWikidata()
    console.log(`[enrich-images] ${wikiItems.size} Wikidata items with coords + images`)
  } catch (e) {
    console.error('[enrich-images] Wikidata fetch failed:', e)
    return 0
  }

  // Load locations that haven't been enriched yet
  const { results: locs } = await db.prepare(`
    SELECT id, lat, lng, website
    FROM   locations
    WHERE  image_urls IS NULL
    AND    (lat IS NOT NULL OR website IS NOT NULL)
  `).all<{ id: string; lat: number | null; lng: number | null; website: string | null }>()

  if (!locs.length) {
    console.log('[enrich-images] no unenriched locations')
    return 0
  }
  console.log(`[enrich-images] enriching ${locs.length} locations…`)

  const wikiArray = Array.from(wikiItems.values())
  let matched = 0

  // Process in batches to stay within D1 batch limit
  const BATCH = 50
  for (let i = 0; i < locs.length; i += BATCH) {
    const chunk = locs.slice(i, i + BATCH)
    const stmts = chunk.map(loc => {
      let best: WikidataItem | null = null

      // 1. Coordinate match (< 0.001° ≈ 100m)
      if (loc.lat !== null && loc.lng !== null) {
        let minDist = Infinity
        for (const item of wikiArray) {
          const dlat = item.lat - loc.lat
          const dlng = item.lng - loc.lng
          const d    = dlat * dlat + dlng * dlng
          if (d < 0.000001 && d < minDist) {   // 0.001° each axis
            minDist = d
            best    = item
          }
        }
      }

      // 2. Website domain match (fallback)
      if (!best && loc.website) {
        const h = hostname(loc.website)
        for (const item of wikiArray) {
          if (item.website && hostname(item.website) === h) {
            best = item
            break
          }
        }
      }

      const imageUrls = best
        ? JSON.stringify(best.images.slice(0, 3))
        : '[]'   // empty = checked, no match

      if (best) matched++

      return db.prepare('UPDATE locations SET image_urls = ? WHERE id = ?')
        .bind(imageUrls, loc.id)
    })

    await db.batch(stmts)
  }

  console.log(`[enrich-images] done — ${matched} matched of ${locs.length}`)
  return matched
}
