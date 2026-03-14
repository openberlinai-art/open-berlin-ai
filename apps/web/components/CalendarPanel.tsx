'use client'
import { useEffect, useState } from 'react'
import { X, CalendarDays, CalendarX } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

const WORKER = process.env.NEXT_PUBLIC_API_URL ?? 'https://kulturpulse-worker.openberlinai.workers.dev'

interface EnrichedItem {
  item_type:  'event' | 'location'
  item_id:    string
  created_at: string
  title:      string | null
  subtitle:   string | null
  date_start?: string | null
}

async function enrichItems(
  items: { item_type: 'event' | 'location'; item_id: string; created_at: string }[]
): Promise<EnrichedItem[]> {
  return Promise.all(items.map(async item => {
    try {
      if (item.item_type === 'event') {
        const res = await fetch(`${WORKER}/api/events/${item.item_id}`)
        if (!res.ok) return { ...item, title: item.item_id, subtitle: null }
        const json = await res.json() as { data: { title: string; date_start: string; location_name: string | null } }
        return {
          ...item,
          title:      json.data.title,
          subtitle:   json.data.location_name ?? null,
          date_start: json.data.date_start,
        }
      } else {
        const res = await fetch(`${WORKER}/api/locations/${item.item_id}`)
        if (!res.ok) return { ...item, title: item.item_id, subtitle: null }
        const json = await res.json() as { data: { name: string | null; borough: string | null } }
        return {
          ...item,
          title:    json.data.name ?? item.item_id,
          subtitle: json.data.borough ?? null,
        }
      }
    } catch {
      return { ...item, title: item.item_id, subtitle: null }
    }
  }))
}

interface Props {
  onClose: () => void
}

export default function CalendarPanel({ onClose }: Props) {
  const { attendance, unattend, user } = useUser()
  const [enriched, setEnriched] = useState<EnrichedItem[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!attendance.length) { setLoading(false); return }
    setLoading(true)
    enrichItems(attendance).then(items => {
      setEnriched(items)
      setLoading(false)
    })
  }, [attendance])

  const today = new Date().toISOString().slice(0, 10)

  const upcomingEvents = enriched.filter(
    i => i.item_type === 'event' && i.date_start && i.date_start >= today
  ).sort((a, b) => (a.date_start ?? '').localeCompare(b.date_start ?? ''))

  const pastEvents = enriched.filter(
    i => i.item_type === 'event' && i.date_start && i.date_start < today
  ).sort((a, b) => (b.date_start ?? '').localeCompare(a.date_start ?? ''))

  const venues = enriched.filter(i => i.item_type === 'location')

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white border-l-2 border-black h-full overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} />
            <h2 className="text-sm font-bold uppercase tracking-wide">My Calendar</h2>
          </div>
          <button onClick={onClose} className="hover:bg-black hover:text-white w-7 h-7 flex items-center justify-center border border-black">
            <X size={13} />
          </button>
        </div>

        <div className="flex-1 px-4 py-4">
          {!user && (
            <p className="text-xs text-gray-500 text-center mt-8">Sign in to save events to your calendar.</p>
          )}
          {user && loading && (
            <p className="text-xs text-gray-400 text-center mt-8">Loading…</p>
          )}
          {user && !loading && attendance.length === 0 && (
            <div className="flex flex-col items-center gap-2 mt-12 text-gray-400">
              <CalendarX size={28} />
              <p className="text-xs text-center">Nothing saved yet.<br/>Click the calendar icon on any event or venue.</p>
            </div>
          )}
          {user && !loading && attendance.length > 0 && (
            <>
              {/* Upcoming events */}
              {upcomingEvents.length > 0 && (
                <section className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Upcoming Events ({upcomingEvents.length})
                  </p>
                  <div className="flex flex-col gap-1">
                    {upcomingEvents.map(item => (
                      <CalendarRow key={item.item_id} item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} />
                    ))}
                  </div>
                </section>
              )}

              {/* Venues */}
              {venues.length > 0 && (
                <section className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Venues ({venues.length})
                  </p>
                  <div className="flex flex-col gap-1">
                    {venues.map(item => (
                      <CalendarRow key={item.item_id} item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} />
                    ))}
                  </div>
                </section>
              )}

              {/* Past events */}
              {pastEvents.length > 0 && (
                <section className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Past Events ({pastEvents.length})
                  </p>
                  <div className="flex flex-col gap-1 opacity-60">
                    {pastEvents.map(item => (
                      <CalendarRow key={item.item_id} item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CalendarRow({
  item,
  onRemove,
  formatDate,
}: {
  item: EnrichedItem
  onRemove: () => void
  formatDate: (d: string) => string
}) {
  const href = item.item_type === 'event' ? `/events/${item.item_id}` : `/locations/${item.item_id}`
  return (
    <div className="border border-black px-2.5 py-2 flex items-start justify-between gap-2 hover:bg-gray-50">
      <a href={href} className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-900 truncate">{item.title}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">
          {item.date_start ? formatDate(item.date_start) : item.subtitle ?? ''}
          {item.date_start && item.subtitle ? ` · ${item.subtitle}` : ''}
        </p>
      </a>
      <button
        onClick={onRemove}
        className="shrink-0 text-gray-400 hover:text-black hover:bg-red-50 w-5 h-5 flex items-center justify-center border border-transparent hover:border-red-200"
        title="Remove from calendar"
      >
        <X size={10} />
      </button>
    </div>
  )
}
