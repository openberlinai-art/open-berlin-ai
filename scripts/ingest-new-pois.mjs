#!/usr/bin/env node
// Local script to ingest new POI categories via Overpass → wrangler d1 execute
// Bypasses Worker subrequest limits by running locally

import { execSync } from 'child_process'

const OVERPASS_API = 'https://overpass-api.de/api/interpreter'
const DB_NAME = 'kulturpulse-db'
const BERLIN_BBOX = '52.338,13.088,52.675,13.761'

// Geohash encoder (6-char precision)
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
  const street = tags['addr:street']
  const number = tags['addr:housenumber']
  const city = tags['addr:city']
  const parts = [street && number ? `${street} ${number}` : street, city].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

const EXTRA_TAG_KEYS = [
  'cuisine', 'sport', 'denomination', 'religion', 'historic',
  'memorial:type', 'artwork_type', 'castle_type', 'tower:type',
  'network', 'capacity', 'fee', 'wheelchair', 'outdoor_seating',
  'building', 'heritage', 'protection_title',
  'craft', 'garden:type', 'nudism', 'musical_instrument', 'emergency',
  'karaoke', 'cocktails', 'live_music', 'wikidata', 'wikipedia',
]

function extractExtraTags(tags) {
  if (!tags) return null
  const extra = {}
  for (const key of EXTRA_TAG_KEYS) {
    if (tags[key]) extra[key] = tags[key]
  }
  return Object.keys(extra).length ? JSON.stringify(extra) : null
}

