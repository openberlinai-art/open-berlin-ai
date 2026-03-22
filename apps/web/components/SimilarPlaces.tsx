'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getPOILabel } from '@/lib/poi-config'

interface SimilarPOI {
  id: string
  name: string | null
  category_group: string
  category: string
  region: string
  address: string | null
  lat: number
  lng: number
}

interface Props {
  query: string
  excludeId: string
  categoryGroup?: string
}

export default function SimilarPlaces({ query, excludeId, categoryGroup }: Props) {
  const [places, setPlaces] = useState<SimilarPOI[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query || query.length < 3) { setLoading(false); return }
    const params = new URLSearchParams({ q: query, limit: '6' })
    if (categoryGroup) params.set('category_group', categoryGroup)

    fetch(`/api/search/semantic?${params}`)
      .then(r => r.json())
      .then((data: { results: SimilarPOI[] }) => {
        const filtered = (data.results ?? []).filter(p => p.id !== excludeId)
        setPlaces(filtered.slice(0, 5))
      })
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false))
  }, [query, excludeId, categoryGroup])

  if (loading || places.length === 0) return null

  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Similar places</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {places.map(p => (
          <Link
            key={p.id}
            href={`/pois/${p.id.replace('/', '_')}`}
            className="block border-2 border-black p-2.5 hover:bg-gray-50 transition-colors"
          >
            <p className="text-xs font-bold text-gray-900 leading-snug truncate">
              {p.name ?? 'Unnamed'}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {getPOILabel(p.category_group, p.category)}
              {p.region ? ` · ${p.region}` : ''}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
