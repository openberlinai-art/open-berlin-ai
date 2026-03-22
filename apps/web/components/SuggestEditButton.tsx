'use client'
import { useState } from 'react'
import { useUser } from '@/providers/UserProvider'

interface Props {
  venueId?: string
  osmId?: string
  poiId?: string
  categoryGroup?: string
  category?: string
  name?: string
  lat?: number
  lng?: number
  onAuthRequired?: () => void
}

const SUGGESTION_TYPES = [
  { value: 'edit_name',      label: 'Fix name' },
  { value: 'edit_address',   label: 'Fix address' },
  { value: 'edit_hours',     label: 'Fix hours' },
  { value: 'report_closed',  label: 'Report closed' },
  { value: 'add_place',      label: 'Add new place' },
  { value: 'other',          label: 'Other' },
] as const

export default function SuggestEditButton({
  venueId, osmId, poiId, categoryGroup, category, name, lat, lng, onAuthRequired,
}: Props) {
  const { user, token } = useUser()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<string>('other')
  const [comment, setComment] = useState('')
  const [fields, setFields] = useState({ name: name ?? '', address: '', opening_hours: '', website: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function handleOpen() {
    if (!user) {
      onAuthRequired?.()
      return
    }
    setOpen(true)
  }

  async function handleSubmit() {
    if (!token) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          suggestion_type: type,
          osm_id: osmId ?? undefined,
          poi_id: poiId ?? venueId ?? undefined,
          category_group: categoryGroup ?? undefined,
          category: category ?? undefined,
          data: { ...fields, lat, lng, comment },
        }),
      })
      if (res.ok) {
        setSubmitted(true)
        setTimeout(() => { setOpen(false); setSubmitted(false) }, 2000)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <span className="text-[10px] text-green-600 font-bold">
        Suggestion submitted
      </span>
    )
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-[10px] text-gray-400 hover:text-[var(--text-primary)] underline"
      >
        Suggest edit
      </button>
      {open && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="bg-[var(--bg-primary)] border-2 border-[var(--border-primary)] shadow-[4px_4px_0_var(--border-primary)] p-4 w-[340px] max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold mb-2">Suggest an edit</h3>
            {name && <p className="text-xs text-gray-500 mb-3">{name}</p>}
            <label className="block text-[11px] font-bold mb-1">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full text-xs border-2 border-[var(--border-primary)] px-2 py-1 mb-2 bg-[var(--bg-primary)]"
            >
              {SUGGESTION_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {(type === 'edit_name' || type === 'add_place') && (
              <>
                <label className="block text-[11px] font-bold mb-1">Name</label>
                <input
                  value={fields.name}
                  onChange={e => setFields(f => ({ ...f, name: e.target.value }))}
                  className="w-full text-xs border-2 border-[var(--border-primary)] px-2 py-1 mb-2"
                />
              </>
            )}
            {(type === 'edit_address' || type === 'add_place') && (
              <>
                <label className="block text-[11px] font-bold mb-1">Address</label>
                <input
                  value={fields.address}
                  onChange={e => setFields(f => ({ ...f, address: e.target.value }))}
                  className="w-full text-xs border-2 border-[var(--border-primary)] px-2 py-1 mb-2"
                />
              </>
            )}
            {(type === 'edit_hours' || type === 'add_place') && (
              <>
                <label className="block text-[11px] font-bold mb-1">Opening hours</label>
                <input
                  value={fields.opening_hours}
                  onChange={e => setFields(f => ({ ...f, opening_hours: e.target.value }))}
                  placeholder="e.g. Mo-Fr 09:00-18:00"
                  className="w-full text-xs border-2 border-[var(--border-primary)] px-2 py-1 mb-2"
                />
              </>
            )}
            <label className="block text-[11px] font-bold mb-1">Comment</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              placeholder="Any additional details…"
              className="w-full text-xs border-2 border-[var(--border-primary)] px-2 py-1 mb-3 resize-none"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="text-xs border-2 border-[var(--border-primary)] px-3 py-1 hover:bg-[var(--bg-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="text-xs border-2 border-[var(--border-primary)] px-3 py-1 bg-[var(--accent)] text-[var(--accent-text)] hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
