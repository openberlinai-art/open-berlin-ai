'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar as CalendarIcon, Filter, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'

import { fetchEvents }          from '@/lib/api'
import { todayISO, formatDate, getCategoryStyle } from '@/lib/utils'
import type { Event }           from '@/lib/types'
import BerlinMap                from './BerlinMap'
import EventCard                from './EventCard'
import ChatPanel                from './ChatPanel'

const CATEGORIES = [
  'Exhibition','Music','Dance','Recreation','Kids','Sports',
  'Tours','Film','Theater','Talks','Literature','Other',
]

interface Props {
  initialEvents: Event[]
  initialTotal:  number
  initialDate:   string
}

export default function KulturPulseApp({ initialEvents, initialTotal, initialDate }: Props) {
  const [events,   setEvents]   = useState<Event[]>(initialEvents)
  const [total,    setTotal]    = useState(initialTotal)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(false)

  const [date,     setDate]     = useState(initialDate)
  const [calOpen,  setCalOpen]  = useState(false)
  const calRef                  = useRef<HTMLDivElement>(null)

  const [price,    setPrice]    = useState<'all' | 'free' | 'paid'>('all')
  const [cats,     setCats]     = useState<string[]>([])
  const [catOpen,  setCatOpen]  = useState(false)
  const catRef                  = useRef<HTMLDivElement>(null)

  const [activeId, setActiveId] = useState<string | null>(null)

  const LIMIT = 50

  const load = useCallback(async (d: string, p: number) => {
    setLoading(true)
    try {
      const res = await fetchEvents({
        date:     d,
        page:     p,
        limit:    LIMIT,
        price:    price !== 'all' ? price : undefined,
        category: cats.length === 1 ? cats[0] : undefined,
      })
      setEvents(res.data)
      setTotal(res.pagination.total)
    } finally {
      setLoading(false)
    }
  }, [price, cats])

  useEffect(() => {
    if (date === initialDate && page === 1 && price === 'all' && cats.length === 0) {
      setEvents(initialEvents)
      setTotal(initialTotal)
      return
    }
    load(date, page)
  }, [date, page, load, initialDate, initialEvents, initialTotal, price, cats])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false)
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleCat(c: string) {
    setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const selectedDay = date ? new Date(date + 'T00:00:00') : undefined

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans">
      {/* ── Left panel ─────────────────────────────────── */}
      <div className="w-[400px] shrink-0 flex flex-col border-r border-gray-200 bg-white">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <h1 className="text-lg font-bold tracking-tight text-gray-900">KulturPulse</h1>
          <p className="text-xs text-gray-400 mt-0.5">Berlin culture events, live</p>

          {/* Filter row */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">

            {/* Date picker */}
            <div ref={calRef} className="relative">
              <button
                onClick={() => setCalOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
              >
                <CalendarIcon size={12} className="text-gray-400" />
                <span className="text-gray-700">
                  {date === todayISO() ? 'Today' : formatDate(date)}
                </span>
              </button>
              {calOpen && (
                <div className="absolute top-full left-0 mt-1 z-[1000] bg-white border border-gray-200 rounded-xl shadow-xl">
                  <DayPicker
                    mode="single"
                    selected={selectedDay}
                    onSelect={d => {
                      if (!d) return
                      const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
                      setDate(`${y}-${m}-${day}`)
                      setPage(1)
                      setCalOpen(false)
                    }}
                    className="text-sm"
                  />
                </div>
              )}
            </div>

            {/* Category filter */}
            <div ref={catRef} className="relative">
              <button
                onClick={() => setCatOpen(o => !o)}
                className={`flex items-center gap-1 text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${
                  cats.length > 0
                    ? 'border-violet-400 bg-violet-50 text-violet-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Filter size={11} />
                {cats.length > 0 ? cats.slice(0, 2).join(', ') + (cats.length > 2 ? ` +${cats.length - 2}` : '') : 'All Events'}
                <ChevronDown size={11} />
              </button>
              {catOpen && (
                <div className="absolute top-full left-0 mt-1 z-[1000] bg-white border border-gray-200 rounded-xl shadow-xl w-44 py-1">
                  {CATEGORIES.map(c => {
                    const style   = getCategoryStyle(c)
                    const checked = cats.includes(c)
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCat(c)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${checked ? 'font-semibold' : ''}`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: style.hex }} />
                        {c}
                        {checked && <span className="ml-auto text-violet-500">✓</span>}
                      </button>
                    )
                  })}
                  {cats.length > 0 && (
                    <button
                      onClick={() => setCats([])}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-gray-400 hover:text-gray-600 border-t border-gray-100 mt-1 pt-1.5"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Price filter */}
            {(['all', 'free', 'paid'] as const).map(p => (
              <button
                key={p}
                onClick={() => { setPrice(p); setPage(1) }}
                className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
                  price === p
                    ? p === 'free' ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : p === 'paid' ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-violet-400 bg-violet-50 text-violet-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === 'all' ? 'Any price' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Event count */}
        <div className="px-4 py-2 text-[11px] text-gray-400 border-b border-gray-100">
          {loading ? 'Loading…' : `${total} event${total !== 1 ? 's' : ''}`}
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto">
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">No events found</div>
          ) : (
            events.map(ev => (
              <EventCard
                key={ev.id}
                event={ev}
                active={ev.id === activeId}
                onClick={() => setActiveId(id => id === ev.id ? null : ev.id)}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 disabled:opacity-30 hover:text-gray-800"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span>{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 disabled:opacity-30 hover:text-gray-800"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <BerlinMap events={events} activeId={activeId} />
      </div>

      {/* ── AI Chat FAB ─────────────────────────────────── */}
      <ChatPanel date={date} />
    </div>
  )
}
