'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CommunityEvent {
  id: string
  title: string
  description: string | null
  date_start: string
  time_start: string | null
  location_name: string | null
  address: string | null
  category: string | null
  tags: string | null
  is_free: number
  submitter_name: string | null
  status: string
  created_at: string
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

  async function moderate(id: string, status: 'approved' | 'rejected') {
    await fetch(`/api/community-events/${id}/moderate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ status }),
    })
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('admin_secret') : null
    if (saved) { setSecret(saved); }
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
        {events.map(ev => {
          const tags: string[] = (() => { try { return ev.tags ? JSON.parse(ev.tags) : [] } catch { return [] } })()
          return (
            <div key={ev.id} className="border-2 border-[var(--border-primary)] p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-[var(--text-primary)]">{ev.title}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {ev.date_start} {ev.time_start ?? ''} | {ev.location_name ?? 'No venue'} | {ev.category ?? 'No category'}
                  </p>
                  {ev.submitter_name && (
                    <p className="text-[10px] text-[var(--text-muted)]">By: {ev.submitter_name}</p>
                  )}
                </div>
                <p className="text-[9px] text-[var(--text-muted)] shrink-0">{ev.created_at}</p>
              </div>
              {ev.description && <p className="text-xs text-[var(--text-secondary)]">{ev.description}</p>}
              {ev.address && <p className="text-[10px] text-[var(--text-muted)] font-mono">{ev.address}</p>}
              {tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {tags.map(t => (
                    <span key={t} className="text-[9px] border border-[var(--border-secondary)] px-1.5 py-0.5 text-[var(--text-muted)]">{t}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => moderate(ev.id, 'approved')}
                  className="text-xs font-bold border-2 border-green-600 text-green-700 px-3 py-1 hover:bg-green-600 hover:text-white"
                >
                  Approve
                </button>
                <button
                  onClick={() => moderate(ev.id, 'rejected')}
                  className="text-xs font-bold border-2 border-red-600 text-red-700 px-3 py-1 hover:bg-red-600 hover:text-white"
                >
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
