// Two-level geocoding cache: in-memory (per Worker instance) + D1 (persistent)

const memCache = new Map<string, { lat: number; lng: number } | null>()

export async function geocode(
  db: D1Database,
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null

  const key = address.trim().toLowerCase()

  // 1. Memory cache
  if (memCache.has(key)) return memCache.get(key)!

  // 2. D1 cache
  const cached = await db
    .prepare('SELECT lat, lng FROM geocode_cache WHERE address = ?')
    .bind(key)
    .first<{ lat: number; lng: number }>()

  if (cached) {
    memCache.set(key, cached)
    return cached
  }

  // 3. Photon first, Nominatim fallback
  const result = (await callPhoton(address)) ?? (await callNominatim(address))
  memCache.set(key, result)

  // Store in D1 (fire-and-forget, don't block ingestion)
  if (result) {
    db.prepare(
      'INSERT OR REPLACE INTO geocode_cache (address, lat, lng) VALUES (?, ?, ?)'
    ).bind(key, result.lat, result.lng).run().catch(() => {})
  }

  return result
}

/** Geocode one batch of events that have an address but no coordinates. */
export async function geocodeAll(db: D1Database, offset = 0): Promise<number> {
  const rows = await db
    .prepare(`SELECT id, address FROM events WHERE lat IS NULL AND address IS NOT NULL LIMIT 20 OFFSET ?`)
    .bind(offset)
    .all<{ id: string; address: string }>()

  if (!rows.results?.length) return 0

  let total = 0
  await Promise.all(rows.results.map(async row => {
    const coords = await geocode(db, row.address)
    if (coords) {
      await db
        .prepare(`UPDATE events SET lat = ?, lng = ? WHERE id = ?`)
        .bind(coords.lat, coords.lng, row.id)
        .run()
      total++
    }
  }))
  return total
}

/** Geocode one batch of locations that have an address but no coordinates. */
export async function geocodeAllLocations(db: D1Database, offset = 0): Promise<number> {
  const rows = await db
    .prepare(`SELECT id, address FROM locations WHERE lat IS NULL AND address IS NOT NULL AND LENGTH(address) > 5 LIMIT 20 OFFSET ?`)
    .bind(offset)
    .all<{ id: string; address: string }>()

  if (!rows.results?.length) return 0

  let total = 0
  await Promise.all(rows.results.map(async row => {
    const coords = await geocode(db, row.address)
    if (coords) {
      await db
        .prepare(`UPDATE locations SET lat = ?, lng = ? WHERE id = ?`)
        .bind(coords.lat, coords.lng, row.id)
        .run()
      total++
    }
  }))
  return total
}

async function callPhoton(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const q   = encodeURIComponent(`${address}, Berlin, Germany`)
  const url = `https://photon.komoot.io/api/?q=${q}&limit=1&lang=de&lat=52.52&lon=13.405`

  try {
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), 5_000)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) return null

    const data = await res.json() as {
      features?: Array<{ geometry: { coordinates: [number, number] } }>
    }

    const feature = data.features?.[0]
    if (!feature) return null

    const [lng, lat] = feature.geometry.coordinates
    return { lat: lat!, lng: lng! }
  } catch {
    return null
  }
}

async function callNominatim(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const q   = encodeURIComponent(`${address}, Berlin, Germany`)
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=1&countrycodes=de`

  try {
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), 8_000)

    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'kulturpulse-berlin/1.0 (openberlinai.workers.dev)' },
    })
    clearTimeout(timer)

    if (!res.ok) return null

    const data = await res.json() as Array<{ lat: string; lon: string }>
    if (!data.length) return null

    return { lat: parseFloat(data[0]!.lat), lng: parseFloat(data[0]!.lon) }
  } catch {
    return null
  }
}
