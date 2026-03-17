'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Share2, Check } from 'lucide-react'
import JourneyWidget from '@/components/JourneyWidget'
import { useUser } from '@/providers/UserProvider'

const VenueMap = dynamic(() => import('@/components/VenueMap'), { ssr: false })

const WORKER = 'https://kulturpulse-worker.openberlinai.workers.dev'

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
      className="inline-flex items-center gap-1 text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
    >
      {copied ? <><Check size={12} /> Copied</> : <><Share2 size={12} /> Share</>}
    </button>
  )
}

interface Props {
  id:            string
  userId:        string
  lat:           number | null
  lng:           number | null
  title:         string
  contactMethod: string
  contactInfo:   string | null
  sellerEmail?:  string
  images:        string[]
  status:        string
}

export function ListingPageClient({
  id, userId, lat, lng, title,
  contactMethod, contactInfo, sellerEmail,
  images, status,
}: Props) {
  const { user, token } = useUser()
  const [showContact, setShowContact] = useState(false)
  const [marking, setMarking]         = useState(false)
  const [currentStatus, setCurrentStatus] = useState(status)
  const isOwner = user?.id === userId

  async function markStatus(newStatus: 'sold' | 'active') {
    if (!token) return
    setMarking(true)
    try {
      await fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      })
      setCurrentStatus(newStatus)
    } catch { /* ignore */ }
    setMarking(false)
  }

  return (
    <>
      {/* Image gallery */}
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
          {images.map((key, i) => (
            <img
              key={i}
              src={`${WORKER}/api/listings/images/${key}`}
              alt={`${title} ${i + 1}`}
              className="h-48 w-auto object-cover border-2 border-black shrink-0"
            />
          ))}
        </div>
      )}

      {/* Contact reveal */}
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Contact</p>
        {showContact ? (
          <div className="border-2 border-black p-3 text-sm space-y-1">
            {(contactMethod === 'email' || contactMethod === 'both') && sellerEmail && (
              <p>
                <a href={`mailto:${sellerEmail}`} className="text-blue-600 underline">{sellerEmail}</a>
              </p>
            )}
            {(contactMethod === 'phone' || contactMethod === 'both') && contactInfo && (
              <p>
                <a href={`tel:${contactInfo.replace(/\s/g, '')}`} className="text-blue-600 underline">{contactInfo}</a>
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowContact(true)}
            className="text-xs border-2 border-black px-3 py-1.5 hover:bg-black hover:text-white font-bold"
          >
            Show contact info
          </button>
        )}
      </div>

      {/* Owner controls */}
      {isOwner && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <Link
            href={`/listings/${id}/edit`}
            className="text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
          >
            Edit listing
          </Link>
          {currentStatus === 'active' && (
            <button
              onClick={() => markStatus('sold')}
              disabled={marking}
              className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white disabled:opacity-50"
            >
              {marking ? '…' : 'Mark as Sold'}
            </button>
          )}
          {currentStatus === 'sold' && (
            <button
              onClick={() => markStatus('active')}
              disabled={marking}
              className="text-xs border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white disabled:opacity-50"
            >
              {marking ? '…' : 'Re-activate'}
            </button>
          )}
        </div>
      )}

      {/* Plan Route */}
      {lat && lng && (
        <div className="border-2 border-black p-3 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Plan Route</p>
          <JourneyWidget toLat={lat} toLng={lng} />
        </div>
      )}

      {/* Mini map */}
      {lat && lng && (
        <div className="border-2 border-black mb-4 overflow-hidden" style={{ height: 220 }}>
          <VenueMap lat={lat} lng={lng} name={title} />
        </div>
      )}

      {/* Get Directions + Share */}
      {lat && lng && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-black hover:text-white"
          >
            ↗ Get Directions
          </a>
          <ShareButton />
        </div>
      )}
    </>
  )
}
