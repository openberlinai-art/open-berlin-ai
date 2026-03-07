'use client'
import { useState }          from 'react'
import { MapPin, Clock, ExternalLink, Heart, Bell, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatDate, formatTime, getCategoryStyle } from '@/lib/utils'
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

  const style   = getCategoryStyle(event.category)
  const time    = formatTime(event.time_start)
  const hasDesc = !!event.description
  const desc    = expanded ? event.description : event.description?.slice(0, 140)
  const showEllipsis = !expanded && (event.description?.length ?? 0) > 140

  return (
    <div
      onClick={onClick}
      className={cn(
        'px-4 py-3 border-b border-gray-100 cursor-pointer',
        'hover:bg-gray-50 transition-colors',
        active && 'bg-violet-50 border-l-4 border-l-violet-500'
      )}
    >
      {/* Date + badges */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div>
          <p className="text-xs font-semibold text-gray-700">{formatDate(event.date_start)}</p>
          {time && <p className="text-xs text-gray-400 mt-0.5">{time}</p>}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {event.category && (
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold', style.badge)}>
              {event.category}
            </span>
          )}
          <span className={cn(
            'px-2 py-0.5 rounded text-[10px] font-semibold',
            event.price_type === 'free'  && 'bg-emerald-100 text-emerald-700',
            event.price_type === 'paid'  && 'bg-amber-100 text-amber-700',
            event.price_type === 'unknown' && 'bg-gray-100 text-gray-500',
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
          <p className="text-xs text-gray-500 leading-relaxed">
            {desc}{showEllipsis && '…'}
          </p>
          {(event.description?.length ?? 0) > 140 && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
              className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5 hover:text-gray-600"
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
            <p className="text-xs text-gray-600 leading-tight">{event.location_name}</p>
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
              followed ? 'text-rose-500' : 'text-gray-400 hover:text-gray-600'
            )}
          >
            <Heart size={11} fill={followed ? 'currentColor' : 'none'}/> Follow
          </button>
          <button
            onClick={e => { e.stopPropagation(); setReminded(r => !r) }}
            className={cn(
              'text-xs flex items-center gap-1',
              reminded ? 'text-amber-500' : 'text-gray-400 hover:text-gray-600'
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
              className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5"
            >
              More info <ExternalLink size={9}/>
            </a>
          : <span className="text-xs text-gray-200">More info</span>
        }
      </div>
    </div>
  )
}
