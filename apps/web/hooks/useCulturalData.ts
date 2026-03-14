import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchParks,
  fetchPlaygrounds,
  fetchVenuesByBbox,
  fetchVenuesList,
  fetchTransitStopsVBB,
  fetchDepartures,
  fetchJourney,
  fetchOSMVenues,
  fetchWeather,
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

/** Bbox-aware venues — refetches when map viewport changes. Optional category filter. */
export function useVenuesByBbox(bbox: string | null, enabled: boolean, category?: string) {
  return useQuery({
    queryKey:        ['venues', bbox, category ?? 'all'],
    queryFn:         () => fetchVenuesByBbox(bbox!, category),
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

export function useVenuesList(bbox: string | null, enabled: boolean, category?: string) {
  return useQuery({
    queryKey:        ['venues-list', bbox, category ?? 'all'],
    queryFn:         () => fetchVenuesList(bbox!, category),
    enabled:         enabled && bbox !== null,
    staleTime:       5 * 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useOSMVenues(category: string, enabled: boolean) {
  return useQuery({
    queryKey:  ['osm-venues', category],
    queryFn:   () => fetchOSMVenues(category),
    enabled,
    staleTime: Infinity,
  })
}

export function useWeather() {
  return useQuery({
    queryKey:        ['weather'],
    queryFn:         fetchWeather,
    staleTime:       10 * 60_000,
    refetchInterval: 10 * 60_000,
  })
}

export function useJourney(
  fromLat: number | null,
  fromLng: number | null,
  toLat:   number | null,
  toLng:   number | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['journey', fromLat, fromLng, toLat, toLng],
    queryFn:  () => fetchJourney(fromLat!, fromLng!, toLat!, toLng!),
    enabled:  enabled && !!fromLat && !!fromLng && !!toLat && !!toLng,
    staleTime: 60_000,
  })
}
