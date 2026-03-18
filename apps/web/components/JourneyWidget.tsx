'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { fetchJourney } from '@/lib/opendata'
import type { Journey, JourneyLeg } from '@/lib/opendata'

const PRODUCT: Record<string, { s: string; c: string }> = {
  subway:   { s: 'U', c: '#1d4ed8' },
  suburban: { s: 'S', c: '#15803d' },
  tram:     { s: 'T', c: '#b91c1c' },
  bus:      { s: 'B', c: '#6b7280' },
  regional: { s: 'R', c: '#7c3aed' },
  express:  { s: 'E', c: '#92400e' },
}

function fmt(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function legMin(leg: JourneyLeg): number {
  if (!leg.departure || !leg.arrival) return 0
  return Math.round((new Date(leg.arrival).getTime() - new Date(leg.departure).getTime()) / 60000)
}

// Zero-duration platform change at the same station — not worth rendering
function isTransfer(leg: JourneyLeg): boolean {
  return leg.walking && leg.origin === leg.destination && legMin(leg) === 0
}

interface Props {
  toLat: number
  toLng: number
}

interface AddressSuggestion {
  label: string
  lat: number
  lng: number
}

export default function JourneyWidget({ toLat, toLng }: Props) {
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [idx,      setIdx]      = useState(0)
  const [error,    setError]    = useState<string | null>(null)
  // Manual address input fallback
  const [showManual, setShowManual] = useState(false)
  const [manualAddr, setManualAddr] = useState('')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const journey = journeys[idx] ?? null

  async function doFetchJourney(fromLat: number, fromLng: number) {
    setLoading(true)
    setError(null)
    setJourneys([])
    setIdx(0)
    try {
      const results = await fetchJourney(fromLat, fromLng, toLat, toLng)
      setJourneys(results)
      if (!results.length) setError('No routes found')
    } catch {
      setError('Could not fetch journey')
    } finally {
      setLoading(false)
    }
  }

  function plan() {
    setOpen(true)
    if (!navigator.geolocation) {
      setShowManual(true)
      return
    }
    setLoading(true)
    setError(null)
    setJourneys([])
    setIdx(0)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        await doFetchJourney(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setShowManual(true)
        setLoading(false)
      },
      { timeout: 8000 },
    )
  }

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(debounceRef.current)
    if (query.length < 3) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const [localRes, photonRes] = await Promise.allSettled([
          fetch(`/api/streets?q=${encodeURIComponent(query)}&limit=4`).then(r => r.ok ? r.json() as Promise<Array<{ name: string; lat: number; lng: number; postcode: string | null }>> : []),
          fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=52.52&lon=13.405&limit=4&lang=de`).then(r => r.ok ? r.json() as Promise<{ features: Array<{ geometry: { coordinates: [number, number] }; properties: { name?: string; street?: string; housenumber?: string; city?: string } }> }> : { features: [] }),
        ])
        const results: AddressSuggestion[] = []
        if (localRes.status === 'fulfilled') {
          for (const s of localRes.value) {
            results.push({ label: [s.name, s.postcode].filter(Boolean).join(', '), lat: s.lat, lng: s.lng })
          }
        }
        if (photonRes.status === 'fulfilled') {
          for (const f of photonRes.value.features) {
            if (!f.properties.street && !f.properties.name) continue
            const p = f.properties
            const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : p.name ?? ''
            results.push({ label: [street, p.city].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })
          }
        }
        setSuggestions(results)
        setShowSuggestions(true)
      } catch { /* ignore */ }
    }, 300)
  }, [])

  function selectSuggestion(s: AddressSuggestion) {
    setManualAddr(s.label)
    setSuggestions([])
    setShowSuggestions(false)
    setShowManual(false)
    doFetchJourney(s.lat, s.lng)
  }

  if (!open) {
    return (
      <button
        onClick={plan}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold border-2 border-black px-4 py-2.5 hover:bg-black hover:text-white transition-colors"
      >
        Plan route
      </button>
    )
  }

  return (
    <div className="text-[10px]">
      {loading && <p className="text-gray-400 mt-1">Finding routes…</p>}

      {/* Manual address fallback */}
      {showManual && !loading && (
        <div className="mt-1">
          <p className="text-xs text-gray-500 mb-1.5">Enter your starting address:</p>
          <div className="relative">
            <input
              type="text"
              value={manualAddr}
              onChange={e => { setManualAddr(e.target.value); fetchSuggestions(e.target.value) }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="e.g. Alexanderplatz, Berlin"
              autoComplete="off"
              className="w-full text-xs border-2 border-black px-2.5 py-1.5 outline-none focus:shadow-[2px_2px_0_#000]"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 bg-white border-2 border-black mt-0.5 max-h-48 overflow-y-auto shadow-[2px_2px_0_#000]">
                {suggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-gray-100"
                      onMouseDown={e => { e.preventDefault(); selectSuggestion(s) }}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && !showManual && <p className="text-red-500 mt-1">{error}</p>}

      {journey && !loading && (
        <div className="mt-1.5">

          {/* Summary row + option navigator */}
          <div className="flex items-center justify-between mb-2">
            <div className="leading-snug">
              <span className="font-bold text-gray-900">{journey.duration} min</span>
              {journey.transfers > 0 && (
                <span className="text-gray-500">
                  {' · '}{journey.transfers} change{journey.transfers > 1 ? 's' : ''}
                </span>
              )}
              <span className="text-gray-400 ml-1">
                {fmt(journey.legs[0]?.departure)}–{fmt(journey.legs[journey.legs.length - 1]?.arrival)}
              </span>
            </div>
            {journeys.length > 1 && (
              <div className="flex items-center gap-0.5 shrink-0 ml-2">
                <button
                  onClick={() => setIdx(i => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  className="w-4 h-4 flex items-center justify-center border border-gray-300 hover:border-black disabled:opacity-30 text-[9px]"
                >‹</button>
                <span className="text-gray-400 px-0.5">{idx + 1}/{journeys.length}</span>
                <button
                  onClick={() => setIdx(i => Math.min(journeys.length - 1, i + 1))}
                  disabled={idx === journeys.length - 1}
                  className="w-4 h-4 flex items-center justify-center border border-gray-300 hover:border-black disabled:opacity-30 text-[9px]"
                >›</button>
              </div>
            )}
          </div>

          {/* Leg timeline */}
          <div className="space-y-1">
            {journey.legs.filter(l => !isTransfer(l)).map((leg, i) => {
              if (leg.walking) {
                const mins = legMin(leg)
                const dist = leg.distance ? ` · ${leg.distance} m` : ''
                return (
                  <div key={i} className="flex items-start gap-1.5 text-gray-500 py-0.5">
                    <span className="shrink-0 mt-0.5">🚶</span>
                    <div>
                      <span>Walk {mins > 0 ? `${mins} min` : ''}{dist}</span>
                      {leg.destination && leg.destination !== leg.origin && (
                        <span className="text-gray-400"> to {leg.destination}</span>
                      )}
                    </div>
                  </div>
                )
              }

              const meta = PRODUCT[leg.product ?? ''] ?? { s: '?', c: '#374151' }
              const mins = legMin(leg)

              return (
                <div
                  key={i}
                  className="border-l-2 pl-2 ml-1 py-0.5"
                  style={{ borderColor: meta.c }}
                >
                  {/* Line + direction */}
                  <div className="flex items-center gap-1 mb-1">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 text-[9px] font-extrabold text-white shrink-0"
                      style={{ background: meta.c }}
                    >
                      {meta.s}
                    </span>
                    <span className="font-bold text-gray-900">{leg.line}</span>
                    <span className="text-gray-400">dir.</span>
                    <span className="text-gray-600 truncate">{leg.direction}</span>
                  </div>
                  {/* Origin row */}
                  <div className="flex items-baseline gap-1.5 text-gray-500">
                    <span className="font-mono text-[9px] text-gray-400 shrink-0 w-9">{fmt(leg.departure)}</span>
                    <span className="truncate">{leg.origin}</span>
                  </div>
                  {/* Destination row */}
                  <div className="flex items-baseline gap-1.5 text-gray-500">
                    <span className="font-mono text-[9px] text-gray-400 shrink-0 w-9">{fmt(leg.arrival)}</span>
                    <span className="truncate">{leg.destination}</span>
                    {mins > 0 && (
                      <span className="text-gray-400 shrink-0 ml-auto">{mins} min</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => { setShowManual(true); setJourneys([]); setManualAddr('') }}
            className="mt-2 text-[9px] text-gray-400 hover:text-black underline"
          >
            Change starting point
          </button>
        </div>
      )}
    </div>
  )
}
