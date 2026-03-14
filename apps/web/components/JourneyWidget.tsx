'use client'
import { useState } from 'react'
import { fetchJourney } from '@/lib/opendata'
import type { Journey } from '@/lib/opendata'

interface Props {
  toLat: number
  toLng: number
}

export default function JourneyWidget({ toLat, toLng }: Props) {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [journey, setJourney] = useState<Journey | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  function plan() {
    if (!navigator.geolocation) {
      setError('Geolocation not available')
      setOpen(true)
      return
    }
    setOpen(true)
    setLoading(true)
    setError(null)
    setJourney(null)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const results = await fetchJourney(
            pos.coords.latitude,
            pos.coords.longitude,
            toLat,
            toLng,
          )
          setJourney(results[0] ?? null)
          if (!results[0]) setError('No routes found')
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
    <div className="mt-1 text-[10px]">
      {loading && <span className="text-gray-400">Finding route…</span>}
      {error   && <span className="text-red-500">{error}</span>}
      {journey && !loading && (
        <div>
          <span className="font-bold text-gray-900">{journey.duration} min</span>
          {journey.transfers > 0 && (
            <span className="text-gray-500"> · {journey.transfers} transfer{journey.transfers > 1 ? 's' : ''}</span>
          )}
          <div className="mt-0.5 text-gray-500 leading-relaxed">
            {journey.legs
              .filter(leg => !leg.walking || journey.legs.indexOf(leg) === journey.legs.length - 1)
              .map((leg, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-0.5 text-gray-400">›</span>}
                  {leg.walking
                    ? <span>walk {leg.destination ? `to ${leg.destination}` : ''}</span>
                    : <span>{leg.line ?? ''} → {leg.destination}</span>
                  }
                </span>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
