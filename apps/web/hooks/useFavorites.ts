'use client'
import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'citizen-favorites'

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

function saveFavorites(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch { /* ignore */ }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites())

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setFavorites(loadFavorites())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((type: string, id: string) => {
    setFavorites(prev => {
      const key = `${type}:${id}`
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveFavorites(next)
      return next
    })
  }, [])

  const isFavorite = useCallback((type: string, id: string) => {
    return favorites.has(`${type}:${id}`)
  }, [favorites])

  const getAll = useCallback(() => {
    return [...favorites].map(key => {
      const idx = key.indexOf(':')
      return { type: key.slice(0, idx), id: key.slice(idx + 1) }
    })
  }, [favorites])

  return { favorites, toggle, isFavorite, getAll, count: favorites.size }
}
