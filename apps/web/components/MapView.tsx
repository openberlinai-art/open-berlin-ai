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
  useParks, usePlaygrounds, useVenuesByBbox, useTransitStops, useDepartures,
} from '@/hooks/useCulturalData'
import type { VBBStop, Departure } from '@/lib/opendata'

const MAP_STYLE   = 'https://tiles.openfreemap.org/styles/liberty'
const INITIAL_VIEW = { longitude: 13.405, latitude: 52.52, zoom: 11 }

interface Props {
  events:        Event[]
  activeId:      string | null
  onEventSelect: (id: string | null) => void
  layers:        { parks: boolean; playgrounds: boolean; venues: boolean; galleries: boolean; museums: boolean }
  mode:          'events' | 'venues'
  venueCat?:     string
  onBboxChange:  (bbox: string) => void
  flyTo?:        [number, number] | null
}

interface TransitPopupState {
  lat:  number
  lng:  number
  stop: VBBStop
}

interface VenuePopupState {
  lat:      number
  lng:      number
  name:     string
  category: string
  address?: string
  website?: string
  id?:      string
}

interface GreenspacePopupState {
  lat:      number
  lng:      number
  name:     string
  type:     'park' | 'playground'
  kind:     string | null   // objartname
  borough:  string | null   // bezirkname
  hood:     string | null   // ortstlname
  built:    string | null   // baujahr
}

// ─── Transit popup content ────────────────────────────────────────────────────

function TransitPopupContent({
  stop, departures, loading,
}: {
  stop: VBBStop; departures: Departure[] | undefined; loading: boolean
}) {
  const typeColor: Record<string, string> = {
    subway: '#1d4ed8', suburban: '#15803d', tram: '#b91c1c',
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

export default function MapView({ events, activeId, onEventSelect, layers, mode, venueCat, onBboxChange, flyTo }: Props) {
  const mapRef     = useRef<MapRef>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [bbox,          setBbox]          = useState<string | null>(null)
  const [transitPopup,    setTransitPopup]    = useState<TransitPopupState | null>(null)
  const [venuePopup,      setVenuePopup]      = useState<VenuePopupState | null>(null)
  const [greenspacePopup, setGreenspacePopup] = useState<GreenspacePopupState | null>(null)
  const [activeTransitId, setActiveTransitId] = useState<string | null>(null)
  const [cursor,        setCursor]        = useState('grab')

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: parksData,      isFetching: parksFetching }      = useParks(layers.parks)
  const { data: playgroundsData, isFetching: playgroundsFetching } = usePlaygrounds(layers.playgrounds)
  // For the venues layer: when a specific non-museum/gallery category is selected, pass it as a filter
  const venuesBboxCat = venueCat && venueCat !== 'all' && !['museum', 'gallery'].includes(venueCat)
    ? venueCat
    : undefined

  const { data: venuesData,     isFetching: venuesFetching,
          isError: venuesError }                                   = useVenuesByBbox(bbox, layers.venues, venuesBboxCat)
  const { data: galleriesData, isFetching: galleriesFetching }    = useVenuesByBbox(bbox, layers.galleries, 'gallery')
  const { data: museumsData,   isFetching: museumsFetching }      = useVenuesByBbox(bbox, layers.museums, 'museum')

  const activeEvent = useMemo(
    () => events.find(e => e.id === activeId) ?? null,
    [events, activeId],
  )

  const { data: transitData } = useTransitStops(
    activeEvent?.lat ?? null,
    activeEvent?.lng ?? null,
    !!activeEvent?.lat && !!activeEvent?.lng,
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
        layerId === 'gallery-clusters' || layerId === 'museum-clusters') {
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
      })
      setTransitPopup(null)
      setGreenspacePopup(null)
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

  const isFetching = parksFetching || playgroundsFetching || venuesFetching || galleriesFetching || museumsFetching

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

        {/* ── Transit stops (when event selected) ── */}
        {activeId && (
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
                  '#374151',
                ],
                'circle-stroke-color': [
                  'match', ['get', 'stopType'],
                  'subway',   '#1e40af',
                  'suburban', '#14532d',
                  'tram',     '#991b1b',
                  '#111827',
                ],
                'circle-stroke-width': 1.5,
                'circle-opacity':      0.85,
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
            maxWidth="260px"
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
                {venuePopup.id && (
                  <Link
                    href={`/locations/${venuePopup.id}`}
                    className="inline-block mt-0.5 text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white transition-colors"
                  >
                    View venue →
                  </Link>
                )}
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
