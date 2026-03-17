'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Calendar as CalendarIcon, Filter, ChevronDown, ChevronLeft, ChevronRight, BookMarked, User, Search, X,
  List, Map, CalendarDays,
} from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

import dynamic from 'next/dynamic'
import { fetchEvents }          from '@/lib/api'
import { todayISO, formatDate, getCategoryStyle } from '@/lib/utils'
import type { Event }           from '@/lib/types'
import EventCard                from './EventCard'
import { useVenuesList, useOSMVenues, useParks, usePlaygrounds, usePOIs } from '@/hooks/useCulturalData'
import { POI_GROUPS, getPOIColor, getPOILabel } from '@/lib/poi-config'
import {
  Castle, Milestone, Church, Camera, TreePine, Train,
  UtensilsCrossed, Dumbbell, Building2, Wine, ShoppingBag, Bed,
  ChevronUp,
} from 'lucide-react'
import type { VenuePopupState } from './MapView'
import ChatPanel                from './ChatPanel'
import NotificationsBell        from './NotificationsBell'
import WeatherWidget             from './WeatherWidget'
import LanguageSelector          from './LanguageSelector'
import { useUser } from '@/providers/UserProvider'
import { useLanguage } from '@/providers/LanguageProvider'
import { ErrorBoundary } from './ErrorBoundary'

const MapView       = dynamic(() => import('./MapView'),       { ssr: false })
const AuthModal     = dynamic(() => import('./AuthModal'),     { ssr: false })
const ListsDrawer   = dynamic(() => import('./ListsDrawer'),   { ssr: false })
const CalendarPanel = dynamic(() => import('./CalendarPanel'), { ssr: false })

const CATEGORIES = [
  'Exhibition','Music','Dance','Recreation','Kids','Sports',
  'Tours','Film','Theater','Talks','Literature','Other',
]

const OSM_CAT_LABELS: Record<string, string> = {
  live_music:    'Live Music',
  jazz:          'Jazz',
  cinema:        'Cinema',
  clubs:         'Clubs',
  osm_galleries: 'Galleries',
  street_art:    'Street Art',
}

interface Props {
  initialEvents: Event[]
  initialTotal:  number
  initialDate:   string
}

