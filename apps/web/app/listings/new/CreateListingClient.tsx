'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/providers/UserProvider'
import type { ListingType, ListingPriceType } from '@/lib/types'

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

export function CreateListingClient() {
  const { user, token } = useUser()
  const router = useRouter()

  const [type,          setType]          = useState<ListingType | null>(null)
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [priceCents,    setPriceCents]    = useState<string>('')
  const [priceType,     setPriceType]     = useState<ListingPriceType>('fixed')
  const [category,      setCategory]      = useState('')
  const [rooms,         setRooms]         = useState('')
  const [sqm,           setSqm]           = useState('')
  const [floor,         setFloor]         = useState('')
  const [address,       setAddress]       = useState('')
  const [borough,       setBorough]       = useState('')
  const [contactMethod, setContactMethod] = useState<'email' | 'phone' | 'both'>('email')
  const [contactInfo,   setContactInfo]   = useState('')
  const [files,         setFiles]         = useState<File[]>([])
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isApartment = type === 'apartment_rent' || type === 'apartment_buy'

  if (!user || !token) {
    return (
      <main className="min-h-screen bg-white font-sans">
        <div className="border-b-2 border-black px-4 py-3">
          <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white">
            ← Back
          </Link>
        </div>
        <div className="flex items-center justify-center h-64 text-sm text-gray-400">
          Please sign in to create a listing.
        </div>
      </main>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!type || !title.trim()) { setError('Type and title are required'); return }
    setSubmitting(true)
    setError(null)

    try {
      // 1. Create listing
      const priceVal = priceCents.trim() ? Math.round(parseFloat(priceCents) * 100) : undefined
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description:    description.trim() || undefined,
          price_cents:    priceVal,
          price_type:     priceType,
          category:       category.trim() || undefined,
          rooms:          rooms ? parseFloat(rooms) : undefined,
          sqm:            sqm ? parseFloat(sqm) : undefined,
          floor:          floor ? parseInt(floor, 10) : undefined,
          address:        address.trim() || undefined,
          borough:        borough || undefined,
          contact_method: contactMethod,
          contact_info:   contactInfo.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { data } = await res.json() as { data: { id: string } }

      // 2. Upload images
      for (const file of files.slice(0, 5)) {
        const form = new FormData()
        form.append('file', file)
        await fetch(`/api/listings/${data.id}/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
      }

      // 3. Redirect
      router.push(`/listings/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing')
      setSubmitting(false)
    }
  }

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return
    const combined = [...files, ...Array.from(newFiles)].slice(0, 5)
    setFiles(combined)
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const btn = 'text-xs border-2 border-black px-2.5 py-1 bg-white text-black hover:bg-black hover:text-white'
  const btnActive = 'text-xs border-2 border-black px-2.5 py-1 bg-black text-white'
  const input = 'w-full text-xs border-2 border-black px-2.5 py-1.5 outline-none focus:shadow-[2px_2px_0_#000]'

  return (
    <main className="min-h-screen bg-white font-sans">
      <div className="border-b-2 border-black px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-xs font-bold border-2 border-black px-2 py-1 hover:bg-black hover:text-white">
          ← Back
        </Link>
        <span className="text-xs text-gray-400">New Listing</span>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* 1. Type */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Type</p>
          <div className="flex gap-2 flex-wrap">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setType(opt.key)}
                className={type === opt.key ? btnActive : btn}
                style={type === opt.key ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Details */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 block">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={input} placeholder="e.g. 2-room apartment in Kreuzberg" required />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${input} min-h-[80px]`} placeholder="Details about your listing…" />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 block">Price (EUR)</label>
              <input type="number" step="0.01" min="0" value={priceCents} onChange={e => setPriceCents(e.target.value)} className={input} placeholder="0.00" />
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
            <input value={category} onChange={e => setCategory(e.target.value)} className={input} placeholder="e.g. Furniture, Electronics, Cleaning…" />
          </div>
        </div>

        {/* 3. Apartment fields */}
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

        {/* 4. Location */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Location</p>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} className={input} placeholder="Street and number" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Borough</label>
            <select value={borough} onChange={e => setBorough(e.target.value)} className={input}>
              <option value="">Select…</option>
              {BOROUGHS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        {/* 5. Contact */}
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
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Phone number</label>
              <input type="tel" value={contactInfo} onChange={e => setContactInfo(e.target.value)} className={input} placeholder="+49 …" />
            </div>
          )}
        </div>

        {/* 6. Images */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Images (max 5)</p>
          <div className="flex gap-2 flex-wrap mb-2">
            {files.map((f, i) => (
              <div key={i} className="relative w-20 h-20 border border-gray-200 overflow-hidden">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-0 right-0 bg-black text-white text-[10px] w-4 h-4 flex items-center justify-center"
                >✕</button>
              </div>
            ))}
          </div>
          {files.length < 5 && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
              <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
                + Add images
              </button>
            </>
          )}
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !type || !title.trim()}
          className="w-full text-sm font-bold border-2 border-black py-2.5 bg-black text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Listing'}
        </button>
      </form>
    </main>
  )
}
