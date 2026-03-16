'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import JourneyWidget from './JourneyWidget'

const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false })

interface GreenspaceFeature {
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, string | null>
}

interface Props {
  feature:  GreenspaceFeature
  type:     'park' | 'playground'
}

export default function GreenspaceDetail({ feature, type }: Props) {
  const p    = feature.properties
  const name = p.namenr ?? p.name ?? 'Unnamed'
  const [lng, lat] = feature.geometry.coordinates

  const categoryColor = type === 'park' ? '#16a34a' : '#a21caf'
  const categoryLabel = type === 'park' ? 'Park' : 'Playground'

  return (
    <main className="min-h-screen bg-white font-sans">
      {/* Nav bar */}
      <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors"
        >
          ← Back to map
        </Link>
        <span className="text-xs text-gray-400 capitalize">{categoryLabel}</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Name + badges */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block px-1.5 py-0.5 border-2 text-[10px] font-bold uppercase"
              style={{ borderColor: categoryColor, color: categoryColor }}
            >
              {categoryLabel}
            </span>
            {p.objartname && (
              <span className="inline-block px-1.5 py-0.5 border-2 border-black text-[10px] font-bold bg-white uppercase">
                {p.objartname}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold leading-tight text-gray-900">{name}</h1>
        </div>

        {/* Borough + neighborhood */}
        {(p.bezirkname || p.ortstlname) && (
          <div className="border-2 border-black p-3 mb-4 text-sm space-y-0.5">
            {p.ortstlname && <p className="font-mono text-gray-700">{p.ortstlname}</p>}
            {p.bezirkname && p.bezirkname !== p.ortstlname && (
              <p className="text-xs text-gray-400">{p.bezirkname}</p>
            )}
          </div>
        )}

        {/* Built year */}
        {p.baujahr && (
          <p className="text-xs text-gray-400 mb-4">Built {p.baujahr}</p>
        )}

        {/* Route planner */}
        <div className="mb-5">
          <JourneyWidget toLat={lat} toLng={lng} />
        </div>

        {/* Mini-map */}
        <div className="mb-4">
          <VenueMap lat={lat} lng={lng} name={name} />
        </div>

        {/* Get Directions + Street View */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
          >
            ↗ Get Directions
          </a>
          <a
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
          >
            Street View
          </a>
        </div>
      </div>
    </main>
  )
}
