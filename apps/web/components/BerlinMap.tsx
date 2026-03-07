'use client'
import { useEffect, useRef } from 'react'
import type { Map as LMap, CircleMarker } from 'leaflet'
import { getCategoryHex }  from '@/lib/utils'
import type { Event }      from '@/lib/types'

interface Props {
  events:   Event[]
  activeId: string | null
}

export default function BerlinMap({ events, activeId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const markersRef   = useRef<Map<string, CircleMarker>>(new Map())

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
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current.clear()
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
  }, [events, activeId])

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
    </div>
  )
}
