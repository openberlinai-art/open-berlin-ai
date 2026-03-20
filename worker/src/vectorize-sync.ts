import type { Env } from './types'

interface POIRow {
  id:             string
  category_group: string
  category:       string
  name:           string | null
  region:         string
  address:        string | null
  description:    string | null
  tags_json:      string | null
}

/** Build a human-readable embedding text from POI fields */
function buildEmbeddingText(poi: POIRow): string {
  const parts = [
    poi.name,
    poi.category_group,
    poi.category,
    poi.description,
    poi.address,
  ].filter(Boolean)

  // Extract cuisine/sport/etc from tags
  if (poi.tags_json) {
    try {
      const tags = JSON.parse(poi.tags_json) as Record<string, string>
      for (const key of ['cuisine', 'sport', 'music_genre', 'brewery', 'craft']) {
        if (tags[key]) parts.push(tags[key])
      }
    } catch { /* ignore malformed JSON */ }
  }

  return parts.join(' | ')
}

/**
 * Sync POIs to Cloudflare Vectorize index.
 * Embeds text via Workers AI bge-base-en-v1.5 (768-dim) and upserts vectors.
 * Tracks sync state via `embedded_at` column on pois table.
 */
export async function syncPOIsToVectorize(
  env: Env,
  options?: { forceAll?: boolean; batchSize?: number }
): Promise<{ synced: number; skipped: number }> {
  const forceAll = options?.forceAll ?? false
  const batchSize = options?.batchSize ?? 100

  // Fetch POIs that need syncing
  const whereClause = forceAll
    ? '1=1'
    : "embedded_at IS NULL OR embedded_at < refreshed_at"

  const { results: pois } = await env.DB.prepare(`
    SELECT id, category_group, category, name, region, address, description, tags_json
    FROM pois
    WHERE ${whereClause}
    ORDER BY id
    LIMIT 5000
  `).all<POIRow>()

  if (pois.length === 0) {
    console.log('[vectorize-sync] No POIs to sync')
    return { synced: 0, skipped: 0 }
  }

  console.log(`[vectorize-sync] Syncing ${pois.length} POIs...`)

  let synced = 0
  let skipped = 0

  // Process in batches of 100 (AI embedding limit)
  for (let i = 0; i < pois.length; i += batchSize) {
    const batch = pois.slice(i, i + batchSize)
    const texts = batch.map(buildEmbeddingText)

    // Generate embeddings via Workers AI
    const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5' as Parameters<typeof env.AI.run>[0], {
      text: texts,
    } as Parameters<typeof env.AI.run>[1]) as { data?: number[][] }

    if (!embeddingResult.data || embeddingResult.data.length !== batch.length) {
      console.error(`[vectorize-sync] Embedding mismatch: expected ${batch.length}, got ${embeddingResult.data?.length ?? 0}`)
      skipped += batch.length
      continue
    }

    // Build vectors for upsert
    const vectors: VectorizeVector[] = batch.map((poi, j) => ({
      id: poi.id,
      values: embeddingResult.data![j] as number[],
      metadata: {
        category_group: poi.category_group,
        category: poi.category,
        region: poi.region,
        name: poi.name ?? '',
      },
    }))

    // Upsert to Vectorize (max 1000 per call)
    await env.VECTORIZE.upsert(vectors)

    // Mark as embedded in D1
    const updateStmt = env.DB.prepare(
      `UPDATE pois SET embedded_at = datetime('now') WHERE id = ?`
    )
    await env.DB.batch(batch.map(p => updateStmt.bind(p.id)))

    synced += batch.length
    console.log(`[vectorize-sync] Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} vectors upserted`)
  }

  console.log(`[vectorize-sync] Done — synced=${synced}, skipped=${skipped}`)
  return { synced, skipped }
}
