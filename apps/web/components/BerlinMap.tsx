'use client'
import { useEffect, useRef, useState } from 'react'
import type { Map as LMap, CircleMarker, GeoJSON as LGeoJSON, LayerGroup } from 'leaflet'
import { getCategoryHex }  from '@/lib/utils'
import type { Event }      from '@/lib/types'
import {
  fetchParks, fetchPlaygrounds, fetchVenues,
  fetchTransitStopsVBB, fetchDepartures,
  type VBBStop, type Departure,
} from '@/lib/opendata'

interface LayerState { parks: boolean; playgrounds: boolean; venues: boolean }

interface Props {
  events:   Event[]
  activeId: string | null
  layers:   LayerState
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function renderDepsHTML(stop: VBBStop, deps: Departure[]): string {
  const typeColor: Record<string, string> = {
    subway:   '#1d4ed8',
    suburban: '#15803d',
    tram:     '#b91c1c',
  }
  const color = typeColor[stop.type] ?? '#374151'

  const rows = deps.length === 0
    ? `<tr><td colspan="3" style="color:#9ca3af;font-size:10px;padding:4px 0">No departures found</td></tr>`
    : deps.map(d => {
        const diffMin = Math.round((new Date(d.when).getTime() - Date.now()) / 60000)
        const eta     = diffMin <= 0 ? 'now' : `${diffMin} min`
        const delayStr = d.delay > 60
          ? `<span style="color:#dc2626"> +${Math.round(d.delay / 60)}m</span>`
          : ''
        return `<tr>
          <td style="font-size:11px;font-weight:700;color:${color};padding-right:8px;white-space:nowrap">${d.line}</td>
          <td style="font-size:10px;color:#374151;padding-right:8px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.direction}</td>
          <td style="font-size:10px;color:#374151;white-space:nowrap">${eta}${delayStr}</td>
        </tr>`
      }).join('')

  return `<div style="font-family:system-ui;padding:8px 12px;min-width:220px">
    <p style="font-weight:700;font-size:12px;margin:0 0 6px;color:#111">
      <span style="color:${color}">${stop.name}</span>
    </p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
  </div>`
}

export default function BerlinMap({ events, activeId, layers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const markersRef   = useRef<Map<string, CircleMarker>>(new Map())
  const [mapReady, setMapReady] = useState(false)

  // Layer refs
  const parksLayerRef       = useRef<LGeoJSON | null>(null)
  const playgroundsLayerRef = useRef<LGeoJSON | null>(null)
  const venuesLayerRef      = useRef<LayerGroup | null>(null)
  const transitGroupRef     = useRef<LayerGroup | null>(null)

  // Data caches — survive remount
  const parksCacheRef        = useRef<GeoJSON.FeatureCollection | null>(null)
  const playgroundsCacheRef  = useRef<GeoJSON.FeatureCollection | null>(null)
  const venuesCacheRef       = useRef<GeoJSON.FeatureCollection | null>(null)
  const transitCacheRef      = useRef<Map<string, VBBStop[]>>(new Map())
  const departuresCacheRef   = useRef<Map<string, { data: Departure[]; ts: number }>>(new Map())

  const [parksLoading,       setParksLoading]       = useState(false)
  const [playgroundsLoading, setPlaygroundsLoading] = useState(false)
  const [venuesLoading,      setVenuesLoading]      = useState(false)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import('leaflet').then(L => {
      delete (L.Icon.Default.prototype as unknown as Record<string,unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current!, {
        center:              [52.52, 13.405],
        zoom:                11,
        zoomControl:         false,
        scrollWheelZoom:     true,
        zoomAnimation:       true,
        markerZoomAnimation: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains:  'abcd',
        maxZoom:     20,
      }).addTo(map)

      L.control.zoom({ position: 'topright' }).addTo(map)
      mapRef.current = map
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
      venuesLayerRef.current = null
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

      existing.forEach((marker, id) => {
        if (!alive.has(id)) { marker.remove(); existing.delete(id) }
      })

      events.forEach(ev => {
        if (!ev.lat || !ev.lng) return
        const color    = getCategoryHex(ev.category)
        const isActive = ev.id === activeId

        if (existing.has(ev.id)) {
          existing.get(ev.id)!.setStyle({
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
            color,
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
        if (parksLayerRef.current) {
          parksLayerRef.current.remove()
          parksLayerRef.current = null
        }
        return
      }

      if (parksLayerRef.current) {
        parksLayerRef.current.addTo(map)
        parksLayerRef.current.bringToBack()
        return
      }

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

  // Venues layer (OSM museums, galleries, theatres)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    import('leaflet').then(async L => {
      if (!layers.venues) {
        if (venuesLayerRef.current) {
          venuesLayerRef.current.remove()
          venuesLayerRef.current = null
        }
        return
      }

      if (venuesLayerRef.current) {
        venuesLayerRef.current.addTo(map)
        return
      }

      setVenuesLoading(true)
      try {
        const data = venuesCacheRef.current ?? await fetchVenues()
        venuesCacheRef.current = data

        const group = L.layerGroup()
        for (const feature of data.features) {
          if (!feature.geometry || feature.geometry.type !== 'Point') continue
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates
          const props = feature.properties ?? {}
          const name  = props.name as string | undefined ?? 'Venue'
          const hours = props.opening_hours as string | undefined
          const site  = props.website as string | undefined

          let html = `<div style="font-family:system-ui;padding:8px 12px;min-width:160px">
            <p style="font-weight:700;font-size:12px;margin:0 0 4px">${name}</p>`
          if (hours) html += `<p style="font-size:10px;color:#374151;margin:0 0 2px">🕐 ${hours}</p>`
          if (site)  html += `<a href="${site}" target="_blank" rel="noopener" style="font-size:10px;color:#1d4ed8">${site.replace(/^https?:\/\//, '')}</a>`
          html += '</div>'

          const marker = L.circleMarker([lat, lng], {
            radius:      6,
            color:       '#78350f',
            fillColor:   '#b45309',
            fillOpacity: 0.85,
            weight:      1.5,
            interactive: true,
          })
          marker.bindPopup(html, { closeButton: false, maxWidth: 280 })
          group.addLayer(marker)
        }

        group.addTo(map)
        venuesLayerRef.current = group
      } catch (err) {
        console.error('[venues] fetch failed:', err)
      } finally {
        setVenuesLoading(false)
      }
    })
  }, [layers.venues, mapReady])

  // Transit stops (VBB) — auto when event is selected
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    import('leaflet').then(async L => {
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
          stops = await fetchTransitStopsVBB(ev.lat, ev.lng)
          transitCacheRef.current.set(activeId, stops)
        }

        const typeColor: Record<string, string> = {
          subway:   '#1d4ed8',
          suburban: '#15803d',
          tram:     '#b91c1c',
        }
        const typeStroke: Record<string, string> = {
          subway:   '#1e40af',
          suburban: '#14532d',
          tram:     '#991b1b',
        }

        const group = L.layerGroup()
        for (const stop of stops) {
          const color  = typeColor[stop.type]  ?? '#374151'
          const stroke = typeStroke[stop.type] ?? '#111827'

          const marker = L.circleMarker([stop.lat, stop.lng], {
            radius:      6,
            color:       stroke,
            fillColor:   color,
            fillOpacity: 0.85,
            weight:      1.5,
          })

          marker.bindPopup('', { maxWidth: 280, closeButton: false })
          marker.on('popupopen', async () => {
            const cached = departuresCacheRef.current.get(stop.id)
            const now    = Date.now()
            if (cached && now - cached.ts < 300_000) {
              marker.setPopupContent(renderDepsHTML(stop, cached.data))
              return
            }

            marker.setPopupContent(
              `<div style="font-family:system-ui;padding:8px 12px;min-width:160px">
                <p style="font-weight:700;font-size:12px;margin:0 0 4px">${stop.name}</p>
                <p style="font-size:10px;color:#6b7280">Loading departures…</p>
              </div>`
            )

            try {
              const deps = await fetchDepartures(stop.id)
              departuresCacheRef.current.set(stop.id, { data: deps, ts: now })
              marker.setPopupContent(renderDepsHTML(stop, deps))
            } catch {
              marker.setPopupContent(
                `<div style="font-family:system-ui;padding:8px 12px">
                  <p style="font-weight:700;font-size:12px;margin:0 0 4px">${stop.name}</p>
                  <p style="font-size:10px;color:#dc2626">Could not load departures</p>
                </div>`
              )
            }
          })

          group.addLayer(marker)
        }

        group.addTo(map)
        transitGroupRef.current = group

        // Opportunistic venue hours — inject into event popup if a venue is within 100 m
        if (venuesCacheRef.current) {
          const nearby = venuesCacheRef.current.features.find(f => {
            if (!f.geometry || f.geometry.type !== 'Point') return false
            const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            return haversineMeters(ev.lat!, ev.lng!, lat, lon) <= 100
          })
          if (nearby?.properties?.opening_hours) {
            const eventMarker = markersRef.current.get(activeId)
            const popup       = eventMarker?.getPopup()
            const content     = popup?.getContent()
            if (popup && typeof content === 'string') {
              const venueName = (nearby.properties.name as string | undefined) ?? 'Nearby venue'
              const extra = `<p style="font-size:10px;color:#374151;border-top:1px solid #e5e7eb;margin-top:6px;padding-top:6px">🕐 ${venueName} · ${nearby.properties.opening_hours as string}</p>`
              popup.setContent(content.replace(/<\/div>\s*$/, extra + '</div>'))
            }
          }
        }
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
      {(parksLoading || playgroundsLoading || venuesLoading) && (
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
          {venuesLoading && (
            <span className="text-[10px] bg-white/90 border border-black px-2 py-0.5">
              Loading venues…
            </span>
          )}
        </div>
      )}
    </div>
  )
}
