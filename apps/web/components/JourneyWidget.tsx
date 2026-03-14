'use client'
import { useState } from 'react'
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

export default function JourneyWidget({ toLat, toLng }: Props) {
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [idx,      setIdx]      = useState(0)
  const [error,    setError]    = useState<string | null>(null)

  const journey = journeys[idx] ?? null

  function plan() {
    if (!navigator.geolocation) {
      setError('Geolocation not available')
      setOpen(true)
      return
    }
    setOpen(true)
    setLoading(true)
    setError(null)
    setJourneys([])
    setIdx(0)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const results = await fetchJourney(
            pos.coords.latitude,
            pos.coords.longitude,
            toLat,
            toLng,
          )
          setJourneys(results)
          if (!results.length) setError('No routes found')
        } catch {
          setError('Could not fetch journey')
        } finally {
          setLoading(false)
        }
      },
      () => {
        setError('Location access denied')
        setLoading(false)
      },
      { timeout: 8000 },
    )
  }

  if (!open) {
    return (
      <button
        onClick={plan}
        className="inline-flex items-center gap-1 text-[10px] font-bold border border-black px-1.5 py-0.5 hover:bg-black hover:text-white"
      >
        Plan route
      </button>
    )
  }

  return (
    <div className="text-[10px]">
      {loading && <p className="text-gray-400 mt-1">Finding routes…</p>}
      {error   && <p className="text-red-500 mt-1">{error}</p>}

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
            onClick={plan}
            className="mt-2 text-[9px] text-gray-400 hover:text-black underline"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
