'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface CommunityEvent {
  id: string
  title: string
  description: string | null
  date_start: string
  date_end: string | null
  time_start: string | null
  time_end: string | null
  is_recurring: number
  recurrence_day: string | null
  location_name: string | null
  address: string | null
  borough: string | null
  lat: number | null
  lng: number | null
  category: string | null
  tags: string | null
  is_free: number
  ticket_url: string | null
  image_key: string | null
  submitter_name: string | null
  status: string
  votes_up: number
  votes_down: number
  created_at: string
}

const CATEGORIES = [
  'Music', 'Art', 'Theater', 'Dance', 'Film', 'Exhibitions',
  'Education', 'Talks', 'Sports', 'Kids', 'Recreation', 'Tours', 'Other',
]

function EventCard({
  ev, secret, onModerate, onUpdate,
}: {
  ev: CommunityEvent
  secret: string
  onModerate: (id: string, status: 'approved' | 'rejected') => void
  onUpdate: (id: string, fields: Partial<CommunityEvent>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(ev.title)
  const [description, setDescription] = useState(ev.description ?? '')
  const [dateStart, setDateStart] = useState(ev.date_start)
  const [timeStart, setTimeStart] = useState(ev.time_start ?? '')
  const [timeEnd, setTimeEnd] = useState(ev.time_end ?? '')
  const [locationName, setLocationName] = useState(ev.location_name ?? '')
  const [address, setAddress] = useState(ev.address ?? '')
  const [category, setCategory] = useState(ev.category ?? '')
  const [ticketUrl, setTicketUrl] = useState(ev.ticket_url ?? '')
  const [isFree, setIsFree] = useState(!!ev.is_free)
  const [submitterName, setSubmitterName] = useState(ev.submitter_name ?? '')
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(ev.image_key ? `/api/listings/images/${ev.image_key}` : null)

  const tags: string[] = (() => { try { return ev.tags ? JSON.parse(ev.tags) : [] } catch { return [] } })()

  async function save() {
    setSaving(true)
    try {
      // Use the admin moderate endpoint to update — we need to extend it
      // For now, use the community-events PATCH with a workaround
      // Actually, admin can call the moderate endpoint for status changes
      // and we need a separate admin edit. Let's just call PATCH directly.
      const res = await fetch(`/api/community-events/${ev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          title, description: description || undefined,
          date_start: dateStart, time_start: timeStart || undefined, time_end: timeEnd || undefined,
          location_name: locationName || undefined, address: address || undefined,
          category: category || undefined, ticket_url: ticketUrl || undefined,
          is_free: isFree, submitter_name: submitterName || undefined,
        }),
      })
      if (res.ok) {
        // Upload image if selected
        if (imageFile) {
          const form = new FormData()
          form.append('file', imageFile)
          const imgRes = await fetch(`/api/community-events/${ev.id}/image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}` },
            body: form,
          })
          if (imgRes.ok) {
            const { key } = await imgRes.json() as { key: string }
            onUpdate(ev.id, { ...{ title, description, date_start: dateStart, time_start: timeStart, time_end: timeEnd, location_name: locationName, address, category, ticket_url: ticketUrl, is_free: isFree ? 1 : 0, submitter_name: submitterName }, image_key: key })
            setImagePreview(`/api/listings/images/${key}`)
          }
        } else {
          onUpdate(ev.id, { title, description, date_start: dateStart, time_start: timeStart, time_end: timeEnd, location_name: locationName, address, category, ticket_url: ticketUrl, is_free: isFree ? 1 : 0, submitter_name: submitterName })
        }
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full text-xs border border-[var(--border-secondary)] px-2 py-1 outline-none bg-[var(--bg-primary)] text-[var(--text-primary)]'

  if (editing) {
    return (
      <div className="border-2 border-blue-500 p-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Date</label>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="text-[9px] text-[var(--text-muted)] uppercase">Start</label>
              <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} className={input} />
            </div>
            <div>
              <label className="text-[9px] text-[var(--text-muted)] uppercase">End</label>
              <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} className={input} />
            </div>
          </div>
          <div>
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Venue</label>
            <input value={locationName} onChange={e => setLocationName(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={input}>
              <option value="">Select…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Submitter</label>
            <input value={submitterName} onChange={e => setSubmitterName(e.target.value)} className={input} />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Ticket / Link</label>
            <input value={ticketUrl} onChange={e => setTicketUrl(e.target.value)} className={input} placeholder="https://..." />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${input} min-h-[60px]`} />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] text-[var(--text-muted)] uppercase">Photo</label>
            <div className="flex items-center gap-2 mt-1">
              {(imagePreview || imageFile) && (
                <div className="relative w-20 h-14 border border-[var(--border-secondary)] overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageFile ? URL.createObjectURL(imageFile) : imagePreview!} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null
                  setImageFile(f)
                  if (f) setImagePreview(URL.createObjectURL(f))
                }}
                className="text-[10px] text-[var(--text-secondary)]"
              />
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} /> Free
            </label>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving} className="text-xs font-bold border-2 border-blue-600 text-blue-700 px-3 py-1 hover:bg-blue-600 hover:text-white">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs border border-[var(--border-secondary)] px-3 py-1 text-[var(--text-muted)]">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-2 border-[var(--border-primary)] p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-[var(--text-primary)]">{ev.title}</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {ev.date_start} {ev.time_start ?? ''}{ev.time_end ? `–${ev.time_end}` : ''} | {ev.location_name ?? 'No venue'} | {ev.category ?? 'No category'}
          </p>
          {ev.submitter_name && (
            <p className="text-[10px] text-[var(--text-muted)]">By: {ev.submitter_name}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] text-[var(--text-muted)]">{ev.created_at?.slice(0, 16)}</p>
          {(ev.votes_up > 0 || ev.votes_down > 0) && (
            <p className="text-[9px] text-[var(--text-muted)]">+{ev.votes_up} / -{ev.votes_down}</p>
          )}
        </div>
      </div>

      {ev.description && <p className="text-xs text-[var(--text-secondary)]">{ev.description}</p>}
      {ev.address && <p className="text-[10px] text-[var(--text-muted)] font-mono">{ev.address}</p>}

      {ev.ticket_url && (
        <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-blue-600 hover:underline break-all block">
          {ev.ticket_url}
        </a>
      )}

      {ev.image_key && (
        <div className="border border-[var(--border-secondary)] overflow-hidden max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/listings/images/${ev.image_key}`} alt="" className="w-full h-24 object-cover" />
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map(t => (
            <span key={t} className="text-[9px] border border-[var(--border-secondary)] px-1.5 py-0.5 text-[var(--text-muted)]">{t}</span>
          ))}
        </div>
      )}

      {ev.is_free ? (
        <span className="text-[9px] font-bold text-green-600">FREE</span>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onModerate(ev.id, 'approved')}
          className="text-xs font-bold border-2 border-green-600 text-green-700 px-3 py-1 hover:bg-green-600 hover:text-white"
        >
          Approve
        </button>
        <button
          onClick={() => onModerate(ev.id, 'rejected')}
          className="text-xs font-bold border-2 border-red-600 text-red-700 px-3 py-1 hover:bg-red-600 hover:text-white"
        >
          Reject
        </button>
        <button
          onClick={() => setEditing(true)}
          className="text-xs border-2 border-[var(--border-primary)] px-3 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
        >
          Edit
        </button>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [loading, setLoading] = useState(false)

  async function login() {
    setLoading(true)
    try {
      const res = await fetch('/api/community-events/pending', {
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (!res.ok) throw new Error('Unauthorized')
      const data = await res.json() as { data: CommunityEvent[] }
      setEvents(data.data)
      setAuthed(true)
    } catch {
      alert('Invalid secret')
    } finally {
      setLoading(false)
    }
  }

  const moderate = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    await fetch(`/api/community-events/${id}/moderate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ status }),
    })
    setEvents(prev => prev.filter(e => e.id !== id))
  }, [secret])

  const updateEvent = useCallback((id: string, fields: Partial<CommunityEvent>) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...fields } : e))
  }, [])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('admin_secret') : null
    if (saved) setSecret(saved)
  }, [])

  if (!authed) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] font-sans">
        <div className="border-b-2 border-[var(--border-primary)] px-4 py-3">
          <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]">
            ← Back
          </Link>
        </div>
        <div className="max-w-sm mx-auto px-4 py-16 space-y-4">
          <p className="text-sm font-bold text-[var(--text-primary)]">Admin Login</p>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="INGEST_SECRET"
            className="w-full text-xs border-2 border-[var(--border-primary)] px-2.5 py-1.5 outline-none"
          />
          <button
            onClick={() => { localStorage.setItem('admin_secret', secret); login() }}
            disabled={loading}
            className="w-full text-xs font-bold border-2 border-[var(--border-primary)] py-2 bg-[var(--accent)] text-[var(--accent-text)]"
          >
            {loading ? 'Loading…' : 'Login'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] font-sans">
      <div className="border-b-2 border-[var(--border-primary)] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-xs font-bold border-2 border-[var(--border-primary)] px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--accent-text)]">
          ← Back
        </Link>
        <span className="text-xs text-[var(--text-muted)]">Admin — Pending Events ({events.length})</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {events.length === 0 && (
          <p className="text-sm text-[var(--text-muted)] text-center py-8">No pending events</p>
        )}
        {events.map(ev => (
          <EventCard key={ev.id} ev={ev} secret={secret} onModerate={moderate} onUpdate={updateEvent} />
        ))}
      </div>
    </main>
  )
}
