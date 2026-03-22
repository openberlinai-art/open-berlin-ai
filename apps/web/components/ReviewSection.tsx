'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/providers/UserProvider'
import StarRating from './StarRating'
import { Trash2 } from 'lucide-react'

interface Review {
  id: string
  user_id: string
  rating: number
  body: string | null
  display_name: string | null
  email: string
  created_at: string
}

interface ReviewData {
  reviews: Review[]
  aggregate: { avg_rating: number | null; count: number }
}

interface Props {
  itemType: 'location' | 'poi'
  itemId: string
  onNeedAuth?: () => void
}

export default function ReviewSection({ itemType, itemId, onNeedAuth }: Props) {
  const { user, token } = useUser()
  const queryClient = useQueryClient()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const { data } = useQuery({
    queryKey: ['reviews', itemType, itemId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews?item_type=${itemType}&item_id=${itemId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ReviewData>
    },
    staleTime: 60_000,
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) { onNeedAuth?.(); return }
    if (!rating) return
    setSaving(true)
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ item_type: itemType, item_id: itemId, rating, body: body.trim() || undefined }),
      })
      setRating(0)
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['reviews', itemType, itemId] })
    } finally {
      setSaving(false)
    }
  }

  async function deleteReview(reviewId: string) {
    await fetch(`/api/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    queryClient.invalidateQueries({ queryKey: ['reviews', itemType, itemId] })
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-DE', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Reviews</h3>
        {data?.aggregate.count ? (
          <div className="flex items-center gap-1.5">
            <StarRating value={Math.round(data.aggregate.avg_rating ?? 0)} readOnly size={12} />
            <span className="text-[10px] text-[var(--text-secondary)]">
              {data.aggregate.avg_rating} ({data.aggregate.count})
            </span>
          </div>
        ) : null}
      </div>

      {/* Write review form */}
      <form onSubmit={submit} className="border-2 border-[var(--border-primary)] p-3 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-2">
          {user ? 'Write a review' : 'Sign in to review'}
        </p>
        <StarRating value={rating} onChange={setRating} size={20} />
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Share your experience (optional)"
          rows={2}
          className="w-full text-xs border-2 border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] px-2 py-1.5 mt-2 outline-none focus:shadow-[2px_2px_0_var(--border-primary)] resize-none"
        />
        <button
          type="submit"
          disabled={!rating || saving}
          className="mt-2 text-xs font-bold border-2 border-[var(--border-primary)] px-3 py-1 bg-[var(--accent)] text-[var(--accent-text)] disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Submit'}
        </button>
      </form>

      {/* Review list */}
      {data?.reviews.length ? (
        <div className="space-y-3">
          {data.reviews.map(r => (
            <div key={r.id} className="border border-[var(--border-secondary)] p-3">
              <div className="flex items-center gap-2 mb-1">
                <StarRating value={r.rating} readOnly size={12} />
                <span className="text-[10px] font-bold text-[var(--text-primary)]">
                  {r.display_name || r.email.split('@')[0]}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{formatDate(r.created_at)}</span>
                {user?.id === r.user_id && (
                  <button
                    onClick={() => deleteReview(r.id)}
                    className="ml-auto text-[var(--text-muted)] hover:text-red-500"
                    title="Delete review"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
              {r.body && <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{r.body}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--text-muted)]">No reviews yet. Be the first!</p>
      )}
    </div>
  )
}
