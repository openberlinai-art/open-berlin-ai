import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import dynamic from 'next/dynamic'
import { fetchEvent } from '@/lib/opendata'
import { EventPageClient } from '@/components/EventPageClient'

const EventMapSection = dynamic(() => import('@/components/EventMapSection'), { ssr: false })

export const revalidate = 300

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const ev = await fetchEvent(id)
    return {
      title:       `${ev.title ?? 'Event'} — KulturPulse`,
      description: [ev.category, ev.location_name, ev.borough].filter(Boolean).join(' · '),
    }
  } catch {
    return { title: 'Event — KulturPulse' }
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
          : null

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
          </div>
          <h1 className="text-2xl font-extrabold leading-tight text-gray-900">
            {ev.title ?? 'Untitled Event'}
          </h1>
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

        {/* Map + nearby transit */}
        {ev.lat && ev.lng && (
          <EventMapSection lat={ev.lat} lng={ev.lng} />
        )}

        {/* Description */}
        {ev.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{ev.description}</p>
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

        {/* Client actions */}
        <EventPageClient id={id} />
      </div>
    </main>
  )
}
