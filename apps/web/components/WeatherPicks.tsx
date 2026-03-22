'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { CloudRain, Sun, Cloud } from 'lucide-react'

interface WeatherPicksData {
  weather: { code: number; label: string; isRainy: boolean; tempMax: number; precipProb: number }
  picks: Array<{
    id: string; title: string; date_start: string; time_start?: string | null
    category?: string | null; location_name?: string | null
  }>
  recommendation: string
}

export default function WeatherPicks({ date }: { date: string }) {
  const { data } = useQuery({
    queryKey: ['weather-picks', date],
    queryFn: async () => {
      const res = await fetch(`/api/events/weather-picks?date=${date}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<WeatherPicksData>
    },
    staleTime: 10 * 60_000,
  })

  if (!data?.picks?.length) return null

  const WeatherIcon = data.weather.isRainy ? CloudRain : data.weather.code <= 1 ? Sun : Cloud

  return (
    <div className="border-b-2 border-[var(--border-primary)]">
      <div className="px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)]">
        <div className="flex items-center gap-1.5">
          <WeatherIcon size={12} className="text-[var(--text-muted)]" />
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            {data.weather.isRainy ? 'Rainy today — indoor picks' : 'Nice weather — outdoor picks'}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] ml-auto">
            {data.weather.tempMax}°C · {data.weather.label}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-[var(--border-secondary)]">
        {data.picks.slice(0, 8).map(ev => (
          <Link
            key={ev.id}
            href={`/events/${ev.id}`}
            className="p-3 hover:bg-[var(--bg-secondary)]"
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
