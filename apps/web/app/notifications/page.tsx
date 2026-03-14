'use client'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'

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

function notifLink(type: string, data: string): string | null {
  try {
    const d = JSON.parse(data) as Record<string, string>
    if ((type === 'list_shared' || type === 'invite') && d.list_id) {
      return `/lists/${d.list_id}`
    }
  } catch { /* ignore */ }
  return null
}

export default function NotificationsPage() {
  const { user, notifications, unreadCount, markNotificationRead } = useUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-white font-sans flex flex-col items-center justify-center">
        <p className="text-sm text-gray-600 mb-4">Sign in to view notifications.</p>
        <Link href="/" className="text-xs font-bold border-2 border-black px-3 py-1.5 hover:bg-black hover:text-white">
          ← Back to map
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white font-sans">
      {/* Nav */}
      <div className="border-b-2 border-black px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors">
            ← Back to map
          </Link>
          <div className="flex items-center gap-1.5">
            <Bell size={13} />
            <span className="text-xs font-bold uppercase tracking-wide">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-black text-white text-[9px] font-bold px-1 py-0.5 min-w-[16px] text-center">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markNotificationRead('all')}
            className="text-xs border-2 border-black px-2 py-1 hover:bg-black hover:text-white font-bold"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Bell size={28} className="mb-3" />
            <p className="text-sm">No notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map(n => {
              const link = notifLink(n.type, n.data)
              const label = notifLabel(n.type, n.data)
              const Row = (
                <div
                  className={`px-4 py-3.5 flex items-start gap-3 hover:bg-gray-50 cursor-pointer ${!n.read ? 'bg-gray-50 border-l-2 border-black' : 'pl-[calc(1rem+2px)]'}`}
                  onClick={() => { if (!n.read) markNotificationRead(n.id) }}
                >
                  <div className={`mt-1 w-2 h-2 shrink-0 ${!n.read ? 'bg-black' : ''}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-gray-900">{label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatRelative(n.created_at)}</p>
                  </div>
                  {link && (
                    <span className="text-[10px] text-gray-400 border border-gray-300 px-1.5 py-0.5 shrink-0 hover:border-black hover:text-black">
                      View →
                    </span>
                  )}
                </div>
              )
              return link ? (
                <Link key={n.id} href={link} className="block">
                  {Row}
                </Link>
              ) : (
                <div key={n.id}>{Row}</div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
