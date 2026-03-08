import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchLocation } from '@/lib/opendata'
import { formatDate, formatTime } from '@/lib/utils'

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
      description: [loc.category, loc.address, loc.borough].filter(Boolean).join(', '),
    }
  } catch {
    return { title: 'Venue — KulturPulse' }
  }
}

export default async function LocationPage({ params }: Props) {
  const { id } = await params
  let loc
  try {
    loc = await fetchLocation(id)
  } catch {
    notFound()
  }

  const tags: string[] = loc.tags ? JSON.parse(loc.tags) : []

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
        <span className="text-xs text-gray-400">Venue</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ── Name + category ── */}
        <div className="mb-4">
          {loc.category && (
            <span className="inline-block px-1.5 py-0.5 border-2 border-black text-[10px] font-bold bg-white mb-2 uppercase">
              {loc.category}
            </span>
          )}
          <h1 className="text-2xl font-extrabold leading-tight text-gray-900">
            {loc.name ?? 'Unknown Venue'}
          </h1>
        </div>

        {/* ── Address + borough ── */}
        {(loc.address || loc.borough) && (
          <div className="border-2 border-black p-3 mb-4 text-sm">
            {loc.address && <p className="font-mono text-gray-700">{loc.address}</p>}
            {loc.borough && <p className="text-xs text-gray-400 mt-0.5">{loc.borough}</p>}
          </div>
        )}

        {/* ── Website ── */}
        {loc.website && (
          <div className="mb-4">
            <a
              href={loc.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 underline break-all hover:text-blue-800"
            >
              {loc.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}

        {/* ── Tags ── */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {tags.map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 border border-gray-300 text-[10px] text-gray-500 font-mono"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Related events ── */}
        <div>
          <h2 className="text-sm font-bold border-b-2 border-black pb-1 mb-3 uppercase tracking-wide">
            Upcoming Events
          </h2>
          {loc.events.length === 0 ? (
            <p className="text-xs text-gray-400">No upcoming events found for this venue.</p>
          ) : (
            <div className="flex flex-col gap-0">
              {loc.events.map(ev => (
                <div key={ev.id} className="border-b border-gray-200 py-2.5 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-900 leading-snug">{ev.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatDate(ev.date_start)}
                      {ev.time_start && ` · ${formatTime(ev.time_start)}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {ev.category && (
                      <span className="px-1 py-0.5 border border-gray-300 text-[9px] font-bold text-gray-500">
                        {ev.category}
                      </span>
                    )}
                    <span className={[
                      'px-1 py-0.5 border text-[9px] font-bold',
                      ev.price_type === 'free'    ? 'border-black bg-black text-white'
                      : ev.price_type === 'paid'  ? 'border-black bg-white text-black'
                      : 'border-gray-300 text-gray-400',
                    ].join(' ')}>
                      {ev.price_type === 'free' ? 'Free' : ev.price_type === 'paid' ? 'Paid' : '?'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
