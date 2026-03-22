'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Share2, Check, CalendarPlus } from 'lucide-react'
import AddToListButton from './AddToListButton'
import AttendButton from './AttendButton'
import JourneyWidget from './JourneyWidget'
import { generateICS } from '@/lib/ics'

const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false })
const EventMapSection = dynamic(() => import('./EventMapSection'), { ssr: false })

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

function EventActions({ id }: { id: string }) {
  const [showAuth, setShowAuth] = useState(false)
  const [AuthModal, setAuthModal] = useState<React.ComponentType<{ onClose: () => void }> | null>(null)

  function openAuth() {
    import('./AuthModal').then(m => setAuthModal(() => m.default)).catch(() => {})
    setShowAuth(true)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <ShareButton />
        <AttendButton itemType="event" itemId={id} onNeedAuth={openAuth} />
        <AddToListButton itemType="event" itemId={id} onNeedAuth={openAuth} />
      </div>
      {showAuth && AuthModal && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

interface EventPageClientProps {
  id: string
  lat?: number
  lng?: number
  title?: string
  dateStart?: string
  dateEnd?: string | null
  timeStart?: string | null
  timeEnd?: string | null
  locationName?: string | null
  address?: string | null
  description?: string | null
}

function CalendarButton({ title, dateStart, dateEnd, timeStart, timeEnd, locationName, address, description }: Omit<EventPageClientProps, 'id' | 'lat' | 'lng'>) {
  function download() {
    if (!title || !dateStart) return
    const ics = generateICS({
      title,
      dateStart,
      dateEnd,
      timeStart,
      timeEnd,
      locationName,
      address,
      description,
    })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}.ics`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!title || !dateStart) return null

  return (
    <button
      onClick={download}
      className="flex items-center gap-1.5 text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white font-bold"
    >
      <CalendarPlus size={11} />
      Add to Calendar
    </button>
  )
}

export function EventPageClient({ id, lat, lng, title, dateStart, dateEnd, timeStart, timeEnd, locationName, address, description }: EventPageClientProps) {
  return (
    <>
      {/* Mini map */}
      {lat && lng && (
        <div className="border-2 border-black mb-4 overflow-hidden" style={{ height: 220 }}>
          <VenueMap lat={lat} lng={lng} name={locationName ?? title ?? 'Event'} />
        </div>
      )}

      {/* Route planner */}
      {lat && lng && (
        <div className="border-2 border-black p-3 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Plan Route</p>
          <JourneyWidget toLat={lat} toLng={lng} />
        </div>
      )}

      {/* Get Directions + Street View */}
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
        </div>
      )}

      {/* Nearby transit */}
      {lat && lng && <EventMapSection lat={lat} lng={lng} />}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <EventActions id={id} />
        <CalendarButton
          title={title}
          dateStart={dateStart}
          dateEnd={dateEnd}
          timeStart={timeStart}
          timeEnd={timeEnd}
          locationName={locationName}
          address={address}
          description={description}
        />
      </div>
    </>
  )
}
