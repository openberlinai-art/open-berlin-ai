'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/providers/UserProvider'

const CATEGORIES = [
  'Music', 'Art', 'Theater', 'Dance', 'Film', 'Exhibitions',
  'Education', 'Talks', 'Sports', 'Kids', 'Recreation', 'Tours', 'Other',
]

const TAG_OPTIONS = [
  'techno', 'house', 'jazz', 'experimental', 'queer', 'free',
  'afterhours', 'pop-up', 'gallery', 'workshop', 'open-air',
  'spoken-word', 'film', 'community', 'networking', 'dj', 'live-music',
]

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export function CreateCommunityEventClient() {
  const { user, token } = useUser()
  const router = useRouter()

  const [title,          setTitle]          = useState('')
  const [description,    setDescription]    = useState('')
  const [dateStart,      setDateStart]      = useState('')
  const [timeStart,      setTimeStart]      = useState('')
  const [timeEnd,        setTimeEnd]        = useState('')
  const [isRecurring,    setIsRecurring]    = useState(false)
  const [recurrenceDay,  setRecurrenceDay]  = useState('')
  const [locationName,   setLocationName]   = useState('')
  const [address,        setAddress]        = useState('')
  const [borough,        setBorough]        = useState('')
  const [lat,            setLat]            = useState<number | null>(null)
  const [lng,            setLng]            = useState<number | null>(null)
  const [category,       setCategory]       = useState('')
  const [tags,           setTags]           = useState<string[]>([])
  const [isFree,         setIsFree]         = useState(false)
  const [ticketUrl,      setTicketUrl]      = useState('')
  const [file,           setFile]           = useState<File | null>(null)
  const [submitterName,  setSubmitterName]  = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [success,        setSuccess]        = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Prefill submitter name from user profile
  useEffect(() => {
    if (user?.display_name && !submitterName) setSubmitterName(user.display_name)
  }, [user?.display_name, submitterName])

  // Address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ label: string; lat: number; lng: number; borough?: string; source: 'local' | 'photon' }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const fetchAddressSuggestions = useCallback((query: string) => {
    clearTimeout(addressDebounceRef.current)
    if (query.length < 2) { setAddressSuggestions([]); return }
    addressDebounceRef.current = setTimeout(async () => {
      try {
        const [localRes, photonRes] = await Promise.allSettled([
          fetch(`/api/streets?q=${encodeURIComponent(query)}&limit=4`).then(r => r.ok ? r.json() as Promise<Array<{ name: string; lat: number; lng: number; postcode: string | null; borough: string | null }>> : []),
          query.length >= 3
            ? fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=52.52&lon=13.405&limit=4&lang=de`).then(r => r.ok ? r.json() as Promise<{ features: Array<{ geometry: { coordinates: [number, number] }; properties: { name?: string; street?: string; housenumber?: string; city?: string; county?: string } }> }> : { features: [] })
            : Promise.resolve({ features: [] as Array<{ geometry: { coordinates: [number, number] }; properties: { name?: string; street?: string; housenumber?: string; city?: string; county?: string } }> }),
        ])
        const results: typeof addressSuggestions = []
        if (localRes.status === 'fulfilled') {
          for (const s of localRes.value) {
            results.push({ label: [s.name, s.postcode].filter(Boolean).join(', '), lat: s.lat, lng: s.lng, borough: s.borough ?? undefined, source: 'local' })
          }
        }
        if (photonRes.status === 'fulfilled') {
          for (const f of photonRes.value.features) {
            if (!f.properties.street && !f.properties.name) continue
            const p = f.properties
            const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : p.name ?? ''
            results.push({ label: [street, p.city ?? ''].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], borough: p.county ?? undefined, source: 'photon' })
          }
        }
        setAddressSuggestions(results)
        setShowSuggestions(true)
      } catch { /* ignore */ }
    }, 300)
  }, [])

  useEffect(() => () => clearTimeout(addressDebounceRef.current), [])

  if (!user || !token) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] font-sans">
        <div className="border-b-2 border-[var(--border-primary)] px-4 py-3">
          <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]">
            ← Back
          </Link>
        </div>
        <div className="flex items-center justify-center h-64 text-sm text-[var(--text-muted)]">
          Please sign in to submit an event.
        </div>
      </main>
    )
  }

  if (success) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] font-sans">
        <div className="border-b-2 border-[var(--border-primary)] px-4 py-3">
          <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]">
            ← Back to map
          </Link>
        </div>
        <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
          <p className="text-2xl font-extrabold text-[var(--text-primary)]">Thanks!</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Your event is pending review. We&apos;ll notify you when it&apos;s live.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-3 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]">
              Back to map
            </Link>
            <button
              onClick={() => { setSuccess(false); setTitle(''); setDescription(''); setDateStart(''); setTimeStart(''); setTimeEnd(''); setFile(null); setError(null) }}
              className="text-xs font-bold border-2 border-[var(--border-primary)] px-3 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]"
            >
              Submit another
            </button>
          </div>
        </div>
      </main>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !dateStart) { setError('Title and date are required'); return }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/community-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          date_start: dateStart,
          time_start: timeStart || undefined,
          time_end: timeEnd || undefined,
          is_recurring: isRecurring,
          recurrence_day: isRecurring ? recurrenceDay || undefined : undefined,
          location_name: locationName.trim() || undefined,
          address: address.trim() || undefined,
          borough: borough || undefined,
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          category: category || undefined,
          tags: tags.length ? tags : undefined,
          is_free: isFree,
          ticket_url: ticketUrl.trim() || undefined,
          submitter_name: submitterName.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { data } = await res.json() as { data: { id: string } }

      // Upload image if selected
      if (file) {
        const form = new FormData()
        form.append('file', file)
        await fetch(`/api/community-events/${data.id}/image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit event')
      setSubmitting(false)
    }
  }

  const btn = 'text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)]'
  const btnActive = 'text-xs border-2 border-[var(--border-primary)] px-2.5 py-1 bg-[var(--accent)] text-[var(--accent-text)]'
  const input = 'w-full text-xs border-2 border-[var(--border-primary)] px-2.5 py-1.5 outline-none bg-[var(--bg-primary)] text-[var(--text-primary)] focus:shadow-[2px_2px_0_var(--border-primary)]'

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] font-sans">
      <div className="border-b-2 border-[var(--border-primary)] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]">
          ← Back
        </Link>
        <span className="text-xs text-[var(--text-muted)]">Submit Event</span>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Title */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1 block">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value.slice(0, 100))} className={input} placeholder="e.g. Techno Afterhours at Hidden Spot" required />
          <p className="text-[9px] text-[var(--text-muted)] mt-0.5 text-right">{title.length}/100</p>
        </div>

        {/* Date & Time */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">When *</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-[var(--text-muted)] block mb-1">Date</label>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={input} required />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)] block mb-1">Start time</label>
              <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} className={input} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)] block mb-1">End time</label>
              <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} className={input} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="accent-black" />
              Recurring weekly
            </label>
            {isRecurring && (
              <select value={recurrenceDay} onChange={e => setRecurrenceDay(e.target.value)} className={`${input} w-auto`}>
                <option value="">Day…</option>
                {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Where</p>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] block mb-1">Venue name</label>
            <input value={locationName} onChange={e => setLocationName(e.target.value)} className={input} placeholder="e.g. Berghain, Kotti, someone's rooftop…" />
          </div>
          <div className="relative">
            <label className="text-[10px] text-[var(--text-muted)] block mb-1">Address</label>
            <input
              value={address}
              onChange={e => { setAddress(e.target.value); fetchAddressSuggestions(e.target.value) }}
              onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className={input}
              placeholder="Street and number"
              autoComplete="off"
            />
            {showSuggestions && addressSuggestions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] mt-0.5 max-h-48 overflow-y-auto shadow-[2px_2px_0_var(--border-primary)]">
                {addressSuggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-[var(--bg-secondary)]"
                      onMouseDown={e => {
                        e.preventDefault()
                        setAddress(s.label)
                        setLat(s.lat)
                        setLng(s.lng)
                        if (s.borough && !borough) setBorough(s.borough)
                        setShowSuggestions(false)
                        setAddressSuggestions([])
                      }}
                    >
                      <span>{s.label}</span>
                      {s.source === 'local' && <span className="text-[9px] text-[var(--text-muted)] ml-1">Berlin</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1 block">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value.slice(0, 400))}
            className={`${input} min-h-[80px]`}
            placeholder="What makes this event special? Keep it short and catchy."
          />
          <p className="text-[9px] text-[var(--text-muted)] mt-0.5 text-right">{description.length}/400</p>
        </div>

        {/* Category */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1 block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className={input}>
            <option value="">Select…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Tags */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {TAG_OPTIONS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                className={tags.includes(tag) ? btnActive : btn}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Free + Ticket */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} className="accent-black" />
            Free event
          </label>
          {!isFree && (
            <div className="flex-1">
              <input value={ticketUrl} onChange={e => setTicketUrl(e.target.value)} className={input} placeholder="Ticket link (optional)" />
            </div>
          )}
        </div>

        {/* Photo */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-2">Photo (optional)</p>
          {file ? (
            <div className="relative w-full h-32 border-2 border-[var(--border-primary)] overflow-hidden mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setFile(null)}
                className="absolute top-1 right-1 bg-black text-white text-[10px] w-5 h-5 flex items-center justify-center"
              >X</button>
            </div>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
                + Add photo
              </button>
            </>
          )}
        </div>

        {/* Submitter name */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1 block">Your name (shown publicly)</label>
          <input value={submitterName} onChange={e => setSubmitterName(e.target.value)} className={input} placeholder="@your_handle or name" />
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !title.trim() || !dateStart}
          className="w-full text-sm font-bold border-2 border-[var(--border-primary)] py-2.5 bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit Event'}
        </button>
      </form>
    </main>
  )
}
