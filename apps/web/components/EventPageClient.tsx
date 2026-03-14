'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Share2, Check } from 'lucide-react'
import { UserProvider, useUser } from '@/providers/UserProvider'
import AddToListButton from './AddToListButton'

const EventMapSection = dynamic(() => import('./EventMapSection'), { ssr: false })

function ShareButton() {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white font-bold"
    >
      {copied ? <Check size={11} /> : <Share2 size={11} />}
      {copied ? 'Copied!' : 'Share'}
    </button>
  )
}

function EventActions({ id }: { id: string }) {
  const { user } = useUser()
  const [showAuth, setShowAuth] = useState(false)
  const [AuthModal, setAuthModal] = useState<React.ComponentType<{ onClose: () => void }> | null>(null)

  function openAuth() {
    import('./AuthModal').then(m => setAuthModal(() => m.default)).catch(() => {})
    setShowAuth(true)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <ShareButton />
        <AddToListButton itemType="event" itemId={id} onNeedAuth={openAuth} />
      </div>
      {showAuth && AuthModal && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

export function EventPageClient({ id, lat, lng }: { id: string; lat?: number; lng?: number }) {
  return (
    <UserProvider>
      {lat && lng && <EventMapSection lat={lat} lng={lng} />}
      <EventActions id={id} />
    </UserProvider>
  )
}
