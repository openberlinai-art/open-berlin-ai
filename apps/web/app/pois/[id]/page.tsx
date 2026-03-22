import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchPOIDetail } from '@/lib/opendata'
import { getPOILabel } from '@/lib/poi-config'
import { POIPageClient } from './POIPageClient'
import FavoriteButton from '@/components/FavoriteButton'
import ViewTracker from '@/components/ViewTracker'

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
      title:       `${poi.name ?? label} — Citizen.Berlin`,
      description: [poi.description, label, poi.address, poi.region].filter(Boolean).join(' · '),
      openGraph: {
        title: `${poi.name ?? label} — Citizen.Berlin`,
        description: [poi.description, label, poi.address, poi.region].filter(Boolean).join(' · '),
        images: [{ url: `/api/og?type=poi&id=${id}`, width: 1200, height: 630 }],
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${poi.name ?? label} — Citizen.Berlin`,
        images: [`/api/og?type=poi&id=${id}`],
      },
    }
  } catch {
    return { title: 'POI — Citizen.Berlin' }
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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: poi.name ?? label,
    ...(poi.address && { address: poi.address }),
    ...(poi.description && { description: poi.description }),
    geo: { '@type': 'GeoCoordinates', latitude: poi.lat, longitude: poi.lng },
    url: `https://citizen.berlin/pois/${id}`,
    image: `/api/og?type=poi&id=${id}`,
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ViewTracker itemType="poi" itemId={id} />
      {/* Nav bar */}
      <div className="border-b-2 border-[var(--border-primary)] px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-xs font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] transition-colors"
        >
          ← Back to map
        </Link>
        <span className="text-xs text-[var(--text-muted)] capitalize">{label}</span>
        <span className="text-[10px] border border-[var(--border-secondary)] px-1.5 py-0.5 text-[var(--text-secondary)] uppercase">
          {poi.region}
        </span>
      </div>

      {poi.image_url && (
        <div className="max-w-2xl mx-auto mt-6 px-4">
          <div className="border-2 border-[var(--border-primary)] overflow-hidden">
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
            <span className="inline-block px-1.5 py-0.5 border-2 border-[var(--border-primary)] text-[10px] font-bold bg-[var(--bg-primary)] uppercase">
              {label}
            </span>
            <span className="inline-block px-1.5 py-0.5 border border-[var(--border-secondary)] text-[10px] text-[var(--text-secondary)] uppercase">
              {poi.category_group.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <h1 className="text-2xl font-extrabold leading-tight text-[var(--text-primary)] flex-1">
              {poi.name ?? `Unnamed ${label}`}
            </h1>
            <FavoriteButton type="poi" id={poi.id} size={20} className="mt-1" />
          </div>
        </div>

        {/* Description */}
        {poi.description && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">{poi.description}</p>
        )}

        {/* Address + phone */}
        {(poi.address || poi.phone) && (
          <div className="border-2 border-[var(--border-primary)] p-3 mb-4 text-sm space-y-0.5">
            {poi.address && <p className="font-mono text-[var(--text-secondary)]">{poi.address}</p>}
            {poi.phone && (
              <a
                href={`tel:${poi.phone.replace(/\s/g, '')}`}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono block mt-1"
              >
                {poi.phone}
              </a>
            )}
          </div>
        )}

        {/* Opening hours */}
        {poi.opening_hours && (
          <div className="border-2 border-[var(--border-primary)] p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1">Opening Hours</p>
            <p className="text-xs text-[var(--text-secondary)] font-mono">{poi.opening_hours}</p>
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
          <p className="text-xs text-[var(--text-secondary)] mb-4">Operator: {poi.operator}</p>
        )}

        {/* Extra OSM tags */}
        {Object.keys(extraTags).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {Object.entries(extraTags).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 border border-[var(--border-secondary)] text-[10px] text-[var(--text-secondary)] font-mono">
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
