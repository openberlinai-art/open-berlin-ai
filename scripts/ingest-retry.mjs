#!/usr/bin/env node
// Retry failed categories with longer delays

import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'

const OVERPASS_API = 'https://overpass-api.de/api/interpreter'
const DB_NAME = 'kulturpulse-db'
const BERLIN_BBOX = '52.338,13.088,52.675,13.761'

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'
function encodeGeohash(lat, lng, precision = 6) {
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180
  let hash = '', bit = 0, ch = 0, isLng = true
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

function buildAddress(tags) {
  if (!tags) return null
  const street = tags['addr:street'], number = tags['addr:housenumber'], city = tags['addr:city']
  const parts = [street && number ? `${street} ${number}` : street, city].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

const EXTRA_TAG_KEYS = ['cuisine','sport','denomination','religion','historic','memorial:type','artwork_type','castle_type','tower:type','network','capacity','fee','wheelchair','outdoor_seating','building','heritage','protection_title','craft','garden:type','nudism','musical_instrument','emergency','karaoke','cocktails','live_music','wikidata','wikipedia']

function extractExtraTags(tags) {
  if (!tags) return null
  const extra = {}
  for (const key of EXTRA_TAG_KEYS) { if (tags[key]) extra[key] = tags[key] }
  return Object.keys(extra).length ? JSON.stringify(extra) : null
}

function resolveImageUrl(tags) {
  if (!tags) return null
  const img = tags['image']
  if (img) {
    if (img.startsWith('http')) return img
    if (img.startsWith('File:')) { const n = img.replace(/^File:/, '').replace(/ /g, '_'); return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(n)}?width=600` }
  }
  const c = tags['wikimedia_commons']
  if (c) { const f = c.startsWith('File:') ? c : `File:${c}`; const n = f.replace(/^File:/, '').replace(/ /g, '_'); return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(n)}?width=600` }
  return null
}

function escapeSQL(s) {
  if (s === null || s === undefined) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}

// Last 4 failed categories to retry
const CATEGORIES = [
  { key: 'electronics', group: 'shopping', query: `[out:json][timeout:30];(node[shop=electronics]({BBOX});way[shop=electronics]({BBOX}););out center;` },
  { key: 'car_rental', group: 'transport', query: `[out:json][timeout:30];(node[amenity=car_rental]({BBOX});way[amenity=car_rental]({BBOX}););out center;` },
  { key: 'amusement_arcade', group: 'quirky', query: `[out:json][timeout:30];(node[leisure=amusement_arcade]({BBOX});way[leisure=amusement_arcade]({BBOX}););out center;` },
  { key: 'music_school', group: 'education', query: `[out:json][timeout:30];(node[amenity=music_school]({BBOX});way[amenity=music_school]({BBOX}););out center;` },
]

async function fetchOverpass(query) {
  const res = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  return res.json()
}

async function ingestCategory(cat) {
  const query = cat.query.replace(/\{BBOX\}/g, BERLIN_BBOX)
  process.stdout.write(`  ${cat.key}... `)

  let data
  try { data = await fetchOverpass(query) }
  catch (e) { console.log(`❌ ${e.message}`); return 0 }

  const elements = data.elements || []
  if (!elements.length) { console.log(`⚠️ 0 results`); return 0 }

  const rows = []
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon
    if (!lat || !lng) continue
    const id = `${el.type}/${el.id}`
    rows.push(`(${escapeSQL(id)}, ${escapeSQL(cat.group)}, ${escapeSQL(cat.key)}, ${escapeSQL(el.tags?.name ?? null)}, ${lat}, ${lng}, ${escapeSQL(encodeGeohash(lat, lng))}, 'berlin', ${escapeSQL(buildAddress(el.tags))}, ${escapeSQL(el.tags?.website ?? el.tags?.['contact:website'] ?? null)}, ${escapeSQL(el.tags?.phone ?? el.tags?.['contact:phone'] ?? null)}, ${escapeSQL(el.tags?.opening_hours ?? null)}, ${escapeSQL(el.tags?.description ?? null)}, ${escapeSQL(el.tags?.operator ?? null)}, ${escapeSQL(extractExtraTags(el.tags))}, ${escapeSQL(resolveImageUrl(el.tags))}, datetime('now'))`)
  }

  let inserted = 0
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const sql = `INSERT OR REPLACE INTO pois (id, category_group, category, name, lat, lng, geohash, region, address, website, phone, opening_hours, description, operator, tags_json, image_url, refreshed_at) VALUES ${batch.join(',\n')};`
    const tmp = `/tmp/poi-retry-${cat.key}-${i}.sql`
    writeFileSync(tmp, sql)
    try {
      execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file="${tmp}"`, { stdio: 'pipe', timeout: 30000 })
      inserted += batch.length
    } catch {}
    try { unlinkSync(tmp) } catch {}
  }
  console.log(`✅ ${inserted}`)
  return inserted
}

async function main() {
  console.log(`\n🔄 Retrying ${CATEGORIES.length} failed categories (5s delay)...\n`)
  let total = 0, ok = 0
  for (const cat of CATEGORIES) {
    const n = await ingestCategory(cat)
    total += n; if (n > 0) ok++
    await new Promise(r => setTimeout(r, 5000))
  }
  console.log(`\n✅ Done! ${ok}/${CATEGORIES.length} categories, ${total.toLocaleString()} POIs`)
}

main().catch(e => { console.error(e); process.exit(1) })