function resolveImageUrl(tags) {
  if (!tags) return null
  const img = tags['image']
  if (img) {
    if (img.startsWith('http')) return img
    if (img.startsWith('File:')) {
      const name = img.replace(/^File:/, '').replace(/ /g, '_')
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=600`
    }
  }
  const commons = tags['wikimedia_commons']
  if (commons) {
    const file = commons.startsWith('File:') ? commons : `File:${commons}`
    const name = file.replace(/^File:/, '').replace(/ /g, '_')
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=600`
  }
  return null
}

// Categories to ingest — all new ones
const CATEGORIES = [
  // From first batch (15 categories added but never ingested)
  { key: 'historic_cemetery', group: 'heritage', query: `[out:json][timeout:30];(way[landuse=cemetery][historic]({BBOX});way[landuse=cemetery][heritage]({BBOX}););out center;` },
  { key: 'outdoor_cinema', group: 'culture', query: `[out:json][timeout:30];(node[amenity=cinema][open_air=yes]({BBOX});way[amenity=cinema][open_air=yes]({BBOX}););out center;` },
  { key: 'rooftop_bar', group: 'nightlife', query: `[out:json][timeout:30];(node[amenity=bar][outdoor_seating=rooftop]({BBOX});way[amenity=bar][outdoor_seating=rooftop]({BBOX});node[amenity=restaurant][outdoor_seating=rooftop]({BBOX});way[amenity=restaurant][outdoor_seating=rooftop]({BBOX}););out center;` },
  { key: 'vegan', group: 'food_drink', query: `[out:json][timeout:30];(node["diet:vegan"=only]({BBOX});way["diet:vegan"=only]({BBOX});node[cuisine=vegan]({BBOX});way[cuisine=vegan]({BBOX}););out center;` },
  { key: 'wochenmarkt', group: 'food_drink', query: `[out:json][timeout:30];(node[amenity=marketplace][name~"[Ww]ochen",i]({BBOX});way[amenity=marketplace][name~"[Ww]ochen",i]({BBOX}););out center;` },
  { key: 'social_facility', group: 'services', query: `[out:json][timeout:30];(node[social_facility]({BBOX});way[social_facility]({BBOX}););out center;` },
  { key: 'nette_toilette', group: 'services', query: `[out:json][timeout:30];(node[amenity=toilets]["toilets:scheme"=nette_toilette]({BBOX}););out center;` },
  { key: 'pet_shop', group: 'shopping', query: `[out:json][timeout:30];(node[shop=pet]({BBOX});way[shop=pet]({BBOX}););out center;` },
  { key: 'spaeti', group: 'quirky', query: `[out:json][timeout:60];(node[shop=kiosk]({BBOX});way[shop=kiosk]({BBOX});node[shop=convenience][name~"[Ss]pät",i]({BBOX}););out center;` },
  { key: 'tattoo', group: 'quirky', query: `[out:json][timeout:30];(node[shop=tattoo]({BBOX});way[shop=tattoo]({BBOX}););out center;` },
  { key: 'repair_cafe', group: 'quirky', query: `[out:json][timeout:30];(node[leisure=hackerspace]({BBOX});way[leisure=hackerspace]({BBOX});node[repair=yes]({BBOX});way[repair=yes]({BBOX}););out center;` },
  { key: 'mural', group: 'quirky', query: `[out:json][timeout:30];(node[artwork_type=mural]({BBOX});way[artwork_type=mural]({BBOX}););out center;` },
  // Second batch (27 new categories)
  { key: 'clothes', group: 'shopping', query: `[out:json][timeout:60];(node[shop=clothes]({BBOX});way[shop=clothes]({BBOX}););out center;` },
  { key: 'electronics', group: 'shopping', query: `[out:json][timeout:30];(node[shop=electronics]({BBOX});way[shop=electronics]({BBOX}););out center;` },
  { key: 'hardware', group: 'shopping', query: `[out:json][timeout:30];(node[shop=hardware]({BBOX});way[shop=hardware]({BBOX});node[shop=doityourself]({BBOX});way[shop=doityourself]({BBOX}););out center;` },
  { key: 'shoes', group: 'shopping', query: `[out:json][timeout:30];(node[shop=shoes]({BBOX});way[shop=shoes]({BBOX}););out center;` },
  { key: 'jewelry', group: 'shopping', query: `[out:json][timeout:30];(node[shop=jewelry]({BBOX});way[shop=jewelry]({BBOX});node[shop=jewellery]({BBOX});way[shop=jewellery]({BBOX}););out center;` },
  { key: 'furniture', group: 'shopping', query: `[out:json][timeout:30];(node[shop=furniture]({BBOX});way[shop=furniture]({BBOX}););out center;` },
  { key: 'mobile_phone', group: 'shopping', query: `[out:json][timeout:30];(node[shop=mobile_phone]({BBOX});way[shop=mobile_phone]({BBOX}););out center;` },
  { key: 'optician', group: 'services', query: `[out:json][timeout:30];(node[shop=optician]({BBOX});way[shop=optician]({BBOX}););out center;` },
  { key: 'bank', group: 'services', query: `[out:json][timeout:60];(node[amenity=bank]({BBOX});way[amenity=bank]({BBOX}););out center;` },
  { key: 'fuel', group: 'services', query: `[out:json][timeout:30];(node[amenity=fuel]({BBOX});way[amenity=fuel]({BBOX}););out center;` },
  { key: 'car_wash', group: 'services', query: `[out:json][timeout:30];(node[amenity=car_wash]({BBOX});way[amenity=car_wash]({BBOX}););out center;` },
  { key: 'clinic', group: 'services', query: `[out:json][timeout:30];(node[amenity=clinic]({BBOX});way[amenity=clinic]({BBOX}););out center;` },
  { key: 'fire_station', group: 'services', query: `[out:json][timeout:30];(node[amenity=fire_station]({BBOX});way[amenity=fire_station]({BBOX}););out center;` },
  { key: 'townhall', group: 'services', query: `[out:json][timeout:30];(node[amenity=townhall]({BBOX});way[amenity=townhall]({BBOX}););out center;` },
  { key: 'hairdresser', group: 'services', query: `[out:json][timeout:60];(node[shop=hairdresser]({BBOX});way[shop=hairdresser]({BBOX}););out center;` },
  { key: 'beauty_salon', group: 'services', query: `[out:json][timeout:30];(node[shop=beauty]({BBOX});way[shop=beauty]({BBOX}););out center;` },
  { key: 'car_rental', group: 'transport', query: `[out:json][timeout:30];(node[amenity=car_rental]({BBOX});way[amenity=car_rental]({BBOX}););out center;` },
  { key: 'deli', group: 'food_drink', query: `[out:json][timeout:30];(node[shop=deli]({BBOX});way[shop=deli]({BBOX});node[shop=delicatessen]({BBOX});way[shop=delicatessen]({BBOX}););out center;` },
  { key: 'butcher', group: 'food_drink', query: `[out:json][timeout:30];(node[shop=butcher]({BBOX});way[shop=butcher]({BBOX}););out center;` },
  { key: 'yoga', group: 'sports', query: `[out:json][timeout:30];(node[sport=yoga]({BBOX});way[sport=yoga]({BBOX});node[leisure=yoga]({BBOX}););out center;` },
  { key: 'dance_studio', group: 'sports', query: `[out:json][timeout:30];(node[leisure=dance]({BBOX});way[leisure=dance]({BBOX});node[amenity=dance_school]({BBOX});way[amenity=dance_school]({BBOX}););out center;` },
  { key: 'amusement_arcade', group: 'quirky', query: `[out:json][timeout:30];(node[leisure=amusement_arcade]({BBOX});way[leisure=amusement_arcade]({BBOX}););out center;` },
  { key: 'school', group: 'education', query: `[out:json][timeout:60];(way[amenity=school]({BBOX});node[amenity=school]({BBOX}););out center;` },
  { key: 'college', group: 'education', query: `[out:json][timeout:30];(node[amenity=college]({BBOX});way[amenity=college]({BBOX}););out center;` },
  { key: 'driving_school', group: 'education', query: `[out:json][timeout:30];(node[amenity=driving_school]({BBOX});way[amenity=driving_school]({BBOX}););out center;` },
  { key: 'music_school', group: 'education', query: `[out:json][timeout:30];(node[amenity=music_school]({BBOX});way[amenity=music_school]({BBOX}););out center;` },
  { key: 'picnic_site', group: 'nature', query: `[out:json][timeout:30];(node[tourism=picnic_site]({BBOX});way[tourism=picnic_site]({BBOX});node[leisure=picnic_table]({BBOX}););out center;` },
]

async function fetchOverpass(query) {
  const body = `data=${encodeURIComponent(query)}`
  const res = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`)
  return res.json()
}

function escapeSQL(s) {
  if (s === null || s === undefined) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}

async function ingestCategory(cat) {
  const query = cat.query.replace(/\{BBOX\}/g, BERLIN_BBOX)
  console.log(`  Fetching ${cat.key} from Overpass...`)

  let data
  try {
    data = await fetchOverpass(query)
  } catch (e) {
    console.log(`  ❌ ${cat.key}: Overpass error: ${e.message}`)
    return 0
  }

  const elements = data.elements || []
  if (elements.length === 0) {
    console.log(`  ⚠️  ${cat.key}: 0 results`)
    return 0
  }

  // Build SQL statements in batches
  const rows = []
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!lat || !lng) continue

    const id = `${el.type}/${el.id}`
    const name = el.tags?.name ?? null
    const geohash = encodeGeohash(lat, lng)
    const region = 'berlin'
    const address = buildAddress(el.tags)
    const website = el.tags?.website ?? el.tags?.['contact:website'] ?? null
    const phone = el.tags?.phone ?? el.tags?.['contact:phone'] ?? null
    const opening_hours = el.tags?.opening_hours ?? null
    const description = el.tags?.description ?? null
    const operator = el.tags?.operator ?? null
    const tags_json = extractExtraTags(el.tags)
    const image_url = resolveImageUrl(el.tags)

    rows.push(
      `(${escapeSQL(id)}, ${escapeSQL(cat.group)}, ${escapeSQL(cat.key)}, ${escapeSQL(name)}, ` +
      `${lat}, ${lng}, ${escapeSQL(geohash)}, ${escapeSQL(region)}, ${escapeSQL(address)}, ` +
      `${escapeSQL(website)}, ${escapeSQL(phone)}, ${escapeSQL(opening_hours)}, ` +
      `${escapeSQL(description)}, ${escapeSQL(operator)}, ${escapeSQL(tags_json)}, ` +
      `${escapeSQL(image_url)}, datetime('now'))`
    )
  }

  // Insert in batches of 50 to stay within SQL size limits
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const sql = `INSERT OR REPLACE INTO pois (id, category_group, category, name, lat, lng, geohash, region, address, website, phone, opening_hours, description, operator, tags_json, image_url, refreshed_at) VALUES ${batch.join(',\n')};`

    // Write SQL to temp file to avoid shell escaping issues
    const tmpFile = `/tmp/poi-batch-${cat.key}-${i}.sql`
    const { writeFileSync } = await import('fs')
    writeFileSync(tmpFile, sql)

    try {
      execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file="${tmpFile}"`, {
        stdio: 'pipe',
        cwd: process.cwd(),
        timeout: 30000,
      })
      inserted += batch.length
    } catch (e) {
      console.log(`  ⚠️  Batch ${i}-${i + batch.length} failed: ${e.message.slice(0, 100)}`)
    }

    // Clean up temp file
    try { const { unlinkSync } = await import('fs'); unlinkSync(tmpFile) } catch {}
  }

  console.log(`  ✅ ${cat.key}: ${inserted} POIs inserted`)
  return inserted
}

// Main
async function main() {
  console.log(`\n🔄 Ingesting ${CATEGORIES.length} new POI categories for Berlin...\n`)

  let totalInserted = 0
  let succeeded = 0

  for (const cat of CATEGORIES) {
    try {
      const count = await ingestCategory(cat)
      totalInserted += count
      if (count > 0) succeeded++
      // Rate-limit Overpass requests
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) {
      console.log(`  ❌ ${cat.key}: ${e.message}`)
    }
  }

  console.log(`\n✅ Done! ${succeeded}/${CATEGORIES.length} categories, ${totalInserted.toLocaleString()} total POIs inserted`)
}

main().catch(e => { console.error(e); process.exit(1) })
