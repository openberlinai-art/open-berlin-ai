'use client'
import { useEffect } from 'react'

export default function ViewTracker({ itemType, itemId }: { itemType: string; itemId: string }) {
  useEffect(() => {
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_type: itemType, item_id: itemId }),
      keepalive: true,
    }).catch(() => {})
  }, [itemType, itemId])

  return null
}
