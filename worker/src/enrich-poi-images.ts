/**
 * Batch-enrich POIs that have a Wikidata QID but no image_url.
 * Uses the wbgetentities API (up to 50 QIDs per request) to fetch P18 (image) claims,
 * then resolves filenames to Commons thumbnail URLs.
 */

function commonsThumbUrl(filename: string, width = 600): string {
  const name = filename.replace(/^File:/, '').replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface POIRow {
  id: string
  tags_json: string
}

interface WikidataEntity {
  claims?: {
    P18?: Array<{
      mainsnak?: {
        datavalue?: {
          value?: string
        }
      }
    }>
  }
}

export async function enrichPOIImages(db: D1Database): Promise<number> {
  // 1. Find POIs with wikidata tag but no image
  const { results } = await db.prepare(
    `SELECT id, tags_json FROM pois
     WHERE image_url IS NULL AND tags_json LIKE '%"wikidata"%'`
  ).all<POIRow>()

  if (!results || results.length === 0) return 0

  // 2. Parse QIDs from tags_json
  const poiQidPairs: Array<{ id: string; qid: string }> = []
  for (const poi of results) {
    try {
      const tags = JSON.parse(poi.tags_json)
      const qid = tags?.wikidata
      if (qid && typeof qid === 'string' && /^Q\d+$/.test(qid)) {
        poiQidPairs.push({ id: poi.id, qid })
      }
    } catch {
      // skip malformed JSON
    }
  }

  if (poiQidPairs.length === 0) return 0

  let updated = 0
  const BATCH_SIZE = 50

  // 3. Process in batches of 50
  for (let i = 0; i < poiQidPairs.length; i += BATCH_SIZE) {
    const batch = poiQidPairs.slice(i, i + BATCH_SIZE)
    const qids = batch.map(p => p.qid).join('|')

    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids}&props=claims&format=json`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'KulturPulse/1.0 (https://kulturpulse.berlin)' },
    })

    if (!resp.ok) {
      console.error(`Wikidata API error: ${resp.status} for batch starting at ${i}`)
      if (i + BATCH_SIZE < poiQidPairs.length) await sleep(2000)
      continue
    }

    const data = await resp.json() as { entities?: Record<string, WikidataEntity> }
    if (!data.entities) continue

    // Build QID → image URL map
    const qidToImage = new Map<string, string>()
    for (const [qid, entity] of Object.entries(data.entities)) {
      const p18Claims = entity.claims?.P18
      if (p18Claims && p18Claims.length > 0) {
        const filename = p18Claims[0]?.mainsnak?.datavalue?.value
        if (filename) {
          qidToImage.set(qid, commonsThumbUrl(filename))
        }
      }
    }

    // 4. Batch update POIs
    const stmts: D1PreparedStatement[] = []
    for (const { id, qid } of batch) {
      const imageUrl = qidToImage.get(qid)
      if (imageUrl) {
        stmts.push(
          db.prepare('UPDATE pois SET image_url = ? WHERE id = ?').bind(imageUrl, id)
        )
        updated++
      }
    }

    if (stmts.length > 0) {
      await db.batch(stmts)
    }

    // Rate-limit: 1s delay between API calls
    if (i + BATCH_SIZE < poiQidPairs.length) {
      await sleep(1000)
    }
  }

  return updated
}
