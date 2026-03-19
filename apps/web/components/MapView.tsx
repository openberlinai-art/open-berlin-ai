'use client'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { GeoJSONSource } from 'maplibre-gl'
import type maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { getCategoryHex } from '@/lib/utils'
import type { Event }     from '@/lib/types'
import {
  useTransitStops, useDepartures,
} from '@/hooks/useCulturalData'
import type { VBBStop, Departure } from '@/lib/opendata'
import type { ResolvedFilters } from '@/lib/unified-filters'
import { getMinZoomForFilter } from '@/lib/zoom-tiers'
import VibeCheck from './VibeCheck'
import JourneyWidget from './JourneyWidget'
import { getPOIColor, getPOILabel } from '@/lib/poi-config'

const MAP_STYLE   = 'https://tiles.openfreemap.org/styles/liberty'
const INITIAL_VIEW = { longitude: 13.405, latitude: 52.52, zoom: 11 }

// ─── Map group icon SVG paths (24x24 viewBox, white fill) ───────────────────────
// Each value is a simplified SVG path from Lucide icons
const MAP_GROUP_ICONS: Record<string, string> = {
  culture:       'M2 3h20v5H2zm3 5v13h5V8zm7 0v13h5V8zM5 18h4M12 18h4', // Palette approx
  nightlife:     'M8 22h8M7 10h10M12 2v2M12 10v12M5.3 7C4 5.7 4 4 5 3c2 2 4.5 2.5 7 2.5S16 5 18 3c1 1 1 2.7-.3 4', // Wine glass
  food_drink:    'M3 11h18M3 11l2.3-6A2 2 0 0 1 7.2 3h9.5a2 2 0 0 1 1.9 1.4L21 11M5 11v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7M12 11v9', // UtensilsCrossed
  outdoors:      'M12 2L7 12h10L12 2zM7 12L2 22h20L17 12', // TreePine
  heritage:      'M3 21h18M4 21V10l8-6 8 6v11M9 21v-4a3 3 0 1 1 6 0v4', // Castle
  monuments:     'M12 2v20M6 12h12M8 6l4-4 4 4', // Milestone
  worship:       'M18 21H6a2 2 0 0 1-2-2V8l8-6 8 6v11a2 2 0 0 1-2 2zM12 2v20M2 8h20', // Church
  transport:     'M4 11V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M4 11h16M4 11v6h16v-6M8 17v2M16 17v2M8 9h.01M16 9h.01', // Train
  shopping:      'M6 2L3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-5zM3 7h18M16 11a4 4 0 0 1-8 0', // ShoppingBag
  sports:        'M6.5 6.5A6.5 6.5 0 1 1 17.5 17.5M6.5 6.5h11M6.5 6.5v11M12 12v5M12 12h5', // Dumbbell
  tourism:       'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', // Camera
  services:      'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4', // Building2
  accommodation: 'M2 20V8l10-6 10 6v12M2 20h20M6 12h4v4H6zM14 12h4v8h-4z', // Bed
  events:        'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 6v6l4 2', // Clock/calendar
  listings:      'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2', // Clipboard
}

/** Register all group icons as MapLibre images */
function registerMapIcons(map: maplibregl.Map) {
  const entries = Object.entries(MAP_GROUP_ICONS)
  let loaded = 0
  entries.forEach(([key, pathD]) => {
    const imgName = `icon-${key}`
    if (map.hasImage(imgName)) { loaded++; return }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${pathD}"/></svg>`
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const img = new Image(24, 24)
    img.onload = () => {
      if (!map.hasImage(imgName)) map.addImage(imgName, img, { sdf: false })
      loaded++
    }
    img.onerror = () => { loaded++ }
    img.src = dataUri
  })
}

// ─── OSM category config ───────────────────────────────────────────────────────

const OSM_CATS = [
  { key: 'live_music',    color: '#1d4ed8', stroke: '#1e3a8a' },
  { key: 'jazz',          color: '#92400e', stroke: '#451a03' },
  { key: 'cinema',        color: '#b91c1c', stroke: '#7f1d1d' },
  { key: 'clubs',         color: '#7c3aed', stroke: '#4c1d95' },
  { key: 'galleries',     color: '#be123c', stroke: '#881337' },
  { key: 'street_art',    color: '#e879f9', stroke: '#a21caf' },
  { key: 'museum',        color: '#0891b2', stroke: '#164e63' },
] as const

const OSM_POINT_LAYERS   = new Set(OSM_CATS.map(c => `osm-${c.key}-point`))
const OSM_CLUSTER_LAYERS = new Set(OSM_CATS.map(c => `osm-${c.key}-clusters`))

interface Props {
  events:          Event[]
  activeId:        string | null
  onEventSelect:   (id: string | null) => void
  resolvedFilters: ResolvedFilters
  venueGeoJSON?:   GeoJSON.FeatureCollection  // pre-filtered D1 venues
  mode:            'events' | 'venues' | 'listings'
  onBboxChange:    (bbox: string, zoom: number) => void
  flyTo?:          [number, number] | null
  openVenuePopup?: ({ _key: number } & VenuePopupState) | null
  liveRadar?:      boolean
  poiData?:        Record<string, GeoJSON.FeatureCollection>  // keyed by "group:category"
  osmData?:        Record<string, GeoJSON.FeatureCollection>  // keyed by osm category key
  parksData?:      GeoJSON.FeatureCollection
  playgroundsData?: GeoJSON.FeatureCollection
  listingsData?:   GeoJSON.FeatureCollection
}

