/**
 * Enriches events with images from two sources (in priority order):
 *   1. OG image from event's source_url or source_links
 *   2. Fallback: location image from the locations table (Wikidata/Wikimedia)
 *
 * Stores both image_urls and image_credit on the events table.
 * Runs daily, processing up to BATCH_LIMIT events per invocation
 * to stay within Cloudflare Worker subrequest limits.
 */

const BATCH_LIMIT = 80
const CONCURRENCY = 10
const FETCH_TIMEOUT = 5000 // ms

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract og:image from an HTML page. */
function extractOgImage(html: string): string | null {
  // Match <meta property="og:image" content="...">
  const match = html.match(
    /<meta\s+[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i
  ) ?? html.match(
    /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i
  )
  return match?.[1] ?? null
}

/** Extract site name for credit (og:site_name or domain). */
function extractSiteName(html: string, url: string): string {
  const match = html.match(
    /<meta\s+[^>]*property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["']/i
  ) ?? html.match(
    /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:site_name["']/i
  )
  if (match?.[1]) return match[1]
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Fetch a URL with timeout, return HTML or null. */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Citizen.Berlin/1.0 (https://citizen.berlin)' },
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null
    // Only read first 50KB to find OG tags (they're in <head>)
    const reader = res.body?.getReader()
    if (!reader) return null
    let html = ''
    const decoder = new TextDecoder()
    while (html.length < 50_000) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }
    reader.cancel()
    return html
  } catch {
    return null
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function enrichEventImages(db: D1Database): Promise<number> {
  console.log('[enrich-event-images] starting…')

  // Find events with no image_urls that have a source URL or source links
  const { results: events } = await db.prepare(`
    SELECT e.id, e.source_url, e.source_links, e.location_id, e.location_name
    FROM events e
    WHERE e.image_urls IS NULL
      AND e.date_start >= date('now')
      AND (e.source_url IS NOT NULL OR e.source_links IS NOT NULL)
    ORDER BY e.date_start ASC
    LIMIT ?
  `).bind(BATCH_LIMIT).all<{
    id: string
    source_url: string | null
    source_links: string | null
    location_id: string | null
    location_name: string | null
  }>()

  if (!events.length) {
    console.log('[enrich-event-images] no events to enrich')
    // Still try location fallback for remaining events
    const fallbackCount = await applyLocationFallback(db)
    console.log(`[enrich-event-images] done — 0 OG images, ${fallbackCount} location fallbacks`)
    return fallbackCount
  }

  console.log(`[enrich-event-images] processing ${events.length} events for OG images…`)

  let ogCount = 0
  const CHUNK = CONCURRENCY

  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK)
    const results = await Promise.all(chunk.map(async (event) => {
      // Collect candidate URLs
      const urls: string[] = []
      if (event.source_url) urls.push(event.source_url)
      if (event.source_links) {
        try {
          const links: Array<{ url: string }> = JSON.parse(event.source_links)
          for (const link of links) {
            if (link.url && !urls.includes(link.url)) urls.push(link.url)
          }
        } catch { /* ignore malformed JSON */ }
      }

      // Try each URL until we find an OG image
      for (const url of urls.slice(0, 3)) {
        const html = await fetchPage(url)
        if (!html) continue
        const ogImage = extractOgImage(html)
        if (ogImage) {
          const credit = extractSiteName(html, url)
          return { id: event.id, imageUrl: ogImage, credit }
        }
      }

      return { id: event.id, imageUrl: null, credit: null }
    }))

    // Batch update D1
    const stmts = results.map(r => {
      if (r.imageUrl) {
        ogCount++
        return db.prepare(
          'UPDATE events SET image_urls = ?, image_credit = ? WHERE id = ?'
        ).bind(JSON.stringify([r.imageUrl]), r.credit, r.id)
      }
      // Mark as checked with empty array so we don't retry
      return db.prepare(
        'UPDATE events SET image_urls = ? WHERE id = ?'
      ).bind('[]', r.id)
    })

    if (stmts.length) await db.batch(stmts)
  }

  // Apply location image fallback for events still without real images
  const fallbackCount = await applyLocationFallback(db)

  console.log(`[enrich-event-images] done — ${ogCount} OG images, ${fallbackCount} location fallbacks`)
  return ogCount + fallbackCount
}

/**
 * For events with empty image_urls ([]) that have a location_id,
 * copy the location's image_urls as fallback with venue credit.
 */
async function applyLocationFallback(db: D1Database): Promise<number> {
  const { results: events } = await db.prepare(`
    SELECT e.id, e.location_id, e.location_name, l.image_urls AS loc_images
    FROM events e
    JOIN locations l ON e.location_id = l.id
    WHERE e.image_urls = '[]'
      AND e.date_start >= date('now')
      AND l.image_urls IS NOT NULL
      AND l.image_urls != '[]'
    LIMIT 200
  `).all<{
    id: string
    location_id: string
    location_name: string | null
    loc_images: string
  }>()

  if (!events.length) return 0

  const CHUNK = 50
  let count = 0

  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK)
    const stmts = chunk.map(e => {
      count++
      const credit = e.location_name
        ? `${e.location_name} (Wikimedia Commons)`
        : 'Wikimedia Commons'
      return db.prepare(
        'UPDATE events SET image_urls = ?, image_credit = ? WHERE id = ?'
      ).bind(e.loc_images, credit, e.id)
    })
    await db.batch(stmts)
  }

  return count
}
