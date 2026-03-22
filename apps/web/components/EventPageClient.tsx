'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Share2, Check, CalendarPlus } from 'lucide-react'
import AddToListButton from './AddToListButton'
import AttendButton from './AttendButton'
import JourneyWidget from './JourneyWidget'
import { generateICS } from '@/lib/ics'

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
      {lat && lng && (
        <div className="mb-5">
          <JourneyWidget toLat={lat} toLng={lng} />
        </div>
      )}
      {lat && lng && <EventMapSection lat={lat} lng={lng} />}
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
