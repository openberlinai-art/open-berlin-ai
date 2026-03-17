// Geohash utility for spatial indexing in D1 (SQLite)
// 6-char precision ≈ 1.2km × 0.6km cells

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let minLat = -90,  maxLat = 90
  let minLng = -180, maxLng = 180
  let hash = ''
  let bit = 0
  let ch = 0
  let isLng = true

  while (hash.length < precision) {
    if (isLng) {
      const mid = (minLng + maxLng) / 2
      if (lng >= mid) { ch |= (1 << (4 - bit)); minLng = mid } else { maxLng = mid }
    } else {
      const mid = (minLat + maxLat) / 2
      if (lat >= mid) { ch |= (1 << (4 - bit)); minLat = mid } else { maxLat = mid }
    }
    isLng = !isLng
    if (bit < 4) { bit++ } else { hash += BASE32[ch]; bit = 0; ch = 0 }
  }
  return hash
}

/**
 * Returns geohash prefixes covering a bounding box.
 * Auto-selects precision based on bbox span:
 *   - small viewport (zoom 14+) → 5-char prefixes (~5km cells)
 *   - medium viewport (zoom 12-13) → 4-char prefixes (~20km cells)
 *   - wide viewport → 3-char prefixes
 */
export function bboxToGeohashPrefixes(
  minLat: number, minLng: number,
  maxLat: number, maxLng: number,
): string[] {
  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng
  const span = Math.max(latSpan, lngSpan)

  // Choose precision to keep prefix count manageable
  let precision: number
  if (span < 0.05)  precision = 5  // zoom 14+
  else if (span < 0.2)  precision = 4  // zoom 12-13
  else if (span < 1.0)  precision = 3  // zoom 10-11
  else precision = 2                    // wide zoom

  const prefixes = new Set<string>()

  // Step size: approximate cell dimensions at each precision
  const latStep = [180, 45, 5.625, 1.40625, 0.17578, 0.02197][precision] ?? 0.02197
  const lngStep = [360, 45, 11.25, 1.40625, 0.35156, 0.04395][precision] ?? 0.04395

  // Use smaller steps to avoid gaps
  const stepLat = latStep * 0.5
  const stepLng = lngStep * 0.5

  for (let lat = minLat; lat <= maxLat + stepLat; lat += stepLat) {
    for (let lng = minLng; lng <= maxLng + stepLng; lng += stepLng) {
      prefixes.add(encodeGeohash(
        Math.min(lat, maxLat),
        Math.min(lng, maxLng),
        precision,
      ))
    }
  }

  return [...prefixes]
}
