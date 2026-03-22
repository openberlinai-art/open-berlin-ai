// POI Duplicate Detection — finds POIs near OSM venues with similar names

/** Dice coefficient on character bigrams — returns 0..1 */
export function normalizedSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const la = a.toLowerCase().trim()
  const lb = b.toLowerCase().trim()
  if (la === lb) return 1

  const bigrams = (s: string) => {
    const bg = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2))
    return bg
  }

  const bgA = bigrams(la)
  const bgB = bigrams(lb)
  if (bgA.size === 0 || bgB.size === 0) return 0

  let intersection = 0
  for (const b of bgA) {
    if (bgB.has(b)) intersection++
  }

  return (2 * intersection) / (bgA.size + bgB.size)
}

/** Haversine distance in metres */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface D1Database {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T>(): Promise<{ results: T[] }>
      run(): Promise<{ meta: { changes: number } }>
    }
    all<T>(): Promise<{ results: T[] }>
    run(): Promise<{ meta: { changes: number } }>
  }
  batch(stmts: unknown[]): Promise<unknown[]>
}

interface OsmVenue {
  id: string
  name: string | null
  lat: number
  lng: number
}

interface POI {
  id: string
  name: string | null
  lat: number
  lng: number
}

export async function deduplicatePOIs(db: D1Database): Promise<{ matched: number }> {
  // ~0.00045° ≈ 50m
  const DELTA = 0.00045
  const MIN_SIMILARITY = 0.5

  // Get OSM venues with names — limit to 200 per run to stay within CF subrequest limits
  const { results: osmVenues } = await db.prepare(
    `SELECT id, name, lat, lng FROM osm_venues WHERE name IS NOT NULL LIMIT 200`
  ).all<OsmVenue>()

  let matched = 0

  for (const venue of osmVenues) {
    {
      if (!venue.name) continue

      const { results: nearby } = await db.prepare(
        `SELECT id, name, lat, lng FROM pois
         WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
         AND name IS NOT NULL`
      ).bind(
        venue.lat - DELTA, venue.lat + DELTA,
        venue.lng - DELTA, venue.lng + DELTA,
      ).all<POI>()

      for (const poi of nearby) {
        if (!poi.name) continue
        const dist = haversineDistance(venue.lat, venue.lng, poi.lat, poi.lng)
        if (dist > 50) continue

        const sim = normalizedSimilarity(venue.name, poi.name)
        if (sim < MIN_SIMILARITY) continue

        await db.prepare(
          `INSERT INTO poi_duplicates (poi_id, osm_venue_id, distance_m, name_similarity, status)
           VALUES (?, ?, ?, ?, 'pending')`
        ).bind(poi.id, venue.id, Math.round(dist * 10) / 10, Math.round(sim * 1000) / 1000).run()

        matched++
      }
    }
  }

  return { matched, venuesChecked: osmVenues.length }
}
