'use client'

import { useState } from 'react'
import { CalendarPlus, CalendarCheck } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

interface Props {
  itemType:   'event' | 'location'
  itemId:     string
  onNeedAuth: () => void
}

export default function AttendButton({ itemType, itemId, onNeedAuth }: Props) {
  const { user, isAttending, attend, unattend } = useUser()
  const [loading, setLoading] = useState(false)

  const attending = isAttending(itemType, itemId)

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!user) { onNeedAuth(); return }
    setLoading(true)
    try {
      attending ? await unattend(itemType, itemId) : await attend(itemType, itemId)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={attending ? 'Remove from my calendar' : 'Add to my calendar'}
      className={`flex items-center justify-center w-7 h-7 border border-black hover:bg-black hover:text-white transition-colors disabled:opacity-50 ${attending ? 'bg-black text-white' : 'bg-white text-black'}`}
    >
      {attending ? <CalendarCheck size={12} /> : <CalendarPlus size={12} />}
    </button>
  )
}
