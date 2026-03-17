'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/providers/UserProvider'
import type { Listing, ListingType, ListingPriceType } from '@/lib/types'

const TYPE_OPTIONS: { key: ListingType; label: string; color: string }[] = [
  { key: 'apartment_rent', label: 'Rent',    color: '#2563eb' },
  { key: 'apartment_buy',  label: 'Buy',     color: '#16a34a' },
  { key: 'item',           label: 'Item',    color: '#d97706' },
  { key: 'service',        label: 'Service', color: '#7c3aed' },
]

const PRICE_TYPES: { key: ListingPriceType; label: string }[] = [
  { key: 'fixed',      label: 'Fixed' },
  { key: 'negotiable', label: 'VB' },
  { key: 'per_month',  label: '/mo' },
  { key: 'free',       label: 'Free' },
]

const BOROUGHS = [
  'Mitte', 'Friedrichshain-Kreuzberg', 'Pankow', 'Charlottenburg-Wilmersdorf',
  'Spandau', 'Steglitz-Zehlendorf', 'Tempelhof-Schöneberg', 'Neukölln',
  'Treptow-Köpenick', 'Marzahn-Hellersdorf', 'Lichtenberg', 'Reinickendorf',
]

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const { user, token } = useUser()
  const router = useRouter()

  const [listing, setListing]       = useState<Listing | null>(null)
  const [loading, setLoading]       = useState(true)
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [priceCents,    setPriceCents]    = useState('')
  const [priceType,     setPriceType]     = useState<ListingPriceType>('fixed')
  const [category,      setCategory]      = useState('')
  const [rooms,         setRooms]         = useState('')
  const [sqm,           setSqm]           = useState('')
  const [floor,         setFloor]         = useState('')
  const [address,       setAddress]       = useState('')
  const [borough,       setBorough]       = useState('')
  const [contactMethod, setContactMethod] = useState<'email' | 'phone' | 'both'>('email')
  const [contactInfo,   setContactInfo]   = useState('')
  const [newFiles,      setNewFiles]      = useState<File[]>([])
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/listings/${id}`)
      .then(r => r.json())
      .then((json: { data: Listing }) => {
        const l = json.data
        setListing(l)
        setTitle(l.title)
        setDescription(l.description ?? '')
        setPriceCents(l.price_cents != null ? (l.price_cents / 100).toString() : '')
        setPriceType(l.price_type)
        setCategory(l.category ?? '')
        setRooms(l.rooms != null ? l.rooms.toString() : '')
        setSqm(l.sqm != null ? l.sqm.toString() : '')
        setFloor(l.floor != null ? l.floor.toString() : '')
        setAddress(l.address ?? '')
        setBorough(l.borough ?? '')
        setContactMethod(l.contact_method)
        setContactInfo(l.contact_info ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const isApartment = listing?.type === 'apartment_rent' || listing?.type === 'apartment_buy'
  const existingImages: string[] = listing?.images ? JSON.parse(listing.images) : []

  if (loading) {
    return (
      <main className="min-h-screen bg-white font-sans flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  if (!listing || !user || !token || user.id !== listing.user_id) {
    return (
      <main className="min-h-screen bg-white font-sans">
        <div className="border-b-2 border-black px-4 py-3">
          <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white">← Back</Link>
        </div>
        <div className="flex items-center justify-center h-64 text-sm text-gray-400">
          Not found or not authorized.
        </div>
      </main>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true)
    setError(null)

    try {
      const priceVal = priceCents.trim() ? Math.round(parseFloat(priceCents) * 100) : undefined
      const res = await fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title:          title.trim(),
          description:    description.trim() || null,
          price_cents:    priceVal ?? null,
          price_type:     priceType,
          category:       category.trim() || null,
          rooms:          rooms ? parseFloat(rooms) : null,
          sqm:            sqm ? parseFloat(sqm) : null,
          floor:          floor ? parseInt(floor, 10) : null,
          address:        address.trim() || null,
          borough:        borough || null,
          contact_method: contactMethod,
          contact_info:   contactInfo.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Upload any new images
      for (const file of newFiles.slice(0, 5 - existingImages.length)) {
        const form = new FormData()
        form.append('file', file)
        await fetch(`/api/listings/${id}/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
      }

      router.push(`/listings/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
      setSubmitting(false)
    }
  }

  const btn = 'text-xs border-2 border-black px-2.5 py-1 bg-white text-black hover:bg-black hover:text-white'
  const btnActive = 'text-xs border-2 border-black px-2.5 py-1 bg-black text-white'
  const input = 'w-full text-xs border-2 border-black px-2.5 py-1.5 outline-none focus:shadow-[2px_2px_0_#000]'

  return (
    <main className="min-h-screen bg-white font-sans">
      <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3">
        <Link href={`/listings/${id}`} className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white">
          ← Back
        </Link>
        <span className="text-xs text-gray-400">Edit Listing</span>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Type (read-only) */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Type</p>
          <div className="flex gap-2">
            {TYPE_OPTIONS.map(opt => (
              <span
                key={opt.key}
                className={listing.type === opt.key ? btnActive : `${btn} opacity-30`}
                style={listing.type === opt.key ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
              >
                {opt.label}
              </span>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 block">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={input} required />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${input} min-h-[80px]`} />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 block">Price (EUR)</label>
              <input type="number" step="0.01" min="0" value={priceCents} onChange={e => setPriceCents(e.target.value)} className={input} />
            </div>
            <div className="flex gap-1 pb-0.5">
              {PRICE_TYPES.map(pt => (
                <button key={pt.key} type="button" onClick={() => setPriceType(pt.key)} className={priceType === pt.key ? btnActive : btn}>
                  {pt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 block">Category</label>
            <input value={category} onChange={e => setCategory(e.target.value)} className={input} />
          </div>
        </div>

        {/* Apartment fields */}
        {isApartment && (
          <div className="border-2 border-black p-3 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Apartment Details</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block">Rooms</label>
                <input type="number" step="0.5" min="1" value={rooms} onChange={e => setRooms(e.target.value)} className={input} />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block">m²</label>
                <input type="number" min="1" value={sqm} onChange={e => setSqm(e.target.value)} className={input} />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block">Floor</label>
                <input type="number" min="0" value={floor} onChange={e => setFloor(e.target.value)} className={input} />
              </div>
            </div>
          </div>
        )}

        {/* Location */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Location</p>
          <input value={address} onChange={e => setAddress(e.target.value)} className={input} placeholder="Address" />
          <select value={borough} onChange={e => setBorough(e.target.value)} className={input}>
            <option value="">Borough…</option>
            {BOROUGHS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Contact */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Contact</p>
          <div className="flex gap-2">
            {(['email', 'phone', 'both'] as const).map(m => (
              <button key={m} type="button" onClick={() => setContactMethod(m)} className={contactMethod === m ? btnActive : btn}>
                {m === 'both' ? 'Email + Phone' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {(contactMethod === 'phone' || contactMethod === 'both') && (
            <input type="tel" value={contactInfo} onChange={e => setContactInfo(e.target.value)} className={input} placeholder="+49 …" />
          )}
        </div>

        {/* Existing images */}
        {existingImages.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Current Images</p>
            <div className="flex gap-2 flex-wrap">
              {existingImages.map((key, i) => (
                <img
                  key={i}
                  src={`/api/listings/images/${key}`}
                  alt=""
                  className="w-20 h-20 object-cover border border-gray-200"
                />
              ))}
            </div>
          </div>
        )}

        {/* New images */}
        {existingImages.length < 5 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Add Images</p>
            <div className="flex gap-2 flex-wrap mb-2">
              {newFiles.map((f, i) => (
                <div key={i} className="relative w-20 h-20 border border-gray-200 overflow-hidden">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 bg-black text-white text-[10px] w-4 h-4 flex items-center justify-center"
                  >✕</button>
                </div>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => {
              if (e.target.files) setNewFiles(prev => [...prev, ...Array.from(e.target.files!)].slice(0, 5 - existingImages.length))
            }} />
            <button type="button" onClick={() => fileRef.current?.click()} className={btn}>+ Add images</button>
          </div>
        )}

        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="w-full text-sm font-bold border-2 border-black py-2.5 bg-black text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </main>
  )
}
