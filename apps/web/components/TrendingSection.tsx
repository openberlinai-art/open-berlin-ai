'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

interface TrendingItem {
  item_type: string
  item_id: string
  score: number
  title?: string | null
  category?: string | null
  date_start?: string | null
}

function fetchTrending(): Promise<TrendingItem[]> {
  return fetch('/api/trending').then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<{ data: TrendingItem[] }>
  }).then(d => d.data)
}

function itemLink(item: TrendingItem): string {
  if (item.item_type === 'event') return `/events/${item.item_id}`
  if (item.item_type === 'location') return `/locations/${item.item_id}`
  if (item.item_type === 'poi') return `/pois/${item.item_id}`
  return '/'
}

export default function TrendingSection() {
  const { data: items } = useQuery({
    queryKey: ['trending'],
    queryFn: fetchTrending,
    staleTime: 5 * 60_000,
  })

  if (!items?.length) return null

  return (
    <div className="border-b-2 border-[var(--border-primary)]">
      <div className="px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)]">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Trending now</p>
      </div>
      <div className="divide-y divide-[var(--border-secondary)]">
        {items.slice(0, 6).map((item, i) => (
          <Link
            key={`${item.item_type}-${item.item_id}`}
            href={itemLink(item)}
            className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <span className="text-xs font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--text-primary)] truncate">{item.title ?? 'Untitled'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {item.category && (
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">{item.category}</span>
                )}
                <span className="text-[10px] text-gray-300 capitalize">{item.item_type}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
