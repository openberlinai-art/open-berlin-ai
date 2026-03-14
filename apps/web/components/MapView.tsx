'use client'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { getCategoryHex } from '@/lib/utils'
import type { Event }     from '@/lib/types'
import {
  useParks, usePlaygrounds, useVenuesByBbox, useTransitStops, useDepartures, useOSMVenues,
} from '@/hooks/useCulturalData'
import type { VBBStop, Departure } from '@/lib/opendata'
import VibeCheck from './VibeCheck'
import JourneyWidget from './JourneyWidget'

const MAP_STYLE   = 'https://tiles.openfreemap.org/styles/liberty'
const INITIAL_VIEW = { longitude: 13.405, latitude: 52.52, zoom: 11 }

// ─── OSM category config ───────────────────────────────────────────────────────

const OSM_CATS = [
  { key: 'vintage',    color: '#d97706', stroke: '#92400e' },
  { key: 'vinyl',      color: '#7c3aed', stroke: '#4c1d95' },
  { key: 'books',      color: '#0369a1', stroke: '#0c4a6e' },
  { key: 'cafe',       color: '#b45309', stroke: '#78350f' },
  { key: 'craft_beer', color: '#c2410c', stroke: '#7c2d12' },
  { key: 'tattoo',     color: '#be123c', stroke: '#881337' },
  { key: 'bike',       color: '#15803d', stroke: '#14532d' },
  { key: 'vegan',      color: '#65a30d', stroke: '#365314' },
  { key: 'street_art', color: '#e879f9', stroke: '#a21caf' },
] as const

type OsmKey = typeof OSM_CATS[number]['key']

const OSM_POINT_LAYERS   = new Set(OSM_CATS.map(c => `osm-${c.key}-point`))
const OSM_CLUSTER_LAYERS = new Set(OSM_CATS.map(c => `osm-${c.key}-clusters`))

