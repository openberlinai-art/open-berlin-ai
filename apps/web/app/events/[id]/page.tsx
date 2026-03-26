import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchEvent } from '@/lib/opendata'
import { EventPageClient } from '@/components/EventPageClient'
import FavoriteButton from '@/components/FavoriteButton'
import TranslatedText from '@/components/TranslatedText'
import ViewTracker from '@/components/ViewTracker'

export const revalidate = 300

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const ev = await fetchEvent(id)
    return {
      title:       `${ev.title ?? 'Event'} — Citizen.Berlin`,
      description: [ev.category, ev.location_name, ev.borough].filter(Boolean).join(' · '),
      openGraph: {
        title: `${ev.title ?? 'Event'} — Citizen.Berlin`,
        description: [ev.category, ev.location_name, ev.borough].filter(Boolean).join(' · '),
        images: [{ url: `/api/og?type=event&id=${id}`, width: 1200, height: 630 }],
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${ev.title ?? 'Event'} — Citizen.Berlin`,
        images: [`/api/og?type=event&id=${id}`],
      },
    }
  } catch {
    return { title: 'Event — Citizen.Berlin' }
  }
}

function formatDateRange(start: string, end: string | null): string {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start)
}

function formatTime(t: string | null): string | null {
  if (!t) return null
  return t.slice(0, 5)
}

export default async function EventPage({ params }: Props) {
  const { id } = await params
  let ev
  try {
    ev = await fetchEvent(id)
  } catch {
    notFound()
  }

  const scheduleLabel =
    ev.schedule_status === 'cancelled'    ? 'Cancelled'
    : ev.schedule_status === 'postponed'  ? 'Postponed'
    : ev.schedule_status === 'rescheduled'? 'Rescheduled'
    : null

  const scheduleClass =
    ev.schedule_status === 'cancelled'
      ? 'bg-red-600 text-white border-red-600'
      : 'bg-yellow-300 text-black border-black'

  const priceLabel =
    ev.price_type === 'free'
      ? 'Free'
      : ev.price_min != null
        ? `€${ev.price_min}${ev.price_max != null && ev.price_max !== ev.price_min ? `–€${ev.price_max}` : ''}`
        : ev.price_type === 'paid'
          ? 'Paid'
          : ev.admission_link
            ? 'Ticketed'
            : null

  const langs: string[] = (() => { try { return ev.languages ? JSON.parse(ev.languages) : [] } catch { return [] } })()
  const nonDeLangs = langs.filter(l => l !== 'de')
  const imageUrls: string[] = (() => { try { return ev.image_urls ? [...new Set(JSON.parse(ev.image_urls) as string[])] : [] } catch { return [] } })()
  const tags: string[] = (() => { try { return ev.tags ? JSON.parse(ev.tags) : [] } catch { return [] } })()

  const eventStatusMap: Record<string, string> = {
    cancelled: 'https://schema.org/EventCancelled',
    postponed: 'https://schema.org/EventPostponed',
    rescheduled: 'https://schema.org/EventRescheduled',
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    startDate: ev.time_start ? `${ev.date_start}T${ev.time_start}` : ev.date_start,
    ...(ev.date_end && { endDate: ev.time_end ? `${ev.date_end}T${ev.time_end}` : ev.date_end }),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(ev.schedule_status && eventStatusMap[ev.schedule_status] && {
      eventStatus: eventStatusMap[ev.schedule_status],
    }),
    location: ev.location_name ? {
      '@type': 'Place',
      name: ev.location_name,
      ...(ev.address && {
        address: {
          '@type': 'PostalAddress',
          streetAddress: ev.address,
          addressLocality: 'Berlin',
          addressCountry: 'DE',
        },
      }),
      ...(ev.lat && ev.lng && {
        geo: { '@type': 'GeoCoordinates', latitude: ev.lat, longitude: ev.lng },
      }),
    } : undefined,
    ...(ev.description && { description: ev.description }),
    ...(ev.price_type === 'free' && { isAccessibleForFree: true }),
    ...(ev.price_type === 'paid' && ev.price_min != null && {
      offers: {
        '@type': 'Offer',
        price: ev.price_min,
        ...(ev.price_max != null && ev.price_max !== ev.price_min && { highPrice: ev.price_max }),
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        ...(ev.admission_link && { url: ev.admission_link }),
      },
    }),
    url: `https://citizen.berlin/events/${id}`,
    ...(imageUrls.length > 0 ? { image: imageUrls } : { image: `/api/og?type=event&id=${id}` }),
  }

  return (
    <main className="min-h-screen bg-white font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ViewTracker itemType="event" itemId={id} />
      {/* Nav bar */}
      <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors"
        >
          ← Back to map
        </Link>
        <span className="text-xs text-gray-400 capitalize">{ev.category ?? 'Event'}</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Title + badges */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {ev.category && (
              <span className="inline-block px-1.5 py-0.5 border-2 border-black text-[10px] font-bold bg-white uppercase">
                {ev.category}
              </span>
            )}
            {scheduleLabel && (
              <span className={`inline-block px-1.5 py-0.5 border-2 text-[10px] font-bold ${scheduleClass}`}>
                {scheduleLabel}
              </span>
            )}
            {priceLabel && (
              <span className={`inline-block px-1.5 py-0.5 border-2 border-black text-[10px] font-bold ${ev.price_type === 'free' ? 'bg-black text-white' : 'bg-white text-black'}`}>
                {priceLabel}
              </span>
            )}
            {ev.registration_type === 'required' && (
              <span className="inline-block px-1.5 py-0.5 border-2 border-orange-500 text-orange-700 text-[10px] font-bold bg-orange-50">
                Registration required
              </span>
            )}
            {nonDeLangs.map(l => (
              <span key={l} className="inline-block px-1.5 py-0.5 border-2 border-blue-600 text-blue-700 text-[10px] font-bold bg-blue-50 uppercase">
                {l}
              </span>
            ))}
            {tags.filter(t => t !== ev.category).map(t => (
              <span key={t} className="inline-block px-1.5 py-0.5 border border-gray-300 text-[10px] text-gray-500">
                {t}
              </span>
            ))}
          </div>
          <div className="flex items-start gap-2">
            <h1 className="text-2xl font-extrabold leading-tight text-gray-900 flex-1">
              <TranslatedText text={ev.title ?? 'Untitled Event'} />
            </h1>
            <FavoriteButton type="event" id={id} size={20} className="mt-1" />
          </div>
        </div>

        {/* Date/time */}
        <div className="border-2 border-black p-3 mb-4 text-sm space-y-0.5">
          <p className="font-mono text-gray-700">{formatDateRange(ev.date_start, ev.date_end)}</p>
          {(ev.time_start || ev.door_time) && (
            <p className="text-xs text-gray-500">
              {ev.door_time && <span>Doors: {formatTime(ev.door_time)}</span>}
              {ev.time_start && ev.door_time && <span className="mx-2">·</span>}
              {ev.time_start && <span>Start: {formatTime(ev.time_start)}</span>}
              {ev.time_end   && <span className="ml-2 text-gray-400">– {formatTime(ev.time_end)}</span>}
            </p>
          )}
        </div>

        {/* Venue */}
        {ev.location_name && (
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Venue</p>
            {ev.location_id ? (
              <Link
                href={`/locations/${ev.location_id}`}
                className="text-sm font-bold text-black underline hover:text-gray-600"
              >
                {ev.location_name}
              </Link>
            ) : (
              <p className="text-sm font-bold text-gray-800">{ev.location_name}</p>
            )}
            {(ev.address || ev.borough) && (
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                {[ev.address, ev.borough].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Photo collage */}
        {imageUrls.length > 0 && (
          <div className={`mb-5 gap-1 ${imageUrls.length === 1 ? 'block' : 'grid grid-cols-2'}`}>
            {imageUrls.map((src, i) => (
              <a
                key={i}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className={imageUrls.length === 3 && i === 0 ? 'row-span-2' : ''}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${ev.title ?? 'Event'} photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-40 object-cover border-2 border-black hover:opacity-90 transition-opacity"
                  style={imageUrls.length === 3 && i === 0 ? { height: '100%' } : {}}
                />
              </a>
            ))}
            {ev.image_credit && (
              <p className="col-span-full text-[9px] text-gray-400 mt-0.5">
                Source: {ev.image_credit}
              </p>
            )}
          </div>
        )}

        {/* Description */}
        {ev.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            <TranslatedText text={ev.description} />
          </p>
        )}

        {/* Please note */}
        {ev.please_note && (
          <div className="border-l-4 border-black pl-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Please note</p>
            <p className="text-xs text-gray-600">{ev.please_note}</p>
          </div>
        )}

        {/* Admission note */}
        {ev.admission_note && (
          <div className="border-l-4 border-black pl-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Admission info</p>
            <p className="text-xs text-gray-600">{ev.admission_note}</p>
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-3 mb-6">
          {ev.admission_link && (
            <a
              href={ev.admission_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white transition-colors"
            >
              Buy tickets →
            </a>
          )}
          {ev.source_url && (
            <a
              href={ev.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white transition-colors"
            >
              Source →
            </a>
          )}
          {ev.source_links && (() => {
            try {
              const links = JSON.parse(ev.source_links) as Array<{ url: string; displayName?: string }>
              return links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white transition-colors"
                >
                  {l.displayName ?? 'More info'} →
                </a>
              ))
            } catch { return null }
          })()}
        </div>

        {/* Related events: More at this venue */}
        {ev.related?.sameVenue && ev.related.sameVenue.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">More at this venue</p>
            <div className="border-2 border-black divide-y-2 divide-black">
              {ev.related.sameVenue.map(r => (
                <Link
                  key={r.id}
                  href={`/events/${r.id}`}
                  className="block px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-xs font-bold text-gray-900 leading-snug">{r.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {new Date(r.date_start + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {r.time_start ? ` · ${r.time_start.slice(0, 5)}` : ''}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related events: Also on this date */}
        {ev.related?.sameDate && ev.related.sameDate.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Also on this date</p>
            <div className="border-2 border-black divide-y-2 divide-black">
              {ev.related.sameDate.map(r => (
                <Link
                  key={r.id}
                  href={`/events/${r.id}`}
                  className="block px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-xs font-bold text-gray-900 leading-snug">{r.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {r.time_start ? r.time_start.slice(0, 5) : 'All day'}
                    {r.location_name ? ` · ${r.location_name}` : ''}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Client actions + map/transit */}
        <EventPageClient
          id={id}
          lat={ev.lat ?? undefined}
          lng={ev.lng ?? undefined}
          title={ev.title ?? undefined}
          dateStart={ev.date_start}
          dateEnd={ev.date_end}
          timeStart={ev.time_start}
          timeEnd={ev.time_end}
          locationName={ev.location_name}
          address={ev.address}
          description={ev.description}
        />
      </div>
    </main>
  )
}
