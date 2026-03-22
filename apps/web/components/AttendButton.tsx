'use client'

import { useState, useRef, useEffect } from 'react'
import { CalendarPlus, CalendarCheck, X, Bell } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

interface Props {
  itemType:   'event' | 'location' | 'listing'
  itemId:     string
  onNeedAuth: () => void
}

export default function AttendButton({ itemType, itemId, onNeedAuth }: Props) {
  const { user, token, isAttending, attend, unattend } = useUser()
  const [loading,    setLoading]    = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [schedDate,  setSchedDate]  = useState('')
  const [schedTime,  setSchedTime]  = useState('')
  const [showReminder, setShowReminder] = useState(false)
  const [reminderHours, setReminderHours] = useState<number | null>(null)
  const reminderRef = useRef<HTMLDivElement>(null)

  const attending = isAttending(itemType, itemId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (reminderRef.current && !reminderRef.current.contains(e.target as Node)) setShowReminder(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function setReminder(hours: number) {
    setReminderHours(hours)
    setShowReminder(false)
    try {
      await fetch('/api/attendance/reminder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_type: itemType, item_id: itemId, reminder_hours: hours }),
      })
    } catch (err) {
      console.error('Failed to set reminder:', err)
    }
  }

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!user) { onNeedAuth(); return }
    if (attending) {
      setLoading(true)
      try { await unattend(itemType, itemId) } finally { setLoading(false) }
      return
    }
    if (itemType === 'location') {
      // Show date picker modal for venues
      setSchedDate('')
      setSchedTime('')
      setShowModal(true)
    } else {
      setLoading(true)
      try {
        await attend(itemType, itemId)
        setShowReminder(true)
      } finally { setLoading(false) }
    }
  }

  function closeModal() {
    setShowModal(false)
    setSchedDate('')
    setSchedTime('')
  }

  async function confirmSchedule(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!schedDate) return
    closeModal()
    setLoading(true)
    try {
      await attend(itemType, itemId, { scheduledFor: schedDate, scheduledTime: schedTime || undefined })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="relative" ref={reminderRef}>
        <button
          onClick={toggle}
          disabled={loading}
          title={attending ? 'Remove from my calendar' : 'Add to my calendar'}
          className={`flex items-center justify-center w-7 h-7 border border-[var(--border-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)] transition-colors disabled:opacity-50 ${attending ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'bg-[var(--bg-primary)] text-[var(--text-primary)]'}`}
        >
          {attending ? <CalendarCheck size={12} /> : <CalendarPlus size={12} />}
        </button>

        {/* Remind me dropdown */}
        {showReminder && attending && (
          <div className="absolute top-full right-0 mt-1 z-50 bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[3px_3px_0_var(--border-primary)] w-40">
            <div className="px-2 py-1.5 border-b border-[var(--border-secondary)] flex items-center gap-1.5">
              <Bell size={10} />
              <span className="text-[10px] font-bold uppercase tracking-wide">Remind me</span>
            </div>
            {[
              { label: '1 hour before', hours: 1 },
              { label: '2 hours before', hours: 2 },
              { label: '1 day before', hours: 24 },
            ].map(opt => (
              <button
                key={opt.hours}
                onClick={(e) => { e.stopPropagation(); setReminder(opt.hours) }}
                className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-[var(--bg-secondary)] ${reminderHours === opt.hours ? 'font-bold bg-[var(--bg-secondary)]' : ''}`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={(e) => { e.stopPropagation(); setShowReminder(false) }}
              className="w-full text-left px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              No thanks
            </button>
          </div>
        )}
      </div>

      {/* Date picker modal — venues only */}
      {showModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={e => { e.stopPropagation(); closeModal() }}
        >
          <form
            onSubmit={confirmSchedule}
            onClick={e => e.stopPropagation()}
            className="bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)] p-5 w-72"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-wide">Schedule a visit</p>
              <button type="button" onClick={closeModal} className="hover:bg-[var(--accent)] hover:text-[var(--accent-text)] w-6 h-6 flex items-center justify-center border border-[var(--border-primary)]">
                <X size={11} />
              </button>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] mb-1">Date *</label>
            <input
              type="date"
              value={schedDate}
              onChange={e => setSchedDate(e.target.value)}
              required
              className="w-full text-xs border-2 border-[var(--border-primary)] px-2 py-1.5 mb-3 outline-none focus:shadow-[2px_2px_0_var(--border-primary)] font-mono"
            />
            <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] mb-1">Time (optional)</label>
            <input
              type="time"
              value={schedTime}
              onChange={e => setSchedTime(e.target.value)}
              className="w-full text-xs border-2 border-[var(--border-primary)] px-2 py-1.5 mb-4 outline-none focus:shadow-[2px_2px_0_var(--border-primary)] font-mono"
            />
            <button
              type="submit"
              disabled={!schedDate}
              className="w-full text-xs font-bold border-2 border-[var(--border-primary)] px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent)] disabled:opacity-40"
            >
              Add to calendar
            </button>
          </form>
        </div>
      )}
    </>
  )
}
