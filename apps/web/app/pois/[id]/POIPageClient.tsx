'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Share2, Check } from 'lucide-react'
import JourneyWidget from '@/components/JourneyWidget'
import VibeCheck from '@/components/VibeCheck'
import { fetchTransitStopsVBB, fetchDepartures } from '@/lib/opendata'
import type { VBBStop, Departure } from '@/lib/opendata'

const VenueMap = dynamic(() => import('@/components/VenueMap'), { ssr: false })

const TRANSIT_TYPES = [
  { key: 'subway',   label: 'U-Bahn', symbol: 'U', color: '#1d4ed8' },
  { key: 'suburban', label: 'S-Bahn', symbol: 'S', color: '#15803d' },
  { key: 'tram',     label: 'Tram',   symbol: 'T', color: '#b91c1c' },
  { key: 'bus',      label: 'Bus',    symbol: 'B', color: '#6b7280' },
] as const

function StopDepartureRow({ stopId, color }: { stopId: string; color: string }) {
  const [deps, setDeps] = useState<Departure[] | null>(null)
  useEffect(() => {
    fetchDepartures(stopId).then(d => setDeps(d)).catch(() => setDeps([]))
  }, [stopId])
  if (!deps) return <p className="text-[10px] text-gray-400 mt-1 ml-6">Loading…</p>
  if (!deps.length) return <p className="text-[10px] text-gray-400 mt-1 ml-6">No departures found</p>
  return (
    <table className="w-full border-collapse mt-1 ml-6 text-[10px]">
      <tbody>
        {deps.map((d, i) => {
          const diffMin = Math.round((new Date(d.when).getTime() - Date.now()) / 60000)
          const eta = diffMin <= 0 ? 'now' : `${diffMin} min`
          return (
            <tr key={i}>
              <td className="pr-2 font-bold whitespace-nowrap w-10" style={{ color }}>{d.line}</td>
              <td className="pr-2 text-gray-600 max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">{d.direction}</td>
              <td className="whitespace-nowrap text-gray-500">
                {eta}
                {d.delay > 60 && <span className="text-red-500"> +{Math.round(d.delay / 60)}m</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function POITransit({ lat, lng }: { lat: number; lng: number }) {
  const [stops, setStops] = useState<VBBStop[] | null>(null)
  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  useEffect(() => {
    fetchTransitStopsVBB(lat, lng).then(s => setStops(s)).catch(() => setStops([]))
  }, [lat, lng])
  if (!stops) return null
  const hasAny = TRANSIT_TYPES.some(({ key }) => stops.some(s => s.type === key))
  if (!hasAny) return null
  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Nearby transit</p>
      <div className="border-2 border-black">
        {TRANSIT_TYPES.map(({ key, label, symbol, color }) => {
          const typeStops = stops.filter(s => s.type === key)
          if (!typeStops.length) return null
          return (
            <div key={key} className="px-3 py-2.5 border-b-2 border-black last:border-b-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-extrabold text-white shrink-0" style={{ background: color }}>{symbol}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-700">{label}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {typeStops.slice(0, 6).map(s => (
                  <div key={s.id} className="w-full">
                    <button
                      onClick={() => setExpandedStop(prev => prev === s.id ? null : s.id)}
                      className="text-[11px] text-gray-700 border border-gray-200 px-1.5 py-0.5 hover:border-black hover:text-black text-left"
                    >
                      {s.name} {expandedStop === s.id ? '▲' : '▼'}
                    </button>
                    {expandedStop === s.id && <StopDepartureRow stopId={s.id} color={color} />}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ShareButton() {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
    >
      {copied ? <><Check size={12} /> Copied</> : <><Share2 size={12} /> Share</>}
    </button>
  )
}

interface Props {
  id:            string
  lat:           number
  lng:           number
  name:          string
  category:      string
  categoryGroup: string
}

export function POIPageClient({ id, lat, lng, name, category, categoryGroup }: Props) {
  return (
    <>
      {/* Plan Route */}
      {lat && lng && (
        <div className="border-2 border-black p-3 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Plan Route</p>
          <JourneyWidget toLat={lat} toLng={lng} />
        </div>
      )}

      {/* Mini map */}
      {lat && lng && (
        <div className="border-2 border-black mb-4 overflow-hidden" style={{ height: 220 }}>
          <VenueMap lat={lat} lng={lng} name={name} />
        </div>
      )}

      {/* Get Directions + Street View + Share */}
      {lat && lng && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
          >
            ↗ Get Directions
          </a>
          <a
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
          >
            Street View
          </a>
          <ShareButton />
        </div>
      )}

      {/* Vibe Check */}
      <div className="mb-4">
        <VibeCheck
          id={id}
          name={name}
          category={`${categoryGroup}/${category}`}
        />
      </div>

      {/* Nearby transit */}
      {lat && lng && <POITransit lat={lat} lng={lng} />}
    </>
  )
}
