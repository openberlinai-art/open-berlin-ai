import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchLocation } from '@/lib/opendata'
import { VenuePageClient } from '@/components/VenuePageClient'
import VibeCheck from '@/components/VibeCheck'
import type { OpeningHour } from '@/lib/types'

export const revalidate = 86400

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const loc = await fetchLocation(id)
    return {
      title:       `${loc.name ?? 'Venue'} — KulturPulse`,
      description: [loc.description, loc.category, loc.address, loc.borough].filter(Boolean).join(' · '),
    }
  } catch {
    return { title: 'Venue — KulturPulse' }
  }
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function OpeningHoursBlock({ json }: { json: string }) {
  let hours: OpeningHour[] = []
  try { hours = JSON.parse(json) } catch { return null }
  if (!hours.length) return null
  // Sort by standard day order
  const sorted = [...hours].sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek))
  return (
    <div className="border-2 border-black p-3 mb-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Opening Hours</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {sorted.map((h, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-gray-500 w-24 shrink-0">{h.dayOfWeek.slice(0, 3)}</span>
            <span className="font-mono text-gray-800">{h.opens}–{h.closes}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccessibilityBlock({ json }: { json: string }) {
  let items: string[] = []
  try { items = JSON.parse(json) } catch { return null }
  if (!items.length) return null
  // Prettify codes like "WC_DIN_18024" → "WC DIN 18024", "Elevator" → "Elevator"
  const pretty = items.map(s => s.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'))
  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Accessibility</p>
      <div className="flex flex-wrap gap-1.5">
        {pretty.map((label, i) => (
          <span key={i} className="px-1.5 py-0.5 border border-black text-[10px] font-mono text-gray-700">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default async function LocationPage({ params }: Props) {
  const { id } = await params
  let loc
  try {
    loc = await fetchLocation(id)
  } catch {
    notFound()
  }

  const tags:       string[] = loc.tags       ? JSON.parse(loc.tags)       : []
  const extraLinks: Array<{ url: string; displayName?: string }> =
    loc.extra_links ? JSON.parse(loc.extra_links) : []
  const imageUrls:  string[] = (() => {
    try { return loc.image_urls ? JSON.parse(loc.image_urls) : [] } catch { return [] }
  })()

  // Normalize opening status label
  const openStatusLabel =
    loc.opening_status === 'location.opened'           ? 'Open'
    : loc.opening_status === 'location.closed'          ? 'Closed'
    : loc.opening_status === 'location.permanentlyClosed' ? 'Permanently Closed'
    : null

  const openStatusClass =
    loc.opening_status === 'location.opened'
      ? 'bg-black text-white border-black'
      : 'bg-white text-black border-black'

  return (
    <main className="min-h-screen bg-white font-sans">
      {/* ── Nav bar ── */}
      <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors"
        >
          ← Back to map
        </Link>
        <span className="text-xs text-gray-400 capitalize">{loc.category ?? 'Venue'}</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ── Name + category + opening status ── */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            {loc.category && (
              <span className="inline-block px-1.5 py-0.5 border-2 border-black text-[10px] font-bold bg-white uppercase">
                {loc.category}
              </span>
            )}
            {openStatusLabel && (
              <span className={`inline-block px-1.5 py-0.5 border-2 text-[10px] font-bold ${openStatusClass}`}>
                {openStatusLabel}
              </span>
            )}
            {loc.is_virtual === 1 && (
              <span className="inline-block px-1.5 py-0.5 border-2 border-blue-600 text-blue-700 text-[10px] font-bold bg-blue-50">
                Online
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold leading-tight text-gray-900">
            {loc.name ?? 'Unknown Venue'}
          </h1>
        </div>

        {/* ── Photo collage (Wikimedia Commons) ── */}
        {imageUrls.length > 0 && (
          <div className={`mb-5 gap-1 ${imageUrls.length === 1 ? 'block' : 'grid grid-cols-2'}`}>
            {imageUrls.map((src, i) => (
              <a
                key={i}
                href={src.replace('?width=800', '')}
                target="_blank"
                rel="noopener noreferrer"
                className={imageUrls.length === 3 && i === 0 ? 'row-span-2' : ''}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${loc.name ?? 'Venue'} photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-40 object-cover border-2 border-black hover:opacity-90 transition-opacity"
                  style={imageUrls.length === 3 && i === 0 ? { height: '100%' } : {}}
                />
              </a>
            ))}
            <p className="col-span-2 text-[9px] text-gray-300 mt-0.5">
              Photos via Wikimedia Commons
            </p>
          </div>
        )}

        {/* ── Description ── */}
        {loc.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            {loc.description}
          </p>
        )}

        {/* ── Address + borough + phone ── */}
        {(loc.address || loc.borough || loc.phone) && (
          <div className="border-2 border-black p-3 mb-4 text-sm space-y-0.5">
            {loc.address && <p className="font-mono text-gray-700">{loc.address}</p>}
            {loc.borough && <p className="text-xs text-gray-400">{loc.borough}</p>}
            {loc.phone && (
              <a
                href={`tel:${loc.phone.replace(/\s/g, '')}`}
                className="text-xs text-gray-600 hover:text-black font-mono block mt-1"
              >
                📞 {loc.phone}
              </a>
            )}
            {loc.contact_email && (
              <a
                href={`mailto:${loc.contact_email}`}
                className="text-xs text-gray-600 hover:text-black font-mono block mt-0.5"
              >
                ✉ {loc.contact_email}
              </a>
            )}
          </div>
        )}

        {/* ── Website + extra links ── */}
        {(loc.website || extraLinks.length > 0) && (
          <div className="mb-4 flex flex-wrap gap-3">
            {loc.website && (
              <a
                href={loc.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 underline break-all hover:text-blue-800"
              >
                {loc.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {extraLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 underline hover:text-black break-all"
              >
                {link.displayName ?? link.url.replace(/^https?:\/\//, '')}
              </a>
            ))}
          </div>
        )}

        {/* ── Get Directions + Street View ── */}
        {(loc.lat && loc.lng) && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}&travelmode=transit`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
            >
              ↗ Get Directions
            </a>
            <a
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.lat},${loc.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
            >
              Street View
            </a>
          </div>
        )}

        {/* ── Vibe Check ── */}
        {loc.id && (
          <div className="mb-4">
            <VibeCheck
              id={loc.id}
              name={loc.name ?? 'Venue'}
              category={loc.category ?? 'other'}
              borough={loc.borough ?? undefined}
              description={loc.description ?? undefined}
            />
          </div>
        )}

        {/* ── Opening hours ── */}
        {loc.opening_hours && <OpeningHoursBlock json={loc.opening_hours} />}

        {/* ── Accessibility ── */}
        {loc.accessibility && <AccessibilityBlock json={loc.accessibility} />}

        {/* ── Tags ── */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {tags.map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 border border-gray-300 text-[10px] text-gray-500 font-mono"
              >
                {tag.replace(/^location\.type\./i, '')}
              </span>
            ))}
          </div>
        )}

        {/* ── Client section: mini map + share + add-to-list + grouped events ── */}
        <VenuePageClient
          id={loc.id}
          lat={loc.lat}
          lng={loc.lng}
          name={loc.name ?? ''}
          events={loc.events}
          pastEvents={loc.pastEvents ?? []}
        />
      </div>
    </main>
  )
}
