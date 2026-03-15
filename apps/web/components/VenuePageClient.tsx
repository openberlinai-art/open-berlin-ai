'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Share2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'
import { useLanguage } from '@/providers/LanguageProvider'
import { useTranslation } from '@/hooks/useTranslation'
import AddToListButton from './AddToListButton'
import AttendButton from './AttendButton'
import JourneyWidget from './JourneyWidget'
import { fetchTransitStopsVBB, fetchDepartures } from '@/lib/opendata'
import type { VBBStop, Departure } from '@/lib/opendata'

const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false })

const TRANSIT_TYPES = [
  { key: 'subway',   label: 'U-Bahn', symbol: 'U', color: '#1d4ed8' },
  { key: 'suburban', label: 'S-Bahn', symbol: 'S', color: '#15803d' },
  { key: 'tram',     label: 'Tram',   symbol: 'T', color: '#b91c1c' },
  { key: 'bus',      label: 'Bus',    symbol: 'B', color: '#6b7280' },
] as const

function StopDepartureRow({ stopId, color }: { stopId: string; color: string }) {
  const [deps, setDeps] = useState<Departure[] | null>(null)

  useEffect(() => {
    fetchDepartures(stopId)
      .then(d => setDeps(d))
      .catch(() => setDeps([]))
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

function VenueTransit({ lat, lng }: { lat: number; lng: number }) {
  const [stops,        setStops]        = useState<VBBStop[] | null>(null)
  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  const [showAllByType, setShowAllByType] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchTransitStopsVBB(lat, lng)
      .then(s => setStops(s))
      .catch(() => setStops([]))
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
                <span
                  className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-extrabold text-white shrink-0"
                  style={{ background: color }}
                >
                  {symbol}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-700">{label}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(showAllByType[key] ? typeStops : typeStops.slice(0, 6)).map(s => (
                  <div key={s.id} className="w-full">
                    <button
                      onClick={() => setExpandedStop(prev => prev === s.id ? null : s.id)}
                      className="text-[11px] text-gray-700 border border-gray-200 px-1.5 py-0.5 hover:border-black hover:text-black text-left"
                    >
                      {s.name} {expandedStop === s.id ? '▲' : '▼'}
                    </button>
                    {expandedStop === s.id && (
                      <StopDepartureRow stopId={s.id} color={color} />
                    )}
                  </div>
                ))}
                {typeStops.length > 6 && !showAllByType[key] && (
                  <button
                    onClick={() => setShowAllByType(prev => ({ ...prev, [key]: true }))}
                    className="text-[10px] text-gray-500 hover:text-black mt-0.5 underline"
                  >
                    Show all {typeStops.length} stops
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface EventItem {
  id:          string
  title:       string
  date_start:  string
  time_start:  string | null
  category:    string | null
  price_type:  'free' | 'paid' | 'unknown'
  description?: string | null
}

interface Props {
  id:         string
  lat:        number | null
  lng:        number | null
  name:       string
  events:     EventItem[]
  pastEvents: EventItem[]
}

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function groupByDate(events: EventItem[]) {
  const map: Record<string, EventItem[]> = {}
  for (const ev of events) {
    if (!map[ev.date_start]) map[ev.date_start] = []
    map[ev.date_start].push(ev)
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
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
      className="flex items-center gap-1.5 text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white font-bold"
    >
      {copied ? <Check size={11} /> : <Share2 size={11} />}
      {copied ? 'Copied!' : 'Share'}
    </button>
  )
}

function VenueActions({ id }: { id: string }) {
  const { user } = useUser()
  const [showAuth, setShowAuth] = useState(false)

  // Dynamically import AuthModal to avoid circular deps
  const [AuthModal, setAuthModal] = useState<React.ComponentType<{ onClose: () => void }> | null>(null)
  function openAuth() {
    import('./AuthModal').then(m => setAuthModal(() => m.default)).catch(() => {})
    setShowAuth(true)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <ShareButton />
        <AttendButton itemType="location" itemId={id} onNeedAuth={openAuth} />
        <AddToListButton itemType="location" itemId={id} onNeedAuth={openAuth} />
      </div>
      {showAuth && AuthModal && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

const DESC_LIMIT = 120

function EventRow({ ev }: { ev: EventItem }) {
  const [expanded, setExpanded] = useState(false)
  const { lang } = useLanguage()
  const { data: translatedTitle } = useTranslation(ev.title, lang)
  const { data: translatedDesc  } = useTranslation(ev.description, lang)
  const displayTitle = (lang !== 'de' && translatedTitle) ? translatedTitle : ev.title
  const displayDesc  = (lang !== 'de' && translatedDesc)  ? translatedDesc  : ev.description
  const hasDesc = !!ev.description
  const desc = expanded ? displayDesc : displayDesc?.slice(0, DESC_LIMIT)
  const showEllipsis = !expanded && (ev.description?.length ?? 0) > DESC_LIMIT

  return (
    <div className="border-b border-gray-200 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900 leading-snug">{displayTitle}</p>
          {ev.time_start && (
            <p className="text-[10px] text-gray-400 mt-0.5">{ev.time_start.slice(0, 5)}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0 items-center">
          {ev.category && (
            <span className="px-1 py-0.5 border border-gray-300 text-[9px] font-bold text-gray-500">
              {ev.category}
            </span>
          )}
          <span className={[
            'px-1 py-0.5 border text-[9px] font-bold',
            ev.price_type === 'free'   ? 'border-black bg-black text-white'
            : ev.price_type === 'paid' ? 'border-black bg-white text-black'
            : 'border-gray-300 text-gray-400',
          ].join(' ')}>
            {ev.price_type === 'free' ? 'Free' : ev.price_type === 'paid' ? 'Paid' : '?'}
          </span>
          <AttendButton itemType="event" itemId={ev.id} onNeedAuth={() => {}} />
          <AddToListButton itemType="event" itemId={ev.id} onNeedAuth={() => {}} />
        </div>
      </div>
      {hasDesc && (
        <div className="mt-1">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            {desc}{showEllipsis && '…'}
          </p>
          {(ev.description?.length ?? 0) > DESC_LIMIT && (
            <button
              onClick={() => setExpanded(x => !x)}
              className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5 hover:text-black"
            >
              {expanded ? <><ChevronUp size={9}/> less</> : <><ChevronDown size={9}/> more</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EventGroup({ events }: { events: EventItem[] }) {
  const grouped = groupByDate(events)
  return (
    <>
      {grouped.map(([date, evs]) => (
        <div key={date} className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
            {formatDate(date)}
          </p>
          <div className="flex flex-col">
            {evs.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>
        </div>
      ))}
    </>
  )
}

export function VenuePageClient({ id, lat, lng, name, events, pastEvents }: Props) {
  const [showPast, setShowPast] = useState(false)

  return (
    <>
      {/* Mini map */}
      {lat && lng && (
        <div className="mb-4">
          <VenueMap lat={lat} lng={lng} name={name} />
        </div>
      )}

      {/* Nearby transit */}
      {lat && lng && <VenueTransit lat={lat} lng={lng} />}

      {/* Route planner */}
      {lat && lng && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Route from your location</p>
          <JourneyWidget toLat={lat} toLng={lng} />
        </div>
      )}

      {/* Actions */}
      <div className="mb-6">
        <VenueActions id={id} />
      </div>

      {/* Upcoming events */}
      <div>
        <h2 className="text-sm font-bold border-b-2 border-black pb-1 mb-3 uppercase tracking-wide flex items-center gap-2">
          Upcoming Events
          {events.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400 border border-gray-300 px-1.5 py-0.5">
              {events.length}
            </span>
          )}
        </h2>
        {events.length === 0 ? (
          <p className="text-xs text-gray-400 mb-4">No upcoming events found for this venue.</p>
        ) : (
          <EventGroup events={events} />
        )}
      </div>

      {/* Past events toggle */}
      {pastEvents.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowPast(p => !p)}
            className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white font-bold flex items-center gap-1.5"
          >
            {showPast ? '▲' : '▼'} Past Events
            <span className="font-normal text-gray-400 border border-current px-1 py-0.5 text-[10px]">
              {pastEvents.length}
            </span>
          </button>
          {showPast && (
            <div className="mt-3 opacity-70">
              <EventGroup events={pastEvents} />
            </div>
          )}
        </div>
      )}
    </>
  )
}
