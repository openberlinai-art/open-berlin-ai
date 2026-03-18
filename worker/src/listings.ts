// Listing CRUD for D1 + R2 image storage

import type { D1Database } from '@cloudflare/workers-types'

// Minimal GeoJSON types (worker has no @types/geojson)
interface GeoJSONFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, unknown>
}
interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListingRow {
  id:             string
  user_id:        string
  type:           'apartment_rent' | 'apartment_buy' | 'item' | 'service'
  title:          string
  description:    string | null
  price_cents:    number | null
  price_type:     'fixed' | 'negotiable' | 'free' | 'per_month'
  currency:       string
  category:       string | null
  images:         string | null  // JSON array of R2 keys
  lat:            number | null
  lng:            number | null
  address:        string | null
  borough:        string | null
  rooms:          number | null
  sqm:            number | null
  floor:          number | null
  contact_method: 'email' | 'phone' | 'both'
  contact_info:   string | null
  status:         'active' | 'sold' | 'expired'
  created_at:     string
  expires_at:     string | null
}

export interface ListingFilters {
  type?:    string
  borough?: string
  bbox?:    string   // 'minLng,minLat,maxLng,maxLat'
  status?:  string
  user_id?: string
  format?:  string   // 'geojson'
  street?:  string
  page?:    number
  limit?:   number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(priceCents: number | null, priceType: string, currency: string): string {
  if (priceType === 'free') return 'Free'
  if (priceCents == null) return ''
  const amount = (priceCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0 })
  const suffix = priceType === 'per_month' ? '/mo' : ''
  return `${amount} ${currency}${suffix}`
}

// ─── GET listings ─────────────────────────────────────────────────────────────

export async function getListings(
  filters: ListingFilters,
  db: D1Database,
): Promise<{ listings: ListingRow[]; total: number; page: number; limit: number } | GeoJSONFeatureCollection> {
  const wheres: string[] = []
  const values: unknown[] = []

  // Default: only active, non-expired
  wheres.push(`status = 'active'`)
  wheres.push(`(expires_at IS NULL OR expires_at > datetime('now'))`)

  if (filters.type) {
    wheres.push(`type = ?`)
    values.push(filters.type)
  }
  if (filters.borough) {
    wheres.push(`borough = ?`)
    values.push(filters.borough)
  }
  if (filters.status && filters.status !== 'active') {
    // Override default status filter
    wheres[0] = `status = ?`
    values.unshift(filters.status)
  }
  if (filters.user_id) {
    // When filtering by user, show all statuses
    wheres[0] = `user_id = ?`
    wheres.splice(1, 1) // remove expiry check
    values.unshift(filters.user_id)
  }
  if (filters.bbox) {
    const [minLng, minLat, maxLng, maxLat] = filters.bbox.split(',').map(Number)
    wheres.push(`lat BETWEEN ? AND ?`)
    wheres.push(`lng BETWEEN ? AND ?`)
    values.push(minLat, maxLat, minLng, maxLng)
  }
  if (filters.street) {
    wheres.push(`LOWER(address) LIKE ?`)
    values.push(`%${filters.street.toLowerCase()}%`)
  }

  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

  const page  = filters.page  ?? 1
  const limit = filters.limit ?? 50

  // Count
  const countRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM listings ${where}`)
    .bind(...values)
    .first<{ cnt: number }>()
  const total = countRow?.cnt ?? 0

  // Rows
  const offset = (page - 1) * limit
  const { results } = await db
    .prepare(`SELECT * FROM listings ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...values, limit, offset)
    .all<ListingRow>()

  // GeoJSON format
  if (filters.format === 'geojson') {
    const features: GeoJSONFeature[] = results
      .filter(r => r.lat != null && r.lng != null)
      .map(r => {
        const imgs: string[] = r.images ? JSON.parse(r.images) : []
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng!, r.lat!] },
          properties: {
            id:          r.id,
            type:        r.type,
            title:       r.title,
            price_label: formatPrice(r.price_cents, r.price_type, r.currency),
            price_cents: r.price_cents,
            borough:     r.borough,
            category:    r.category,
            first_image_url: imgs.length > 0 ? `/api/listings/images/${imgs[0]}` : null,
          },
        }
      })
    return { type: 'FeatureCollection', features }
  }

  return { listings: results, total, page, limit }
}

// ─── GET single listing ──────────────────────────────────────────────────────

export async function getListing(
  id: string,
  db: D1Database,
): Promise<(ListingRow & { seller_name: string | null; seller_email: string }) | null> {
  const row = await db
    .prepare(
      `SELECT l.*, u.display_name AS seller_name, u.email AS seller_email
       FROM listings l JOIN users u ON l.user_id = u.id
       WHERE l.id = ?`
    )
    .bind(id)
    .first<ListingRow & { seller_name: string | null; seller_email: string }>()
  return row ?? null
}

