'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { fetchJourney, buildRouteDisplay } from '@/lib/opendata'
import type { Journey, JourneyLeg, RouteDisplayData } from '@/lib/opendata'

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
  onRouteChange?: (route: RouteDisplayData | null) => void
}

interface AddressSuggestion {
  label: string
  lat: number
  lng: number
}

type TimeMode = 'now' | 'depart' | 'arrive'

function getDefaultTime(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 30)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getDefaultDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildISO(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function walkingJourney(fromLat: number, fromLng: number, toLat: number, toLng: number): Journey {
  const dist = Math.round(haversineDist(fromLat, fromLng, toLat, toLng))
  // ~80m/min walking speed (~4.8 km/h)
  const mins = Math.max(1, Math.round(dist / 80))
  const now = new Date()
  const arrival = new Date(now.getTime() + mins * 60000)
  return {
    duration: mins,
    transfers: 0,
    legs: [{
      origin: 'Your location',
      destination: 'Destination',
      departure: now.toISOString(),
      arrival: arrival.toISOString(),
      line: null,
      product: null,
      direction: null,
      walking: true,
      distance: dist,
      originCoords: [fromLng, fromLat],
      destinationCoords: [toLng, toLat],
      polyline: null,
    }],
  }
}

export default function JourneyWidget({ toLat, toLng, onRouteChange }: Props) {
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
  const lastFromRef = useRef<{ lat: number; lng: number } | null>(null)

  // Time controls
  const [timeMode,  setTimeMode]  = useState<TimeMode>('now')
  const [showTime,  setShowTime]  = useState(false)
  const [timeValue, setTimeValue] = useState(getDefaultTime)
  const [dateValue, setDateValue] = useState(getDefaultDate)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  // Emit route geometry whenever the selected journey changes
  useEffect(() => {
    if (!onRouteChange) return
    const j = journeys[idx]
    onRouteChange(j ? buildRouteDisplay(j) : null)
    return () => onRouteChange(null)
  }, [journeys, idx, onRouteChange])

  const journey = journeys[idx] ?? null

  function getTimeOptions(): { departure?: string; arrival?: string } | undefined {
    if (timeMode === 'now') return undefined
    const iso = buildISO(dateValue, timeValue)
    if (timeMode === 'depart') return { departure: iso }
    return { arrival: iso }
  }

  async function doFetchJourney(fromLat: number, fromLng: number) {
    lastFromRef.current = { lat: fromLat, lng: fromLng }
    setLoading(true)
    setError(null)
    setJourneys([])
    setIdx(0)

    const dist = haversineDist(fromLat, fromLng, toLat, toLng)

    // For very short distances (<300m), just show walking
    if (dist < 300) {
      setJourneys([walkingJourney(fromLat, fromLng, toLat, toLng)])
      setLoading(false)
      return
    }

    try {
      const results = await fetchJourney(fromLat, fromLng, toLat, toLng, getTimeOptions())
      if (results.length) {
        setJourneys(results)
      } else if (dist < 2000) {
        // No transit results but walkable — show walking fallback
        setJourneys([walkingJourney(fromLat, fromLng, toLat, toLng)])
      } else {
        setError('No routes found')
      }
    } catch {
      // API failed — if walkable distance, show walking; otherwise error
      if (dist < 2000) {
        setJourneys([walkingJourney(fromLat, fromLng, toLat, toLng)])
      } else {
        setError('Could not fetch journey')
      }
    } finally {
      setLoading(false)
    }
  }

  function plan() {
    setOpen(true)
    setError(null)
    setJourneys([])
    setIdx(0)
    if (!navigator.geolocation) {
      setShowManual(true)
      return
    }
    // Check permission first to skip the browser prompt if already denied
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'denied') {
          setShowManual(true)
          return
        }
        requestGeolocation()
      }).catch(() => requestGeolocation())
    } else {
      requestGeolocation()
    }
  }

  function requestGeolocation() {
    setLoading(true)
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
        className="w-full flex items-center justify-center gap-2 text-sm font-bold border-2 border-[var(--border-primary)] px-4 py-2.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] transition-colors"
      >
        Plan route
      </button>
    )
  }

  return (
    <div className="text-[10px]">
      {/* Time mode selector */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {(['now', 'depart', 'arrive'] as const).map(m => (
          <button
            key={m}
            onClick={() => {
              setTimeMode(m)
              setShowTime(m !== 'now')
              if (m !== 'now' && timeValue === getDefaultTime()) {
                setTimeValue(getDefaultTime())
                setDateValue(getDefaultDate())
              }
            }}
            className={`px-2 py-1 border text-[10px] font-bold ${timeMode === m ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--border-primary)]' : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-primary)]'}`}
          >
            {m === 'now' ? 'Leave now' : m === 'depart' ? 'Depart at' : 'Arrive by'}
          </button>
        ))}
      </div>
      {showTime && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <input
            type="time"
            value={timeValue}
            onChange={e => setTimeValue(e.target.value)}
            className="text-xs border-2 border-[var(--border-primary)] px-2 py-1 outline-none font-mono min-w-0"
          />
          <input
            type="date"
            value={dateValue}
            onChange={e => setDateValue(e.target.value)}
            className="text-xs border-2 border-[var(--border-primary)] px-2 py-1 outline-none font-mono min-w-0 flex-1"
          />
          {lastFromRef.current && (
            <button
              onClick={() => lastFromRef.current && doFetchJourney(lastFromRef.current.lat, lastFromRef.current.lng)}
              className="text-[10px] font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] shrink-0"
            >
              Go
            </button>
          )}
        </div>
      )}

      {loading && <p className="text-[var(--text-muted)] mt-1">Finding routes…</p>}

      {/* Manual address fallback */}
      {showManual && !loading && (
        <div className="mt-1">
          <p className="text-xs text-[var(--text-secondary)] mb-1.5">Location unavailable — enter your starting address:</p>
          <div className="relative">
            <input
              type="text"
              value={manualAddr}
              onChange={e => { setManualAddr(e.target.value); fetchSuggestions(e.target.value) }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="e.g. Alexanderplatz, Berlin"
              autoComplete="off"
              className="w-full text-xs border-2 border-[var(--border-primary)] px-2.5 py-1.5 outline-none focus:shadow-[2px_2px_0_var(--border-primary)]"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] mt-0.5 max-h-48 overflow-y-auto shadow-[2px_2px_0_var(--border-primary)]">
                {suggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-[var(--bg-secondary)]"
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
              <span className="font-bold text-[var(--text-primary)]">{journey.duration} min</span>
              {journey.transfers > 0 && (
                <span className="text-[var(--text-secondary)]">
                  {' · '}{journey.transfers} change{journey.transfers > 1 ? 's' : ''}
                </span>
              )}
              <span className="text-[var(--text-muted)] ml-1">
                {fmt(journey.legs[0]?.departure)}–{fmt(journey.legs[journey.legs.length - 1]?.arrival)}
              </span>
            </div>
            {journeys.length > 1 && (
              <div className="flex items-center gap-0.5 shrink-0 ml-2">
                <button
                  onClick={() => setIdx(i => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  className="w-4 h-4 flex items-center justify-center border border-[var(--border-secondary)] hover:border-[var(--border-primary)] disabled:opacity-30 text-[9px]"
                >‹</button>
                <span className="text-[var(--text-muted)] px-0.5">{idx + 1}/{journeys.length}</span>
                <button
                  onClick={() => setIdx(i => Math.min(journeys.length - 1, i + 1))}
                  disabled={idx === journeys.length - 1}
                  className="w-4 h-4 flex items-center justify-center border border-[var(--border-secondary)] hover:border-[var(--border-primary)] disabled:opacity-30 text-[9px]"
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
                  <div key={i} className="flex items-start gap-1.5 text-[var(--text-secondary)] py-0.5">
                    <span className="shrink-0 mt-0.5">🚶</span>
                    <div>
                      <span>Walk {mins > 0 ? `${mins} min` : ''}{dist}</span>
                      {leg.destination && leg.destination !== leg.origin && (
                        <span className="text-[var(--text-muted)]"> to {leg.destination}</span>
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
                    <span className="font-bold text-[var(--text-primary)]">{leg.line}</span>
                    <span className="text-[var(--text-muted)]">dir.</span>
                    <span className="text-[var(--text-secondary)] truncate">{leg.direction}</span>
                  </div>
                  {/* Origin row */}
                  <div className="flex items-baseline gap-1.5 text-[var(--text-secondary)]">
                    <span className="font-mono text-[9px] text-[var(--text-muted)] shrink-0 w-9">{fmt(leg.departure)}</span>
                    <span className="truncate">{leg.origin}</span>
                  </div>
                  {/* Destination row */}
                  <div className="flex items-baseline gap-1.5 text-[var(--text-secondary)]">
                    <span className="font-mono text-[9px] text-[var(--text-muted)] shrink-0 w-9">{fmt(leg.arrival)}</span>
                    <span className="truncate">{leg.destination}</span>
                    {mins > 0 && (
                      <span className="text-[var(--text-muted)] shrink-0 ml-auto">{mins} min</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Earlier / Later buttons */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                if (!lastFromRef.current || !journey) return
                const firstDep = journey.legs[0]?.departure
                if (!firstDep) return
                const earlier = new Date(new Date(firstDep).getTime() - 30 * 60000).toISOString()
                setLoading(true)
                fetchJourney(lastFromRef.current.lat, lastFromRef.current.lng, toLat, toLng, { departure: earlier })
                  .then(r => { setJourneys(r); setIdx(0) })
                  .catch(() => {})
                  .finally(() => setLoading(false))
              }}
              className="text-[9px] font-bold border border-[var(--border-secondary)] px-2 py-0.5 hover:border-[var(--border-primary)]"
            >
              ← Earlier
            </button>
            <button
              onClick={() => {
                if (!lastFromRef.current || !journey) return
                const lastArr = journey.legs[journey.legs.length - 1]?.arrival
                if (!lastArr) return
                const later = new Date(new Date(lastArr).getTime() + 5 * 60000).toISOString()
                setLoading(true)
                fetchJourney(lastFromRef.current.lat, lastFromRef.current.lng, toLat, toLng, { departure: later })
                  .then(r => { setJourneys(r); setIdx(0) })
                  .catch(() => {})
                  .finally(() => setLoading(false))
              }}
              className="text-[9px] font-bold border border-[var(--border-secondary)] px-2 py-0.5 hover:border-[var(--border-primary)]"
            >
              Later →
            </button>
          </div>

          <button
            onClick={() => { setShowManual(true); setJourneys([]); setManualAddr('') }}
            className="mt-2 text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
          >
            Change starting point
          </button>
        </div>
      )}
    </div>
  )
}
