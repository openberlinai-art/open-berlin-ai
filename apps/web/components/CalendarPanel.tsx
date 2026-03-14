'use client'
import { useEffect, useState } from 'react'
import { X, CalendarDays, CalendarX, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

const WORKER = process.env.NEXT_PUBLIC_API_URL ?? 'https://kulturpulse-worker.openberlinai.workers.dev'

type CalendarView = 'list' | 'day' | 'week' | 'month' | 'year'

interface EnrichedItem {
  item_type:       'event' | 'location'
  item_id:         string
  created_at:      string
  scheduled_for?:  string | null
  scheduled_time?: string | null
  title:           string | null
  subtitle:        string | null
  date_start?:     string | null
  time_start?:     string | null
}

async function enrichItems(
  items: { item_type: 'event' | 'location'; item_id: string; created_at: string; scheduled_for?: string | null; scheduled_time?: string | null }[]
): Promise<EnrichedItem[]> {
  return Promise.all(items.map(async item => {
    try {
      if (item.item_type === 'event') {
        const res = await fetch(`${WORKER}/api/events/${item.item_id}`)
        if (!res.ok) return { ...item, title: item.item_id, subtitle: null }
        const json = await res.json() as { data: { title: string; date_start: string; time_start: string | null; location_name: string | null } }
        return { ...item, title: json.data.title, subtitle: json.data.location_name ?? null, date_start: json.data.date_start, time_start: json.data.time_start }
      } else {
        const res = await fetch(`${WORKER}/api/locations/${item.item_id}`)
        if (!res.ok) return { ...item, title: item.item_id, subtitle: null }
        const json = await res.json() as { data: { name: string | null; borough: string | null } }
        return { ...item, title: json.data.name ?? item.item_id, subtitle: json.data.borough ?? null }
      }
    } catch {
      return { ...item, title: item.item_id, subtitle: null }
    }
  }))
}

function NavBar({ title, onPrev, onNext }: { title: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <button onClick={onPrev} className="w-6 h-6 flex items-center justify-center border border-gray-300 hover:border-black hover:bg-black hover:text-white">
        <ChevronLeft size={12} />
      </button>
      <span className="text-xs font-bold text-gray-800">{title}</span>
      <button onClick={onNext} className="w-6 h-6 flex items-center justify-center border border-gray-300 hover:border-black hover:bg-black hover:text-white">
        <ChevronRight size={12} />
      </button>
    </div>
  )
}

interface Props { onClose: () => void }

export default function CalendarPanel({ onClose }: Props) {
  const { attendance, unattend, user } = useUser()
  const [enriched, setEnriched] = useState<EnrichedItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState<CalendarView>('list')
  const [viewDate, setViewDate] = useState(new Date())

  useEffect(() => {
    if (!attendance.length) { setLoading(false); return }
    setLoading(true)
    enrichItems(attendance).then(items => { setEnriched(items); setLoading(false) })
  }, [attendance])

  const today = isoDate(new Date())

  function isoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function getItemDate(item: EnrichedItem): string | null {
    return item.item_type === 'event' ? (item.date_start ?? null) : (item.scheduled_for ?? null)
  }

  function getItemTime(item: EnrichedItem): string | null {
    return item.item_type === 'event' ? (item.time_start ?? null) : (item.scheduled_time ?? null)
  }

  function itemsForDate(dateStr: string): EnrichedItem[] {
    return enriched
      .filter(i => getItemDate(i) === dateStr)
      .sort((a, b) => (getItemTime(a) ?? '').localeCompare(getItemTime(b) ?? ''))
  }

  function hasItemsOnDate(dateStr: string): boolean {
    return enriched.some(i => getItemDate(i) === dateStr)
  }

  function getWeekStart(d: Date): Date {
    const r = new Date(d)
    const dow = r.getDay()
    r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow))
    return r
  }

  function navigate(delta: number) {
    const d = new Date(viewDate)
    if (view === 'day')   d.setDate(d.getDate() + delta)
    if (view === 'week')  d.setDate(d.getDate() + delta * 7)
    if (view === 'month') d.setMonth(d.getMonth() + delta)
    if (view === 'year')  d.setFullYear(d.getFullYear() + delta)
    setViewDate(d)
  }

  function navTitle(): string {
    if (view === 'day')   return viewDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    if (view === 'month') return viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    if (view === 'year')  return String(viewDate.getFullYear())
    if (view === 'week') {
      const mon = getWeekStart(viewDate)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return mon.getMonth() === sun.getMonth()
        ? `${mon.getDate()}–${sun.getDate()} ${sun.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
        : `${mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return ''
  }

  function generateMonthGrid(year: number, month: number): Array<Date | null> {
    const first = new Date(year, month, 1)
    const last  = new Date(year, month + 1, 0)
    let pad = first.getDay() - 1; if (pad < 0) pad = 6
    const grid: Array<Date | null> = Array(pad).fill(null)
    for (let d = 1; d <= last.getDate(); d++) grid.push(new Date(year, month, d))
    while (grid.length % 7 !== 0) grid.push(null)
    return grid
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  // List view groupings
  const allUpcoming = enriched.filter(i => { const d = getItemDate(i); return d && d >= today })
    .sort((a, b) => (getItemDate(a) ?? '').localeCompare(getItemDate(b) ?? ''))
  const unsched     = enriched.filter(i => !getItemDate(i))
  const allPast     = enriched.filter(i => { const d = getItemDate(i); return d && d < today })
    .sort((a, b) => (getItemDate(b) ?? '').localeCompare(getItemDate(a) ?? ''))

  const views: CalendarView[] = ['list', 'day', 'week', 'month', 'year']

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-sm bg-white border-l-2 border-black h-full overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} />
            <h2 className="text-sm font-bold uppercase tracking-wide">My Calendar</h2>
          </div>
          <button onClick={onClose} className="hover:bg-black hover:text-white w-7 h-7 flex items-center justify-center border border-black">
            <X size={13} />
          </button>
        </div>

        {/* View tabs */}
        {user && !loading && attendance.length > 0 && (
          <div className="flex border-b border-gray-200 px-2 sticky top-[49px] bg-white z-10">
            {views.map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-[10px] font-bold uppercase px-2.5 py-2 border-b-2 transition-colors ${view === v ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 px-4 py-4">
          {!user && <p className="text-xs text-gray-500 text-center mt-8">Sign in to save events to your calendar.</p>}
          {user && loading && <p className="text-xs text-gray-400 text-center mt-8">Loading…</p>}
          {user && !loading && attendance.length === 0 && (
            <div className="flex flex-col items-center gap-2 mt-12 text-gray-400">
              <CalendarX size={28} />
              <p className="text-xs text-center">Nothing saved yet.<br/>Click the calendar icon on any event or venue.</p>
            </div>
          )}

          {user && !loading && attendance.length > 0 && (
            <>
              {/* ── LIST VIEW ── */}
              {view === 'list' && (
                <>
                  {allUpcoming.length > 0 && (
                    <section className="mb-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Upcoming ({allUpcoming.length})</p>
                      <div className="flex flex-col gap-1">
                        {allUpcoming.map(item => <CalendarRow key={`${item.item_type}:${item.item_id}`} item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} />)}
                      </div>
                    </section>
                  )}
                  {unsched.length > 0 && (
                    <section className="mb-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Saved ({unsched.length})</p>
                      <div className="flex flex-col gap-1">
                        {unsched.map(item => <CalendarRow key={`${item.item_type}:${item.item_id}`} item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} />)}
                      </div>
                    </section>
                  )}
                  {allPast.length > 0 && (
                    <section className="mb-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Past ({allPast.length})</p>
                      <div className="flex flex-col gap-1 opacity-60">
                        {allPast.map(item => <CalendarRow key={`${item.item_type}:${item.item_id}`} item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} />)}
                      </div>
                    </section>
                  )}
                </>
              )}

              {/* ── DAY VIEW ── */}
              {view === 'day' && (
                <>
                  <NavBar title={navTitle()} onPrev={() => navigate(-1)} onNext={() => navigate(1)} />
                  {itemsForDate(isoDate(viewDate)).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center mt-8">No items scheduled for this day.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {itemsForDate(isoDate(viewDate)).map(item => {
                        const time = getItemTime(item)
                        return (
                          <div key={`${item.item_type}:${item.item_id}`} className="flex gap-2 items-start">
                            <span className="text-[10px] font-mono text-gray-400 w-10 shrink-0 pt-2.5">{time ? time.slice(0, 5) : '—'}</span>
                            <div className="flex-1"><CalendarRow item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} hideDate /></div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── WEEK VIEW ── */}
              {view === 'week' && (() => {
                const mon  = getWeekStart(viewDate)
                const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d })
                const ABBR = ['Mo','Tu','We','Th','Fr','Sa','Su']
                return (
                  <>
                    <NavBar title={navTitle()} onPrev={() => navigate(-1)} onNext={() => navigate(1)} />
                    <div className="grid grid-cols-7 gap-0.5 mb-4">
                      {days.map((d, i) => {
                        const dStr  = isoDate(d)
                        const count = itemsForDate(dStr).length
                        const isT   = dStr === today
                        return (
                          <button key={i} onClick={() => { setViewDate(d); setView('day') }}
                            className={`flex flex-col items-center py-2 border ${isT ? 'border-black bg-black text-white' : count > 0 ? 'border-black' : 'border-gray-200'} hover:border-black`}>
                            <span className={`text-[9px] font-bold uppercase ${isT ? 'text-white' : 'text-gray-400'}`}>{ABBR[i]}</span>
                            <span className={`text-sm font-bold ${isT ? 'text-white' : 'text-gray-900'}`}>{d.getDate()}</span>
                            {count > 0 && <span className={`text-[8px] font-bold ${isT ? 'text-white' : 'text-black'}`}>{count}</span>}
                          </button>
                        )
                      })}
                    </div>
                    {days.some(d => hasItemsOnDate(isoDate(d))) ? (
                      days.map(d => {
                        const dStr  = isoDate(d)
                        const items = itemsForDate(dStr)
                        if (!items.length) return null
                        return (
                          <div key={dStr} className="mb-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                              {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                            <div className="flex flex-col gap-1">
                              {items.map(item => <CalendarRow key={`${item.item_type}:${item.item_id}`} item={item} onRemove={() => unattend(item.item_type, item.item_id)} formatDate={formatDate} hideDate />)}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-xs text-gray-400 text-center mt-4">No items this week.</p>
                    )}
                  </>
                )
              })()}

              {/* ── MONTH VIEW ── */}
              {view === 'month' && (() => {
                const grid   = generateMonthGrid(viewDate.getFullYear(), viewDate.getMonth())
                const LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su']
                return (
                  <>
                    <NavBar title={navTitle()} onPrev={() => navigate(-1)} onNext={() => navigate(1)} />
                    <div className="grid grid-cols-7 mb-0.5">
                      {LABELS.map(l => <div key={l} className="text-center text-[9px] font-bold text-gray-400 uppercase py-1">{l}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-px mb-4">
                      {grid.map((d, i) => {
                        if (!d) return <div key={i} />
                        const dStr  = isoDate(d)
                        const count = itemsForDate(dStr).length
                        const isT   = dStr === today
                        return (
                          <button key={i} onClick={() => { setViewDate(d); setView('day') }}
                            className={`flex flex-col items-center py-1.5 border ${isT ? 'border-black bg-black text-white' : count > 0 ? 'border-black hover:bg-gray-50' : 'border-transparent hover:border-gray-200'}`}>
                            <span className={`text-[11px] font-mono ${isT ? 'text-white font-bold' : 'text-gray-700'}`}>{d.getDate()}</span>
                            {count > 0 && <span className={`text-[8px] font-bold ${isT ? 'text-white' : 'text-black'}`}>{count}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )
              })()}

              {/* ── YEAR VIEW ── */}
              {view === 'year' && (
                <>
                  <NavBar title={navTitle()} onPrev={() => navigate(-1)} onNext={() => navigate(1)} />
                  <div className="grid grid-cols-3 gap-1.5">
                    {Array.from({ length: 12 }, (_, m) => {
                      const md      = new Date(viewDate.getFullYear(), m, 1)
                      const prefix  = `${viewDate.getFullYear()}-${String(m+1).padStart(2,'0')}`
                      const count   = enriched.filter(i => (getItemDate(i) ?? '').startsWith(prefix)).length
                      const isCurM  = m === new Date().getMonth() && viewDate.getFullYear() === new Date().getFullYear()
                      return (
                        <button key={m} onClick={() => { setViewDate(md); setView('month') }}
                          className={`flex flex-col items-center py-3 border-2 ${isCurM ? 'border-black' : 'border-gray-200'} hover:border-black transition-colors`}>
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${isCurM ? 'text-black' : 'text-gray-500'}`}>
                            {md.toLocaleDateString('en-GB', { month: 'short' })}
                          </span>
                          {count > 0 && <span className="mt-1 w-4 h-4 bg-black text-white text-[8px] font-bold flex items-center justify-center">{count}</span>}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CalendarRow({
  item, onRemove, formatDate, hideDate = false,
}: {
  item: EnrichedItem; onRemove: () => void; formatDate: (d: string) => string; hideDate?: boolean
}) {
  const href    = item.item_type === 'event' ? `/events/${item.item_id}` : `/locations/${item.item_id}`
  const dateStr = item.item_type === 'event' ? item.date_start : item.scheduled_for
  const timeStr = item.item_type === 'location' ? item.scheduled_time : item.time_start
  const Icon    = item.item_type === 'event' ? CalendarDays : MapPin

  return (
    <div className="border border-black px-2.5 py-2 flex items-start justify-between gap-2 hover:bg-gray-50">
      <a href={href} className="flex items-start gap-2 flex-1 min-w-0">
        <Icon size={11} className="shrink-0 mt-0.5 text-gray-400" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900 truncate">{item.title}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">
            {!hideDate && dateStr ? formatDate(dateStr) : null}
            {timeStr ? (hideDate ? timeStr.slice(0, 5) : ` · ${timeStr.slice(0, 5)}`) : null}
            {item.subtitle ? (!hideDate && dateStr ? ` · ${item.subtitle}` : item.subtitle) : null}
          </p>
        </div>
      </a>
      <button onClick={onRemove}
        className="shrink-0 text-gray-400 hover:text-black hover:bg-red-50 w-5 h-5 flex items-center justify-center border border-transparent hover:border-red-200"
        title="Remove from calendar">
        <X size={10} />
      </button>
    </div>
  )
}
