import type { Env } from './types'

export interface SemanticSearchResult {
  id:    string
  score: number
}

/**
 * Embed a user query and search the Vectorize POI index.
 * Returns POI IDs ranked by cosine similarity.
 */
export async function semanticSearchPOIs(
  env: Env,
  query: string,
  options?: { topK?: number; filter?: { category_group?: string } }
): Promise<SemanticSearchResult[]> {
  const topK = options?.topK ?? 10

  // Embed the query
  const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5' as Parameters<typeof env.AI.run>[0], {
    text: [query],
  } as Parameters<typeof env.AI.run>[1]) as { data?: number[][] }

  if (!embeddingResult.data?.[0]) {
    console.error('[vector-search] Failed to embed query')
    return []
  }

  // Build Vectorize query options
  const queryOptions: VectorizeQueryOptions = {
    topK,
    returnMetadata: 'all',
  }
  if (options?.filter?.category_group) {
    queryOptions.filter = { category_group: options.filter.category_group }
  }

  const matches = await env.VECTORIZE.query(embeddingResult.data[0], queryOptions)

  return matches.matches.map(m => ({
    id:    m.id,
    score: m.score,
  }))
}