// ─── CREATE listing ─────────────────────────────────────────────────────────

export async function createListing(
  userId: string,
  data: {
    type:            ListingRow['type']
    title:           string
    description?:    string
    price_cents?:    number
    price_type?:     ListingRow['price_type']
    currency?:       string
    category?:       string
    lat?:            number
    lng?:            number
    address?:        string
    borough?:        string
    rooms?:          number
    sqm?:            number
    floor?:          number
    contact_method?: ListingRow['contact_method']
    contact_info?:   string
  },
  db: D1Database,
): Promise<ListingRow> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await db.prepare(
    `INSERT INTO listings
     (id, user_id, type, title, description, price_cents, price_type, currency,
      category, lat, lng, address, borough, rooms, sqm, floor,
      contact_method, contact_info, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, userId, data.type, data.title,
    data.description ?? null, data.price_cents ?? null,
    data.price_type ?? 'fixed', data.currency ?? 'EUR',
    data.category ?? null, data.lat ?? null, data.lng ?? null,
    data.address ?? null, data.borough ?? null,
    data.rooms ?? null, data.sqm ?? null, data.floor ?? null,
    data.contact_method ?? 'email', data.contact_info ?? null,
    now, expiresAt,
  ).run()

  return {
    id, user_id: userId, type: data.type, title: data.title,
    description: data.description ?? null, price_cents: data.price_cents ?? null,
    price_type: data.price_type ?? 'fixed', currency: data.currency ?? 'EUR',
    category: data.category ?? null, images: null,
    lat: data.lat ?? null, lng: data.lng ?? null,
    address: data.address ?? null, borough: data.borough ?? null,
    rooms: data.rooms ?? null, sqm: data.sqm ?? null, floor: data.floor ?? null,
    contact_method: data.contact_method ?? 'email', contact_info: data.contact_info ?? null,
    status: 'active', created_at: now, expires_at: expiresAt,
  }
}

// ─── UPDATE listing ─────────────────────────────────────────────────────────

export async function updateListing(
  id: string,
  userId: string,
  fields: Partial<Pick<ListingRow,
    'title' | 'description' | 'price_cents' | 'price_type' | 'currency' | 'category' |
    'lat' | 'lng' | 'address' | 'borough' | 'rooms' | 'sqm' | 'floor' |
    'contact_method' | 'contact_info' | 'status'
  >>,
  db: D1Database,
): Promise<boolean> {
  const sets: string[] = []
  const vals: unknown[] = []
  const allowed = [
    'title', 'description', 'price_cents', 'price_type', 'currency', 'category',
    'lat', 'lng', 'address', 'borough', 'rooms', 'sqm', 'floor',
    'contact_method', 'contact_info', 'status',
  ] as const
  for (const key of allowed) {
    if ((fields as Record<string, unknown>)[key] !== undefined) {
      sets.push(`${key} = ?`)
      vals.push((fields as Record<string, unknown>)[key])
    }
  }
  if (!sets.length) return false
  vals.push(id, userId)
  const { meta } = await db
    .prepare(`UPDATE listings SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...vals)
    .run()
  return (meta.changes ?? 0) > 0
}

// ─── DELETE listing ─────────────────────────────────────────────────────────

export async function deleteListing(
  id: string,
  userId: string,
  db: D1Database,
  r2: R2Bucket,
): Promise<boolean> {
  // Get listing to find images
  const listing = await db
    .prepare(`SELECT images FROM listings WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<{ images: string | null }>()
  if (!listing) return false

  // Delete R2 images
  const imgs: string[] = listing.images ? JSON.parse(listing.images) : []
  for (const key of imgs) {
    try { await r2.delete(key) } catch { /* ignore */ }
  }

  const { meta } = await db
    .prepare(`DELETE FROM listings WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run()
  return (meta.changes ?? 0) > 0
}

// ─── Upload image ──────────────────────────────────────────────────────────

export async function uploadListingImage(
  listingId: string,
  userId: string,
  file: ArrayBuffer,
  filename: string,
  contentType: string,
  db: D1Database,
  r2: R2Bucket,
): Promise<{ ok: boolean; key?: string; error?: string }> {
  // Verify ownership
  const listing = await db
    .prepare(`SELECT images FROM listings WHERE id = ? AND user_id = ?`)
    .bind(listingId, userId)
    .first<{ images: string | null }>()
  if (!listing) return { ok: false, error: 'Not found or not owner' }

  const imgs: string[] = listing.images ? JSON.parse(listing.images) : []
  if (imgs.length >= 5) return { ok: false, error: 'Max 5 images' }

  const key = `listings/${listingId}/${filename}`
  await r2.put(key, file, { httpMetadata: { contentType } })

  imgs.push(key)
  await db
    .prepare(`UPDATE listings SET images = ? WHERE id = ?`)
    .bind(JSON.stringify(imgs), listingId)
    .run()

  return { ok: true, key }
}
