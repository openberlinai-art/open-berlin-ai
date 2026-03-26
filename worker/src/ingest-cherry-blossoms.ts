/**
 * Fetches cherry blossom tree locations from Berlin's Baumkataster (tree registry)
 * via WFS and stores as GeoJSON in R2.
 *
 * Data source: gdi.berlin.de/services/wfs/baumbestand
 * Filters for Prunus serrulata (ornamental cherry) from both street and park trees.
 */

import type { Env } from './types'

const WFS_BASE = 'https://gdi.berlin.de/services/wfs/baumbestand'
const PAGE_SIZE = 2000

interface WFSFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, unknown>
}

interface WFSResponse {
  type: 'FeatureCollection'
  features: WFSFeature[]
  numberMatched?: number
  numberReturned?: number
}

function buildUrl(layer: string, startIndex: number): string {
  const filter = encodeURIComponent("art_bot LIKE '%serrulata%'")
  return `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=baumbestand:${layer}&outputFormat=json&srsName=EPSG:4326&CQL_FILTER=${filter}&count=${PAGE_SIZE}&startIndex=${startIndex}`
}

async function fetchAllPages(layer: string): Promise<WFSFeature[]> {
  const all: WFSFeature[] = []
  let startIndex = 0

  while (true) {
    const res = await fetch(buildUrl(layer, startIndex))
    if (!res.ok) {
      console.warn(`[cherry] WFS ${layer} page ${startIndex} returned ${res.status}`)
      break
    }
    const data = await res.json() as WFSResponse
    if (!data.features?.length) break
    all.push(...data.features)
    if (data.features.length < PAGE_SIZE) break
    startIndex += PAGE_SIZE
  }

  return all
}

export async function ingestCherryBlossoms(env: Env): Promise<number> {
  console.log('[cherry] fetching from WFS…')

  const [streetTrees, parkTrees] = await Promise.all([
    fetchAllPages('strassenbaeume'),
    fetchAllPages('anlagenbaeume'),
  ])

  console.log(`[cherry] raw: ${streetTrees.length} street + ${parkTrees.length} park trees`)

  // Normalize to a clean GeoJSON with only the fields we need
  const features = [...streetTrees, ...parkTrees]
    .filter(f => f.geometry?.coordinates?.length === 2)
    .map(f => {
      const p = f.properties
      return {
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          id:        p.gisid ?? `${f.geometry.coordinates[0]}_${f.geometry.coordinates[1]}`,
          name_de:   p.art_dtsch ?? 'Zierkirsche',
          name_bot:  p.art_bot ?? 'Prunus serrulata',
          height:    p.baumhoehe ?? null,
          age:       p.standalter ?? null,
          crown:     p.kronedurch ?? null,
          trunk:     p.stammumfg ?? null,
          planted:   p.pflanzjahr ?? null,
          street:    p.strname ?? p.namenr ?? null,
          district:  p.bezirk ?? null,
          type:      streetTrees.includes(f) ? 'street' : 'park',
        },
      }
    })

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  }

  const json = JSON.stringify(geojson)
  await env.GEODATA.put('cherry-blossoms.geojson', json, {
    httpMetadata: { contentType: 'application/json' },
  })

  console.log(`[cherry] stored ${features.length} cherry trees in R2`)
  return features.length
}
