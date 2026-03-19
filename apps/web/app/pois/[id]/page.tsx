import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchPOIDetail } from '@/lib/opendata'
import { getPOILabel } from '@/lib/poi-config'
import { POIPageClient } from './POIPageClient'

export const revalidate = 3600

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const poi = await fetchPOIDetail(id)
    const label = getPOILabel(poi.category_group, poi.category)
    return {
      title:       `${poi.name ?? label} — KulturPulse`,
      description: [poi.description, label, poi.address, poi.region].filter(Boolean).join(' · '),
    }
  } catch {
    return { title: 'POI — KulturPulse' }
  }
}

export default async function POIPage({ params }: Props) {
  const { id } = await params
  let poi
  try {
    poi = await fetchPOIDetail(id)
  } catch {
    notFound()
  }

  const label = getPOILabel(poi.category_group, poi.category)
  const extraTags: Record<string, string> = poi.tags_json ? JSON.parse(poi.tags_json) : {}

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
        <span className="text-xs text-gray-400 capitalize">{label}</span>
        <span className="text-[10px] border border-gray-300 px-1.5 py-0.5 text-gray-500 uppercase">
          {poi.region}
        </span>
      </div>

      {poi.image_url && (
        <div className="max-w-2xl mx-auto mt-6 px-4">
          <div className="border-2 border-black overflow-hidden">
            <img
              src={poi.image_url}
              alt={poi.name ?? label}
              className="w-full h-auto object-cover max-h-[360px]"
            />
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Name + category badges */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block px-1.5 py-0.5 border-2 border-black text-[10px] font-bold bg-white uppercase">
              {label}
            </span>
            <span className="inline-block px-1.5 py-0.5 border border-gray-300 text-[10px] text-gray-500 uppercase">
              {poi.category_group.replace('_', ' ')}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold leading-tight text-gray-900">
            {poi.name ?? `Unnamed ${label}`}
          </h1>
        </div>

        {/* Description */}
        {poi.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{poi.description}</p>
        )}

        {/* Address + phone */}
        {(poi.address || poi.phone) && (
          <div className="border-2 border-black p-3 mb-4 text-sm space-y-0.5">
            {poi.address && <p className="font-mono text-gray-700">{poi.address}</p>}
            {poi.phone && (
              <a
                href={`tel:${poi.phone.replace(/\s/g, '')}`}
                className="text-xs text-gray-600 hover:text-black font-mono block mt-1"
              >
                {poi.phone}
              </a>
            )}
          </div>
        )}

        {/* Opening hours */}
        {poi.opening_hours && (
          <div className="border-2 border-black p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Opening Hours</p>
            <p className="text-xs text-gray-700 font-mono">{poi.opening_hours}</p>
          </div>
        )}

        {/* Website */}
        {poi.website && (
          <div className="mb-4">
            <a
              href={poi.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 underline break-all hover:text-blue-800"
            >
              {poi.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}

        {/* Operator */}
        {poi.operator && (
          <p className="text-xs text-gray-500 mb-4">Operator: {poi.operator}</p>
        )}

        {/* Extra OSM tags */}
        {Object.keys(extraTags).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {Object.entries(extraTags).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 border border-gray-300 text-[10px] text-gray-500 font-mono">
                {k}: {v}
              </span>
            ))}
          </div>
        )}

        {/* Client-side interactive section */}
        <POIPageClient
          id={poi.id}
          lat={poi.lat}
          lng={poi.lng}
          name={poi.name ?? `Unnamed ${label}`}
          category={poi.category}
          categoryGroup={poi.category_group}
        />
      </div>
    </main>
  )
}
