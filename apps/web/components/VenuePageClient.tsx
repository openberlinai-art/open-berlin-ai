'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Share2, Check } from 'lucide-react'
import { UserProvider, useUser } from '@/providers/UserProvider'
import AddToListButton from './AddToListButton'

const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false })

interface EventItem {
  id:         string
  title:      string
  date_start: string
  time_start: string | null
  category:   string | null
  price_type: 'free' | 'paid' | 'unknown'
}

interface Props {
  id:       string
  lat:      number | null
  lng:      number | null
  name:     string
  events:   EventItem[]
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
        <AddToListButton itemType="location" itemId={id} onNeedAuth={openAuth} />
      </div>
      {showAuth && AuthModal && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

export function VenuePageClient({ id, lat, lng, name, events }: Props) {
  const grouped = groupByDate(events)

  return (
    <UserProvider>
      {/* Mini map */}
      {lat && lng && (
        <div className="mb-4">
          <VenueMap lat={lat} lng={lng} name={name} />
        </div>
      )}

      {/* Actions */}
      <div className="mb-6">
        <VenueActions id={id} />
      </div>

      {/* Events grouped by date */}
      <div>
        <h2 className="text-sm font-bold border-b-2 border-black pb-1 mb-3 uppercase tracking-wide flex items-center gap-2">
          Upcoming Events
          {events.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400 border border-gray-300 px-1.5 py-0.5">
              {events.length}
            </span>
          )}
        </h2>
        {grouped.length === 0 ? (
          <p className="text-xs text-gray-400">No upcoming events found for this venue.</p>
        ) : (
          grouped.map(([date, evs]) => (
            <div key={date} className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                {formatDate(date)}
              </p>
              <div className="flex flex-col">
                {evs.map(ev => (
                  <div key={ev.id} className="border-b border-gray-200 py-2.5 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-gray-900 leading-snug">{ev.title}</p>
                      {ev.time_start && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {ev.time_start.slice(0, 5)}
                        </p>
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
                        ev.price_type === 'free'    ? 'border-black bg-black text-white'
                        : ev.price_type === 'paid'  ? 'border-black bg-white text-black'
                        : 'border-gray-300 text-gray-400',
                      ].join(' ')}>
                        {ev.price_type === 'free' ? 'Free' : ev.price_type === 'paid' ? 'Paid' : '?'}
                      </span>
                      <AddToListButton itemType="event" itemId={ev.id} onNeedAuth={() => {}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </UserProvider>
  )
}
