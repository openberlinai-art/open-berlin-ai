'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Calendar as CalendarIcon, Filter, ChevronDown, ChevronLeft, ChevronRight,
  BookMarked, User,
} from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

import dynamic from 'next/dynamic'
import { fetchEvents }          from '@/lib/api'
import { todayISO, formatDate, getCategoryStyle } from '@/lib/utils'
import type { Event }           from '@/lib/types'
import EventCard                from './EventCard'
import ChatPanel                from './ChatPanel'
import NotificationsBell        from './NotificationsBell'
import { UserProvider, useUser } from '@/providers/UserProvider'

const MapView     = dynamic(() => import('./MapView'),     { ssr: false })
const AuthModal   = dynamic(() => import('./AuthModal'),   { ssr: false })
const ListsDrawer = dynamic(() => import('./ListsDrawer'), { ssr: false })

const CATEGORIES = [
  'Exhibition','Music','Dance','Recreation','Kids','Sports',
  'Tours','Film','Theater','Talks','Literature','Other',
]

interface Props {
  initialEvents: Event[]
  initialTotal:  number
  initialDate:   string
}

function AppInner({ initialEvents, initialTotal, initialDate }: Props) {
  const { user, unreadCount } = useUser()

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
  const [layers, setLayers] = useState({ parks: false, playgrounds: false, venues: false, galleries: false, museums: false })

  const [showAuth,   setShowAuth]   = useState(false)
  const [showLists,  setShowLists]  = useState(false)

  const LIMIT = 50

  const load = useCallback(async (d: string, p: number) => {
    setLoading(true)
    try {
      const res = await fetchEvents({
        date:     d,
        page:     p,
        limit:    LIMIT,
        price_type: price !== 'all' ? price : undefined,
        category: cats.length === 1 ? cats[0] : undefined,
      })
      setEvents(res.data)
      setTotal(res.pagination.total)
    } finally {
      setLoading(false)
    }
  }, [price, cats])

  // Always fetch fresh data from Worker (initialEvents are for first-paint only)
  useEffect(() => {
    load(date, page)
  }, [date, page, load])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false)
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Auto-enable playgrounds layer when Kids category is active
  useEffect(() => {
    if (cats.includes('Kids')) {
      setLayers(prev => prev.playgrounds ? prev : { ...prev, playgrounds: true })
    }
    // Intentionally never auto-disables — user controls the off state
  }, [cats])

  function toggleCat(c: string) {
    setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const selectedDay = date ? new Date(date + 'T00:00:00') : undefined

  // Shared button classes
  const btn = 'text-xs border-2 border-black px-2.5 py-1 bg-white text-black hover:bg-black hover:text-white'
  const btnActive = 'text-xs border-2 border-black px-2.5 py-1 bg-black text-white'

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── Left panel ─────────────────────────────────── */}
      <div className="w-[380px] shrink-0 flex flex-col border-r-2 border-black bg-white">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b-2 border-black">
          <div className="flex items-center justify-between mb-0.5">
            <h1 className="text-lg font-bold tracking-tight">KulturPulse</h1>
            <div className="flex items-center gap-1">
              {user && <NotificationsBell />}
              <button
                onClick={() => { if (user) setShowLists(true); else setShowAuth(true) }}
                title="My Lists"
                className="relative flex items-center justify-center w-8 h-8 border-2 border-black hover:bg-black hover:text-white"
              >
                <BookMarked size={14} />
              </button>
              <button
                onClick={() => setShowAuth(true)}
                title={user ? user.display_name ?? user.email : 'Sign in'}
                className={`flex items-center justify-center w-8 h-8 border-2 border-black hover:bg-black hover:text-white ${user ? 'bg-black text-white' : ''}`}
              >
                <User size={14} />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">Berlin culture events, live</p>

          {/* Filter row */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">

            {/* Date picker */}
            <div ref={calRef} className="relative">
              <button
                onClick={() => setCalOpen(o => !o)}
                className={calOpen ? btnActive : btn}
              >
                <span className="flex items-center gap-1">
                  <CalendarIcon size={11} />
                  {date === todayISO() ? 'Today' : formatDate(date)}
                </span>
              </button>
              {calOpen && (
                <div className="absolute top-full left-0 mt-1 z-[1000] bg-white border-2 border-black shadow-[4px_4px_0_#000]">
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
                    className="text-sm p-2"
                  />
                </div>
              )}
            </div>

            {/* Category filter */}
            <div ref={catRef} className="relative">
              <button
                onClick={() => setCatOpen(o => !o)}
                className={cats.length > 0 ? btnActive : btn}
              >
                <span className="flex items-center gap-1">
                  <Filter size={10} />
                  {cats.length > 0 ? cats.slice(0, 2).join(', ') + (cats.length > 2 ? ` +${cats.length - 2}` : '') : 'All Events'}
                  <ChevronDown size={10} />
                </span>
              </button>
              {catOpen && (
                <div className="absolute top-full left-0 mt-1 z-[1000] bg-white border-2 border-black shadow-[4px_4px_0_#000] w-44 py-1">
                  {CATEGORIES.map(c => {
                    const style   = getCategoryStyle(c)
                    const checked = cats.includes(c)
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCat(c)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-100 ${checked ? 'font-bold' : ''}`}
                      >
                        <span className="w-2 h-2 shrink-0 border border-gray-400" style={{ background: style.hex }} />
                        {c}
                        {checked && <span className="ml-auto">✓</span>}
                      </button>
                    )
                  })}
                  {cats.length > 0 && (
                    <button
                      onClick={() => setCats([])}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-gray-500 border-t-2 border-gray-200 mt-1 pt-1.5 hover:bg-gray-100"
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
                className={price === p ? btnActive : btn}
              >
                {p === 'all' ? 'Any price' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Event count */}
        <div className="px-4 py-2 text-[11px] text-gray-500 border-b-2 border-black">
          {loading ? 'Loading…' : `${total} event${total !== 1 ? 's' : ''}`}
        </div>

        {/* Layer toggles */}
        <div className="px-4 py-2 border-b-2 border-black flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mr-1">
            Layers
          </span>
          <button
            onClick={() => setLayers(l => ({ ...l, parks: !l.parks }))}
            className={layers.parks ? btnActive : btn}
          >
            Parks
          </button>
          <button
            onClick={() => setLayers(l => ({ ...l, playgrounds: !l.playgrounds }))}
            className={layers.playgrounds ? btnActive : btn}
          >
            Playgrounds
          </button>
          <button
            onClick={() => setLayers(l => ({ ...l, venues: !l.venues }))}
            className={layers.venues ? btnActive : btn}
          >
            Venues
          </button>
          <button
            onClick={() => setLayers(l => ({ ...l, galleries: !l.galleries }))}
            className={layers.galleries ? btnActive : btn}
          >
            Galleries
          </button>
          <button
            onClick={() => setLayers(l => ({ ...l, museums: !l.museums }))}
            className={layers.museums ? btnActive : btn}
          >
            Museums
          </button>
          {activeId && (
            <span className="text-[10px] text-gray-500 border border-gray-300 px-2 py-0.5">
              Transit nearby
            </span>
          )}
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
                onNeedAuth={() => setShowAuth(true)}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t-2 border-black text-xs">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 border-2 border-black px-2 py-1 disabled:opacity-30 hover:bg-black hover:text-white"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="font-semibold">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 border-2 border-black px-2 py-1 disabled:opacity-30 hover:bg-black hover:text-white"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <MapView
          events={events}
          activeId={activeId}
          onEventSelect={setActiveId}
          layers={layers}
        />
      </div>

      {/* ── AI Chat FAB ─────────────────────────────────── */}
      <ChatPanel date={date} />

      {/* ── Modals / drawers ────────────────────────────── */}
      {showAuth  && <AuthModal   onClose={() => setShowAuth(false)}  />}
      {showLists && <ListsDrawer onClose={() => setShowLists(false)} />}
    </div>
  )
}

export default function KulturPulseApp(props: Props) {
  return (
    <UserProvider>
      <AppInner {...props} />
    </UserProvider>
  )
}