interface TransitPopupState {
  lat:  number
  lng:  number
  stop: VBBStop
}

export interface VenuePopupState {
  lat:      number
  lng:      number
  name:     string
  category: string
  address?: string
  website?: string
  id?:      string
  borough?: string
}

interface GreenspacePopupState {
  lat:      number
  lng:      number
  name:     string
  type:     'park' | 'playground'
  kind:     string | null
  borough:  string | null
  hood:     string | null
  built:    string | null
  gid?:     string
}

// ─── Transit popup content ────────────────────────────────────────────────────

function TransitPopupContent({
  stop, departures, loading,
}: {
  stop: VBBStop; departures: Departure[] | undefined; loading: boolean
}) {
  const typeColor: Record<string, string> = {
    subway: '#1d4ed8', suburban: '#15803d', tram: '#b91c1c', bus: '#6b7280',
  }
  const color = typeColor[stop.type] ?? '#374151'

  return (
    <div className="font-sans p-2 min-w-[220px] text-xs">
      <p className="font-bold mb-1.5" style={{ color }}>{stop.name}</p>
      {loading ? (
        <p className="text-gray-500">Loading departures…</p>
      ) : departures?.length ? (
        <table className="w-full border-collapse">
          <tbody>
            {departures.map((d, i) => {
              const diffMin = Math.round((new Date(d.when).getTime() - Date.now()) / 60000)
              const eta = diffMin <= 0 ? 'now' : `${diffMin} min`
              return (
                <tr key={i}>
                  <td className="pr-2 font-bold whitespace-nowrap" style={{ color }}>{d.line}</td>
                  <td className="pr-2 text-gray-700 max-w-[130px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {d.direction}
                  </td>
                  <td className="whitespace-nowrap text-gray-700">
                    {eta}
                    {d.delay > 60 && (
                      <span className="text-red-600"> +{Math.round(d.delay / 60)}m</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-400">No departures found</p>
      )}
    </div>
  )
}

// ─── Main MapView component ───────────────────────────────────────────────────

const BERLIN_BBOX = { south: 52.338, north: 52.675, west: 13.088, east: 13.761 }

interface RadarPopupState {
  lat:       number
  lng:       number
  line:      string
  direction: string
}

export default function MapView({
  events, activeId, onEventSelect,
  resolvedFilters,
  venueGeoJSON, mode, onBboxChange, flyTo, openVenuePopup,
  liveRadar = false,
  poiData = {}, osmData = {},
  parksData, playgroundsData,
  listingsData,
}: Props) {
  const mapRef     = useRef<MapRef>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [transitPopup,     setTransitPopup]     = useState<TransitPopupState | null>(null)
  const [venuePopup,       setVenuePopup]       = useState<VenuePopupState | null>(null)
  const [greenspacePopup,  setGreenspacePopup]  = useState<GreenspacePopupState | null>(null)
  const [activeTransitId,  setActiveTransitId]  = useState<string | null>(null)
  const [listingPopup,     setListingPopup]     = useState<{
    lat: number; lng: number; id: string; title: string; type: string
    price_label: string; first_image_url: string | null
  } | null>(null)
  const [cursor,           setCursor]           = useState('grab')
  const [radarData,        setRadarData]        = useState<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] })
  const [radarPopup,       setRadarPopup]       = useState<RadarPopupState | null>(null)

  // ── Queries (only transit still fetched here) ──────────────────────────────

  const showParks       = resolvedFilters.geodataLayers.has('parks')
  const showPlaygrounds = resolvedFilters.geodataLayers.has('playgrounds')
  const showVenues      = mode === 'venues' && !!venueGeoJSON?.features?.length

  const activeEvent = useMemo(
    () => events.find(e => e.id === activeId) ?? null,
    [events, activeId],
  )

  const transitLat = venuePopup?.lat ?? activeEvent?.lat ?? null
  const transitLng = venuePopup?.lng ?? activeEvent?.lng ?? null

  const { data: transitData } = useTransitStops(
    transitLat,
    transitLng,
    transitLat !== null && transitLng !== null,
  )

  const { data: departures, isLoading: depsLoading } = useDepartures(activeTransitId)

  // ── GeoJSON sources ──────────────────────────────────────────────────────────

  const eventsGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: events
      .filter(e => e.lat && e.lng)
      .map(e => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.lng!, e.lat!] },
        properties: {
          id:            e.id,
          title:         e.title,
          category:      e.category ?? 'Other',
          color:         getCategoryHex(e.category),
          price_type:    e.price_type,
          time_start:    e.time_start ?? null,
          location_name: e.location_name ?? null,
          borough:       e.borough ?? null,
        },
      })),
  }), [events])

  const transitGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (transitData ?? []).map(stop => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [stop.lng, stop.lat] },
      properties: { id: stop.id, name: stop.name, stopType: stop.type },
    })),
  }), [transitData])

  // ── Bbox updates (debounced) ─────────────────────────────────────────────────

  const updateBbox = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    if (!b) return
    const bboxStr = `${b.getWest().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getNorth().toFixed(4)}`
    const zoom = Math.floor(map.getZoom())
    onBboxChange(bboxStr, zoom)
  }, [onBboxChange])

  const onLoad    = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) registerMapIcons(map)
    updateBbox()
  }, [updateBbox])
  const onMoveEnd = useCallback(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(updateBbox, 300)
  }, [updateBbox])

  // ── Click handler ────────────────────────────────────────────────────────────

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const features = e.features
    if (!features?.length) return
    const feature = features[0]
    const layerId = feature.layer?.id

    // Event marker → select/deselect
    if (layerId === 'events-point') {
      const id = feature.properties?.id as string
      onEventSelect(id === activeId ? null : id)
      setTransitPopup(null)
      setVenuePopup(null)
      return
    }

    // Cluster → zoom in
    if (layerId === 'event-clusters' || layerId === 'venue-clusters' ||
        OSM_CLUSTER_LAYERS.has(layerId ?? '')) {
      const map = mapRef.current
      if (!map) return
      const clusterId  = feature.properties?.cluster_id as number
      const sourceName = feature.source as string
      const coords     = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      try {
        const source = map.getMap().getSource(sourceName) as GeoJSONSource | undefined
        source?.getClusterExpansionZoom(clusterId)
          .then(zoom => map.flyTo({ center: coords, zoom: zoom + 1, duration: 400 }))
          .catch(() => {})
      } catch { /* ignore */ }
      return
    }

    // Transit stop → show departures popup
    if (layerId === 'transit-point') {
      const props  = feature.properties
      if (!props) return
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      const stop: VBBStop = {
        id:   props.id as string,
        name: props.name as string,
        lat:  coords[1],
        lng:  coords[0],
        type: props.stopType as VBBStop['type'],
      }
      setTransitPopup({ lat: coords[1], lng: coords[0], stop })
      setActiveTransitId(props.id as string)
      setVenuePopup(null)
      return
    }

    // D1 venue marker → show info popup
    if (layerId === 'venues-point') {
      const props  = feature.properties
      if (!props) return
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      setVenuePopup({
        lat:      coords[1],
        lng:      coords[0],
        name:     (props.name as string) ?? 'Venue',
        category: (props.category as string) ?? 'other',
        address:  (props.address as string) ?? undefined,
        website:  (props.website as string) ?? undefined,
        id:       (props.id as string) ?? undefined,
        borough:  (props.borough as string) ?? undefined,
      })
      setTransitPopup(null)
      setGreenspacePopup(null)
      return
    }

    // OSM hipster venue marker → show info popup
    if (OSM_POINT_LAYERS.has(layerId ?? '')) {
      const props  = feature.properties
      if (!props) return
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      setVenuePopup({
        lat:      coords[1],
        lng:      coords[0],
        name:     (props.name as string) ?? 'Venue',
        category: (props.category as string) ?? 'other',
        address:  (props.address as string) ?? undefined,
        website:  (props.website as string) ?? undefined,
        id:       (props.id as string) ?? undefined,
      })
      setTransitPopup(null)
      setGreenspacePopup(null)
      return
    }

    // POI marker → show info popup (link to /pois/:id)
    if ((layerId ?? '').startsWith('poi-') && (layerId ?? '').endsWith('-point')) {
      const props  = feature.properties
      if (!props) return
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      const catGroup = (props.category_group as string) ?? ''
      const cat      = (props.category as string) ?? ''
      setVenuePopup({
        lat:      coords[1],
        lng:      coords[0],
        name:     (props.name as string) ?? `Unnamed ${getPOILabel(catGroup, cat)}`,
        category: getPOILabel(catGroup, cat),
        address:  (props.address as string) ?? undefined,
        website:  (props.website as string) ?? undefined,
        id:       `poi:${(props.id as string)?.replace('/', '_') ?? ''}`,
      })
      setTransitPopup(null)
      setGreenspacePopup(null)
      return
    }

    // POI cluster → zoom in
    if ((layerId ?? '').startsWith('poi-') && (layerId ?? '').endsWith('-clusters')) {
      const map = mapRef.current
      if (!map) return
      const clusterId  = feature.properties?.cluster_id as number
      const sourceName = feature.source as string
      const coords     = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      try {
        const source = map.getMap().getSource(sourceName) as GeoJSONSource | undefined
        source?.getClusterExpansionZoom(clusterId)
          .then(zoom => map.flyTo({ center: coords, zoom: zoom + 1, duration: 400 }))
          .catch(() => {})
      } catch { /* ignore */ }
      return
    }

    // Listing marker → show listing popup
    if (layerId === 'listings-point') {
      const props  = feature.properties
      if (!props) return
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      setListingPopup({
        lat:             coords[1],
        lng:             coords[0],
        id:              (props.id as string) ?? '',
        title:           (props.title as string) ?? 'Listing',
        type:            (props.type as string) ?? 'item',
        price_label:     (props.price_label as string) ?? '',
        first_image_url: (props.first_image_url as string) ?? null,
      })
      setVenuePopup(null)
      setTransitPopup(null)
      setGreenspacePopup(null)
      return
    }

    // Listing cluster → zoom in
    if (layerId === 'listings-clusters') {
      const map = mapRef.current
      if (!map) return
      const clusterId  = feature.properties?.cluster_id as number
      const coords     = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      try {
        const source = map.getMap().getSource('listings-source') as GeoJSONSource | undefined
        source?.getClusterExpansionZoom(clusterId)
          .then(zoom => map.flyTo({ center: coords, zoom: zoom + 1, duration: 400 }))
          .catch(() => {})
      } catch { /* ignore */ }
      return
    }

    // Radar vehicle → show line popup
    if (layerId === 'radar-vehicles') {
      const props  = feature.properties
      if (!props) return
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      setRadarPopup({
        lat:       coords[1],
        lng:       coords[0],
        line:      props.line      as string ?? '',
        direction: props.direction as string ?? '',
      })
      return
    }

    // Park / playground → show info popup
    if (layerId === 'parks-point' || layerId === 'playgrounds-point') {
      const props  = feature.properties
      if (!props) return
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      setGreenspacePopup({
        lat:     coords[1],
        lng:     coords[0],
        name:    (props.namenr as string) || (props.name as string) || 'Unnamed',
        type:    layerId === 'parks-point' ? 'park' : 'playground',
        kind:    (props.objartname as string) ?? null,
        borough: (props.bezirkname as string) ?? null,
        hood:    (props.ortstlname as string) ?? null,
        built:   (props.baujahr as string) ?? null,
        gid:     ((props.gml_id as string) ?? (props.fid as string)) || undefined,
      })
      setTransitPopup(null)
      setVenuePopup(null)
      return
    }
  }, [activeId, onEventSelect])

  const onMouseEnter = useCallback(() => setCursor('pointer'), [])
  const onMouseLeave = useCallback(() => setCursor('grab'), [])

  // ── Fly to active event ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeId) return
    const ev = events.find(e => e.id === activeId)
    if (ev?.lat && ev?.lng) {
      mapRef.current?.flyTo({ center: [ev.lng, ev.lat], zoom: 15, duration: 600 })
    }
  }, [activeId, events])

  // ── Clear transit popup when event deselected ────────────────────────────────

  useEffect(() => {
    if (!activeId) {
      setTransitPopup(null)
      setActiveTransitId(null)
    }
  }, [activeId])

  // Fly to venue when selected from sidebar
  useEffect(() => {
    if (!flyTo) return
    mapRef.current?.flyTo({ center: flyTo, zoom: 16, duration: 800 })
  }, [flyTo])

  // Programmatically open a venue popup (e.g. from Surprise Me)
  useEffect(() => {
    if (!openVenuePopup) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _key, ...data } = openVenuePopup
    setVenuePopup(data)
    setGreenspacePopup(null)
    setTransitPopup(null)
  }, [openVenuePopup])

  // ── Live radar polling ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!liveRadar) {
      setRadarData({ type: 'FeatureCollection', features: [] })
      return
    }

    async function fetchRadar() {
      const map = mapRef.current
      if (!map) return
      const b = map.getBounds()
      if (!b) return

      // Only within Berlin bounding box
      const center = map.getCenter()
      if (
        center.lat < BERLIN_BBOX.south || center.lat > BERLIN_BBOX.north ||
        center.lng < BERLIN_BBOX.west  || center.lng > BERLIN_BBOX.east
      ) return

      const params = new URLSearchParams({
        north:   b.getNorth().toFixed(4),
        south:   b.getSouth().toFixed(4),
        east:    b.getEast().toFixed(4),
        west:    b.getWest().toFixed(4),
        results: '128',
        frames:  '1',
      })

      try {
        const res = await fetch(`/api/proxy/vbb?path=${encodeURIComponent(`/radar?${params}`)}`)
        if (!res.ok) return
        const data = await res.json() as {
          movements?: Array<{
            line?:      { name?: string; product?: string }
            direction?: string
            location?:  { type: string; geometry: { type: string; coordinates: [number, number] } }
          }>
        }
        const features: GeoJSON.Feature[] = (data.movements ?? [])
          .filter(m => m.location?.geometry?.coordinates)
          .map(m => ({
            type: 'Feature' as const,
            geometry: m.location!.geometry as GeoJSON.Point,
            properties: {
              line:      m.line?.name      ?? '',
              product:   m.line?.product   ?? 'unknown',
              direction: m.direction       ?? '',
            },
          }))
        setRadarData({ type: 'FeatureCollection', features })
      } catch { /* ignore */ }
    }

    fetchRadar()
    const interval = setInterval(fetchRadar, 15000)
    return () => clearInterval(interval)
  }, [liveRadar])

  // Build interactiveLayerIds
  const osmInteractiveIds = useMemo(() => {
    return Object.keys(osmData).flatMap(key => [
      `osm-${key}-point`, `osm-${key}-clusters`,
    ])
  }, [osmData])

  const poiInteractiveIds = useMemo(() => {
    return Object.keys(poiData).flatMap(key => [
      `poi-${key}-point`, `poi-${key}-clusters`,
    ])
  }, [poiData])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        cursor={cursor}
        interactiveLayerIds={[
          'events-point', 'event-clusters',
          'transit-point',
          'venues-point', 'venue-clusters',
          'parks-point', 'playgrounds-point',
          'radar-vehicles',
          'listings-point', 'listings-clusters',
          ...osmInteractiveIds,
          ...poiInteractiveIds,
        ]}
        onLoad={onLoad}
        onMoveEnd={onMoveEnd}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <NavigationControl position="top-right" />

        {/* ── Parks (centroid points) ───────────── */}
        {showParks && parksData && (
          <Source id="parks" type="geojson" data={parksData}>
            <Layer
              id="parks-point"
              type="circle"
              paint={{
                'circle-radius':       10,
                'circle-color':        '#16a34a',
                'circle-stroke-color': '#14532d',
                'circle-stroke-width': 2,
                'circle-opacity':      0.9,
              }}
            />
            <Layer
              id="parks-icon"
              type="symbol"
              layout={{
                'icon-image':           'icon-outdoors',
                'icon-size':            0.55,
                'icon-allow-overlap':   true,
              }}
            />
          </Source>
        )}

        {/* ── Playgrounds (centroid points) ─────── */}
        {showPlaygrounds && playgroundsData && (
          <Source id="playgrounds" type="geojson" data={playgroundsData}>
            <Layer
              id="playgrounds-point"
              type="circle"
              paint={{
                'circle-radius':       10,
                'circle-color':        '#e879f9',
                'circle-stroke-color': '#86198f',
                'circle-stroke-width': 2,
                'circle-opacity':      0.9,
              }}
            />
          </Source>
        )}

        {/* ── D1 Venues (pre-filtered, clustered) ── */}
        {showVenues && venueGeoJSON && (
          <Source
            id="venues"
            type="geojson"
            data={venueGeoJSON}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={40}
          >
            <Layer
              id="venue-clusters"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color':  '#b45309',
                'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 30, 22],
                'circle-opacity': 0.85,
              }}
            />
            <Layer
              id="venue-cluster-count"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-size':  11,
                'text-font':  ['Noto Sans Bold', 'Open Sans Bold'],
              }}
              paint={{ 'text-color': '#fff' }}
            />
            <Layer
              id="venues-point"
              type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius':       10,
                'circle-color':        ['match', ['get', 'category'],
                  'museum',           '#b91c1c',
                  'gallery',          '#7c3aed',
                  'theatre',          '#0369a1',
                  'concert_hall',     '#b45309',
                  'cinema',           '#0891b2',
                  'library',          '#0369a1',
                  'community_centre', '#15803d',
                  '#b45309',  // default
                ],
                'circle-stroke-color': '#78350f',
                'circle-stroke-width': 2,
                'circle-opacity':      0.9,
              }}
            />
            <Layer
              id="venues-icon"
              type="symbol"
              filter={['!', ['has', 'point_count']]}
              layout={{
                'icon-image':           'icon-culture',
                'icon-size':            0.55,
                'icon-allow-overlap':   true,
              }}
            />
          </Source>
        )}

        {/* ── OSM venue layers (from props) ──────────────── */}
        {Object.entries(osmData).map(([key, data]) => {
          if (!data?.features?.length) return null
          const catConfig = OSM_CATS.find(c => c.key === key)
          const color  = catConfig?.color  ?? '#6b7280'
          const stroke = catConfig?.stroke ?? '#4b5563'
          return (
            <Source
              key={`osm-${key}`}
              id={`osm-${key}`}
              type="geojson"
              data={data}
              cluster={true}
              clusterMaxZoom={14}
              clusterRadius={40}
            >
              <Layer
                id={`osm-${key}-clusters`}
                type="circle"
                filter={['has', 'point_count']}
                paint={{
                  'circle-color':   color,
                  'circle-radius':  ['step', ['get', 'point_count'], 14, 10, 18, 30, 22],
                  'circle-opacity': 0.85,
                }}
              />
              <Layer
                id={`osm-${key}-cluster-count`}
                type="symbol"
                filter={['has', 'point_count']}
                layout={{
                  'text-field': '{point_count_abbreviated}',
                  'text-size':  11,
                  'text-font':  ['Noto Sans Bold', 'Open Sans Bold'],
                }}
                paint={{ 'text-color': '#fff' }}
              />
              <Layer
                id={`osm-${key}-point`}
                type="circle"
                filter={['!', ['has', 'point_count']]}
                paint={{
                  'circle-radius':       10,
                  'circle-color':        color,
                  'circle-stroke-color': stroke,
                  'circle-stroke-width': 2,
                  'circle-opacity':      0.9,
                }}
              />
              <Layer
                id={`osm-${key}-icon`}
                type="symbol"
                filter={['!', ['has', 'point_count']]}
                layout={{
                  'icon-image':           'icon-culture',
                  'icon-size':            0.55,
                  'icon-allow-overlap':   true,
                }}
              />
            </Source>
          )
        })}

        {/* ── POI layers (dynamic, keyed by group:category) ── */}
        {Object.entries(poiData).map(([key, data]) => {
          if (!data?.features?.length) return null
          const [group, cat] = key.split(':')
          const { color, stroke } = getPOIColor(group, cat)
          const minZoom = getMinZoomForFilter(key)
          return (
            <Source
              key={`poi-${key}`}
              id={`poi-${key}`}
              type="geojson"
              data={data}
              cluster={true}
              clusterMaxZoom={14}
              clusterRadius={40}
            >
              <Layer
                id={`poi-${key}-clusters`}
                type="circle"
                filter={['has', 'point_count']}
                minzoom={minZoom}
                paint={{
                  'circle-color':   color,
                  'circle-radius':  ['step', ['get', 'point_count'], 14, 10, 18, 30, 22],
                  'circle-opacity': 0.85,
                }}
              />
              <Layer
                id={`poi-${key}-cluster-count`}
                type="symbol"
                filter={['has', 'point_count']}
                minzoom={minZoom}
                layout={{
                  'text-field': '{point_count_abbreviated}',
                  'text-size':  11,
                  'text-font':  ['Noto Sans Bold', 'Open Sans Bold'],
                }}
                paint={{ 'text-color': '#fff' }}
              />
              <Layer
                id={`poi-${key}-point`}
                type="circle"
                filter={['!', ['has', 'point_count']]}
                minzoom={minZoom}
                paint={{
                  'circle-radius':       10,
                  'circle-color':        color,
                  'circle-stroke-color': stroke,
                  'circle-stroke-width': 2,
                  'circle-opacity':      0.9,
                }}
              />
              <Layer
                id={`poi-${key}-icon`}
                type="symbol"
                filter={['!', ['has', 'point_count']]}
                minzoom={minZoom}
                layout={{
                  'icon-image':           `icon-${group}`,
                  'icon-size':            0.55,
                  'icon-allow-overlap':   true,
                }}
              />
            </Source>
          )
        })}

        {/* ── Events (clustered, data-driven color) ─ */}
        {mode === 'events' && <Source
          id="events"
          type="geojson"
          data={eventsGeoJSON}
          cluster={true}
          clusterMaxZoom={13}
          clusterRadius={50}
        >
          <Layer
            id="event-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color':  '#374151',
              'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
              'circle-opacity': 0.85,
            }}
          />
          <Layer
            id="event-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': '{point_count_abbreviated}',
              'text-size':  12,
              'text-font':  ['Noto Sans Bold', 'Open Sans Bold'],
            }}
            paint={{ 'text-color': '#fff' }}
          />
          <Layer
            id="events-point"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius': ['case',
                ['==', ['get', 'id'], activeId ?? ''], 13, 10],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': ['case',
                ['==', ['get', 'id'], activeId ?? ''], 3, 2],
              'circle-stroke-color': ['case',
                ['==', ['get', 'id'], activeId ?? ''], '#000', '#fff'],
              'circle-opacity': 0.9,
            }}
          />
          <Layer
            id="events-icon"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'icon-image':           'icon-events',
              'icon-size':            0.55,
              'icon-allow-overlap':   true,
            }}
          />
        </Source>}

        {/* ── Transit stops (when event selected OR venue popup open) ── */}
        {(activeId || venuePopup) && (
          <Source id="transit" type="geojson" data={transitGeoJSON}>
            <Layer
              id="transit-point"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': [
                  'match', ['get', 'stopType'],
                  'subway',   '#1d4ed8',
                  'suburban', '#15803d',
                  'tram',     '#b91c1c',
                  'bus',      '#6b7280',
                  '#374151',
                ],
                'circle-stroke-color': [
                  'match', ['get', 'stopType'],
                  'subway',   '#1e40af',
                  'suburban', '#14532d',
                  'tram',     '#991b1b',
                  'bus',      '#4b5563',
                  '#111827',
                ],
                'circle-stroke-width': 1.5,
                'circle-opacity':      0.85,
              }}
            />
          </Source>
        )}

        {/* ── Live vehicle radar ───────────────────── */}
        {liveRadar && (
          <Source id="radar-source" type="geojson" data={radarData}>
            <Layer
              id="radar-vehicles"
              type="circle"
              paint={{
                'circle-radius': 5,
                'circle-color': [
                  'match', ['get', 'product'],
                  'subway',   '#1d4ed8',
                  'suburban', '#15803d',
                  'tram',     '#b91c1c',
                  'bus',      '#6b7280',
                  '#374151',
                ],
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 1,
                'circle-opacity':      0.9,
              }}
            />
          </Source>
        )}

        {/* ── Listings markers ────────────────────── */}
        {mode === 'listings' && listingsData && (
          <Source id="listings-source" type="geojson" data={listingsData} cluster clusterMaxZoom={14} clusterRadius={40}>
            <Layer
              id="listings-clusters"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-radius':       ['step', ['get', 'point_count'], 14, 10, 18, 50, 22],
                'circle-color':        '#2563eb',
                'circle-stroke-color': '#1e40af',
                'circle-stroke-width': 2,
                'circle-opacity':      0.85,
              }}
            />
            <Layer
              id="listings-cluster-count"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field':   '{point_count_abbreviated}',
                'text-size':    11,
                'text-font':    ['Open Sans Bold'],
              }}
              paint={{ 'text-color': '#ffffff' }}
            />
            <Layer
              id="listings-point"
              type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius':       10,
                'circle-color':        [
                  'match', ['get', 'type'],
                  'apartment_rent', '#2563eb',
                  'apartment_buy',  '#16a34a',
                  'item',           '#d97706',
                  'service',        '#7c3aed',
                  '#6b7280',
                ],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
                'circle-opacity':      0.9,
              }}
            />
            <Layer
              id="listings-icon"
              type="symbol"
              filter={['!', ['has', 'point_count']]}
              layout={{
                'icon-image':           'icon-listings',
                'icon-size':            0.55,
                'icon-allow-overlap':   true,
              }}
            />
            <Layer
              id="listings-price"
              type="symbol"
              filter={['!', ['has', 'point_count']]}
              layout={{
                'text-field':   ['get', 'price_label'],
                'text-size':    10,
                'text-offset':  [0, 1.5],
                'text-anchor':  'top',
                'text-font':    ['Open Sans Bold'],
              }}
              paint={{
                'text-color':      '#374151',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
              }}
            />
          </Source>
        )}

        {/* ── Active event popup ───────────────────── */}
        {activeId && activeEvent?.lat && activeEvent?.lng && (
          <Popup
            longitude={activeEvent.lng}
            latitude={activeEvent.lat}
            anchor="bottom"
            closeButton={false}
            onClose={() => onEventSelect(null)}
            maxWidth="260px"
          >
            <div className="font-sans text-xs border-2 border-black bg-white shadow-[3px_3px_0_#000] min-w-[200px]">
              <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1">
                <p className="font-bold text-gray-900 leading-snug">{activeEvent.title}</p>
                <button
                  onClick={() => onEventSelect(null)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center border border-black hover:bg-black hover:text-white font-bold text-[11px] leading-none mt-0.5"
                  aria-label="Close"
                >✕</button>
              </div>
              <div className="px-3 pb-2.5 space-y-0.5">
                {activeEvent.location_name && (
                  <p className="text-gray-500">{activeEvent.location_name}</p>
                )}
                {activeEvent.borough && (
                  <p className="text-gray-400">{activeEvent.borough}</p>
                )}
                <p className="text-gray-600 pt-0.5">
                  {[
                    activeEvent.time_start?.slice(0, 5),
                    activeEvent.price_type === 'free' ? 'Free'
                      : activeEvent.price_type === 'paid' ? 'Paid'
                      : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {activeEvent.location_id && (
                  <Link
                    href={`/locations/${activeEvent.location_id}`}
                    className="inline-block mt-1 text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white transition-colors"
                  >
                    View venue →
                  </Link>
                )}
              </div>
              {transitData && transitData.length > 0 && (
                <div className="px-3 pb-2.5 pt-1.5 border-t border-gray-100 flex flex-wrap gap-1.5">
                  {(['subway', 'suburban', 'tram', 'bus'] as const).map(type => {
                    const stop = transitData.find(s => s.type === type)
                    if (!stop) return null
                    const meta = {
                      subway:   { s: 'U', c: '#1d4ed8' },
                      suburban: { s: 'S', c: '#15803d' },
                      tram:     { s: 'T', c: '#b91c1c' },
                      bus:      { s: 'B', c: '#6b7280' },
                    }[type]
                    return (
                      <span key={type} className="flex items-center gap-1 text-[10px] text-gray-600">
                        <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-extrabold text-white shrink-0" style={{ background: meta.c }}>{meta.s}</span>
                        {stop.name}
                      </span>
                    )
                  })}
                </div>
              )}
              {activeEvent.lat && activeEvent.lng && (
                <div className="px-3 pb-2.5 pt-1 border-t border-gray-100">
                  <JourneyWidget toLat={activeEvent.lat} toLng={activeEvent.lng} />
                </div>
              )}
            </div>
          </Popup>
        )}

        {/* ── Transit stop popup ───────────────────── */}
        {transitPopup && (
          <Popup
            longitude={transitPopup.lng}
            latitude={transitPopup.lat}
            anchor="bottom"
            closeButton={false}
            onClose={() => { setTransitPopup(null); setActiveTransitId(null) }}
            maxWidth="300px"
          >
            <div className="border-2 border-black bg-white shadow-[3px_3px_0_#000]">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Transit</span>
                <button
                  onClick={() => { setTransitPopup(null); setActiveTransitId(null) }}
                  className="w-5 h-5 flex items-center justify-center border border-black hover:bg-black hover:text-white font-bold text-[11px] leading-none"
                  aria-label="Close"
                >✕</button>
              </div>
              <div className="px-3 py-2">
                <TransitPopupContent
                  stop={transitPopup.stop}
                  departures={departures}
                  loading={depsLoading}
                />
              </div>
            </div>
          </Popup>
        )}

        {/* ── Venue popup ──────────────────────────── */}
        {venuePopup && (
          <Popup
            longitude={venuePopup.lng}
            latitude={venuePopup.lat}
            anchor="bottom"
            closeButton={false}
            onClose={() => setVenuePopup(null)}
            maxWidth="280px"
          >
            <div className="font-sans text-xs border-2 border-black bg-white shadow-[3px_3px_0_#000] min-w-[200px]">
              <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1">
                <div>
                  <p className="font-bold text-gray-900 leading-snug">{venuePopup.name}</p>
                  {venuePopup.category && (
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{venuePopup.category}</p>
                  )}
                </div>
                <button
                  onClick={() => setVenuePopup(null)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center border border-black hover:bg-black hover:text-white font-bold text-[11px] leading-none mt-0.5"
                  aria-label="Close"
                >✕</button>
              </div>
              <div className="px-3 pb-2.5 space-y-1">
                {venuePopup.address && (
                  <p className="text-gray-500 font-mono text-[10px]">{venuePopup.address}</p>
                )}
                {venuePopup.website && (
                  <a
                    href={venuePopup.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 underline break-all text-[10px] block"
                  >
                    {venuePopup.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {/* Directions + Street View */}
                <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${venuePopup.lat},${venuePopup.lng}&travelmode=transit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white"
                  >
                    ↗ Directions
                  </a>
                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${venuePopup.lat},${venuePopup.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-gray-500 border border-gray-300 px-1.5 py-0.5 hover:border-black"
                  >
                    Street View
                  </a>
                  {venuePopup.id && venuePopup.id.startsWith('poi:') && (
                    <Link
                      href={`/pois/${venuePopup.id.replace('poi:', '')}`}
                      className="inline-block text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white transition-colors"
                    >
                      View details →
                    </Link>
                  )}
                  {venuePopup.id && !venuePopup.id.startsWith('node/') && !venuePopup.id.startsWith('way/') && !venuePopup.id.startsWith('poi:') && (
                    <Link
                      href={`/locations/${venuePopup.id}`}
                      className="inline-block text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white transition-colors"
                    >
                      View venue →
                    </Link>
                  )}
                </div>
                {/* Vibe Check */}
                {venuePopup.id && (
                  <VibeCheck
                    id={venuePopup.id}
                    name={venuePopup.name}
                    category={venuePopup.category}
                    borough={venuePopup.borough}
                  />
                )}
              </div>
              {transitData && transitData.length > 0 && (
                <div className="px-3 pb-2.5 pt-1.5 border-t border-gray-100 flex flex-wrap gap-1.5">
                  {(['subway', 'suburban', 'tram', 'bus'] as const).map(type => {
                    const stop = transitData.find(s => s.type === type)
                    if (!stop) return null
                    const meta = {
                      subway:   { s: 'U', c: '#1d4ed8' },
                      suburban: { s: 'S', c: '#15803d' },
                      tram:     { s: 'T', c: '#b91c1c' },
                      bus:      { s: 'B', c: '#6b7280' },
                    }[type]
                    return (
                      <span key={type} className="flex items-center gap-1 text-[10px] text-gray-600">
                        <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-extrabold text-white shrink-0" style={{ background: meta.c }}>{meta.s}</span>
                        {stop.name}
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="px-3 pb-2.5 pt-1 border-t border-gray-100">
                <JourneyWidget toLat={venuePopup.lat} toLng={venuePopup.lng} />
              </div>
            </div>
          </Popup>
        )}

        {/* ── Park / playground popup ──────────────── */}
        {greenspacePopup && (
          <Popup
            longitude={greenspacePopup.lng}
            latitude={greenspacePopup.lat}
            anchor="bottom"
            closeButton={false}
            onClose={() => setGreenspacePopup(null)}
            maxWidth="260px"
          >
            <div className="font-sans text-xs border-2 border-black bg-white shadow-[3px_3px_0_#000] min-w-[200px]">
              <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1">
                <div>
                  <p className="font-bold text-gray-900 leading-snug">{greenspacePopup.name}</p>
                  <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: greenspacePopup.type === 'park' ? '#16a34a' : '#a21caf' }}>
                    {greenspacePopup.kind ?? (greenspacePopup.type === 'park' ? 'Park' : 'Playground')}
                  </p>
                </div>
                <button
                  onClick={() => setGreenspacePopup(null)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center border border-black hover:bg-black hover:text-white font-bold text-[11px] leading-none mt-0.5"
                  aria-label="Close"
                >✕</button>
              </div>
              <div className="px-3 pb-2.5 space-y-0.5">
                {greenspacePopup.hood && (
                  <p className="text-gray-500">{greenspacePopup.hood}</p>
                )}
                {greenspacePopup.borough && greenspacePopup.borough !== greenspacePopup.hood && (
                  <p className="text-gray-400">{greenspacePopup.borough}</p>
                )}
                {greenspacePopup.built && (
                  <p className="text-gray-400 text-[10px]">Built {greenspacePopup.built}</p>
                )}
                {greenspacePopup.gid && (
                  <Link
                    href={`/${greenspacePopup.type === 'park' ? 'parks' : 'playgrounds'}/${encodeURIComponent(greenspacePopup.gid)}`}
                    className="inline-block text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white transition-colors mt-1"
                  >
                    View →
                  </Link>
                )}
              </div>
            </div>
          </Popup>
        )}
        {/* ── Radar vehicle popup ──────────────────── */}
        {radarPopup && (
          <Popup
            longitude={radarPopup.lng}
            latitude={radarPopup.lat}
            anchor="bottom"
            closeButton={false}
            onClose={() => setRadarPopup(null)}
            maxWidth="200px"
          >
            <div className="font-sans text-xs border-2 border-black bg-white shadow-[3px_3px_0_#000] px-3 py-2 min-w-[120px]">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-gray-900">{radarPopup.line || 'Vehicle'}</p>
                <button
                  onClick={() => setRadarPopup(null)}
                  className="w-4 h-4 flex items-center justify-center border border-black hover:bg-black hover:text-white font-bold text-[10px] leading-none shrink-0"
                  aria-label="Close"
                >✕</button>
              </div>
              {radarPopup.direction && (
                <p className="text-[10px] text-gray-500 mt-0.5">→ {radarPopup.direction}</p>
              )}
            </div>
          </Popup>
        )}
        {/* ── Listing popup ────────────────────── */}
        {listingPopup && (
          <Popup
            longitude={listingPopup.lng}
            latitude={listingPopup.lat}
            anchor="bottom"
            closeButton={false}
            onClose={() => setListingPopup(null)}
            maxWidth="260px"
          >
            <div className="font-sans text-xs border-2 border-black bg-white shadow-[3px_3px_0_#000] min-w-[200px]">
              <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1">
                <div>
                  <p className="font-bold text-gray-900 leading-snug">{listingPopup.title}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5" style={{
                    color: listingPopup.type === 'apartment_rent' ? '#2563eb'
                         : listingPopup.type === 'apartment_buy'  ? '#16a34a'
                         : listingPopup.type === 'item'           ? '#d97706'
                         : '#7c3aed',
                  }}>
                    {listingPopup.type.replace('_', ' ')}
                  </p>
                </div>
                <button
                  onClick={() => setListingPopup(null)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center border border-black hover:bg-black hover:text-white font-bold text-[11px] leading-none mt-0.5"
                  aria-label="Close"
                >✕</button>
              </div>
              <div className="px-3 pb-2.5 space-y-1">
                {listingPopup.first_image_url && (
                  <img src={listingPopup.first_image_url} alt="" className="w-full h-20 object-cover border border-gray-200" />
                )}
                {listingPopup.price_label && (
                  <p className="text-sm font-semibold text-gray-800">{listingPopup.price_label}</p>
                )}
                <Link
                  href={`/listings/${listingPopup.id}`}
                  className="inline-block text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white transition-colors"
                >
                  Details →
                </Link>
              </div>
            </div>
          </Popup>
        )}
      </Map>

    </div>
  )
}
