import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchParks,
  fetchPlaygrounds,
  fetchVenuesByBbox,
  fetchTransitStopsVBB,
  fetchDepartures,
} from '@/lib/opendata'

export function useParks(enabled: boolean) {
  return useQuery({
    queryKey:  ['parks'],
    queryFn:   fetchParks,
    enabled,
    staleTime: Infinity,
  })
}

export function usePlaygrounds(enabled: boolean) {
  return useQuery({
    queryKey:  ['playgrounds'],
    queryFn:   fetchPlaygrounds,
    enabled,
    staleTime: Infinity,
  })
}

/** Bbox-aware venues — refetches when map viewport changes. */
export function useVenuesByBbox(bbox: string | null, enabled: boolean) {
  return useQuery({
    queryKey:        ['venues', bbox],
    queryFn:         () => fetchVenuesByBbox(bbox!),
    enabled:         enabled && bbox !== null,
    staleTime:       5 * 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useTransitStops(lat: number | null, lng: number | null, enabled: boolean) {
  return useQuery({
    queryKey:  ['transit', lat, lng],
    queryFn:   () => fetchTransitStopsVBB(lat!, lng!),
    enabled:   enabled && lat !== null && lng !== null,
    staleTime: 60_000,
  })
}

export function useDepartures(stopId: string | null) {
  return useQuery({
    queryKey:  ['departures', stopId],
    queryFn:   () => fetchDepartures(stopId!),
    enabled:   stopId !== null,
    staleTime: 300_000,
  })
}
