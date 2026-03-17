import type { Event, EventsResponse, EventFilters, Listing, ListingsResponse, ListingFilters } from './types'

function getApiBase(): string {
  // Server-side: call worker directly
  if (typeof window === 'undefined') {
    return process.env.WORKER_API_URL ?? 'http://localhost:8787'
  }
  // Client-side: use relative path — Next.js rewrites /api/* → worker
  return ''
}

export async function fetchEvents(
  filters: EventFilters = {},
  options?: RequestInit
): Promise<EventsResponse> {
  const params = new URLSearchParams()
  if (filters.date)       params.set('date',       filters.date)
  if (filters.date_from)  params.set('date_from',  filters.date_from)
  if (filters.date_to)    params.set('date_to',    filters.date_to)
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

// ─── Listings ─────────────────────────────────────────────────────────────────

export async function fetchListings(
  filters: ListingFilters = {},
  options?: RequestInit,
): Promise<ListingsResponse> {
  const params = new URLSearchParams()
  if (filters.type)    params.set('type',    filters.type)
  if (filters.borough) params.set('borough', filters.borough)
  if (filters.bbox)    params.set('bbox',    filters.bbox)
  params.set('page',  String(filters.page  ?? 1))
  params.set('limit', String(filters.limit ?? 50))

  const res = await fetch(`${getApiBase()}/api/listings?${params}`, {
    next: { revalidate: 60 },
    ...options,
  })
  if (!res.ok) throw new Error(`fetchListings failed: ${res.status}`)
  return res.json() as Promise<ListingsResponse>
}

export async function fetchListing(id: string): Promise<Listing> {
  const res = await fetch(`${getApiBase()}/api/listings/${id}`, {
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`fetchListing failed: ${res.status}`)
  const { data } = await res.json() as { data: Listing }
  return data
}
