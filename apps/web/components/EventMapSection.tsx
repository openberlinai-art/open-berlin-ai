'use client'
import { useState, useEffect } from 'react'
import Map, { Marker } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchTransitStopsVBB } from '@/lib/opendata'
import type { VBBStop } from '@/lib/opendata'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const TRANSIT_TYPES = [
  { key: 'subway',   label: 'U-Bahn', symbol: 'U', color: '#1d4ed8' },
  { key: 'suburban', label: 'S-Bahn', symbol: 'S', color: '#15803d' },
  { key: 'tram',     label: 'Tram',   symbol: 'T', color: '#b91c1c' },
] as const

export default function EventMapSection({ lat, lng }: { lat: number; lng: number }) {
  const [stops, setStops] = useState<VBBStop[] | null>(null)

  useEffect(() => {
    fetchTransitStopsVBB(lat, lng)
      .then(s => setStops(s))
      .catch(() => setStops([]))
  }, [lat, lng])

  const grouped = stops
    ? Object.fromEntries(
        TRANSIT_TYPES.map(({ key }) => [key, stops.filter(s => s.type === key)])
      ) as Record<string, VBBStop[]>
    : null

  const hasTransit = grouped && TRANSIT_TYPES.some(({ key }) => (grouped[key]?.length ?? 0) > 0)

  return (
    <div className="mb-6">
      {/* Mini map */}
      <div className="border-2 border-black h-52 overflow-hidden mb-4">
        <Map
          initialViewState={{ longitude: lng, latitude: lat, zoom: 15 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLE}
          scrollZoom={false}
          dragPan={false}
          dragRotate={false}
          doubleClickZoom={false}
          touchZoomRotate={false}
          keyboard={false}
        >
          <Marker longitude={lng} latitude={lat} anchor="center">
            <div className="w-4 h-4 rounded-full bg-black border-2 border-white shadow" />
          </Marker>
        </Map>
      </div>

      {/* Nearby transit */}
      {hasTransit && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Nearby transit</p>
          <div className="border-2 border-black">
            {TRANSIT_TYPES.map(({ key, label, symbol, color }) => {
              const typeStops = grouped![key] ?? []
              if (!typeStops.length) return null
              return (
                <div key={key} className="px-3 py-2.5 border-b-2 border-black last:border-b-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-extrabold text-white shrink-0"
                      style={{ background: color }}
                    >
                      {symbol}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-700">{label}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {typeStops.slice(0, 6).map(s => (
                      <span key={s.id} className="text-[11px] text-gray-700 border border-gray-200 px-1.5 py-0.5">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
