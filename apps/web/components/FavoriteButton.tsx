'use client'
import { Heart } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'

interface Props {
  type: string
  id: string
  size?: number
  className?: string
}

export default function FavoriteButton({ type, id, size = 14, className = '' }: Props) {
  const { toggle, isFavorite } = useFavorites()
  const active = isFavorite(type, id)

  return (
    <button
      onClick={e => {
        e.stopPropagation()
        e.preventDefault()
        toggle(type, id)
      }}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      title={active ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        size={size}
        fill={active ? '#ef4444' : 'none'}
        stroke={active ? '#ef4444' : '#9ca3af'}
        className="hover:scale-110 transition-transform"
      />
    </button>
  )
}