interface Props {
  events:        Event[]
  activeId:      string | null
  onEventSelect: (id: string | null) => void
  layers: {
    parks: boolean; playgrounds: boolean
    venues: boolean; galleries: boolean; museums: boolean
    vintage: boolean; vinyl: boolean; books: boolean; cafe: boolean
    craft_beer: boolean; tattoo: boolean; bike: boolean; vegan: boolean
    street_art: boolean
  }
  mode:            'events' | 'venues'
  venueCat?:       string
  onBboxChange:    (bbox: string) => void
  flyTo?:          [number, number] | null
  openVenuePopup?: ({ _key: number } & VenuePopupState) | null
  liveRadar?:      boolean
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

export default function MapView({ events, activeId, onEventSelect, layers, mode, venueCat, onBboxChange, flyTo, openVenuePopup, liveRadar = false }: Props) {
  const mapRef     = useRef<MapRef>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [bbox,             setBbox]             = useState<string | null>(null)
  const [transitPopup,     setTransitPopup]     = useState<TransitPopupState | null>(null)
  const [venuePopup,       setVenuePopup]       = useState<VenuePopupState | null>(null)
  const [greenspacePopup,  setGreenspacePopup]  = useState<GreenspacePopupState | null>(null)
  const [activeTransitId,  setActiveTransitId]  = useState<string | null>(null)
  const [cursor,           setCursor]           = useState('grab')
  const [radarData,        setRadarData]        = useState<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] })
  const [radarPopup,       setRadarPopup]       = useState<RadarPopupState | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: parksData,       isFetching: parksFetching }       = useParks(layers.parks)
  const { data: playgroundsData, isFetching: playgroundsFetching } = usePlaygrounds(layers.playgrounds)

  const venuesBboxCat = venueCat && venueCat !== 'all' && !['museum', 'gallery'].includes(venueCat)
    ? venueCat
    : undefined

  const { data: venuesData,    isFetching: venuesFetching,
          isError: venuesError }                                    = useVenuesByBbox(bbox, layers.venues, venuesBboxCat)
  const { data: galleriesData, isFetching: galleriesFetching }     = useVenuesByBbox(bbox, layers.galleries, 'gallery')
  const { data: museumsData,   isFetching: museumsFetching }       = useVenuesByBbox(bbox, layers.museums, 'museum')

  // OSM hipster venue layers
  const { data: vintageData }    = useOSMVenues('vintage',    layers.vintage)
  const { data: vinylData }      = useOSMVenues('vinyl',      layers.vinyl)
  const { data: booksData }      = useOSMVenues('books',      layers.books)
  const { data: cafeData }       = useOSMVenues('cafe',       layers.cafe)
  const { data: craftBeerData }  = useOSMVenues('craft_beer', layers.craft_beer)
  const { data: tattooData }     = useOSMVenues('tattoo',     layers.tattoo)
  const { data: bikeData }       = useOSMVenues('bike',       layers.bike)
  const { data: veganData }      = useOSMVenues('vegan',      layers.vegan)
  const { data: streetArtData }  = useOSMVenues('street_art', layers.street_art)

  const osmDataMap: Record<OsmKey, GeoJSON.FeatureCollection | undefined> = {
    vintage:    vintageData,
    vinyl:      vinylData,
    books:      booksData,
    cafe:       cafeData,
    craft_beer: craftBeerData,
    tattoo:     tattooData,
    bike:       bikeData,
    vegan:      veganData,
    street_art: streetArtData,
  }

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
    setBbox(bboxStr)
    onBboxChange(bboxStr)
  }, [onBboxChange])

  const onLoad    = useCallback(() => updateBbox(), [updateBbox])
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
        layerId === 'gallery-clusters' || layerId === 'museum-clusters' ||
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

    // Venue / gallery / museum marker → show info popup
    if (layerId === 'venues-point' || layerId === 'galleries-point' || layerId === 'museums-point') {
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

  const isFetching = parksFetching || playgroundsFetching || venuesFetching || galleriesFetching || museumsFetching

  // Build interactiveLayerIds
  const osmInteractiveIds = OSM_CATS.flatMap(c => [
    `osm-${c.key}-point`, `osm-${c.key}-clusters`,
  ])

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
          'venues-point',    'venue-clusters',
          'galleries-point', 'gallery-clusters',
          'museums-point',   'museum-clusters',
          'parks-point', 'playgrounds-point',
          'radar-vehicles',
          ...osmInteractiveIds,
        ]}
        onLoad={onLoad}
        onMoveEnd={onMoveEnd}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <NavigationControl position="top-right" />

        {/* ── Parks (centroid points) ───────────── */}
        {layers.parks && parksData && (
          <Source id="parks" type="geojson" data={parksData}>
            <Layer
              id="parks-point"
              type="circle"
              paint={{
                'circle-radius':       6,
                'circle-color':        '#16a34a',
                'circle-stroke-color': '#14532d',
                'circle-stroke-width': 1.5,
                'circle-opacity':      0.85,
              }}
            />
          </Source>
        )}

        {/* ── Playgrounds (centroid points) ─────── */}
        {layers.playgrounds && playgroundsData && (
          <Source id="playgrounds" type="geojson" data={playgroundsData}>
            <Layer
              id="playgrounds-point"
              type="circle"
              paint={{
                'circle-radius':       6,
                'circle-color':        '#e879f9',
                'circle-stroke-color': '#86198f',
                'circle-stroke-width': 1.5,
                'circle-opacity':      0.85,
              }}
            />
          </Source>
        )}

        {/* ── Venues (D1 bbox, clustered) ───────── */}
        {layers.venues && venuesData && (
          <Source
            id="venues"
            type="geojson"
            data={venuesData}
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
                'circle-radius':       6,
                'circle-color':        '#b45309',
                'circle-stroke-color': '#78350f',
                'circle-stroke-width': 1.5,
                'circle-opacity':      0.85,
              }}
            />
          </Source>
        )}

        {/* ── Galleries (D1 bbox, clustered) ───────── */}
        {layers.galleries && galleriesData && (
          <Source
            id="galleries"
            type="geojson"
            data={galleriesData}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={40}
          >
            <Layer
              id="gallery-clusters"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color':  '#6d28d9',
                'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 30, 22],
                'circle-opacity': 0.85,
              }}
            />
            <Layer
              id="gallery-cluster-count"
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
              id="galleries-point"
              type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius':       6,
                'circle-color':        '#7c3aed',
                'circle-stroke-color': '#4c1d95',
                'circle-stroke-width': 1.5,
                'circle-opacity':      0.85,
              }}
            />
          </Source>
        )}

        {/* ── Museums (D1 bbox, clustered) ─────────── */}
        {layers.museums && museumsData && (
          <Source
            id="museums"
            type="geojson"
            data={museumsData}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={40}
          >
            <Layer
              id="museum-clusters"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color':  '#991b1b',
                'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 30, 22],
                'circle-opacity': 0.85,
              }}
            />
            <Layer
              id="museum-cluster-count"
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
              id="museums-point"
              type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius':       6,
                'circle-color':        '#b91c1c',
                'circle-stroke-color': '#7f1d1d',
                'circle-stroke-width': 1.5,
                'circle-opacity':      0.85,
              }}
            />
          </Source>
        )}

        {/* ── OSM hipster venue layers ──────────────── */}
        {OSM_CATS.map(cat => {
          const data = osmDataMap[cat.key]
          if (!layers[cat.key] || !data) return null
          return (
            <Source
              key={cat.key}
              id={`osm-${cat.key}`}
              type="geojson"
              data={data}
              cluster={true}
              clusterMaxZoom={14}
              clusterRadius={40}
            >
              <Layer
                id={`osm-${cat.key}-clusters`}
                type="circle"
                filter={['has', 'point_count']}
                paint={{
                  'circle-color':   cat.color,
                  'circle-radius':  ['step', ['get', 'point_count'], 14, 10, 18, 30, 22],
                  'circle-opacity': 0.85,
                }}
              />
              <Layer
                id={`osm-${cat.key}-cluster-count`}
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
                id={`osm-${cat.key}-point`}
                type="circle"
                filter={['!', ['has', 'point_count']]}
                paint={{
                  'circle-radius':       6,
                  'circle-color':        cat.color,
                  'circle-stroke-color': cat.stroke,
                  'circle-stroke-width': 1.5,
                  'circle-opacity':      0.85,
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
              'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 24],
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
                ['==', ['get', 'id'], activeId ?? ''], 11, 8],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': ['case',
                ['==', ['get', 'id'], activeId ?? ''], 3, 1.5],
              'circle-stroke-color': ['case',
                ['==', ['get', 'id'], activeId ?? ''], '#000', '#fff'],
              'circle-opacity': 0.9,
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
                  {venuePopup.id && !venuePopup.id.startsWith('node/') && !venuePopup.id.startsWith('way/') && (
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
      </Map>

      {/* ── Loading / error badges ─────────────────── */}
      {(isFetching || venuesError) && (
        <div className="absolute bottom-8 left-2 z-10 flex flex-col gap-1 pointer-events-none">
          {parksFetching && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading parks…
            </span>
          )}
          {playgroundsFetching && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading playgrounds…
            </span>
          )}
          {venuesFetching && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading venues…
            </span>
          )}
          {galleriesFetching && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading galleries…
            </span>
          )}
          {museumsFetching && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading museums…
            </span>
          )}
          {venuesError && (
            <span className="text-[10px] bg-red-100 border border-red-400 text-red-700 px-2 py-0.5">
              Venues unavailable
            </span>
          )}
        </div>
      )}
    </div>
  )
}
