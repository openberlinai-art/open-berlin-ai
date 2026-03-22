'use client'
import { useCallback } from 'react'

export interface MapURLState {
  lat?: number
  lng?: number
  zoom?: number
  mode?: 'events' | 'venues' | 'listings'
  filters?: string
  query?: string
}

export function readFromURL(): MapURLState {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.search)
  const state: MapURLState = {}
  if (p.has('lat')) state.lat = parseFloat(p.get('lat')!)
  if (p.has('lng')) state.lng = parseFloat(p.get('lng')!)
  if (p.has('z'))   state.zoom = parseFloat(p.get('z')!)
  if (p.has('mode')) state.mode = p.get('mode') as MapURLState['mode']
  if (p.has('filters')) state.filters = p.get('filters')!
  if (p.has('q'))   state.query = p.get('q')!
  return state
}

export function syncToURL(state: MapURLState, usePush = false) {
  if (typeof window === 'undefined') return
  const p = new URLSearchParams(window.location.search)
  if (state.lat != null)  p.set('lat', state.lat.toFixed(4))
  else p.delete('lat')
  if (state.lng != null)  p.set('lng', state.lng.toFixed(4))
  else p.delete('lng')
  if (state.zoom != null) p.set('z', state.zoom.toFixed(1))
  else p.delete('z')
  if (state.mode && state.mode !== 'events') p.set('mode', state.mode)
  else p.delete('mode')
  if (state.filters) p.set('filters', state.filters)
  else p.delete('filters')
  if (state.query)  p.set('q', state.query)
  else p.delete('q')

  const qs = p.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  if (usePush) {
    window.history.pushState(null, '', url)
  } else {
    window.history.replaceState(null, '', url)
  }
}

export function filtersToString(filters: Set<string>): string {
  return [...filters].sort().join(',')
}

export function filtersFromString(s: string): Set<string> {
  if (!s) return new Set()
  return new Set(s.split(',').filter(Boolean))
}

export function useShareURL() {
  return useCallback(() => {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
  }, [])
}
