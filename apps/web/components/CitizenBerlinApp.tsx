'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Filter, ChevronDown, ChevronLeft, ChevronRight, BookMarked, User, Search, X,
  List, Map, CalendarDays, MoreHorizontal,
} from 'lucide-react'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { fetchEvents }          from '@/lib/api'
import { formatDayHeader, getCategoryStyle } from '@/lib/utils'
import type { Event }           from '@/lib/types'
import EventCard                from './EventCard'
import { useVenuesList, useOSMVenues, useParks, usePlaygrounds, usePOIsBatch, useListings } from '@/hooks/useCulturalData'
import { getPOIColor, getPOILabel } from '@/lib/poi-config'
import {
  FILTER_GROUPS, LITE_DEFAULTS, resolveActiveFiltersForZoom,
  QUICK_CHIPS, getChipFilterKeys, searchCategories,
} from '@/lib/unified-filters'
import type { VenuePopupState } from './MapView'
import ChatPanel                from './ChatPanel'
import TrendingSection          from './TrendingSection'
import ForYouSection            from './ForYouSection'
import WeatherPicks             from './WeatherPicks'
import BottomSheet              from './BottomSheet'
import JourneyWidget            from './JourneyWidget'
import NotificationsBell        from './NotificationsBell'
import ThemeToggle              from './ThemeToggle'
import WeatherWidget             from './WeatherWidget'
import LanguageSelector          from './LanguageSelector'
import ListingsList from './ListingsList'
import FavoriteButton from './FavoriteButton'
import { useUser } from '@/providers/UserProvider'
import { useLanguage } from '@/providers/LanguageProvider'
import { ErrorBoundary } from './ErrorBoundary'
import OfflineBanner from './OfflineBanner'
import { readFromURL, syncToURL, filtersToString, filtersFromString } from '@/hooks/useMapState'
import { useFavorites } from '@/hooks/useFavorites'
import { Heart, Share2, Check, Navigation, Sparkles } from 'lucide-react'
import DayStrip from './DayStrip'
import { isOpenNow } from '@/lib/opening-hours'

const MapView       = dynamic(() => import('./MapView'),       { ssr: false })
const AuthModal     = dynamic(() => import('./AuthModal'),     { ssr: false })
const ListsDrawer   = dynamic(() => import('./ListsDrawer'),   { ssr: false })
const CalendarPanel = dynamic(() => import('./CalendarPanel'), { ssr: false })

const CATEGORIES = [
  'Exhibitions','Music','Art','Theater','Education','Recreation',
  'Kids','Sports','Dance','Talks','Tours','Film','Other',
]


interface Props {
  initialEvents: Event[]
  initialTotal:  number
  initialDate:   string
}