function AppInner({ initialEvents, initialTotal, initialDate }: Props) {
  const { user, unreadCount, attendance } = useUser()
  const { lang } = useLanguage()

  const [events,   setEvents]   = useState<Event[]>(initialEvents)
  const [total,    setTotal]    = useState(initialTotal)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(false)

  const [dateFrom, setDateFrom] = useState(initialDate)
  const [dateTo,   setDateTo]   = useState(initialDate)
  const [calOpen,  setCalOpen]  = useState(false)
  const calRef                  = useRef<HTMLDivElement>(null)

  const [price,    setPrice]    = useState<'all' | 'free' | 'paid'>('all')
  const [cats,     setCats]     = useState<string[]>([])
  const [catOpen,  setCatOpen]  = useState(false)
  const catRef                  = useRef<HTMLDivElement>(null)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [layers, setLayers] = useState({
    parks: false, playgrounds: false, venues: false, galleries: false, museums: false,
    live_music: false, jazz: false, cinema: false, clubs: false,
    osm_galleries: false, street_art: false, osm_museum: false,
  })

  // POI layer toggles — keys are "group:category" e.g. "heritage:castle"
  const [poiLayers, setPOILayers] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const [showAuth,     setShowAuth]     = useState(false)
  const [showLists,    setShowLists]    = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [liveRadar,    setLiveRadar]    = useState(false)
  const [mode,      setMode]      = useState<'events' | 'venues'>('events')
  const [mapBbox,   setMapBbox]   = useState<string | null>(null)
  const [venueCat,  setVenueCat]  = useState<string>('all')
  const [flyTo,     setFlyToRaw]  = useState<[number, number] | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')
  const [surpriseVenuePopup, setSurpriseVenuePopup] = useState<({ _key: number } & VenuePopupState) | null>(null)

  function setFlyTo(coords: [number, number] | null) {
    setFlyToRaw(coords)
    if (coords) setMobileView('map')
  }
  const [search,    setSearch]    = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<{
    events:    Array<{ id: string; title: string; date_start: string; category: string | null; location_name: string | null; lat: number | null; lng: number | null }>
    locations: Array<{ id: string; name: string; category: string | null; address: string | null; borough: string | null; lat: number | null; lng: number | null }>
    places:    Array<{ id: string; name: string; type: string; lat: number; lng: number }>
    pois?:     Array<{ id: string; name: string | null; category_group: string; category: string; region: string; address: string | null; lat: number; lng: number }>
  } | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const { data: venuesGeo, isFetching: venuesFetching } = useVenuesList(
    mapBbox,
    mode === 'venues',
    venueCat === 'all' ? undefined : venueCat,
  )

  // Always fetch parks + playgrounds so search works regardless of layer toggle
  const { data: parksData }       = useParks(true)
  const { data: playgroundsData } = usePlaygrounds(true)

  const venueFeatures = venuesGeo?.features ?? []

  // OSM cultural venue layers — hooks must be called unconditionally; enabled by layer toggle
  const osmLiveMusic    = useOSMVenues('live_music',  layers.live_music,    mapBbox)
  const osmJazz         = useOSMVenues('jazz',        layers.jazz,          mapBbox)
  const osmCinema       = useOSMVenues('cinema',      layers.cinema,        mapBbox)
  const osmClubs        = useOSMVenues('clubs',       layers.clubs,         mapBbox)
  const osmGalleries    = useOSMVenues('galleries',   layers.osm_galleries, mapBbox)
  const osmStreetArt    = useOSMVenues('street_art',  layers.street_art,    mapBbox)
  const osmMuseumEnabled = layers.osm_museum || venueCat === 'museum'
  const osmMuseum       = useOSMVenues('museum',      osmMuseumEnabled,     mapBbox)

  // POI hooks — one per enabled group (fetch all categories for that group)
  const enabledPOIGroups = [...new Set(
    Object.entries(poiLayers).filter(([, v]) => v).map(([k]) => k.split(':')[0])
  )]
  // We call usePOIs for each of the 12 possible groups, enabled only when active
  const poiHeritage      = usePOIs('heritage',      mapBbox, enabledPOIGroups.includes('heritage'))
  const poiMonuments     = usePOIs('monuments',      mapBbox, enabledPOIGroups.includes('monuments'))
  const poiWorship       = usePOIs('worship',        mapBbox, enabledPOIGroups.includes('worship'))
  const poiTourism       = usePOIs('tourism',        mapBbox, enabledPOIGroups.includes('tourism'))
  const poiNature        = usePOIs('nature',         mapBbox, enabledPOIGroups.includes('nature'))
  const poiTransport     = usePOIs('transport',      mapBbox, enabledPOIGroups.includes('transport'))
  const poiFoodDrink     = usePOIs('food_drink',     mapBbox, enabledPOIGroups.includes('food_drink'))
  const poiSports        = usePOIs('sports',         mapBbox, enabledPOIGroups.includes('sports'))
  const poiServices      = usePOIs('services',       mapBbox, enabledPOIGroups.includes('services'))
  const poiNightlife     = usePOIs('nightlife',      mapBbox, enabledPOIGroups.includes('nightlife'))
  const poiShopping      = usePOIs('shopping',       mapBbox, enabledPOIGroups.includes('shopping'))
  const poiAccommodation = usePOIs('accommodation',  mapBbox, enabledPOIGroups.includes('accommodation'))

  const poiGroupDataMap: Record<string, GeoJSON.FeatureCollection | undefined> = {
    heritage: poiHeritage.data, monuments: poiMonuments.data, worship: poiWorship.data,
    tourism: poiTourism.data, nature: poiNature.data, transport: poiTransport.data,
    food_drink: poiFoodDrink.data, sports: poiSports.data, services: poiServices.data,
    nightlife: poiNightlife.data, shopping: poiShopping.data, accommodation: poiAccommodation.data,
  }

  // Build poiData map (keyed by "group:category") for MapView — filter to only enabled categories
  const poiData: Record<string, GeoJSON.FeatureCollection> = {}
  for (const [layerKey, enabled] of Object.entries(poiLayers)) {
    if (!enabled) continue
    const [group, cat] = layerKey.split(':')
    const groupData = poiGroupDataMap[group]
    if (!groupData?.features?.length) continue
    // Filter features to just this category
    const filtered = groupData.features.filter(
      f => (f.properties as Record<string, unknown>)?.category === cat
    )
    if (filtered.length > 0) {
      poiData[layerKey] = { type: 'FeatureCollection', features: filtered }
    }
  }

  // Merge active OSM features into the venue list
  const activeOSMFeatures = [
    ...(layers.live_music    ? (osmLiveMusic.data?.features  ?? []) : []),
    ...(layers.jazz          ? (osmJazz.data?.features       ?? []) : []),
    ...(layers.cinema        ? (osmCinema.data?.features     ?? []) : []),
    ...(layers.clubs         ? (osmClubs.data?.features      ?? []) : []),
    ...(layers.osm_galleries ? (osmGalleries.data?.features  ?? []) : []),
    ...(layers.street_art    ? (osmStreetArt.data?.features  ?? []) : []),
    ...(osmMuseumEnabled     ? (osmMuseum.data?.features     ?? []) : []),
  ]

  const activePOIFeatures = Object.values(poiData).flatMap(fc => fc.features)

  const allVenueFeatures = mode === 'venues'
    ? [...venueFeatures, ...activeOSMFeatures, ...activePOIFeatures]
    : venueFeatures

  const LIMIT = 50

  const load = useCallback(async (from: string, to: string, p: number) => {
    setLoading(true)
    try {
      const res = await fetchEvents({
        date_from:  from,
        date_to:    to,
        page:       p,
        limit:      LIMIT,
        price_type: price !== 'all' ? price : undefined,
        category:   cats.length === 1 ? cats[0] : undefined,
      })
      setEvents(res.data)
      setTotal(res.pagination.total)
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
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false)
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Auto-enable playgrounds layer when Kids category is active
  useEffect(() => {
    if (cats.includes('Kids')) {
      setLayers(prev => prev.playgrounds ? prev : { ...prev, playgrounds: true })
    }
    // Intentionally never auto-disables — user controls the off state
  }, [cats])

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
        const apiData = await res.json() as Omit<NonNullable<typeof searchResults>, 'places' | 'pois'> & { pois?: NonNullable<typeof searchResults>['pois'] }

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

        setSearchResults({ ...apiData, places: places.slice(0, 20), pois: apiData.pois ?? [] })
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

  function toISO(d: Date): string {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
    return `${y}-${m}-${day}`
  }

  const isRange = dateFrom !== dateTo

  // When no range is set yet, pass to:undefined so DayPicker stays in "awaiting second click" mode
  // (if we pass to:from, DayPicker treats the range as complete and the next click starts fresh)
  const selectedRange = isRange
    ? { from: new Date(dateFrom + 'T00:00:00'), to: new Date(dateTo + 'T00:00:00') }
    : { from: new Date(dateFrom + 'T00:00:00'), to: undefined }
  const dateLabel = dateFrom === todayISO() && !isRange
    ? 'Today'
    : isRange
      ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
      : formatDate(dateFrom)

  // Shared button classes
  const btn = 'text-xs border-2 border-black px-2.5 py-1 bg-white text-black hover:bg-black hover:text-white'
  const btnActive = 'text-xs border-2 border-black px-2.5 py-1 bg-black text-white'

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── Left panel ─────────────────────────────────── */}
      <div className={`flex flex-col border-r-2 border-black bg-white w-full md:w-[380px] md:shrink-0 ${mobileView === 'map' ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b-2 border-black">
          <div className="flex items-center justify-between mb-0.5">
            <h1 className="text-lg font-bold tracking-tight">KulturPulse</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const pool = mode === 'events' ? events : allVenueFeatures
                  if (!pool.length) return
                  const item = pool[Math.floor(Math.random() * pool.length)]
                  if (mode === 'events') {
                    const ev = item as Event
                    if (ev.lat && ev.lng) {
                      setFlyTo([ev.lng, ev.lat])
                      setActiveId(ev.id)
                    }
                  } else {
                    const f = item as GeoJSON.Feature<GeoJSON.Point>
                    const coords = f.geometry?.coordinates as [number, number] | undefined
                    if (coords) {
                      setFlyTo(coords)
                      const p = f.properties ?? {}
                      setSurpriseVenuePopup({
                        _key:     Date.now(),
                        lat:      coords[1],
                        lng:      coords[0],
                        name:     (p.name as string) ?? 'Venue',
                        category: (p.category as string) ?? 'other',
                        address:  (p.address as string) ?? undefined,
                        website:  (p.website as string) ?? undefined,
                        id:       (p.id as string) ?? undefined,
                        borough:  (p.borough as string) ?? undefined,
                      })
                    }
                  }
                }}
                className="text-xs border-2 border-black px-2 py-1 hover:bg-black hover:text-white font-bold"
                title="Surprise Me"
              >
                ✦ Surprise
              </button>
              {user && <NotificationsBell />}
              <LanguageSelector />
              <button
                onClick={() => { if (user) setShowCalendar(true); else setShowAuth(true) }}
                title="My Calendar"
                className="relative flex items-center justify-center w-8 h-8 border-2 border-black hover:bg-black hover:text-white"
              >
                <CalendarDays size={14} />
                {user && attendance.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 bg-black text-white text-[9px] font-bold flex items-center justify-center border border-white">
                    {attendance.length > 9 ? '9+' : attendance.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => { if (user) setShowLists(true); else setShowAuth(true) }}
                title="My Lists"
                className="relative flex items-center justify-center w-8 h-8 border-2 border-black hover:bg-black hover:text-white"
              >
                <BookMarked size={14} />
              </button>
              {user ? (
                <a
                  href="/profile"
                  title={user.display_name ?? user.email}
                  className="flex items-center justify-center w-8 h-8 border-2 border-black hover:bg-black hover:text-white bg-black text-white"
                >
                  <User size={14} />
                </a>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  title="Sign in"
                  className="flex items-center justify-center w-8 h-8 border-2 border-black hover:bg-black hover:text-white"
                >
                  <User size={14} />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500">Berlin culture events, live<WeatherWidget /></p>

          {/* Search */}
          <div className="relative mt-2">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search events, venues, parks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs border-2 border-black pl-7 pr-7 py-1.5 outline-none focus:shadow-[2px_2px_0_#000]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Filter row — only shown in events mode */}
          <div className={`flex items-center gap-1.5 mt-3 flex-wrap ${mode !== 'events' ? 'hidden' : ''}`}>

            {/* Date picker */}
            <div ref={calRef} className="relative">
              <button
                onClick={() => setCalOpen(o => !o)}
                className={`${calOpen || isRange ? btnActive : btn} max-w-[180px] truncate`}
              >
                <span className="flex items-center gap-1">
                  <CalendarIcon size={11} className="shrink-0" />
                  <span className="truncate">{dateLabel}</span>
                </span>
              </button>
              {isRange && (
                <button
                  onClick={() => { setDateFrom(todayISO()); setDateTo(todayISO()); setPage(1) }}
                  className={btn}
                  title="Clear date range"
                >
                  <X size={10} />
                </button>
              )}
              {calOpen && (
                <div className="absolute top-full left-0 mt-1 z-[1000] bg-white border-2 border-black shadow-[4px_4px_0_#000]">
                  <DayPicker
                    mode="range"
                    selected={selectedRange}
                    onSelect={range => {
                      if (!range?.from) return
                      const from = toISO(range.from)
                      const to   = range.to ? toISO(range.to) : from
                      setDateFrom(from)
                      setDateTo(to)
                      setPage(1)
                      if (range.to) setCalOpen(false)
                    }}
                    className="text-sm p-2"
                  />
                  {!isRange && (
                    <div className="px-3 pb-2 text-[10px] text-gray-400 text-center">
                      Click a second date to set a range
                    </div>
                  )}
                </div>
              )}
            </div>

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
                <div className="absolute top-full left-0 mt-1 z-[1000] bg-white border-2 border-black shadow-[4px_4px_0_#000] w-44 py-1">
                  {CATEGORIES.map(c => {
                    const style   = getCategoryStyle(c)
                    const checked = cats.includes(c)
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCat(c)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-100 ${checked ? 'font-bold' : ''}`}
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
                      className="w-full text-left px-3 py-1.5 text-[10px] text-gray-500 border-t-2 border-gray-200 mt-1 pt-1.5 hover:bg-gray-100"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Price filter */}
            {(['all', 'free', 'paid'] as const).map(p => (
              <button
                key={p}
                onClick={() => { setPrice(p); setPage(1) }}
                className={price === p ? btnActive : btn}
              >
                {p === 'all' ? 'Any price' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}

            {/* Clear all filters */}
            {(price !== 'all' || cats.length > 0 || dateFrom !== todayISO() || dateTo !== todayISO()) && (
              <button
                onClick={() => {
                  setPrice('all'); setCats([])
                  const t = todayISO(); setDateFrom(t); setDateTo(t); setPage(1)
                }}
                className={btn}
                title="Clear all filters"
              >
                <span className="flex items-center gap-1"><X size={10} /> Clear</span>
              </button>
            )}

            {/* Dynamic count */}
            <span className="ml-auto text-[11px] text-gray-400 shrink-0 self-center">
              {loading ? '…' : `${total} event${total !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {/* Mode toggle + map overlay toggles */}
        <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2 flex-wrap">
          <button onClick={() => setMode('events')} className={mode === 'events' ? btnActive : btn}>Events</button>
          <button onClick={() => setMode('venues')} className={mode === 'venues' ? btnActive : btn}>Venues</button>
          <span className="text-[10px] text-gray-300 mx-0.5">|</span>
          <button
            onClick={() => setLiveRadar(v => !v)}
            className={liveRadar ? btnActive : btn}
            title="Live vehicle radar"
          >
            ● Live
          </button>
          {activeId && mode === 'events' && (
            <span className="text-[10px] text-gray-500 border border-gray-300 px-2 py-0.5">Transit nearby</span>
          )}
        </div>

        {/* Venues mode — subcategory filters */}
        {mode === 'venues' && (
          <>
            {/* Cultural venues */}
            <div className="px-4 py-1.5 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300 shrink-0">Cultural</span>
              {(['all', 'museum', 'gallery', 'theatre', 'library', 'other'] as const).map(c => (
                <button key={c} onClick={() => setVenueCat(venueCat === c && c !== 'all' ? 'all' : c)} className={venueCat === c ? btnActive : btn}>
                  {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
            {/* Cultural spots */}
            <div className="px-4 py-1.5 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300 shrink-0">Spots</span>
              {([
                ['live_music',    'Live Music'],
                ['jazz',          'Jazz'],
                ['cinema',        'Cinema'],
                ['clubs',         'Clubs'],
                ['osm_galleries', 'Galleries'],
                ['street_art',    'Street Art'],
                ['parks',         'Parks'],
                ['playgrounds',   'Playgrounds'],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))} className={layers[key] ? btnActive : btn}>
                  {label}
                </button>
              ))}
            </div>

            {/* POI category groups — compact inline pills */}
            <div className="px-4 py-1.5 border-b-2 border-black">
              <div className="flex items-center gap-1 flex-wrap mb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300 shrink-0">Explore</span>
                {POI_GROUPS.map(group => {
                  const isExpanded = !!expandedGroups[group.key]
                  const activeCount = group.categories.filter(c => poiLayers[`${group.key}:${c.key}`]).length
                  const Icon = {
                    Castle, Milestone, Church, Camera, TreePine, Train,
                    UtensilsCrossed, Dumbbell, Building2, Wine, ShoppingBag, Bed,
                  }[group.icon] ?? Building2
                  return (
                    <button
                      key={group.key}
                      onClick={() => setExpandedGroups(g => ({ ...g, [group.key]: !g[group.key] }))}
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border ${isExpanded ? 'border-black bg-gray-100 font-bold' : 'border-gray-300 hover:border-gray-400'}`}
                    >
                      <Icon size={10} className="shrink-0 text-gray-500" />
                      {group.label}
                      {activeCount > 0 && (
                        <span className="text-[8px] bg-black text-white px-1 py-px font-bold leading-none">{activeCount}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              {/* Expanded subcategories */}
              {POI_GROUPS.filter(g => expandedGroups[g.key]).map(group => (
                <div key={group.key} className="flex flex-wrap gap-1 pb-1">
                  <span className="text-[9px] text-gray-400 w-full">{group.label}</span>
                  {group.categories.map(cat => {
                    const layerKey = `${group.key}:${cat.key}`
                    const isActive = !!poiLayers[layerKey]
                    return (
                      <button
                        key={cat.key}
                        onClick={() => setPOILayers(l => ({ ...l, [layerKey]: !l[layerKey] }))}
                        className={isActive ? btnActive : btn}
                        style={isActive ? { backgroundColor: cat.color, borderColor: cat.stroke } : undefined}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              ))}
              <span className="text-[11px] text-gray-400">
                {allVenueFeatures.length} venue{allVenueFeatures.length !== 1 ? 's' : ''}
              </span>
            </div>
          </>
        )}

        {/* Search results / Event list / Venue list */}
        <div className="flex-1 overflow-y-auto pb-14 md:pb-0">
          {search.trim() ? (
            /* ── Search results ── */
            searching && !searchResults ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">Searching…</div>
            ) : (
              <>
                {/* Event results */}
                {(searchResults?.events?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-gray-50">
                      Events ({searchResults!.events.length})
                    </p>
                    {searchResults!.events.map(ev => (
                      <div
                        key={ev.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          if (ev.lat && ev.lng) setFlyTo([ev.lng, ev.lat])
                        }}
                      >
                        <p className="text-xs font-bold text-gray-900 leading-snug">{ev.title}</p>
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
                    ))}
                  </div>
                )}
                {/* Location results */}
                {(searchResults?.locations?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-gray-50">
                      Venues ({searchResults!.locations.length})
                    </p>
                    {searchResults!.locations.map(loc => (
                      <div
                        key={loc.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          if (loc.lat && loc.lng) setFlyTo([loc.lng, loc.lat])
                        }}
                      >
                        <p className="text-xs font-bold text-gray-900 leading-snug">{loc.name}</p>
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
                    ))}
                  </div>
                )}
                {/* Places (parks, playgrounds, OSM spots) */}
                {(searchResults?.places?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-gray-50">
                      Places ({searchResults!.places.length})
                    </p>
                    {searchResults!.places.map(pl => (
                      <div
                        key={pl.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          setFlyTo([pl.lng, pl.lat])
                        }}
                      >
                        <p className="text-xs font-bold text-gray-900 leading-snug">{pl.name}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{pl.type}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* POI results */}
                {(searchResults?.pois?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-200 bg-gray-50">
                      Points of Interest ({searchResults!.pois!.length})
                    </p>
                    {searchResults!.pois!.map(poi => (
                      <div
                        key={poi.id}
                        className="px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          setSearch('')
                          if (poi.lat && poi.lng) setFlyTo([poi.lng, poi.lat])
                        }}
                      >
                        <p className="text-xs font-bold text-gray-900 leading-snug">{poi.name ?? 'Unnamed'}</p>
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
                    ))}
                  </div>
                )}
                {searchResults && searchResults.events.length === 0 && searchResults.locations.length === 0 && searchResults.places.length === 0 && (searchResults.pois?.length ?? 0) === 0 && (
                  <div className="flex items-center justify-center h-32 text-sm text-gray-400">No results</div>
                )}
              </>
            )
          ) : mode === 'events' ? (
            loading && events.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
            ) : events.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">No events found</div>
            ) : (
              events.map(ev => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  active={ev.id === activeId}
                  onClick={() => setActiveId(id => id === ev.id ? null : ev.id)}
                  onNeedAuth={() => setShowAuth(true)}
                />
              ))
            )
          ) : (
            /* ── Venue list (kulturdaten + active OSM) ── */
            <>
              {venuesFetching && allVenueFeatures.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
              ) : allVenueFeatures.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  {mapBbox ? 'No venues in view' : 'Pan the map to load venues'}
                </div>
              ) : (
                allVenueFeatures.map((f, i) => {
                  const p = f.properties as {
                    id?: string; name?: string; category?: string; category_group?: string
                    address?: string; borough?: string
                    website?: string; phone?: string; opening_hours?: string; cuisine?: string
                  }
                  const coords = (f.geometry as GeoJSON.Point | undefined)?.coordinates as [number, number] | undefined
                  const isPOI  = typeof p.category_group === 'string' && p.category_group !== ''
                  const isOSM  = !isPOI && typeof p.id === 'string' && (p.id.startsWith('node/') || p.id.startsWith('way/'))
                  const catLabel = isPOI
                    ? getPOILabel(p.category_group!, p.category ?? '')
                    : OSM_CAT_LABELS[p.category ?? ''] ?? p.category
                  const poiColors = isPOI ? getPOIColor(p.category_group!, p.category ?? '') : null
                  return (
                    <div
                      key={p.id ?? i}
                      className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => { if (coords) setFlyTo(coords) }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-900 leading-snug truncate">
                            {p.name ?? (isPOI ? `Unnamed ${catLabel}` : 'Unnamed')}
                          </p>
                          {p.address  && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{p.address}</p>}
                          {p.borough  && <p className="text-[10px] text-gray-400">{p.borough}</p>}
                          {p.opening_hours && <p className="text-[10px] text-gray-400 mt-0.5 truncate">🕐 {p.opening_hours}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {catLabel && catLabel !== 'other' && (
                            <span
                              className="text-[10px] border-2 px-1.5 py-0.5 font-bold capitalize"
                              style={poiColors
                                ? { backgroundColor: poiColors.color, borderColor: poiColors.stroke, color: '#fff' }
                                : { borderColor: '#000', backgroundColor: '#fff' }}
                            >
                              {catLabel}
                            </span>
                          )}
                          {isPOI && p.id && (
                            <a
                              href={`/pois/${p.id.replace('/', '_')}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black border border-gray-300 px-1.5 py-0.5 hover:border-black"
                            >
                              Details →
                            </a>
                          )}
                          {!isPOI && !isOSM && p.id && (
                            <a
                              href={`/locations/${p.id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black border border-gray-300 px-1.5 py-0.5 hover:border-black"
                            >
                              Details →
                            </a>
                          )}
                          {isOSM && p.website && (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-gray-400 hover:text-black border border-gray-300 px-1.5 py-0.5 hover:border-black"
                            >
                              Website →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            {/* Parks & Playgrounds section (shown when either layer is ON) */}
            {(layers.parks || layers.playgrounds) && (() => {
              const bboxParts = mapBbox ? mapBbox.split(',').map(Number) : null
              const inBbox = (coords: [number, number]) => {
                if (!bboxParts) return true
                const [minLng, minLat, maxLng, maxLat] = bboxParts
                return coords[0] >= minLng && coords[0] <= maxLng && coords[1] >= minLat && coords[1] <= maxLat
              }
              const visibleParks = (layers.parks && parksData?.features)
                ? parksData.features.filter(f => inBbox((f.geometry as GeoJSON.Point).coordinates as [number, number]))
                : []
              const visiblePlaygrounds = (layers.playgrounds && playgroundsData?.features)
                ? playgroundsData.features.filter(f => inBbox((f.geometry as GeoJSON.Point).coordinates as [number, number]))
                : []
              const total = visibleParks.length + visiblePlaygrounds.length
              if (total === 0) return null
              return (
                <div className="mt-2 border-t-2 border-black">
                  <p className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-300 flex items-center gap-2">
                    Parks &amp; Playgrounds
                    <span className="text-[9px] font-bold text-gray-400">{total}</span>
                  </p>
                  {[
                    ...visibleParks.map(f => ({ f, type: 'park' as const })),
                    ...visiblePlaygrounds.map(f => ({ f, type: 'playground' as const })),
                  ].map(({ f, type }, i) => {
                    const p = f.properties as Record<string, string | null>
                    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number]
                    const name   = p.namenr ?? p.name ?? 'Unnamed'
                    const gid    = p.gml_id ?? p.fid ?? null
                    return (
                      <div
                        key={gid ?? i}
                        className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setFlyTo(coords)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-gray-900 leading-snug truncate">{name}</p>
                            {p.objartname && <p className="text-[10px] text-gray-500 mt-0.5">{p.objartname}</p>}
                            {p.bezirkname && <p className="text-[10px] text-gray-400">{p.bezirkname}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className="text-[10px] border-2 px-1.5 py-0.5 font-bold uppercase"
                              style={type === 'park' ? { borderColor: '#16a34a', color: '#16a34a' } : { borderColor: '#a21caf', color: '#a21caf' }}
                            >
                              {type === 'park' ? 'Park' : 'Play'}
                            </span>
                            {gid && (
                              <a
                                href={`/${type === 'park' ? 'parks' : 'playgrounds'}/${encodeURIComponent(gid)}`}
                                onClick={e => e.stopPropagation()}
                                className="text-[10px] text-gray-400 hover:text-black border border-gray-300 px-1.5 py-0.5 hover:border-black"
                              >
                                Details →
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            </>
          )}
        </div>

        {/* Pagination */}
        {mode === 'events' && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 pb-[calc(0.5rem+3.5rem)] md:pb-2 border-t-2 border-black text-xs">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 border-2 border-black px-2 py-1 disabled:opacity-30 hover:bg-black hover:text-white"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="font-semibold">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 border-2 border-black px-2 py-1 disabled:opacity-30 hover:bg-black hover:text-white"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────── */}
      <div className={`flex-1 relative ${mobileView === 'list' ? 'hidden md:block' : 'block'}`}>
        <ErrorBoundary fallback={
          <div className="flex items-center justify-center h-full text-xs text-gray-500">Map failed to load.</div>
        }>
          <MapView
            events={events}
            activeId={activeId}
            onEventSelect={setActiveId}
            layers={{
              ...layers,
              // Show venue-type layers based on the active category filter
              venues:     mode === 'venues' && !['museum', 'gallery'].includes(venueCat),
              galleries:  mode === 'venues' && (venueCat === 'all' || venueCat === 'gallery'),
              museums:    mode === 'venues' && (venueCat === 'all' || venueCat === 'museum'),
              osm_museum: osmMuseumEnabled,
            }}
            mode={mode}
            venueCat={venueCat}
            onBboxChange={setMapBbox}
            flyTo={flyTo}
            openVenuePopup={surpriseVenuePopup}
            liveRadar={liveRadar}
            poiData={poiData}
          />
        </ErrorBoundary>
      </div>

      {/* ── Mobile bottom bar ───────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t-2 border-black bg-white">
        <button
          onClick={() => setMobileView('list')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 ${mobileView === 'list' ? 'bg-black text-white' : ''}`}
        >
          <List size={14} /> Events
        </button>
        <button
          onClick={() => setMobileView('map')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 ${mobileView === 'map' ? 'bg-black text-white' : ''}`}
        >
          <Map size={14} /> Map
        </button>
      </div>

      {/* ── AI Chat FAB ─────────────────────────────────── */}
      <ChatPanel date={dateFrom} />

      {/* ── Modals / drawers ────────────────────────────── */}
      {showAuth     && <AuthModal     onClose={() => setShowAuth(false)}     />}
      {showLists    && <ListsDrawer   onClose={() => setShowLists(false)}    />}
      {showCalendar && <CalendarPanel onClose={() => setShowCalendar(false)} />}
    </div>
  )
}

export default function KulturPulseApp(props: Props) {
  return <AppInner {...props} />
}
