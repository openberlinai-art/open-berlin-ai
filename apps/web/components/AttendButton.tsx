'use client'

import { useState } from 'react'
import { CalendarPlus, CalendarCheck, X } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

interface Props {
  itemType:   'event' | 'location'
  itemId:     string
  onNeedAuth: () => void
}

export default function AttendButton({ itemType, itemId, onNeedAuth }: Props) {
  const { user, isAttending, attend, unattend } = useUser()
  const [loading,    setLoading]    = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [schedDate,  setSchedDate]  = useState('')
  const [schedTime,  setSchedTime]  = useState('')

  const attending = isAttending(itemType, itemId)

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
      try { await attend(itemType, itemId) } finally { setLoading(false) }
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
      <button
        onClick={toggle}
        disabled={loading}
        title={attending ? 'Remove from my calendar' : 'Add to my calendar'}
        className={`flex items-center justify-center w-7 h-7 border border-black hover:bg-black hover:text-white transition-colors disabled:opacity-50 ${attending ? 'bg-black text-white' : 'bg-white text-black'}`}
      >
        {attending ? <CalendarCheck size={12} /> : <CalendarPlus size={12} />}
      </button>

      {/* Date picker modal — venues only */}
      {showModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
          onClick={e => { e.stopPropagation(); closeModal() }}
        >
          <form
            onSubmit={confirmSchedule}
            onClick={e => e.stopPropagation()}
            className="bg-white border-2 border-black shadow-[4px_4px_0_#000] p-5 w-72"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-wide">Schedule a visit</p>
              <button type="button" onClick={closeModal} className="hover:bg-black hover:text-white w-6 h-6 flex items-center justify-center border border-black">
                <X size={11} />
              </button>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Date *</label>
            <input
              type="date"
              value={schedDate}
              onChange={e => setSchedDate(e.target.value)}
              required
              className="w-full text-xs border-2 border-black px-2 py-1.5 mb-3 outline-none focus:shadow-[2px_2px_0_#000] font-mono"
            />
            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Time (optional)</label>
            <input
              type="time"
              value={schedTime}
              onChange={e => setSchedTime(e.target.value)}
              className="w-full text-xs border-2 border-black px-2 py-1.5 mb-4 outline-none focus:shadow-[2px_2px_0_#000] font-mono"
            />
            <button
              type="submit"
              disabled={!schedDate}
              className="w-full text-xs font-bold border-2 border-black px-3 py-1.5 bg-black text-white hover:bg-gray-800 disabled:opacity-40"
            >
              Add to calendar
            </button>
          </form>
        </div>
      )}
    </>
  )
}
