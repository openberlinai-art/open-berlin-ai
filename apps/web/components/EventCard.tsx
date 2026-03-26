'use client'
import { useState }          from 'react'
import Link                  from 'next/link'
import { MapPin, ExternalLink, ChevronDown, ChevronUp, CalendarPlus } from 'lucide-react'
import { cn, formatDate, formatTime } from '@/lib/utils'
import type { Event } from '@/lib/types'
import AddToListButton from './AddToListButton'
import AttendButton from './AttendButton'
import { useLanguage } from '@/providers/LanguageProvider'
import { useTranslation } from '@/hooks/useTranslation'
import { generateICS } from '@/lib/ics'

interface Props {
  event:      Event
  active:     boolean
  onClick:    () => void
  onNeedAuth: () => void
}

export default function EventCard({ event, active, onClick, onNeedAuth }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { lang } = useLanguage()

  const { data: translatedTitle } = useTranslation(event.title, lang)
  const { data: translatedDesc  } = useTranslation(event.description, lang)

  const displayTitle = (lang !== 'de' && translatedTitle) ? translatedTitle : event.title
  const displayDesc  = (lang !== 'de' && translatedDesc)  ? translatedDesc  : event.description

  const time       = formatTime(event.time_start)
  const doorTime   = event.door_time ? formatTime(event.door_time) : null
  const hasDesc    = !!event.description
  const desc       = expanded ? displayDesc : displayDesc?.slice(0, 140)
  const showEllipsis = !expanded && (displayDesc?.length ?? 0) > 140
  const isCancelled  = event.schedule_status === 'cancelled'
  const isPostponed  = event.schedule_status === 'postponed'
  const isRescheduled = event.schedule_status === 'rescheduled'
  const needsRegistration = event.registration_type === 'required'
  const langs: string[] = (() => { try { return event.languages ? JSON.parse(event.languages) : [] } catch { return [] } })()
  const nonDeLangs = langs.filter(l => l !== 'de')
  const thumbUrl: string | null = (() => { try { const urls = event.image_urls ? JSON.parse(event.image_urls) : []; return urls[0] ?? null } catch { return null } })()
  const imageCredit = event.image_credit ?? null

  return (
    <div
      onClick={onClick}
      className={cn(
        'px-4 py-3 border-b-2 border-[var(--border-primary)] cursor-pointer hover:bg-[var(--bg-secondary)]',
        active && 'bg-[var(--bg-secondary)] border-l-4 border-l-black'
      )}
    >
      {/* Date + badges */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div>
          <p className={cn("text-xs font-bold", isCancelled ? "text-red-600 line-through" : "text-[var(--text-primary)]")}>
            {formatDate(event.date_start)}
          </p>
          {time && (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {time}
              {doorTime && doorTime !== time && <span className="text-[var(--text-muted)]"> · doors {doorTime}</span>}
            </p>
          )}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {isCancelled && (
            <span className="px-1.5 py-0.5 border-2 border-red-600 bg-red-600 text-white text-[10px] font-bold">
              Cancelled
            </span>
          )}
          {isPostponed && (
            <span className="px-1.5 py-0.5 border-2 border-orange-500 bg-orange-500 text-white text-[10px] font-bold">
              Postponed
            </span>
          )}
          {isRescheduled && (
            <span className="px-1.5 py-0.5 border-2 border-yellow-600 bg-yellow-100 text-yellow-800 text-[10px] font-bold">
              Rescheduled
            </span>
          )}
          {nonDeLangs.map(l => (
            <span key={l} className="px-1.5 py-0.5 border-2 border-blue-600 text-blue-700 text-[10px] font-bold bg-blue-50">
              {l.toUpperCase()}
            </span>
          ))}
          {needsRegistration && (
            <span className="px-1.5 py-0.5 border-2 border-orange-500 text-orange-700 text-[10px] font-bold bg-orange-50">
              Register
            </span>
          )}
          {event.category && (
            <span className="px-1.5 py-0.5 border-2 border-[var(--border-primary)] text-[10px] font-bold bg-white">
              {event.category}
            </span>
          )}
          <span className={cn(
            'px-1.5 py-0.5 border-2 text-[10px] font-bold',
            event.price_type === 'free'    && 'border-[var(--border-primary)] bg-[var(--accent)] text-[var(--accent-text)]',
            event.price_type === 'paid'    && 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)]',
            event.price_type === 'unknown' && 'border-gray-400 text-[var(--text-muted)]',
          )}>
            {event.price_type === 'free' ? 'Free' : event.price_type === 'paid' ? 'Paid' : '?'}
          </span>
        </div>
      </div>

      {/* Title */}
      <p className={cn(
        'font-bold text-sm leading-snug text-[var(--text-primary)] mb-1',
        lang !== 'de' && !translatedTitle && 'animate-pulse text-[var(--text-muted)]',
      )}>
        {displayTitle}
      </p>

      {/* Thumbnail */}
      {thumbUrl && (
        <div className="mb-2 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="w-full h-24 object-cover border border-[var(--border-primary)]"
          />
          {imageCredit && (
            <span className="absolute bottom-0 right-0 text-[8px] text-white/80 bg-black/50 px-1 py-0.5 leading-none">
              {imageCredit}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {hasDesc && (
        <div className="mb-2">
          <p className={cn(
            'text-xs text-[var(--text-secondary)] leading-relaxed',
            lang !== 'de' && event.description && !translatedDesc && 'animate-pulse text-gray-300',
          )}>
            {desc}{showEllipsis && '…'}
          </p>
          {(event.description?.length ?? 0) > 140 && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
              className="text-[10px] text-[var(--text-secondary)] flex items-center gap-0.5 mt-0.5 hover:text-[var(--text-primary)]"
            >
              {expanded ? <><ChevronUp size={10}/> less</> : <><ChevronDown size={10}/> more</>}
            </button>
          )}
        </div>
      )}

      {/* Venue */}
      {event.location_name && (
        <div className="flex items-start gap-1 mb-2.5">
          <MapPin size={10} className="text-[var(--text-muted)] mt-0.5 shrink-0"/>
          <div>
            {event.location_id
              ? <Link
                  href={`/locations/${event.location_id}`}
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-[var(--text-secondary)] leading-tight hover:underline"
                >
                  {event.location_name}
                </Link>
              : <p className="text-xs text-[var(--text-secondary)] leading-tight">{event.location_name}</p>
            }
            {event.borough && <p className="text-[10px] text-[var(--text-muted)]">{event.borough}</p>}
          </div>
        </div>
      )}

      {/* Please note */}
      {event.please_note && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 mb-2 leading-snug">
          ⚠ {event.please_note}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end mt-1">
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {event.admission_link && (
            <a
              href={event.admission_link}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-bold border-2 border-[var(--border-primary)] px-2 py-0.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] flex items-center gap-0.5"
            >
              Tickets <ExternalLink size={8}/>
            </a>
          )}
          <Link
            href={`/events/${event.id}`}
            onClick={e => e.stopPropagation()}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-0.5"
          >
            More info
          </Link>
          <button
            onClick={e => {
              e.stopPropagation()
              const ics = generateICS({
                title: event.title,
                dateStart: event.date_start,
                dateEnd: event.date_end,
                timeStart: event.time_start,
                timeEnd: event.time_end,
                locationName: event.location_name,
                address: event.address,
                description: event.description,
              })
              const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${event.title.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}.ics`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
            }}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5"
            title="Add to calendar"
          >
            <CalendarPlus size={12} />
          </button>
          <AttendButton itemType="event" itemId={event.id} onNeedAuth={onNeedAuth} />
          <AddToListButton itemType="event" itemId={event.id} onNeedAuth={onNeedAuth} />
        </div>
      </div>
    </div>
  )
}
