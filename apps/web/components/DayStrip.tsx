'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { todayISO, parseLocalDate, formatDate } from '@/lib/utils'

interface Props {
  dateFrom: string
  dateTo: string
  onSelectDay: (iso: string) => void
  onSelectRange: (from: string, to: string) => void
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

export default function DayStrip({ dateFrom, dateTo, onSelectDay, onSelectRange }: Props) {
  const today = todayISO()
  const isRange = dateFrom !== dateTo
  const pillCount = 7

  const [windowStart, setWindowStart] = useState(() => parseLocalDate(today))
  const [calOpen, setCalOpen] = useState(false)
  const calRef = useRef<HTMLDivElement>(null)

  // Close calendar on outside click
  useEffect(() => {
    if (!calOpen) return
    function handleClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [calOpen])

  const days = useMemo(() => {
    const result: Date[] = []
    for (let i = 0; i < pillCount; i++) {
      result.push(addDays(windowStart, i))
    }
    return result
  }, [windowStart])

  const handleToday = () => {
    const t = todayISO()
    onSelectDay(t)
    setWindowStart(parseLocalDate(t))
  }

  const selectedRange = isRange
    ? { from: parseLocalDate(dateFrom), to: parseLocalDate(dateTo) }
    : { from: parseLocalDate(dateFrom), to: undefined }

  const btnBase = 'flex items-center justify-center shrink-0 border-2 border-[var(--border-primary)]'
  const btnSmall = `${btnBase} w-6 h-7`
  const btnDefault = 'bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
  const btnActive = 'bg-[var(--accent)] text-[var(--accent-text)]'

  return (
    <div className="px-4 py-1.5 border-b-2 border-[var(--border-primary)]">
      {/* Range indicator */}
      {isRange && (
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] text-[var(--text-muted)]">
            {formatDate(dateFrom)} – {formatDate(dateTo)}
          </span>
          <button
            onClick={() => { onSelectDay(todayISO()); setWindowStart(parseLocalDate(todayISO())) }}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            title="Clear range"
          >
            <X size={10} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-0.5">
        {/* Back arrow */}
        <button onClick={() => setWindowStart(prev => addDays(prev, -pillCount))} className={`${btnSmall} ${btnDefault}`}>
          <ChevronLeft size={11} />
        </button>

        {/* Today pill */}
        <button
          onClick={handleToday}
          className={`${btnBase} h-7 px-1.5 text-[10px] font-bold ${dateFrom === today && !isRange ? btnActive : btnDefault}`}
        >
          Today
        </button>

        {/* Day pills — flex-1 to fill available space */}
        {days.map((d) => {
          const iso = toISO(d)
          const isSelected = dateFrom === iso && !isRange
          const inRange = isRange && iso >= dateFrom && iso <= dateTo
          const isToday = iso === today
          const dayLetter = DAY_LETTERS[d.getDay()]
          const dateNum = d.getDate()

          return (
            <button
              key={iso}
              onClick={() => onSelectDay(iso)}
              className={`${btnBase} flex-1 min-w-0 h-7 text-[10px] font-medium transition-colors ${
                isSelected
                  ? btnActive
                  : inRange
                    ? 'bg-[var(--accent)]/20 text-[var(--text-primary)] border-[var(--accent)]/40'
                    : btnDefault
              }`}
            >
              <span className="truncate">
                {dayLetter} {dateNum}{isToday ? '\u2022' : ''}
              </span>
            </button>
          )
        })}

        {/* Forward arrow */}
        <button onClick={() => setWindowStart(prev => addDays(prev, pillCount))} className={`${btnSmall} ${btnDefault}`}>
          <ChevronRight size={11} />
        </button>

        {/* Calendar icon for range selection */}
        <div ref={calRef} className="relative shrink-0">
          <button
            onClick={() => setCalOpen(o => !o)}
            className={`${btnSmall} ${isRange || calOpen ? btnActive : btnDefault}`}
            title="Select date range"
          >
            <CalendarIcon size={11} />
          </button>
          {calOpen && (
            <div className="absolute top-full right-0 mt-1 z-[1000] bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)]">
              <div className="flex gap-1 px-2 pt-2">
                {([
                  ['Today', 0],
                  ['3 days', 2],
                  ['Week', 6],
                  ['Month', 30],
                ] as const).map(([label, offset]) => {
                  const from = todayISO()
                  const to = offset === 0 ? from : toISO(addDays(new Date(), offset))
                  const active = dateFrom === from && dateTo === to
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        if (offset === 0) onSelectDay(from)
                        else onSelectRange(from, to)
                        setCalOpen(false)
                        setWindowStart(parseLocalDate(from))
                      }}
                      className={`text-[10px] border-2 border-[var(--border-primary)] px-2 py-0.5 ${
                        active ? btnActive : `${btnDefault} hover:bg-[var(--accent)] hover:text-[var(--accent-text)]`
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <DayPicker
                mode="range"
                selected={selectedRange}
                onSelect={range => {
                  if (!range?.from) return
                  const from = toISO(range.from)
                  const to = range.to ? toISO(range.to) : from
                  if (range.to) {
                    onSelectRange(from, to)
                    setCalOpen(false)
                  } else {
                    onSelectDay(from)
                  }
                }}
                className="text-sm p-2"
              />
              {!isRange && (
                <div className="px-3 pb-2 text-[10px] text-gray-400 text-center">
                  Click a second date to set a range
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
