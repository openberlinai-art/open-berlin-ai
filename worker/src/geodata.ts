import type { Env } from './types'

const WFS_BASE = 'https://gdi.berlin.de/services/wfs/gruenanlagen'

function buildWFSUrl(typeName: string): string {
  return `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeName}&outputFormat=application/json&SRSNAME=EPSG:4326`
}

async function fetchWFS(typeName: string): Promise<string> {
  const res = await fetch(buildWFSUrl(typeName))
  if (!res.ok) throw new Error(`WFS ${typeName} returned ${res.status}`)
  return res.text()
}

function centroidOfRing(ring: number[][]): [number, number] {
  let x = 0, y = 0
  for (const p of ring) { x += p[0]; y += p[1] }
  return [x / ring.length, y / ring.length]
}

type AnyFeatureCollection = {
  type: string
  features: Array<{
    type: string
    geometry: { type: string; coordinates: unknown }
    properties: Record<string, unknown>
  }>
}

function polygonsToPoints(geojsonText: string): string {
  const fc = JSON.parse(geojsonText) as AnyFeatureCollection
  const features = fc.features
    .map(f => {
      const geom = f.geometry
      let ring: number[][] | null = null
      if (geom.type === 'Polygon') {
        ring = (geom.coordinates as number[][][])[0]
      } else if (geom.type === 'MultiPolygon') {
        const polys = geom.coordinates as number[][][][]
        ring = polys.reduce((best, poly) =>
          poly[0].length > best.length ? poly[0] : best, polys[0][0])
      }
      if (!ring?.length) return null
      const [x, y] = centroidOfRing(ring)
      if (!isFinite(x) || !isFinite(y)) return null
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [x, y] },
        properties: f.properties,
      }
    })
    .filter(Boolean)
  return JSON.stringify({ type: 'FeatureCollection', features })
}

/**
 * Fetches parks and playgrounds GeoJSON from Berlin GDI WFS,
 * stores full polygons AND centroid points in R2.
 * Centroid files are ~100x smaller and used for map pins.
 */
export async function refreshGeodata(env: Env): Promise<void> {
  const [parksJson, playgroundsJson] = await Promise.all([
    fetchWFS('gruenanlagen:gruenanlagen'),
    fetchWFS('gruenanlagen:spielplaetze'),
  ])

  const parksPoints       = polygonsToPoints(parksJson)
  const playgroundsPoints = polygonsToPoints(playgroundsJson)

  await Promise.all([
    env.GEODATA.put('parks.geojson', parksJson, {
      httpMetadata: { contentType: 'application/json' },
    }),
    env.GEODATA.put('playgrounds.geojson', playgroundsJson, {
      httpMetadata: { contentType: 'application/json' },
    }),
    env.GEODATA.put('parks-points.geojson', parksPoints, {
      httpMetadata: { contentType: 'application/json' },
    }),
    env.GEODATA.put('playgrounds-points.geojson', playgroundsPoints, {
      httpMetadata: { contentType: 'application/json' },
    }),
  ])

  console.log('[geodata] parks and playgrounds refreshed in R2')
}
