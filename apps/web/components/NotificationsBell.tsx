'use client'
import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

export default function NotificationsBell() {
  const { notifications, unreadCount, markNotificationRead } = useUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleOpen() {
    setOpen(o => !o)
  }

  function formatRelative(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  function notifLabel(type: string, data: string) {
    try {
      const d = JSON.parse(data) as Record<string, string>
      if (type === 'list_shared') return `${d.from_name ?? 'Someone'} shared a list: "${d.list_name ?? ''}"`
      if (type === 'invite')      return `${d.from_name ?? 'Someone'} invited you to "${d.list_name ?? ''}"`
    } catch { /* ignore */ }
    return type
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-8 h-8 border-2 border-black hover:bg-black hover:text-white"
        title="Notifications"
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-black text-white text-[9px] font-bold flex items-center justify-center px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border-2 border-black shadow-[3px_3px_0_#000] w-72">
          <div className="flex items-center justify-between px-3 py-2 border-b-2 border-black">
            <span className="text-[10px] font-bold uppercase tracking-wide">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markNotificationRead('all')}
                className="text-[9px] text-gray-400 underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-[11px] text-gray-400 px-3 py-4 text-center">No notifications yet</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => markNotificationRead(n.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-2 ${!n.read ? 'bg-gray-50' : ''}`}
                >
                  {!n.read && (
                    <span className="mt-1 w-1.5 h-1.5 rounded-none bg-black shrink-0" />
                  )}
                  {n.read && <span className="mt-1 w-1.5 h-1.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium leading-snug">{notifLabel(n.type, n.data)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatRelative(n.created_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
