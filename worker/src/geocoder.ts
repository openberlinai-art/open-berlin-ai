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

  // 3. Photon API (OpenStreetMap-based, no key required)
  const result = await callPhoton(address)
  memCache.set(key, result)

  // Store in D1 (fire-and-forget, don't block ingestion)
  if (result) {
    db.prepare(
      'INSERT OR REPLACE INTO geocode_cache (address, lat, lng) VALUES (?, ?, ?)'
    ).bind(key, result.lat, result.lng).run().catch(() => {})
  }

  return result
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
