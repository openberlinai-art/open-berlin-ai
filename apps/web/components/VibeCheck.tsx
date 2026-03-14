'use client'

import { useState } from 'react'

interface Props {
  id:           string
  name:         string
  category:     string
  borough?:     string
  description?: string
}

export default function VibeCheck({ id, name, category, borough, description }: Props) {
  const [vibe,    setVibe]    = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function check() {
    setLoading(true)
    try {
      const res  = await fetch('/api/vibe-check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, name, category, borough, description }),
      })
      const data = await res.json() as { vibe?: string }
      setVibe(data.vibe ?? null)
    } catch {
      setVibe('Could not load vibe.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2">
      {vibe ? (
        <p className="text-[11px] italic text-gray-600 leading-relaxed border-l-2 border-gray-200 pl-2">
          {vibe}
        </p>
      ) : (
        <button
          onClick={check}
          disabled={loading}
          className="text-[10px] border border-gray-300 px-2 py-0.5 hover:border-black disabled:opacity-50"
        >
          {loading ? '…' : '✦ Vibe Check'}
        </button>
      )}
    </div>
  )
}
