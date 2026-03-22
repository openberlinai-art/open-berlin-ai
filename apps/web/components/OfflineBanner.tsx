'use client'
import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setOffline(!navigator.onLine)
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="bg-yellow-100 border-b-2 border-yellow-400 px-4 py-1.5 flex items-center gap-2 text-yellow-800">
      <WifiOff size={14} />
      <span className="text-xs font-bold">You're offline — showing cached data</span>
    </div>
  )
}
