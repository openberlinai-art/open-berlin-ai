#!/usr/bin/env node
// Local script to ingest batch 3 POI categories via Overpass → wrangler d1 execute
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
  'healthcare', 'office', 'shop',
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

// Categories to ingest — batch 3
const CATEGORIES = [
  // Health
  { key: 'physiotherapist', group: 'health', query: `[out:json][timeout:30];(node[healthcare=physiotherapist]({BBOX});way[healthcare=physiotherapist]({BBOX}););out center;` },
  { key: 'psychologist', group: 'health', query: `[out:json][timeout:30];(node[healthcare=psychotherapist]({BBOX});way[healthcare=psychotherapist]({BBOX});node[office=psychologist]({BBOX});way[office=psychologist]({BBOX}););out center;` },
  { key: 'midwife', group: 'health', query: `[out:json][timeout:30];(node[healthcare=midwife]({BBOX});way[healthcare=midwife]({BBOX}););out center;` },
  { key: 'speech_therapist', group: 'health', query: `[out:json][timeout:30];(node[healthcare=speech_therapist]({BBOX});way[healthcare=speech_therapist]({BBOX}););out center;` },
  { key: 'podiatrist', group: 'health', query: `[out:json][timeout:30];(node[healthcare=podiatrist]({BBOX});way[healthcare=podiatrist]({BBOX});node[healthcare=podology]({BBOX});way[healthcare=podology]({BBOX}););out center;` },
  { key: 'alternative_medicine', group: 'health', query: `[out:json][timeout:30];(node[healthcare=alternative]({BBOX});way[healthcare=alternative]({BBOX}););out center;` },
  { key: 'massage', group: 'health', query: `[out:json][timeout:30];(node[shop=massage]({BBOX});way[shop=massage]({BBOX}););out center;` },
  { key: 'hearing_aids', group: 'health', query: `[out:json][timeout:30];(node[shop=hearing_aids]({BBOX});way[shop=hearing_aids]({BBOX}););out center;` },

  // Craft
  { key: 'locksmith', group: 'craft', query: `[out:json][timeout:30];(node[shop=locksmith]({BBOX});way[shop=locksmith]({BBOX});node[craft=locksmith]({BBOX});way[craft=locksmith]({BBOX}););out center;` },
  { key: 'electrician', group: 'craft', query: `[out:json][timeout:30];(node[craft=electrician]({BBOX});way[craft=electrician]({BBOX}););out center;` },
  { key: 'plumber', group: 'craft', query: `[out:json][timeout:30];(node[craft=plumber]({BBOX});way[craft=plumber]({BBOX}););out center;` },
  { key: 'carpenter', group: 'craft', query: `[out:json][timeout:30];(node[craft=carpenter]({BBOX});way[craft=carpenter]({BBOX}););out center;` },
  { key: 'painter_craft', group: 'craft', query: `[out:json][timeout:30];(node[craft=painter]({BBOX});way[craft=painter]({BBOX}););out center;` },
  { key: 'photographer_studio', group: 'craft', query: `[out:json][timeout:30];(node[craft=photographer]({BBOX});way[craft=photographer]({BBOX}););out center;` },
  { key: 'printer', group: 'craft', query: `[out:json][timeout:30];(node[craft=printer]({BBOX});way[craft=printer]({BBOX});node[shop=copyshop]({BBOX});way[shop=copyshop]({BBOX}););out center;` },
  { key: 'tailor', group: 'craft', query: `[out:json][timeout:30];(node[shop=tailor]({BBOX});way[shop=tailor]({BBOX});node[craft=tailor]({BBOX});way[craft=tailor]({BBOX}););out center;` },
  { key: 'shoemaker', group: 'craft', query: `[out:json][timeout:30];(node[craft=shoemaker]({BBOX});way[craft=shoemaker]({BBOX}););out center;` },
  { key: 'goldsmith', group: 'craft', query: `[out:json][timeout:30];(node[craft=goldsmith]({BBOX});way[craft=goldsmith]({BBOX}););out center;` },
  { key: 'watchmaker', group: 'craft', query: `[out:json][timeout:30];(node[craft=watchmaker]({BBOX});way[craft=watchmaker]({BBOX}););out center;` },
  { key: 'glazier', group: 'craft', query: `[out:json][timeout:30];(node[craft=glazier]({BBOX});way[craft=glazier]({BBOX}););out center;` },
  { key: 'key_cutter', group: 'craft', query: `[out:json][timeout:30];(node[craft=key_cutter]({BBOX});way[craft=key_cutter]({BBOX}););out center;` },

  // Shopping batch 3
  { key: 'department_store', group: 'shopping', query: `[out:json][timeout:30];(node[shop=department_store]({BBOX});way[shop=department_store]({BBOX}););out center;` },
  { key: 'sports_shop', group: 'shopping', query: `[out:json][timeout:30];(node[shop=sports]({BBOX});way[shop=sports]({BBOX}););out center;` },
  { key: 'stationery', group: 'shopping', query: `[out:json][timeout:30];(node[shop=stationery]({BBOX});way[shop=stationery]({BBOX}););out center;` },
  { key: 'gift_shop', group: 'shopping', query: `[out:json][timeout:30];(node[shop=gift]({BBOX});way[shop=gift]({BBOX}););out center;` },
  { key: 'tobacco', group: 'shopping', query: `[out:json][timeout:30];(node[shop=tobacco]({BBOX});way[shop=tobacco]({BBOX}););out center;` },
  { key: 'newsagent', group: 'shopping', query: `[out:json][timeout:30];(node[shop=newsagent]({BBOX});way[shop=newsagent]({BBOX}););out center;` },
  { key: 'garden_centre', group: 'shopping', query: `[out:json][timeout:30];(node[shop=garden_centre]({BBOX});way[shop=garden_centre]({BBOX}););out center;` },
  { key: 'toy_shop', group: 'shopping', query: `[out:json][timeout:30];(node[shop=toys]({BBOX});way[shop=toys]({BBOX}););out center;` },
  { key: 'alcohol_shop', group: 'shopping', query: `[out:json][timeout:30];(node[shop=alcohol]({BBOX});way[shop=alcohol]({BBOX}););out center;` },
  { key: 'antiques', group: 'shopping', query: `[out:json][timeout:30];(node[shop=antiques]({BBOX});way[shop=antiques]({BBOX}););out center;` },
  { key: 'cosmetics', group: 'shopping', query: `[out:json][timeout:30];(node[shop=cosmetics]({BBOX});way[shop=cosmetics]({BBOX}););out center;` },
  { key: 'computer_shop', group: 'shopping', query: `[out:json][timeout:30];(node[shop=computer]({BBOX});way[shop=computer]({BBOX}););out center;` },
  { key: 'greengrocer', group: 'shopping', query: `[out:json][timeout:30];(node[shop=greengrocer]({BBOX});way[shop=greengrocer]({BBOX}););out center;` },
  { key: 'confectionery', group: 'shopping', query: `[out:json][timeout:30];(node[shop=confectionery]({BBOX});way[shop=confectionery]({BBOX}););out center;` },
  { key: 'art_shop', group: 'shopping', query: `[out:json][timeout:30];(node[shop=art]({BBOX});way[shop=art]({BBOX}););out center;` },

  // Food & Drink batch 3
  { key: 'pastry', group: 'food_drink', query: `[out:json][timeout:30];(node[shop=pastry]({BBOX});way[shop=pastry]({BBOX}););out center;` },
  { key: 'tea_house', group: 'food_drink', query: `[out:json][timeout:30];(node[shop=tea]({BBOX});way[shop=tea]({BBOX});node[amenity=cafe][cuisine=tea]({BBOX});way[amenity=cafe][cuisine=tea]({BBOX}););out center;` },
  { key: 'cheese_shop', group: 'food_drink', query: `[out:json][timeout:30];(node[shop=cheese]({BBOX});way[shop=cheese]({BBOX}););out center;` },
  { key: 'seafood', group: 'food_drink', query: `[out:json][timeout:30];(node[shop=seafood]({BBOX});way[shop=seafood]({BBOX}););out center;` },

  // Services batch 3
  { key: 'dry_cleaning', group: 'services', query: `[out:json][timeout:30];(node[shop=dry_cleaning]({BBOX});way[shop=dry_cleaning]({BBOX}););out center;` },
  { key: 'travel_agency', group: 'services', query: `[out:json][timeout:30];(node[shop=travel_agency]({BBOX});way[shop=travel_agency]({BBOX}););out center;` },
  { key: 'estate_agent', group: 'services', query: `[out:json][timeout:30];(node[office=estate_agent]({BBOX});way[office=estate_agent]({BBOX}););out center;` },
  { key: 'notary', group: 'services', query: `[out:json][timeout:30];(node[office=notary]({BBOX});way[office=notary]({BBOX}););out center;` },
  { key: 'insurance', group: 'services', query: `[out:json][timeout:30];(node[office=insurance]({BBOX});way[office=insurance]({BBOX}););out center;` },
  { key: 'lawyer', group: 'services', query: `[out:json][timeout:30];(node[office=lawyer]({BBOX});way[office=lawyer]({BBOX}););out center;` },
  { key: 'accountant', group: 'services', query: `[out:json][timeout:30];(node[office=accountant]({BBOX});way[office=accountant]({BBOX}););out center;` },
  { key: 'funeral_home', group: 'services', query: `[out:json][timeout:30];(node[amenity=funeral_hall]({BBOX});way[amenity=funeral_hall]({BBOX});node[shop=funeral_directors]({BBOX});way[shop=funeral_directors]({BBOX}););out center;` },
  { key: 'animal_shelter', group: 'services', query: `[out:json][timeout:30];(node[amenity=animal_shelter]({BBOX});way[amenity=animal_shelter]({BBOX}););out center;` },
  { key: 'childcare', group: 'services', query: `[out:json][timeout:30];(node[amenity=childcare]({BBOX});way[amenity=childcare]({BBOX}););out center;` },
  { key: 'internet_cafe', group: 'services', query: `[out:json][timeout:30];(node[amenity=internet_cafe]({BBOX});way[amenity=internet_cafe]({BBOX}););out center;` },

  // Transport batch 3
  { key: 'airport', group: 'transport', query: `[out:json][timeout:30];(node[aeroway=aerodrome]({BBOX});way[aeroway=aerodrome]({BBOX}););out center;` },
  { key: 'marina', group: 'transport', query: `[out:json][timeout:30];(node[leisure=marina]({BBOX});way[leisure=marina]({BBOX}););out center;` },

  // Sports batch 3
  { key: 'golf_course', group: 'sports', query: `[out:json][timeout:30];(node[leisure=golf_course]({BBOX});way[leisure=golf_course]({BBOX}););out center;` },
  { key: 'horse_riding', group: 'sports', query: `[out:json][timeout:30];(node[leisure=horse_riding]({BBOX});way[leisure=horse_riding]({BBOX}););out center;` },
  { key: 'tennis', group: 'sports', query: `[out:json][timeout:30];(node[leisure=pitch][sport=tennis]({BBOX});way[leisure=pitch][sport=tennis]({BBOX});node[sport=tennis]({BBOX}););out center;` },
  { key: 'martial_arts', group: 'sports', query: `[out:json][timeout:30];(node[sport=martial_arts]({BBOX});way[sport=martial_arts]({BBOX});node[leisure=dojo]({BBOX});way[leisure=dojo]({BBOX}););out center;` },
  { key: 'swimming_outdoor', group: 'sports', query: `[out:json][timeout:30];(node[leisure=swimming_area]({BBOX});way[leisure=swimming_area]({BBOX}););out center;` },

  // Nature batch 3
  { key: 'waterfall', group: 'nature', query: `[out:json][timeout:30];(node[waterway=waterfall]({BBOX});way[waterway=waterfall]({BBOX}););out center;` },
  { key: 'spring', group: 'nature', query: `[out:json][timeout:30];(node[natural=spring]({BBOX});way[natural=spring]({BBOX}););out center;` },
  { key: 'water_tower', group: 'nature', query: `[out:json][timeout:30];(node[man_made=water_tower]({BBOX});way[man_made=water_tower]({BBOX}););out center;` },
  { key: 'pier', group: 'nature', query: `[out:json][timeout:30];(node[man_made=pier]({BBOX});way[man_made=pier]({BBOX}););out center;` },

  // Heritage batch 3
  { key: 'tomb', group: 'heritage', query: `[out:json][timeout:30];(node[historic=tomb]({BBOX});way[historic=tomb]({BBOX}););out center;` },
  { key: 'boundary_stone', group: 'heritage', query: `[out:json][timeout:30];(node[historic=boundary_stone]({BBOX});way[historic=boundary_stone]({BBOX}););out center;` },
  { key: 'wayside_shrine', group: 'heritage', query: `[out:json][timeout:30];(node[historic=wayside_shrine]({BBOX});way[historic=wayside_shrine]({BBOX}););out center;` },
  { key: 'milestone_historic', group: 'heritage', query: `[out:json][timeout:30];(node[historic=milestone]({BBOX});way[historic=milestone]({BBOX}););out center;` },
  { key: 'locomotive', group: 'heritage', query: `[out:json][timeout:30];(node[historic=locomotive]({BBOX});way[historic=locomotive]({BBOX});node[historic=railway_car]({BBOX});way[historic=railway_car]({BBOX}););out center;` },
  { key: 'lighthouse', group: 'heritage', query: `[out:json][timeout:30];(node[man_made=lighthouse]({BBOX});way[man_made=lighthouse]({BBOX}););out center;` },

  // Quirky batch 3
  { key: 'observatory', group: 'quirky', query: `[out:json][timeout:30];(node[man_made=observatory]({BBOX});way[man_made=observatory]({BBOX});node[amenity=observatory]({BBOX});way[amenity=observatory]({BBOX}););out center;` },
  { key: 'clock_tower', group: 'quirky', query: `[out:json][timeout:30];(node[man_made=clock]({BBOX});way[man_made=clock]({BBOX});node[amenity=clock][support=tower]({BBOX}););out center;` },
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
  console.log(`\n🔄 Ingesting ${CATEGORIES.length} batch 3 POI categories for Berlin...\n`)

  let totalInserted = 0
  let succeeded = 0

  for (const cat of CATEGORIES) {
    try {
      const count = await ingestCategory(cat)
      totalInserted += count
      if (count > 0) succeeded++
      // Rate-limit Overpass requests (5s between requests)
      await new Promise(r => setTimeout(r, 5000))
    } catch (e) {
      console.log(`  ❌ ${cat.key}: ${e.message}`)
    }
  }

  console.log(`\n✅ Done! ${succeeded}/${CATEGORIES.length} categories, ${totalInserted.toLocaleString()} total POIs inserted`)
}

main().catch(e => { console.error(e); process.exit(1) })
