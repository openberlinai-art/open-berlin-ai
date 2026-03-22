'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useUser } from '@/providers/UserProvider'
import { Sparkles } from 'lucide-react'

interface ForYouEvent {
  id: string
  title: string
  date_start: string
  time_start?: string | null
  category?: string | null
  location_name?: string | null
}

export default function ForYouSection() {
  const { token, preferences } = useUser()

  const { data: events } = useQuery({
    queryKey: ['for-you', token],
    queryFn: async () => {
      const res = await fetch('/api/events/for-you', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { data: ForYouEvent[] }
      return data.data
    },
    enabled: !!token && ((preferences.categories?.length ?? 0) > 0 || (preferences.boroughs?.length ?? 0) > 0),
    staleTime: 5 * 60_000,
  })

  if (!token || !events?.length) return null

  return (
    <div className="border-b-2 border-[var(--border-primary)]">
      <div className="px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)]">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-[var(--text-muted)]" />
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">For You</p>
        </div>
      </div>
      <div className="flex overflow-x-auto gap-0 custom-scrollbar">
        {events.slice(0, 10).map(ev => (
          <Link
            key={ev.id}
            href={`/events/${ev.id}`}
            className="flex-shrink-0 w-48 p-3 border-r border-[var(--border-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <p className="text-xs font-bold text-[var(--text-primary)] truncate">{ev.title}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {ev.time_start?.slice(0, 5) ?? 'All day'} · {ev.category ?? 'Event'}
            </p>
            {ev.location_name && (
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">{ev.location_name}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
