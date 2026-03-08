'use client'
import { useEffect, useRef, useState } from 'react'
import type { Map as LMap, CircleMarker, GeoJSON as LGeoJSON, LayerGroup } from 'leaflet'
import { getCategoryHex }  from '@/lib/utils'
import type { Event }      from '@/lib/types'
import { fetchParks, fetchPlaygrounds, fetchTransitStops, type TransitStop } from '@/lib/opendata'

interface LayerState { parks: boolean; playgrounds: boolean }

interface Props {
  events:   Event[]
  activeId: string | null
  layers:   LayerState
}

export default function BerlinMap({ events, activeId, layers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const markersRef   = useRef<Map<string, CircleMarker>>(new Map())
  const [mapReady, setMapReady] = useState(false)

  // Layer refs
  const parksLayerRef       = useRef<LGeoJSON | null>(null)
  const playgroundsLayerRef = useRef<LGeoJSON | null>(null)
  const transitGroupRef     = useRef<LayerGroup | null>(null)

  // Data caches — survive remount
  const parksCacheRef       = useRef<GeoJSON.FeatureCollection | null>(null)
  const playgroundsCacheRef = useRef<GeoJSON.FeatureCollection | null>(null)
  const transitCacheRef     = useRef<Map<string, TransitStop[]>>(new Map())

  const [parksLoading, setParksLoading]             = useState(false)
  const [playgroundsLoading, setPlaygroundsLoading] = useState(false)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Dynamic import keeps Leaflet out of the SSR bundle
    import('leaflet').then(L => {
      // Fix default icon paths broken by bundlers
      delete (L.Icon.Default.prototype as unknown as Record<string,unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current!, {
        center:           [52.52, 13.405],
        zoom:             11,
        zoomControl:      false,
        scrollWheelZoom:  true,
        zoomAnimation:    true,
        markerZoomAnimation: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains:  'abcd',
        maxZoom:     20,
      }).addTo(map)

      L.control.zoom({ position: 'topright' }).addTo(map)
      mapRef.current = map
      // Defer setMapReady so the flex container has its final dimensions
      // before markers are placed; without this, markers land at wrong
      // pixel positions and only snap into view on the first zoom.
      requestAnimationFrame(() => {
        map.invalidateSize()
        setMapReady(true)
      })
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current.clear()
      parksLayerRef.current = null
      playgroundsLayerRef.current = null
      transitGroupRef.current = null
      // Do NOT clear data caches — they survive remount
    }
  }, [])

  // Sync markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    import('leaflet').then(L => {
      const alive    = new Set(events.filter(e => e.lat && e.lng).map(e => e.id))
      const existing = markersRef.current

      // Remove stale
      existing.forEach((marker, id) => {
        if (!alive.has(id)) { marker.remove(); existing.delete(id) }
      })

      // Add / update
      events.forEach(ev => {
        if (!ev.lat || !ev.lng) return
        const color  = getCategoryHex(ev.category)
        const isActive = ev.id === activeId

        if (existing.has(ev.id)) {
          const m = existing.get(ev.id)!
          m.setStyle({
            color:       isActive ? '#000' : color,
            fillColor:   color,
            fillOpacity: isActive ? 1 : 0.8,
            weight:      isActive ? 3 : 1.5,
            radius:      isActive ? 12 : 8,
          })
        } else {
          const time  = ev.time_start?.slice(0, 5) ?? ''
          const price = ev.price_type === 'free' ? '🟢 Free' : ev.price_type === 'paid' ? '🔴 Paid' : ''

          const marker = L.circleMarker([ev.lat, ev.lng], {
            radius:      8,
            color:       color,
            weight:      1.5,
            fillColor:   color,
            fillOpacity: 0.8,
          })

          marker.bindPopup(
            `<div style="font-family:system-ui;padding:8px 12px;min-width:160px">
              <p style="font-weight:700;font-size:12px;margin:0 0 4px">${ev.title}</p>
              ${ev.location_name ? `<p style="color:#6b7280;font-size:11px;margin:0 0 2px">${ev.location_name}</p>` : ''}
              ${ev.borough ? `<p style="color:#9ca3af;font-size:10px;margin:0 0 4px">${ev.borough}</p>` : ''}
              <p style="font-size:10px;color:#374151">${[time, price].filter(Boolean).join(' · ')}</p>
            </div>`,
            { closeButton: false, maxWidth: 240 }
          )

          marker.addTo(map)
          existing.set(ev.id, marker)
        }
      })
    })
  }, [events, activeId, mapReady])

  // Fly to active
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeId) return
    const ev = events.find(e => e.id === activeId)
    if (ev?.lat && ev.lng) {
      map.setView([ev.lat, ev.lng], 15)
      markersRef.current.get(activeId)?.openPopup()
    }
  }, [activeId, events])

  // Parks layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    import('leaflet').then(async L => {
      if (!layers.parks) {
        // Toggle OFF
        if (parksLayerRef.current) {
          parksLayerRef.current.remove()
          parksLayerRef.current = null
        }
        return
      }

      // Toggle ON + layer already exists — re-add
      if (parksLayerRef.current) {
        parksLayerRef.current.addTo(map)
        parksLayerRef.current.bringToBack()
        return
      }

      // Fetch and create layer
      setParksLoading(true)
      try {
        const data = parksCacheRef.current ?? await fetchParks()
        parksCacheRef.current = data

        parksLayerRef.current = L.geoJSON(data, {
          style: {
            color:       '#166534',
            fillColor:   '#4ade80',
            fillOpacity: 0.25,
            weight:      1,
            opacity:     0.6,
          },
          interactive: false,
        }).addTo(map)
        parksLayerRef.current.bringToBack()
      } catch (err) {
        console.error('[parks] fetch failed:', err)
      } finally {
        setParksLoading(false)
      }
    })
  }, [layers.parks, mapReady])

  // Playgrounds layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    import('leaflet').then(async L => {
      if (!layers.playgrounds) {
        if (playgroundsLayerRef.current) {
          playgroundsLayerRef.current.remove()
          playgroundsLayerRef.current = null
        }
        return
      }

      if (playgroundsLayerRef.current) {
        playgroundsLayerRef.current.addTo(map)
        playgroundsLayerRef.current.bringToBack()
        return
      }

      setPlaygroundsLoading(true)
      try {
        const data = playgroundsCacheRef.current ?? await fetchPlaygrounds()
        playgroundsCacheRef.current = data

        playgroundsLayerRef.current = L.geoJSON(data, {
          pointToLayer: (_f, ll) => L.circleMarker(ll, {
            radius:      5,
            color:       '#9d174d',
            fillColor:   '#f472b6',
            fillOpacity: 0.75,
            weight:      1,
          }),
          onEachFeature: (feature, layer) => {
            const name =
              feature.properties?.name ??
              feature.properties?.bezeichnung ??
              'Spielplatz'
            layer.bindTooltip(name, { sticky: true })
          },
        }).addTo(map)
        playgroundsLayerRef.current.bringToBack()
      } catch (err) {
        console.error('[playgrounds] fetch failed:', err)
      } finally {
        setPlaygroundsLoading(false)
      }
    })
  }, [layers.playgrounds, mapReady])

  // Transit stops (auto when event is selected)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    import('leaflet').then(async L => {
      // Always clear previous transit group
      if (transitGroupRef.current) {
        transitGroupRef.current.remove()
        transitGroupRef.current = null
      }

      if (!activeId) return

      const ev = events.find(e => e.id === activeId)
      if (!ev?.lat || !ev.lng) return

      try {
        let stops = transitCacheRef.current.get(activeId)
        if (!stops) {
          stops = await fetchTransitStops(ev.lat, ev.lng)
          transitCacheRef.current.set(activeId, stops)
        }

        const group = L.layerGroup()
        for (const stop of stops) {
          const isUbahn = stop.type === 'ubahn'
          const marker = L.circleMarker([stop.lat, stop.lng], {
            radius:      6,
            color:       isUbahn ? '#1e40af' : '#14532d',
            fillColor:   isUbahn ? '#1d4ed8' : '#15803d',
            fillOpacity: 0.85,
            weight:      1.5,
          })
          const prefix = isUbahn ? 'U' : 'S'
          marker.bindTooltip(`${prefix} ${stop.name}`, {
            className: 'transit-tooltip',
            sticky:    false,
          })
          group.addLayer(marker)
        }

        group.addTo(map)
        transitGroupRef.current = group
      } catch (err) {
        console.error('[transit] fetch failed:', err)
      }
    })
  }, [activeId, events, mapReady])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {events.filter(e => e.lat).length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-gray-400 bg-white/80 px-3 py-1.5 rounded">
            No mapped locations yet
          </p>
        </div>
      )}
      {(parksLoading || playgroundsLoading) && (
        <div className="absolute bottom-8 left-2 z-[500] flex flex-col gap-1 pointer-events-none">
          {parksLoading && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading parks…
            </span>
          )}
          {playgroundsLoading && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading playgrounds…
            </span>
          )}
        </div>
      )}
    </div>
  )
}
