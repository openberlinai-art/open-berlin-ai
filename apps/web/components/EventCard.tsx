'use client'
import { useState }          from 'react'
import { MapPin, Clock, ExternalLink, Heart, Bell, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatDate, formatTime } from '@/lib/utils'
import type { Event } from '@/lib/types'

interface Props {
  event:    Event
  active:   boolean
  onClick:  () => void
}

export default function EventCard({ event, active, onClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [followed, setFollowed] = useState(false)
  const [reminded, setReminded] = useState(false)

  const time    = formatTime(event.time_start)
  const hasDesc = !!event.description
  const desc    = expanded ? event.description : event.description?.slice(0, 140)
  const showEllipsis = !expanded && (event.description?.length ?? 0) > 140

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
          <p className="text-xs font-bold text-gray-900">{formatDate(event.date_start)}</p>
          {time && <p className="text-xs text-gray-500 mt-0.5">{time}</p>}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
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
            <p className="text-xs text-gray-700 leading-tight">{event.location_name}</p>
            {event.borough && <p className="text-[10px] text-gray-400">{event.borough}</p>}
          </div>
        </div>
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
        {event.source_url
          ? <a
              href={event.source_url}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-gray-400 hover:text-black flex items-center gap-0.5"
            >
              More info <ExternalLink size={9}/>
            </a>
          : <span className="text-xs text-gray-200">More info</span>
        }
      </div>
    </div>
  )
}