function AppInner({ initialEvents, initialTotal, initialDate }: Props) {
  const { user, token, attendance } = useUser()
  const { lang } = useLanguage()
  const { isFavorite: isFav } = useFavorites()

  const [events,   setEvents]   = useState<Event[]>(initialEvents)
  const [total,    setTotal]    = useState(initialTotal)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(false)

  const [dateFrom, setDateFrom] = useState(initialDate)
  const [dateTo,   setDateTo]   = useState(initialDate)
  const [price,    setPrice]    = useState<'all' | 'free' | 'paid'>('all')
  const [cats,     setCats]     = useState<string[]>([])
  const [catOpen,  setCatOpen]  = useState(false)
  const catRef                  = useRef<HTMLDivElement>(null)

  const [activeId, setActiveId] = useState<string | null>(null)

  // ─── Unified filter state ──────────────────────────────────────────────────
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(LITE_DEFAULTS))

  const [mapZoom, setMapZoom] = useState(11)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)

  // ─── Nearby Discovery ──────────────────────────────────────────────────────
  const [nearbyMode, setNearbyMode] = useState(false)
  const [nearbyResults, setNearbyResults] = useState<Array<{
    type: string; id: string; name: string; category?: string; distance_m: number; lat: number; lng: number
  }> | null>(null)
  const [_nearbyLoading, setNearbyLoading] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [nearbyRadius, setNearbyRadius] = useState(500)

  // ─── Favorites view ─────────────────────────────────────────────────────────
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // ─── UX: chips expand/collapse, discovery collapse ─────────────────────────
  const [chipsExpanded, setChipsExpanded] = useState(false)
  const [expandedChip, setExpandedChip] = useState<string | null>(null)
  const [discoverExpanded, setDiscoverExpanded] = useState(false)
  useEffect(() => {
    const stored = localStorage.getItem('citizen-discover-expanded')
    if (stored === 'true') setDiscoverExpanded(true)
  }, [])

  // ─── Mode (events / venues / listings) ────────────────────────────────────
  const [mode,      setModeRaw]      = useState<'events' | 'venues' | 'listings'>('events')
  const [search,    setSearch]    = useState('')

  // ─── Share URL ──────────────────────────────────────────────────────────────
  const [urlCopied, setUrlCopied] = useState(false)

  const resolved = useMemo(() => resolveActiveFiltersForZoom(activeFilters, mapZoom), [activeFilters, mapZoom])

  // Push a URL history entry after filter changes so back/forward works
  const pushFilterURL = useCallback((nextFilters: Set<string>) => {
    const filterStr = filtersToString(nextFilters)
    const defaultStr = filtersToString(new Set(LITE_DEFAULTS))
    syncToURL({
      lat: mapCenter?.lat, lng: mapCenter?.lng, zoom: mapZoom,
      mode: mode !== 'events' ? mode : undefined,
      filters: filterStr !== defaultStr ? filterStr : undefined,
      query: search.trim() || undefined,
    }, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter, mapZoom, mode, search])


  // ─── Other state ──────────────────────────────────────────────────────────

  const [showAuth,     setShowAuth]     = useState(false)
  const [showLists,    setShowLists]    = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [liveRadar,    setLiveRadar]    = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const setMode = useCallback((m: 'events' | 'venues' | 'listings') => {
    setModeRaw(m)
    syncToURL({
      lat: mapCenter?.lat, lng: mapCenter?.lng, zoom: mapZoom,
      mode: m !== 'events' ? m : undefined,
      filters: activeFilters.size > 0 ? filtersToString(activeFilters) : undefined,
      query: search.trim() || undefined,
    }, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter, mapZoom, activeFilters, search])
  const [listingType, setListingType] = useState<string | undefined>(undefined)
  const [listingStreetFilter, setListingStreetFilter] = useState<string | undefined>(undefined)
  const [listingStreetQuery, setListingStreetQuery] = useState('')
  const [listingStreetSuggestions, setListingStreetSuggestions] = useState<Array<{ name: string; lat: number; lng: number; postcode: string | null; borough: string | null }>>([])
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false)
  const streetDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [mapBbox,   setMapBbox]   = useState<string | null>(null)
  const [flyTo,     setFlyToRaw]  = useState<[number, number] | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')
  const [surpriseVenuePopup, setSurpriseVenuePopup] = useState<({ _key: number } & VenuePopupState) | null>(null)
  const [mobileSheetPopup, setMobileSheetPopup] = useState<VenuePopupState | null>(null)

  function setFlyTo(coords: [number, number] | null) {
    setFlyToRaw(coords)
    if (coords) setMobileView('map')
  }
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<{
    events:    Array<{ id: string; title: string; date_start: string; category: string | null; location_name: string | null; lat: number | null; lng: number | null }>
    locations: Array<{ id: string; name: string; category: string | null; address: string | null; borough: string | null; lat: number | null; lng: number | null }>
    places:    Array<{ id: string; name: string; type: string; lat: number; lng: number }>
    pois?:     Array<{ id: string; name: string | null; category_group: string; category: string; region: string; address: string | null; lat: number; lng: number }>
    streets?:  Array<{ name: string; lat: number; lng: number; postcode: string | null; borough: string | null }>
    addresses?: Array<{ street: string; housenumber: string; display: string; lat: number; lng: number; postcode: string | null }>
  } | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ─── Deep link: read URL on mount ──────────────────────────────────────────
  const urlInitRef = useRef(false)
  useEffect(() => {
    if (urlInitRef.current) return
    urlInitRef.current = true
    const s = readFromURL()
    if (s.mode) setMode(s.mode)
    if (s.query) setSearch(s.query)
    if (s.filters) setActiveFilters(filtersFromString(s.filters))
    if (s.lat != null && s.lng != null) {
      setMapCenter({ lat: s.lat, lng: s.lng })
      if (s.zoom != null) setMapZoom(s.zoom)
      setFlyTo([s.lng, s.lat])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep link: sync URL on state changes
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(syncTimeoutRef.current)
    syncTimeoutRef.current = setTimeout(() => {
      syncToURL({
        lat: mapCenter?.lat,
        lng: mapCenter?.lng,
        zoom: mapZoom,
        mode: mode !== 'events' ? mode : undefined,
        filters: activeFilters.size > 0 && filtersToString(activeFilters) !== filtersToString(new Set(LITE_DEFAULTS))
          ? filtersToString(activeFilters) : undefined,
        query: search.trim() || undefined,
      })
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter, mapZoom, mode, activeFilters, search])

  // Deep link: popstate listener
  useEffect(() => {
    function onPopState() {
      const s = readFromURL()
      if (s.mode) setMode(s.mode)
      if (s.query !== undefined) setSearch(s.query ?? '')
      if (s.filters) setActiveFilters(filtersFromString(s.filters))
      if (s.lat != null && s.lng != null) {
        setFlyTo([s.lng, s.lat])
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Data fetching — uses resolved filters ────────────────────────────────

  // D1 venues — fetch all, filter client-side by resolved.venueCategories
  const { data: venuesGeo, isFetching: venuesFetching } = useVenuesList(
    mapBbox,
    mode === 'venues' && resolved.venueCategories.length > 0,
  )

  // Always fetch parks + playgrounds (for search); map visibility from resolved.geodataLayers
  const { data: parksData }       = useParks(true)
  const { data: playgroundsData } = usePlaygrounds(true)

  // Filter venue features to only active venue categories
  const venueFeatures = useMemo(() => {
    if (!venuesGeo?.features) return []
    if (resolved.venueCategories.length === 0) return []
    const catSet = new Set(resolved.venueCategories)
    return venuesGeo.features.filter(f => {
      const cat = (f.properties as Record<string, unknown>)?.category as string | undefined
      return cat ? catSet.has(cat) : catSet.has('other')
    })
  }, [venuesGeo, resolved.venueCategories])

  // OSM hooks — called unconditionally (React rules), enabled by resolved
  const osmLiveMusic    = useOSMVenues('live_music',  resolved.osmCategories.includes('live_music'),    mapBbox)
  const osmJazz         = useOSMVenues('jazz',        resolved.osmCategories.includes('jazz'),          mapBbox)
  const osmCinema       = useOSMVenues('cinema',      resolved.osmCategories.includes('cinema'),        mapBbox)
  const osmClubs        = useOSMVenues('clubs',       resolved.osmCategories.includes('clubs'),         mapBbox)
  const osmGalleries    = useOSMVenues('galleries',   resolved.osmCategories.includes('galleries'),     mapBbox)
  const osmStreetArt    = useOSMVenues('street_art',  resolved.osmCategories.includes('street_art'),    mapBbox)
  const osmMuseum       = useOSMVenues('museum',      resolved.osmCategories.includes('museum'),        mapBbox)

  // Build osmData map for MapView
  const osmData = useMemo(() => {
    const map: Record<string, GeoJSON.FeatureCollection> = {}
    const pairs: [string, typeof osmLiveMusic][] = [
      ['live_music', osmLiveMusic], ['jazz', osmJazz], ['cinema', osmCinema],
      ['clubs', osmClubs], ['galleries', osmGalleries], ['street_art', osmStreetArt],
      ['museum', osmMuseum],
    ]
    for (const [key, hook] of pairs) {
      if (resolved.osmCategories.includes(key) && hook.data?.features?.length) {
        map[key] = hook.data
      }
    }
    return map
  }, [resolved.osmCategories, osmLiveMusic.data, osmJazz.data, osmCinema.data, osmClubs.data, osmGalleries.data, osmStreetArt.data, osmMuseum.data])

  // POI hooks — single batch request instead of 16 individual ones
  const enabledPOIGroups = useMemo(() => Array.from(resolved.poiGroups.keys()), [resolved.poiGroups])
  const poiBatch = usePOIsBatch(enabledPOIGroups, mapBbox, enabledPOIGroups.length > 0)

  // Split batch result by category_group
  const poiGroupDataMap: Record<string, GeoJSON.FeatureCollection | undefined> = useMemo(() => {
    if (!poiBatch.data?.features) return {}
    const map: Record<string, GeoJSON.Feature[]> = {}
    for (const f of poiBatch.data.features) {
      const group = (f.properties as Record<string, unknown>)?.category_group as string
      if (!group) continue
      ;(map[group] ??= []).push(f)
    }
    const result: Record<string, GeoJSON.FeatureCollection> = {}
    for (const [group, features] of Object.entries(map)) {
      result[group] = { type: 'FeatureCollection', features }
    }
    return result
  }, [poiBatch.data])

  // Build poiData map: filter each group's features to only enabled categories
  const poiData = useMemo(() => {
    const result: Record<string, GeoJSON.FeatureCollection> = {}
    for (const [apiGroup, activeCats] of resolved.poiGroups) {
      const groupData = poiGroupDataMap[apiGroup]
      if (!groupData?.features?.length) continue
      for (const cat of activeCats) {
        const filtered = groupData.features.filter(
          f => (f.properties as Record<string, unknown>)?.category === cat
        )
        if (filtered.length > 0) {
          result[`${apiGroup}:${cat}`] = { type: 'FeatureCollection', features: filtered }
        }
      }
    }
    return result
  }, [resolved.poiGroups, poiGroupDataMap])

  // Listings data
  const { data: listingsGeo, isFetching: listingsFetching } = useListings(
    mapBbox,
    mode === 'listings',
    listingType,
    listingStreetFilter,
  )

  // Merge all active features for the venue list
  const activeOSMFeatures = useMemo(() =>
    Object.values(osmData).flatMap(fc => fc.features),
    [osmData]
  )

  const activePOIFeatures = useMemo(() =>
    Object.values(poiData).flatMap(fc => fc.features),
    [poiData]
  )

  // Parks/playgrounds in bbox for the list
  const visibleParksFeatures = useMemo(() => {
    if (!resolved.geodataLayers.has('parks') || !parksData?.features) return []
    if (!mapBbox) return parksData.features
    const [minLng, minLat, maxLng, maxLat] = mapBbox.split(',').map(Number)
    return parksData.features.filter(f => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
      return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    })
  }, [resolved.geodataLayers, parksData, mapBbox])

  const visiblePlaygroundFeatures = useMemo(() => {
    if (!resolved.geodataLayers.has('playgrounds') || !playgroundsData?.features) return []
    if (!mapBbox) return playgroundsData.features
    const [minLng, minLat, maxLng, maxLat] = mapBbox.split(',').map(Number)
    return playgroundsData.features.filter(f => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
      return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    })
  }, [resolved.geodataLayers, playgroundsData, mapBbox])

  const allVenueFeatures = useMemo(() => {
    if (mode !== 'venues') return venueFeatures
    return [
      ...venueFeatures,
      ...activeOSMFeatures,
      ...activePOIFeatures,
      ...visibleParksFeatures.map(f => ({ ...f, properties: { ...f.properties, _source: 'park' as const } })),
      ...visiblePlaygroundFeatures.map(f => ({ ...f, properties: { ...f.properties, _source: 'playground' as const } })),
    ]
  }, [mode, venueFeatures, activeOSMFeatures, activePOIFeatures, visibleParksFeatures, visiblePlaygroundFeatures])

  // Build venue GeoJSON for MapView (pre-filtered D1 venues)
  const venueGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: venueFeatures,
  }), [venueFeatures])

  const LIMIT = 50

  const load = useCallback(async (from: string, to: string, p: number) => {
    setLoading(true)
    try {
      // "Paid" filter: fetch all events, then exclude free client-side
      // (the DB only has 'free'/'unknown'/'paid'; unknown often means paid/untagged)
      const sendPriceType = price === 'free' ? 'free' : undefined
      const res = await fetchEvents({
        date_from:  from,
        date_to:    to,
        page:       p,
        limit:      price === 'paid' ? 500 : LIMIT,
        price_type: sendPriceType,
        category:   cats.length === 1 ? cats[0] : undefined,
      })
      if (price === 'paid') {
        const filtered = res.data.filter(ev => ev.price_type !== 'free')
        setEvents(filtered)
        setTotal(filtered.length)
      } else {
        setEvents(res.data)
        setTotal(res.pagination.total)
      }
    } finally {
      setLoading(false)
    }
  }, [price, cats])

  // Always fetch fresh data from Worker (initialEvents are for first-paint only)
  useEffect(() => {
    load(dateFrom, dateTo, page)
  }, [dateFrom, dateTo, page, load])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced search — API + client-side GeoJSON filtering
  useEffect(() => {
    clearTimeout(searchRef.current)
    if (!search.trim()) { setSearchResults(null); return }
    setSearching(true)
    searchRef.current = setTimeout(async () => {
      const q = search.trim().toLowerCase()
      try {
        const [res] = await Promise.all([
          fetch(`/api/search?q=${encodeURIComponent(search.trim())}&lang=${lang}`),
        ])
        const apiData = await res.json() as Omit<NonNullable<typeof searchResults>, 'places' | 'pois' | 'streets'> & { pois?: NonNullable<typeof searchResults>['pois']; streets?: NonNullable<typeof searchResults>['streets'] }

        // Client-side search across parks, playgrounds, and all OSM venues
        const places: NonNullable<typeof searchResults>['places'] = []
        const seen = new Set<string>()

        function addFeatures(features: GeoJSON.Feature[] | undefined, typeLabel: string) {
          for (const f of features ?? []) {
            const name = (f.properties?.name as string | null) ?? ''
            if (!name || !name.toLowerCase().includes(q)) continue
            const coords = (f.geometry as GeoJSON.Point).coordinates
            const id = (f.properties?.id as string) ?? `${typeLabel}:${name}`
            if (seen.has(id)) continue
            seen.add(id)
            places.push({ id, name, type: typeLabel, lat: coords[1], lng: coords[0] })
          }
        }

        addFeatures(parksData?.features,           'Park')
        addFeatures(playgroundsData?.features,    'Playground')
        addFeatures(osmLiveMusic.data?.features,  'Live Music')
        addFeatures(osmJazz.data?.features,       'Jazz')
        addFeatures(osmCinema.data?.features,     'Cinema')
        addFeatures(osmClubs.data?.features,      'Club')
        addFeatures(osmGalleries.data?.features,  'Gallery')
        addFeatures(osmStreetArt.data?.features,  'Street Art')

        setSearchResults({ ...apiData, places: places.slice(0, 20), pois: apiData.pois ?? [], streets: apiData.streets ?? [] })
      } catch { /* ignore */ } finally {
        setSearching(false)
      }
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, lang, parksData, playgroundsData])

  function toggleCat(c: string) {
    setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // Shared button classes
  const btn = 'text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)]'
  const btnActive = 'text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 bg-[var(--accent)] text-[var(--accent-text)]'

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <OfflineBanner />
      <div className="flex flex-1 overflow-hidden">
      {/* ── Left panel ─────────────────────────────────── */}
      <div className={`flex flex-col border-r-2 border-[var(--border-primary)] bg-[var(--bg-primary)] w-full md:w-1/3 md:min-w-[320px] md:max-w-[500px] md:shrink-0 ${mobileView === 'map' ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b-2 border-[var(--border-primary)]">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold tracking-tight">Citizen.Berlin</h1>
            <div className="flex items-center gap-1">
              {/* Utility icons */}
              <button
                onClick={() => {
                  if (nearbyMode) { setNearbyMode(false); setNearbyResults(null); return }
                  setNearbyLoading(true)
                  navigator.geolocation.getCurrentPosition(
                    pos => {
                      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                      setUserLocation(loc)
                      setNearbyMode(true)
                      setFlyTo([loc.lng, loc.lat])
                      fetch(`/api/nearby?lat=${loc.lat}&lng=${loc.lng}&radius=${nearbyRadius}&limit=20`)
                        .then(r => r.json())
                        .then((data: { results: typeof nearbyResults }) => setNearbyResults(data.results))
                        .catch(() => setNearbyResults([]))
                        .finally(() => setNearbyLoading(false))
                    },
                    () => { setNearbyLoading(false) },
                    { enableHighAccuracy: true, timeout: 10000 },
                  )
                }}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border ${nearbyMode ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
                title="Near Me"
              >
                <Navigation size={12} />
              </button>
              <button
                onClick={() => setShowFavoritesOnly(v => !v)}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border ${showFavoritesOnly ? 'bg-pink-500 border-pink-500 text-white' : 'border-gray-200 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
                title="Show favorites"
              >
                <Heart size={12} fill={showFavoritesOnly ? '#fff' : 'none'} />
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href).catch(() => {})
                  setUrlCopied(true)
                  setTimeout(() => setUrlCopied(false), 2000)
                }}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                title="Share this view"
              >
                {urlCopied ? <Check size={12} /> : <Share2 size={12} />}
              </button>
              {user && <NotificationsBell />}
              {/* ⋯ More menu */}
              <div ref={moreMenuRef} className="relative">
                <button
                  onClick={() => setMoreMenuOpen(o => !o)}
                  title="More options"
                  className="flex items-center justify-center w-8 h-8 border-2 border-[var(--border-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
                >
                  <MoreHorizontal size={14} />
                </button>
                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-[1000] bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)] w-48 py-1">
                    <div className="px-3 py-1.5 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Theme</span>
                      <ThemeToggle />
                    </div>
                    <div className="px-3 py-1.5 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Language</span>
                      <LanguageSelector />
                    </div>
                    <button
                      onClick={() => { setMoreMenuOpen(false); if (user) setShowCalendar(true); else setShowAuth(true) }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                    >
                      <CalendarDays size={12} />
                      My Calendar
                      {user && attendance.length > 0 && (
                        <span className="ml-auto text-[9px] font-bold bg-[var(--accent)] text-[var(--accent-text)] px-1 py-0.5">
                          {attendance.length > 9 ? '9+' : attendance.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => { setMoreMenuOpen(false); if (user) setShowLists(true); else setShowAuth(true) }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                    >
                      <BookMarked size={12} />
                      My Lists
                    </button>
                  </div>
                )}
              </div>
              {user ? (
                <a
                  href="/profile"
                  title={user.display_name ?? user.email}
                  className="flex items-center justify-center w-8 h-8 border-2 border-[var(--border-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)] bg-[var(--accent)] text-[var(--accent-text)]"
                >
                  <User size={14} />
                </a>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  title="Sign in"
                  className="flex items-center justify-center w-8 h-8 border-2 border-[var(--border-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
                >
                  <User size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Unified Search */}
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search places, events, categories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs border-2 border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] pl-7 pr-7 py-1.5 outline-none focus:shadow-[2px_2px_0_var(--border-primary)]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
              >
                <X size={11} />
              </button>
            )}
            {/* Unified search dropdown: filter matches + Surprise Me when empty */}
            {search.trim().length >= 2 && (() => {
              const filterMatches = searchCategories(search.trim())
              if (filterMatches.length === 0) return null
              return (
                <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)] max-h-52 overflow-y-auto">
                  <p className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100">Filter by category</p>
                  {filterMatches.map(({ group, cat, filterKey }) => {
                    const on = activeFilters.has(filterKey)
                    return (
                      <button
                        key={filterKey}
                        onClick={() => {
                          setActiveFilters(prev => {
                            const next = new Set(prev)
                            if (on) next.delete(filterKey); else next.add(filterKey)
                            pushFilterURL(next)
                            return next
                          })
                          setMode('venues')
                        }}
                        className={`flex items-center gap-2 w-full text-left text-xs px-2.5 py-1.5 hover:bg-[var(--bg-secondary)] ${on ? 'font-bold' : ''}`}
                      >
                        <span className="w-3 h-3 shrink-0 rounded-sm border-2 flex items-center justify-center" style={{ borderColor: cat.color, background: on ? cat.color : 'transparent' }}>
                          {on && <span className="text-white text-[8px]">✓</span>}
                        </span>
                        <span>{cat.label}</span>
                        <span className="text-[9px] text-gray-400 ml-auto">{group.label}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Compact filter row — only shown in events mode */}
          <div className={`flex items-center gap-1.5 mt-3 ${mode !== 'events' ? 'hidden' : ''}`}>

            {/* Category filter */}
            <div ref={catRef} className="relative">
              <button
                onClick={() => setCatOpen(o => !o)}
                className={cats.length > 0 ? btnActive : btn}
              >
                <span className="flex items-center gap-1">
                  <Filter size={10} />
                  {cats.length > 0 ? cats.slice(0, 2).join(', ') + (cats.length > 2 ? ` +${cats.length - 2}` : '') : 'All Events'}
                  <ChevronDown size={10} />
                </span>
              </button>
              {catOpen && (
                <div className="absolute top-full left-0 mt-1 z-[1000] bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)] w-44 py-1">
                  {CATEGORIES.map(c => {
                    const style   = getCategoryStyle(c)
                    const checked = cats.includes(c)
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCat(c)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[var(--bg-secondary)] ${checked ? 'font-bold' : ''}`}
                      >
                        <span className="w-2 h-2 shrink-0 border border-gray-400" style={{ background: style.hex }} />
                        {c}
                        {checked && <span className="ml-auto">✓</span>}
                      </button>
                    )
                  })}
                  {cats.length > 0 && (
                    <button
                      onClick={() => setCats([])}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-gray-500 border-t-2 border-gray-200 mt-1 pt-1.5 hover:bg-[var(--bg-secondary)]"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Price filter — segmented control */}
            <div className="flex">
              {(['all', 'free', 'paid'] as const).map((p, i) => (
                <button
                  key={p}
                  onClick={() => { setPrice(p); setPage(1) }}
                  className={`text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 ${i > 0 ? '-ml-0.5' : ''} ${
                    price === p
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] z-[1] relative'
                      : 'bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)]'
                  }`}
                >
                  {p === 'all' ? 'Any' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Clear all filters */}
            {(price !== 'all' || cats.length > 0) && (
              <button
                onClick={() => {
                  setPrice('all'); setCats([]); setPage(1)
                }}
                className={btn}
                title="Clear all filters"
              >
                <span className="flex items-center gap-1"><X size={10} /> Clear</span>
              </button>
            )}

          </div>
        </div>

        {/* ── Day Navigation Strip ──────────────────────────────── */}
        {mode === 'events' && (
          <DayStrip
            dateFrom={dateFrom}
            dateTo={dateTo}
            onSelectDay={(iso) => { setDateFrom(iso); setDateTo(iso); setPage(1) }}
            onSelectRange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1) }}
          />
        )}

        {/* ── Mode row ──────────────────────────────────────── */}
        <div className="px-4 py-2 border-b-2 border-[var(--border-primary)]">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMode('events')} className={mode === 'events' ? btnActive : btn}>Events</button>
            <button onClick={() => setMode('venues')} className={mode === 'venues' ? btnActive : btn}>Places</button>
            <button onClick={() => setMode('listings')} className={mode === 'listings' ? btnActive : btn}>Listings</button>
            <WeatherWidget />
            {user && (
              <Link
                href="/events/new"
                className="ml-auto text-[10px] font-bold border-2 border-[var(--border-primary)] px-2 py-0.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
              >
                + Add
              </Link>
            )}
          </div>
        </div>

        {/* ── Category chips with collapsible subcategories (Places/Listings only) ─── */}
        {mode !== 'events' && <div className="px-4 py-1.5 border-b-2 border-[var(--border-primary)]">
          {/* Chip row + reset */}
          <div className="flex items-center gap-1 flex-wrap">
            {(chipsExpanded ? QUICK_CHIPS : QUICK_CHIPS.slice(0, 8)).map(chip => {
              const Icon = chip.icon
              const chipKeys = getChipFilterKeys(chip)
              const activeCount = chipKeys.filter(k => activeFilters.has(k)).length
              const hasAny = activeCount > 0
              const hasAll = activeCount === chipKeys.length
              const isOpen = expandedChip === chip.key
              return (
                <button
                  key={chip.key}
                  className={`inline-flex items-center gap-1 text-[11px] whitespace-nowrap px-2 py-1 rounded-full border transition-colors min-h-[28px] ${
                    hasAny
                      ? 'text-white font-semibold'
                      : 'border-gray-200 bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                  } ${isOpen ? 'ring-2 ring-offset-1 ring-[var(--border-primary)]' : ''}`}
                  style={hasAny ? { backgroundColor: chip.color, borderColor: chip.color } : undefined}
                  onClick={() => setExpandedChip(isOpen ? null : chip.key)}
                >
                  <Icon size={12} className="shrink-0" />
                  {chip.label}
                  {hasAny && !hasAll && (
                    <span className="bg-white/30 text-[8px] px-1 rounded-full">{activeCount}</span>
                  )}
                  <ChevronDown size={9} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )
            })}
            {QUICK_CHIPS.length > 8 && (
              <button
                onClick={() => setChipsExpanded(v => !v)}
                className="inline-flex items-center text-[11px] px-2 py-1 rounded-full border border-gray-200 bg-[var(--bg-primary)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] min-h-[28px]"
              >
                {chipsExpanded ? 'Less' : `+${QUICK_CHIPS.length - 8}`}
              </button>
            )}
            {/* Reset all map filters */}
            {(() => {
              const liteDefaults = new Set(LITE_DEFAULTS)
              const isDefault = liteDefaults.size === activeFilters.size && [...liteDefaults].every(k => activeFilters.has(k))
              if (isDefault) return null
              return (
                <button
                  onClick={() => {
                    setActiveFilters(new Set(LITE_DEFAULTS))
                    setExpandedChip(null)
                  }}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-red-300 text-red-500 hover:bg-red-50 min-h-[28px]"
                  title="Reset all map filters to defaults"
                >
                  <X size={10} /> Reset
                </button>
              )
            })()}
          </div>

          {/* ── Expanded subcategories panel ─── */}
          {expandedChip && (() => {
            const chip = QUICK_CHIPS.find(c => c.key === expandedChip)
            if (!chip) return null
            const groups = chip.groups.map(gk => FILTER_GROUPS.find(fg => fg.key === gk)).filter(Boolean)
            const allKeys = getChipFilterKeys(chip)
            const activeCount = allKeys.filter(k => activeFilters.has(k)).length
            const allActive = activeCount === allKeys.length
            return (
              <div className="mt-2 pt-2 border-t border-[var(--border-secondary)]">
                {/* Header: label + toggle all + close */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[var(--text-primary)]">
                      {chip.label}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {activeCount}/{allKeys.length} active
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActiveFilters(prev => {
                          const next = new Set(prev)
                          if (allActive) { for (const k of allKeys) next.delete(k) }
                          else { for (const k of allKeys) next.add(k) }
                          return next
                        })
                        setMode('venues')
                      }}
                      className="text-[10px] text-[var(--accent)] hover:underline font-medium"
                    >
                      {allActive ? 'Clear all' : 'Select all'}
                    </button>
                    <button
                      onClick={() => setExpandedChip(null)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {/* Subcategory chips — larger touch targets for mobile */}
                <div className="flex flex-wrap gap-1.5">
                  {groups.map(group => group!.categories.map(cat => {
                    const filterKey = `${group!.key}:${cat.key}`
                    const isOn = activeFilters.has(filterKey)
                    return (
                      <button
                        key={filterKey}
                        onClick={() => {
                          setActiveFilters(prev => {
                            const next = new Set(prev)
                            if (isOn) next.delete(filterKey)
                            else next.add(filterKey)
                            return next
                          })
                          setMode('venues')
                        }}
                        className={`inline-flex items-center gap-1 text-[10px] whitespace-nowrap px-2 py-1 rounded-full border min-h-[26px] transition-colors ${
                          isOn
                            ? 'text-white font-medium'
                            : 'border-gray-200 bg-[var(--bg-primary)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'
                        }`}
                        style={isOn ? { backgroundColor: cat.color, borderColor: cat.stroke } : undefined}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0 border border-white/30" style={{ backgroundColor: cat.color }} />
                        {cat.label}
                      </button>
                    )
                  }))}
                </div>
              </div>
            )
          })()}
        </div>}

        {/* ── Listings filter pills + new listing ──────────────────────── */}
        {mode === 'listings' && (
          <div className="px-4 py-1.5 border-b-2 border-[var(--border-primary)]">
            <div className="flex items-center gap-1 flex-wrap mb-1">
              {([
                { key: undefined,          label: 'All' },
                { key: 'apartment_rent',   label: 'Rent' },
                { key: 'apartment_buy',    label: 'Buy' },
                { key: 'item',             label: 'Item' },
                { key: 'service',          label: 'Service' },
              ] as const).map(({ key, label }) => (
                <button
                  key={label}
                  onClick={() => setListingType(key)}
                  className={listingType === key ? btnActive : btn}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  if (user) window.location.href = '/listings/new'
                  else setShowAuth(true)
                }}
                className="text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent)] ml-auto"
              >
                + New
              </button>
            </div>
            {/* Street filter */}
            <div className="relative mt-1">
              <input
                type="text"
                placeholder="Filter by street…"
                value={listingStreetFilter ?? listingStreetQuery}
                onChange={e => {
                  const v = e.target.value
                  setListingStreetQuery(v)
                  if (listingStreetFilter) setListingStreetFilter(undefined)
                  clearTimeout(streetDebounceRef.current)
                  if (v.length < 2) { setListingStreetSuggestions([]); return }
                  streetDebounceRef.current = setTimeout(async () => {
                    try {
                      const res = await fetch(`/api/streets?q=${encodeURIComponent(v)}&limit=6`)
                      if (res.ok) {
                        const data = await res.json() as typeof listingStreetSuggestions
                        setListingStreetSuggestions(data)
                        setShowStreetSuggestions(true)
                      }
                    } catch { /* ignore */ }
                  }, 250)
                }}
                onFocus={() => listingStreetSuggestions.length > 0 && setShowStreetSuggestions(true)}
                onBlur={() => setTimeout(() => setShowStreetSuggestions(false), 200)}
                className="w-full text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 outline-none focus:shadow-[2px_2px_0_var(--border-primary)] pr-7"
                autoComplete="off"
              />
              {listingStreetFilter && (
                <button
                  onClick={() => { setListingStreetFilter(undefined); setListingStreetQuery(''); setListingStreetSuggestions([]) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                >
                  <X size={11} />
                </button>
              )}
              {showStreetSuggestions && listingStreetSuggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] mt-0.5 max-h-40 overflow-y-auto shadow-[2px_2px_0_var(--border-primary)]">
                  {listingStreetSuggestions.map((s, i) => (
                    <li key={`${s.name}-${s.postcode}-${i}`}>
                      <button
                        type="button"
                        className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-[var(--bg-secondary)]"
                        onMouseDown={e => {
                          e.preventDefault()
                          setListingStreetFilter(s.name)
                          setListingStreetQuery('')
                          setShowStreetSuggestions(false)
                          setListingStreetSuggestions([])
                          setFlyTo([s.lng, s.lat])
                        }}
                      >
                        <span className="font-medium">{s.name}</span>
                        {s.postcode && <span className="text-gray-400 ml-1">{s.postcode}</span>}
                        {s.borough && <span className="text-gray-400 ml-1">· {s.borough}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Search results / Event list / Venue list */}
        <div className="flex-1 overflow-y-auto pb-14 md:pb-0">
          {/* Nearby radius picker */}
          {nearbyMode && (
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Radius:</span>
              {[250, 500, 1000].map(r => (
                <button
                  key={r}
                  onClick={() => {
                    setNearbyRadius(r)
                    if (userLocation) {
                      setNearbyLoading(true)
                      fetch(`/api/nearby?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=${r}&limit=20`)
                        .then(res => res.json())
                        .then((data: { results: typeof nearbyResults }) => setNearbyResults(data.results))
                        .catch(() => setNearbyResults([]))
                        .finally(() => setNearbyLoading(false))
                    }
                  }}
                  className={nearbyRadius === r ? btnActive : btn}
                >
                  {r >= 1000 ? `${r / 1000}km` : `${r}m`}
                </button>
              ))}
            </div>
          )}
          {/* Nearby results */}
          {nearbyMode && nearbyResults ? (
            nearbyResults.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">Nothing nearby</div>
            ) : (
              nearbyResults.map((item, i) => (
                <div
                  key={`${item.type}-${item.id}-${i}`}
                  className="px-4 py-2.5 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                  onClick={() => setFlyTo([item.lng, item.lat])}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] leading-snug truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {item.category ?? item.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono bg-[var(--bg-secondary)] border border-gray-300 px-1.5 py-0.5">
                        {item.distance_m < 1000 ? `${Math.round(item.distance_m)}m` : `${(item.distance_m / 1000).toFixed(1)}km`}
                      </span>
                      <FavoriteButton type={item.type} id={item.id} size={12} />
                    </div>
                  </div>
                </div>
              ))
            )
          ) : search.trim() && mode !== 'listings' ? (
            /* ── Search results ── */
            searching && !searchResults ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">Searching…</div>
            ) : (
              <>
                {/* Event results */}
                {(searchResults?.events?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-[var(--bg-secondary)]">
                      Events ({searchResults!.events.length})
                    </p>
                    {searchResults!.events.map(ev => (
                      <div
                        key={ev.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          if (ev.lat && ev.lng) setFlyTo([ev.lng, ev.lat])
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">{ev.title}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {ev.date_start}{ev.location_name ? ` · ${ev.location_name}` : ''}
                            </p>
                            <a
                              href={`/events/${ev.id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black hover:underline"
                            >
                              Details →
                            </a>
                          </div>
                          <FavoriteButton type="event" id={ev.id} size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Location results */}
                {(searchResults?.locations?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-[var(--bg-secondary)]">
                      Venues ({searchResults!.locations.length})
                    </p>
                    {searchResults!.locations.map(loc => (
                      <div
                        key={loc.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          if (loc.lat && loc.lng) setFlyTo([loc.lng, loc.lat])
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">{loc.name}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {[loc.category, loc.borough].filter(Boolean).join(' · ')}
                            </p>
                            <a
                              href={`/locations/${loc.id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black hover:underline"
                            >
                              Details →
                            </a>
                          </div>
                          <FavoriteButton type="location" id={loc.id} size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Places (parks, playgrounds, OSM spots) */}
                {(searchResults?.places?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-[var(--bg-secondary)]">
                      Places ({searchResults!.places.length})
                    </p>
                    {searchResults!.places.map(pl => (
                      <div
                        key={pl.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          setFlyTo([pl.lng, pl.lat])
                        }}
                      >
                        <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">{pl.name}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{pl.type}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* POI results */}
                {(searchResults?.pois?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-[var(--bg-secondary)]">
                      Points of Interest ({searchResults!.pois!.length})
                    </p>
                    {searchResults!.pois!.map(poi => (
                      <div
                        key={poi.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          if (poi.lat && poi.lng) setFlyTo([poi.lng, poi.lat])
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">{poi.name ?? 'Unnamed'}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {[poi.category, poi.region].filter(Boolean).join(' · ')}
                            </p>
                            <a
                              href={`/pois/${poi.id.replace('/', '_')}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black hover:underline"
                            >
                              Details →
                            </a>
                          </div>
                          <FavoriteButton type="poi" id={poi.id} size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Address results */}
                {(searchResults?.addresses?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-[var(--bg-secondary)]">
                      Addresses ({searchResults!.addresses!.length})
                    </p>
                    {searchResults!.addresses!.map((addr, i) => (
                      <div
                        key={`addr-${addr.street}-${addr.housenumber}-${i}`}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          setFlyTo([addr.lng, addr.lat])
                        }}
                      >
                        <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">{addr.display}</p>
                        {addr.postcode && (
                          <p className="text-[10px] text-gray-500 mt-0.5">{addr.postcode}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Street results */}
                {(searchResults?.streets?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-[var(--bg-secondary)]">
                      Streets ({searchResults!.streets!.length})
                    </p>
                    {searchResults!.streets!.map((st, i) => (
                      <div
                        key={`${st.name}-${st.postcode}-${i}`}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          setFlyTo([st.lng, st.lat])
                        }}
                      >
                        <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">{st.name}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {[st.postcode, st.borough].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults && searchResults.events.length === 0 && searchResults.locations.length === 0 && searchResults.places.length === 0 && (searchResults.pois?.length ?? 0) === 0 && (searchResults.streets?.length ?? 0) === 0 && (searchResults.addresses?.length ?? 0) === 0 && (
                  <div className="flex items-center justify-center h-32 text-sm text-gray-400">No results</div>
                )}
              </>
            )
          ) : mode === 'listings' ? (
            <ListingsList
              listings={(listingsGeo?.features ?? []).map(f => {
                const p = f.properties as Record<string, unknown>
                return {
                  id:          (p.id as string) ?? '',
                  type:        (p.type as string) ?? 'item',
                  title:       (p.title as string) ?? 'Untitled',
                  price_cents: (p.price_cents as number) ?? null,
                  price_type:  (p.price_type as string) ?? 'fixed',
                  currency:    'EUR',
                  borough:     (p.borough as string) ?? null,
                  images:      null,
                  lat:         (f.geometry as GeoJSON.Point).coordinates[1],
                  lng:         (f.geometry as GeoJSON.Point).coordinates[0],
                }
              })}
              loading={listingsFetching}
              onFlyTo={setFlyTo}
            />
          ) : mode === 'events' ? (
            <>
            {/* ── Collapsible Discover bar ──────────────────────── */}
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-[var(--border-secondary)]">
              <button
                onClick={() => {
                  const next = !discoverExpanded
                  setDiscoverExpanded(next)
                  try { localStorage.setItem('citizen-discover-expanded', String(next)) } catch {}
                }}
                className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-1"
              >
                <Sparkles size={10} /> Discover
                <ChevronDown size={10} className={`transition-transform ${discoverExpanded ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={() => {
                  const pool = events
                  if (!pool.length) return
                  const ev = pool[Math.floor(Math.random() * pool.length)]
                  if (ev.lat && ev.lng) {
                    setFlyTo([ev.lng, ev.lat])
                    setActiveId(ev.id)
                  }
                }}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✦ Surprise me
              </button>
            </div>
            {discoverExpanded && (
              <>
                <ForYouSection />
                <WeatherPicks date={dateFrom} />
                <TrendingSection />
              </>
            )}
            {/* ── Day-grouped event list ──────────────────────── */}
            {loading && events.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
            ) : events.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">No events found</div>
            ) : (() => {
              const filtered = showFavoritesOnly ? events.filter(ev => isFav('event', ev.id)) : events
              if (filtered.length === 0) {
                return <div className="flex items-center justify-center h-32 text-sm text-gray-400">No favorited events</div>
              }
              // Group events by day
              const groups: Record<string, Event[]> = {}
              for (const ev of filtered) {
                const key = ev.date_start;
                (groups[key] ??= []).push(ev)
              }
              return Object.entries(groups).map(([date, dayEvents]) => (
                <div key={date}>
                  <div className="sticky top-0 z-10 px-4 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)]">
                    <span className="text-[11px] font-bold">{formatDayHeader(date)}</span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-2">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</span>
                  </div>
                  {dayEvents.map((ev: Event) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      active={ev.id === activeId}
                      onClick={() => setActiveId(id => id === ev.id ? null : ev.id)}
                      onNeedAuth={() => setShowAuth(true)}
                    />
                  ))}
                </div>
              ))
            })()}
            </>
          ) : (
            /* ── Venue list (unified: D1 + OSM + POI + parks/playgrounds) ── */
            <>
              {venuesFetching && allVenueFeatures.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
              ) : allVenueFeatures.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  {mapBbox ? 'No places in view' : 'Pan the map to load places'}
                </div>
              ) : (() => {
                const venuesToShow = showFavoritesOnly
                  ? allVenueFeatures.filter(f => {
                      const p = f.properties as { id?: string; gml_id?: string; fid?: string; category_group?: string; _source?: string }
                      const isPark = p._source === 'park'
                      const isPlayground = p._source === 'playground'
                      const isPOI = typeof p.category_group === 'string' && p.category_group !== ''
                      const itemType = isPOI ? 'poi' : isPark ? 'park' : isPlayground ? 'playground' : 'location'
                      const itemId = p.id ?? p.gml_id ?? p.fid ?? ''
                      return isFav(itemType, itemId)
                    })
                  : allVenueFeatures
                return venuesToShow.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-sm text-gray-400">No favorited places</div>
                ) : venuesToShow.map((f, i) => {
                  const p = f.properties as {
                    id?: string; name?: string; category?: string; category_group?: string
                    address?: string; borough?: string; bezirkname?: string; objartname?: string
                    website?: string; phone?: string; opening_hours?: string; cuisine?: string
                    namenr?: string; gml_id?: string; fid?: string
                    _source?: 'park' | 'playground'
                  }
                  const coords = (f.geometry as GeoJSON.Point | undefined)?.coordinates as [number, number] | undefined
                  const isPark       = p._source === 'park'
                  const isPlayground = p._source === 'playground'
                  const isPOI  = !isPark && !isPlayground && typeof p.category_group === 'string' && p.category_group !== ''
                  const isOSM  = !isPOI && !isPark && !isPlayground && typeof p.id === 'string' && (p.id.startsWith('node/') || p.id.startsWith('way/'))

                  const catLabel = isPark ? 'Park'
                    : isPlayground ? 'Playground'
                    : isPOI ? getPOILabel(p.category_group!, p.category ?? '')
                    : getFilterLabel(p.category ?? '') ?? p.category
                  const poiColors = isPOI ? getPOIColor(p.category_group!, p.category ?? '') : null

                  const displayName = isPark || isPlayground
                    ? (p.namenr ?? p.name ?? 'Unnamed')
                    : (p.name ?? (isPOI ? `Unnamed ${catLabel}` : 'Unnamed'))

                  const displayAddress = isPark || isPlayground ? p.objartname : p.address
                  const displayBorough = isPark || isPlayground ? p.bezirkname : p.borough

                  const gid = isPark || isPlayground ? (p.gml_id ?? p.fid ?? null) : null
                  const detailHref = isPark ? `/parks/${encodeURIComponent(gid!)}`
                    : isPlayground ? `/playgrounds/${encodeURIComponent(gid!)}`
                    : isPOI && p.id ? `/pois/${p.id.replace('/', '_')}`
                    : !isPOI && !isOSM && p.id ? `/locations/${p.id}`
                    : null

                  return (
                    <div
                      key={p.id ?? gid ?? i}
                      className="px-4 py-3 border-b border-gray-100 hover:bg-[var(--bg-secondary)] cursor-pointer"
                      onClick={() => { if (coords) setFlyTo(coords) }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-[var(--text-primary)] leading-snug truncate">
                            {displayName}
                          </p>
                          {displayAddress && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{displayAddress}</p>}
                          {displayBorough && <p className="text-[10px] text-gray-400">{displayBorough}</p>}
                          {p.opening_hours && (() => {
                            const status = isOpenNow(p.opening_hours)
                            return (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {status === 'open' && <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1 py-0.5 rounded">Open</span>}
                                {status === 'closed' && <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1 py-0.5 rounded">Closed</span>}
                                <p className="text-[10px] text-gray-400 truncate">🕐 {p.opening_hours}</p>
                              </div>
                            )
                          })()}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {catLabel && catLabel !== 'other' && (
                            <span
                              className="text-[10px] border-2 px-1.5 py-0.5 font-bold capitalize"
                              style={
                                isPark ? { borderColor: '#16a34a', color: '#16a34a' }
                                : isPlayground ? { borderColor: '#a21caf', color: '#a21caf' }
                                : poiColors ? { backgroundColor: poiColors.color, borderColor: poiColors.stroke, color: '#fff' }
                                : { borderColor: '#000', backgroundColor: '#fff' }
                              }
                            >
                              {catLabel}
                            </span>
                          )}
                          {detailHref && (
                            <a
                              href={detailHref}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black border border-gray-300 px-1.5 py-0.5 hover:border-[var(--border-primary)]"
                            >
                              Details →
                            </a>
                          )}
                          {isOSM && p.website && !detailHref && (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black border border-gray-300 px-1.5 py-0.5 hover:border-[var(--border-primary)]"
                            >
                              Website →
                            </a>
                          )}
                          <FavoriteButton
                            type={isPOI ? 'poi' : isPark ? 'park' : isPlayground ? 'playground' : 'location'}
                            id={p.id ?? gid ?? String(i)}
                            size={12}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
            </>
          )}
        </div>

        {/* Pagination */}
        {mode === 'events' && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 pb-[calc(0.5rem+3.5rem)] md:pb-2 border-t-2 border-[var(--border-primary)] text-xs">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 border-2 border-[var(--border-primary)] px-2 py-1 disabled:opacity-30 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="font-semibold">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 border-2 border-[var(--border-primary)] px-2 py-1 disabled:opacity-30 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────── */}
      <div className={`flex-1 relative ${mobileView === 'list' ? 'hidden md:block' : 'block'}`}>
        {/* Mobile floating search button — scrolls to sidebar search */}
        <button
          className="absolute top-2 right-2 z-10 md:hidden w-10 h-10 bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[2px_2px_0_var(--border-primary)] flex items-center justify-center"
          onClick={() => setMobileView('list')}
          title="Search"
        >
          <Search size={14} />
        </button>
        <ErrorBoundary fallback={
          <div className="flex items-center justify-center h-full text-xs text-gray-500">Map failed to load.</div>
        }>
          <MapView
            events={events}
            activeId={activeId}
            onEventSelect={setActiveId}
            resolvedFilters={resolved}
            venueGeoJSON={mode === 'events' ? { type: 'FeatureCollection' as const, features: [] } : venueGeoJSON}
            mode={mode}
            onBboxChange={useCallback((bbox: string, zoom: number) => {
              setMapBbox(bbox)
              setMapZoom(zoom)
              // Track map center from bbox
              const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number)
              setMapCenter({ lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 })
            }, [])}
            flyTo={flyTo}
            openVenuePopup={surpriseVenuePopup}
            liveRadar={liveRadar}
            poiData={mode === 'events' ? {} : poiData}
            osmData={mode === 'events' ? {} : osmData}
            parksData={mode === 'events' ? undefined : parksData}
            playgroundsData={mode === 'events' ? undefined : playgroundsData}
            listingsData={listingsGeo}
            onMobilePopup={setMobileSheetPopup}
          />
        </ErrorBoundary>
      </div>

      {/* ── Mobile bottom bar ───────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t-2 border-[var(--border-primary)] bg-[var(--bg-primary)]">
        <button
          onClick={() => setMobileView('list')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 ${mobileView === 'list' ? 'bg-[var(--accent)] text-[var(--accent-text)]' : ''}`}
        >
          <List size={14} /> Events
        </button>
        <button
          onClick={() => setMobileView('map')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 ${mobileView === 'map' ? 'bg-[var(--accent)] text-[var(--accent-text)]' : ''}`}
        >
          <Map size={14} /> Map
        </button>
      </div>

      {/* ── Mobile bottom sheet for venue details ────────── */}
      <BottomSheet isOpen={!!mobileSheetPopup} onClose={() => setMobileSheetPopup(null)}>
        {mobileSheetPopup && (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-[var(--text-primary)]">{mobileSheetPopup.name}</p>
                {mobileSheetPopup.category && (
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{mobileSheetPopup.category}</p>
                )}
              </div>
              {mobileSheetPopup.id && (
                <FavoriteButton
                  type={mobileSheetPopup.id.startsWith('poi:') ? 'poi' : mobileSheetPopup.id.startsWith('node/') || mobileSheetPopup.id.startsWith('way/') ? 'osm' : 'location'}
                  id={mobileSheetPopup.id.replace('poi:', '')}
                  size={16}
                />
              )}
            </div>
            {mobileSheetPopup.address && (
              <p className="text-xs text-gray-500 font-mono">{mobileSheetPopup.address}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${mobileSheetPopup.lat},${mobileSheetPopup.lng}&travelmode=transit`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold border-2 border-[var(--border-primary)] px-2.5 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
              >
                Directions
              </a>
              {mobileSheetPopup.id?.startsWith('poi:') && (
                <a
                  href={`/pois/${mobileSheetPopup.id.replace('poi:', '')}`}
                  className="text-xs font-bold border-2 border-[var(--border-primary)] px-2.5 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
                >
                  View details
                </a>
              )}
              {mobileSheetPopup.id?.startsWith('listing:') && (
                <a
                  href={`/listings/${mobileSheetPopup.id.replace('listing:', '')}`}
                  className="text-xs font-bold border-2 border-[var(--border-primary)] px-2.5 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
                >
                  View listing
                </a>
              )}
              {mobileSheetPopup.id && !mobileSheetPopup.id.startsWith('node/') && !mobileSheetPopup.id.startsWith('way/') && !mobileSheetPopup.id.startsWith('poi:') && !mobileSheetPopup.id.startsWith('park:') && !mobileSheetPopup.id.startsWith('playground:') && !mobileSheetPopup.id.startsWith('listing:') && (
                <a
                  href={`/locations/${mobileSheetPopup.id}`}
                  className="text-xs font-bold border-2 border-[var(--border-primary)] px-2.5 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
                >
                  View venue
                </a>
              )}
            </div>
            {/* Route planner */}
            <div className="pt-1 border-t border-gray-100">
              <JourneyWidget toLat={mobileSheetPopup.lat} toLng={mobileSheetPopup.lng} />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ── AI Chat FAB ─────────────────────────────────── */}
      <ChatPanel date={dateFrom} viewport={mapCenter ? { ...mapCenter, zoom: mapZoom } : undefined} token={token} />

      {/* ── Favorites migration prompt ─────────────────── */}
      <FavoritesMigrationPrompt />

      {/* ── Modals / drawers ────────────────────────────── */}
      {showAuth     && <AuthModal     onClose={() => setShowAuth(false)}     />}
      {showLists    && <ListsDrawer   onClose={() => setShowLists(false)}    />}
      {showCalendar && <CalendarPanel onClose={() => setShowCalendar(false)} />}
      </div>
    </div>
  )
}

function FavoritesMigrationPrompt() {
  const { user, createList, addToList } = useUser()
  const { getAll, count: favCount } = useFavorites()
  const [show, setShow] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const prompted = useRef(false)

  useEffect(() => {
    if (user && favCount > 0 && !prompted.current) {
      const migrated = localStorage.getItem('citizen-favorites-migrated')
      if (!migrated) {
        prompted.current = true
        setShow(true)
      }
    }
  }, [user, favCount])

  if (!show) return null

  return (
    <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-5 sm:w-80 z-50 bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)] p-4">
      <p className="text-xs font-bold mb-2">Save {favCount} favorite{favCount !== 1 ? 's' : ''} to your account?</p>
      <p className="text-[10px] text-gray-500 mb-3">Your favorites are stored locally. Save them to a list so they sync across devices.</p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setMigrating(true)
            try {
              const list = await createList('Favorites', '', false)
              const items = getAll()
              for (const item of items) {
                await addToList(list.id, item.type as 'event' | 'location' | 'listing', item.id)
              }
              localStorage.setItem('citizen-favorites-migrated', 'true')
              setShow(false)
            } catch { /* ignore */ }
            setMigrating(false)
          }}
          disabled={migrating}
          className="text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent)] disabled:opacity-50"
        >
          {migrating ? 'Saving...' : 'Save to list'}
        </button>
        <button
          onClick={() => {
            localStorage.setItem('citizen-favorites-migrated', 'true')
            setShow(false)
          }}
          className="text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 hover:bg-[var(--bg-secondary)]"
        >
          Not now
        </button>
      </div>
    </div>
  )
}

// Helper for venue list labels
function getFilterLabel(category: string): string | null {
  const labels: Record<string, string> = {
    museum: 'Museum', gallery: 'Gallery', theatre: 'Theatre', cinema: 'Cinema',
    concert_hall: 'Concert Hall', club: 'Club', library: 'Library',
    community_centre: 'Community', religious: 'Religious', education: 'Education',
    sports_venue: 'Sports', open_air: 'Open Air', virtual: 'Virtual', other: 'Other',
    live_music: 'Live Music', jazz: 'Jazz', clubs: 'Clubs',
    osm_galleries: 'Galleries', street_art: 'Street Art',
  }
  return labels[category] ?? null
}

export default function CitizenBerlinApp(props: Props) {
  return <AppInner {...props} />
}
