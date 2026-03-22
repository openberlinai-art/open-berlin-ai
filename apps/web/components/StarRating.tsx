'use client'
import { useState } from 'react'
import { Star } from 'lucide-react'

interface Props {
  value: number
  onChange?: (v: number) => void
  size?: number
  readOnly?: boolean
}

export default function StarRating({ value, onChange, size = 16, readOnly = false }: Props) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHover(star)}
          onMouseLeave={() => !readOnly && setHover(0)}
          className={`${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
        >
          <Star
            size={size}
            className={
              (hover || value) >= star
                ? 'fill-[var(--accent)] text-[var(--accent)]'
                : 'text-[var(--border-secondary)]'
            }
          />
        </button>
      ))}
    </div>
  )
}
