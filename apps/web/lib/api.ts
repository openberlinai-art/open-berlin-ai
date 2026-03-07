import type { Event, EventsResponse, EventFilters } from './types'

function getApiBase(): string {
  // Server-side: use internal Worker URL (no CORS needed)
  if (typeof window === 'undefined') {
    return process.env.WORKER_API_URL ?? 'http://localhost:8787'
  }
  // Client-side: use public URL
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
}

export async function fetchEvents(
  filters: EventFilters = {},
  options?: RequestInit
): Promise<EventsResponse> {
  const params = new URLSearchParams()
  if (filters.date)       params.set('date',       filters.date)
  if (filters.category && filters.category !== 'all')
    params.set('category',   filters.category)
  if (filters.price_type && filters.price_type !== 'all')
    params.set('price_type', filters.price_type)
  params.set('page',  String(filters.page  ?? 1))
  params.set('limit', String(filters.limit ?? 50))

  const url = `${getApiBase()}/api/events?${params}`
  const res = await fetch(url, {
    next: { revalidate: 60 },
    ...options,
  })
  if (!res.ok) throw new Error(`fetchEvents failed: ${res.status}`)
  return res.json() as Promise<EventsResponse>
}

export async function fetchEvent(id: string): Promise<Event> {
  const res = await fetch(`${getApiBase()}/api/events/${id}`, {
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`fetchEvent failed: ${res.status}`)
  const { data } = await res.json() as { data: Event }
  return data
}
