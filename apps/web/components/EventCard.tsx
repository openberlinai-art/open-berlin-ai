'use client'
import { useState }          from 'react'
import Link                  from 'next/link'
import { MapPin, Clock, ExternalLink, Heart, Bell, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatDate, formatTime } from '@/lib/utils'
import type { Event } from '@/lib/types'
import AddToListButton from './AddToListButton'

interface Props {
  event:      Event
  active:     boolean
  onClick:    () => void
  onNeedAuth: () => void
}

export default function EventCard({ event, active, onClick, onNeedAuth }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [followed, setFollowed] = useState(false)
  const [reminded, setReminded] = useState(false)

  const time       = formatTime(event.time_start)
  const doorTime   = event.door_time ? formatTime(event.door_time) : null
  const hasDesc    = !!event.description
  const desc       = expanded ? event.description : event.description?.slice(0, 140)
  const showEllipsis = !expanded && (event.description?.length ?? 0) > 140
  const isCancelled  = event.schedule_status === 'cancelled'
  const isPostponed  = event.schedule_status === 'postponed'
  const isRescheduled = event.schedule_status === 'rescheduled'

  return (
    <div
      onClick={onClick}
      className={cn(
        'px-4 py-3 border-b-2 border-black cursor-pointer hover:bg-gray-50',
        active && 'bg-gray-100 border-l-4 border-l-black'
      )}
    >
      {/* Date + badges */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div>
          <p className={cn("text-xs font-bold", isCancelled ? "text-red-600 line-through" : "text-gray-900")}>
            {formatDate(event.date_start)}
          </p>
          {time && (
            <p className="text-xs text-gray-500 mt-0.5">
              {time}
              {doorTime && doorTime !== time && <span className="text-gray-400"> · doors {doorTime}</span>}
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
          {event.category && (
            <span className="px-1.5 py-0.5 border-2 border-black text-[10px] font-bold bg-white">
              {event.category}
            </span>
          )}
          <span className={cn(
            'px-1.5 py-0.5 border-2 text-[10px] font-bold',
            event.price_type === 'free'    && 'border-black bg-black text-white',
            event.price_type === 'paid'    && 'border-black bg-white text-black',
            event.price_type === 'unknown' && 'border-gray-400 text-gray-400',
          )}>
            {event.price_type === 'free' ? 'Free' : event.price_type === 'paid' ? 'Paid' : '?'}
          </span>
        </div>
      </div>

      {/* Title */}
      <p className="font-bold text-sm leading-snug text-gray-900 mb-1">{event.title}</p>

      {/* Description */}
      {hasDesc && (
        <div className="mb-2">
          <p className="text-xs text-gray-600 leading-relaxed">
            {desc}{showEllipsis && '…'}
          </p>
          {(event.description?.length ?? 0) > 140 && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
              className="text-[10px] text-gray-500 flex items-center gap-0.5 mt-0.5 hover:text-black"
            >
              {expanded ? <><ChevronUp size={10}/> less</> : <><ChevronDown size={10}/> more</>}
            </button>
          )}
        </div>
      )}

      {/* Venue */}
      {event.location_name && (
        <div className="flex items-start gap-1 mb-2.5">
          <MapPin size={10} className="text-gray-400 mt-0.5 shrink-0"/>
          <div>
            {event.location_id
              ? <Link
                  href={`/locations/${event.location_id}`}
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-gray-700 leading-tight hover:underline"
                >
                  {event.location_name}
                </Link>
              : <p className="text-xs text-gray-700 leading-tight">{event.location_name}</p>
            }
            {event.borough && <p className="text-[10px] text-gray-400">{event.borough}</p>}
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
      <div className="flex items-center justify-between mt-1">
        <div className="flex gap-3">
          <button
            onClick={e => { e.stopPropagation(); setFollowed(f => !f) }}
            className={cn(
              'text-xs flex items-center gap-1',
              followed ? 'text-black font-semibold' : 'text-gray-400 hover:text-black'
            )}
          >
            <Heart size={11} fill={followed ? 'currentColor' : 'none'}/> Follow
          </button>
          <button
            onClick={e => { e.stopPropagation(); setReminded(r => !r) }}
            className={cn(
              'text-xs flex items-center gap-1',
              reminded ? 'text-black font-semibold' : 'text-gray-400 hover:text-black'
            )}
          >
            <Bell size={11} fill={reminded ? 'currentColor' : 'none'}/> Remind
          </button>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {event.admission_link && (
            <a
              href={event.admission_link}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-bold border-2 border-black px-2 py-0.5 hover:bg-black hover:text-white flex items-center gap-0.5"
            >
              Tickets <ExternalLink size={8}/>
            </a>
          )}
          <Link
            href={`/events/${event.id}`}
            onClick={e => e.stopPropagation()}
            className="text-xs text-gray-400 hover:text-black flex items-center gap-0.5"
          >
            More info
          </Link>
          <AddToListButton itemType="event" itemId={event.id} onNeedAuth={onNeedAuth} />
        </div>
      </div>
    </div>
  )
}
