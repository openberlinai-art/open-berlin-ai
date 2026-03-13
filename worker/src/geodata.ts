import type { Env } from './types'

const WFS_BASE = 'https://gdi.berlin.de/services/wfs/gruenanlagen'

// WFS 2.0 uses 'typeNames' (plural). Build URL without URLSearchParams to avoid
// percent-encoding of : and / that some WFS servers reject.
function buildWFSUrl(typeName: string): string {
  return `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeName}&outputFormat=application/json&SRSNAME=EPSG:4326`
}

async function fetchWFS(typeName: string): Promise<string> {
  const res = await fetch(buildWFSUrl(typeName))
  if (!res.ok) throw new Error(`WFS ${typeName} returned ${res.status}`)
  return res.text()
}

/**
 * Fetches parks and playgrounds GeoJSON from Berlin GDI WFS
 * and stores them in R2 under 'parks.geojson' / 'playgrounds.geojson'.
 */
export async function refreshGeodata(env: Env): Promise<void> {
  const [parksJson, playgroundsJson] = await Promise.all([
    fetchWFS('gruenanlagen:gruenanlagen'),
    fetchWFS('gruenanlagen:spielplaetze'),
  ])

  await Promise.all([
    env.GEODATA.put('parks.geojson', parksJson, {
      httpMetadata: { contentType: 'application/json' },
    }),
    env.GEODATA.put('playgrounds.geojson', playgroundsJson, {
      httpMetadata: { contentType: 'application/json' },
    }),
  ])

  console.log('[geodata] parks and playgrounds refreshed in R2')
}
