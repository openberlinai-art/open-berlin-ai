'use client'
import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react'

const WORKER = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const TOKEN_KEY = 'kp_token'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface KPUser {
  id:           string
  email:        string
  display_name: string | null
}

export interface KPList {
  id:          string
  user_id:     string
  name:        string
  description: string | null
  is_public:   number
  created_at:  string
  item_count:  number
}

export interface KPListItem {
  id:        string
  list_id:   string
  item_type: 'event' | 'location'
  item_id:   string
  notes:     string | null
  added_at:  string
}

export interface KPNotification {
  id:         string
  user_id:    string
  type:       string
  data:       string  // JSON
  read:       number
  created_at: string
}

interface UserContextValue {
  user:              KPUser | null
  token:             string | null
  lists:             KPList[]
  notifications:     KPNotification[]
  unreadCount:       number
  login:             (email: string) => Promise<{ dev_link?: string }>
  logout:            () => void
  refreshLists:      () => Promise<void>
  refreshNotifications: () => Promise<void>
  createList:        (name: string, description: string, isPublic: boolean) => Promise<KPList>
  deleteList:        (listId: string) => Promise<void>
  addToList:         (listId: string, itemType: 'event' | 'location', itemId: string, notes?: string) => Promise<void>
  removeFromList:    (listId: string, itemId: string) => Promise<void>
  getListItems:      (listId: string) => Promise<KPListItem[]>
  markNotificationRead: (id: string | 'all') => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
  shareList:         (listId: string, email: string) => Promise<{ ok: boolean; error?: string }>
}

const UserContext = createContext<UserContextValue | null>(null)

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function apiFetch(path: string, token: string | null, init?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(`${WORKER}${path}`, { ...init, headers: { ...headers, ...init?.headers } })
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: ReactNode }) {
  const [user,          setUser]          = useState<KPUser | null>(null)
  const [token,         setToken]         = useState<string | null>(null)
  const [lists,         setLists]         = useState<KPList[]>([])
  const [notifications, setNotifications] = useState<KPNotification[]>([])

  // ── Hydrate from localStorage ───────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) return
    // Decode payload without verifying (verification happens on worker side)
    try {
      const parts   = stored.split('.')
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.exp && payload.exp < Date.now() / 1000) {
        localStorage.removeItem(TOKEN_KEY)
        return
      }
      setToken(stored)
      setUser({ id: payload.sub, email: payload.email, display_name: null })
      // Auto-refresh if expiry is within 7 days
      if (payload.exp - Date.now() / 1000 < 7 * 86400) {
        fetch(`${WORKER}/api/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${stored}` },
        })
          .then(r => r.json())
          .then((json: { token?: string }) => {
            if (json.token) {
              localStorage.setItem(TOKEN_KEY, json.token)
              setToken(json.token)
            }
          })
          .catch(() => {})
      }
    } catch { localStorage.removeItem(TOKEN_KEY) }
  }, [])

  const refreshLists = useCallback(async () => {
    const t = token ?? localStorage.getItem(TOKEN_KEY)
    if (!t) return
    try {
      const res = await apiFetch('/api/lists', t)
      if (!res.ok) return
      const json = await res.json() as { data: KPList[] }
      setLists(json.data)
    } catch { /* ignore */ }
  }, [token])

  const refreshNotifications = useCallback(async () => {
    const t = token ?? localStorage.getItem(TOKEN_KEY)
    if (!t) return
    try {
      const res = await apiFetch('/api/notifications', t)
      if (!res.ok) return
      const json = await res.json() as { data: KPNotification[] }
      setNotifications(json.data)
    } catch { /* ignore */ }
  }, [token])

  // Load lists + notifications when token is set
  useEffect(() => {
    if (!token) return
    refreshLists()
    refreshNotifications()
  }, [token, refreshLists, refreshNotifications])

  const login = useCallback(async (email: string): Promise<{ dev_link?: string }> => {
    const res = await apiFetch('/api/auth/magic-link', null, {
      method: 'POST',
      body:   JSON.stringify({ email }),
    })
    if (!res.ok) {
      let message = 'Failed to send magic link'
      try {
        const json = await res.json() as { error?: string }
        message = json.error ?? message
      } catch { /* non-JSON response */ }
      throw new Error(message)
    }
    try {
      const json = await res.json() as { ok: boolean; dev_link?: string }
      return { dev_link: json.dev_link }
    } catch { return {} }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setLists([])
    setNotifications([])
  }, [])

  const createList = useCallback(async (name: string, description: string, isPublic: boolean): Promise<KPList> => {
    const t = token!
    const res = await apiFetch('/api/lists', t, {
      method: 'POST',
      body:   JSON.stringify({ name, description, is_public: isPublic }),
    })
    const json = await res.json() as { data: KPList }
    await refreshLists()
    return json.data
  }, [token, refreshLists])

  const deleteList = useCallback(async (listId: string) => {
    await apiFetch(`/api/lists/${listId}`, token!, { method: 'DELETE' })
    await refreshLists()
  }, [token, refreshLists])

  const addToList = useCallback(async (listId: string, itemType: 'event' | 'location', itemId: string, notes?: string) => {
    await apiFetch(`/api/lists/${listId}/items`, token!, {
      method: 'POST',
      body:   JSON.stringify({ item_type: itemType, item_id: itemId, notes: notes ?? null }),
    })
    await refreshLists()
  }, [token, refreshLists])

  const removeFromList = useCallback(async (listId: string, itemId: string) => {
    await apiFetch(`/api/lists/${listId}/items/${itemId}`, token!, { method: 'DELETE' })
    await refreshLists()
  }, [token, refreshLists])

  const getListItems = useCallback(async (listId: string): Promise<KPListItem[]> => {
    const res = await apiFetch(`/api/lists/${listId}/items`, token!)
    if (!res.ok) return []
    const json = await res.json() as { data: KPListItem[] }
    return json.data
  }, [token])

  const markNotificationRead = useCallback(async (id: string | 'all') => {
    await apiFetch(`/api/notifications/${id}`, token!, { method: 'PATCH' })
    await refreshNotifications()
  }, [token, refreshNotifications])

  const updateDisplayName = useCallback(async (name: string) => {
    await apiFetch('/api/auth/profile', token!, {
      method: 'POST',
      body:   JSON.stringify({ display_name: name }),
    })
    setUser(u => u ? { ...u, display_name: name } : u)
  }, [token])

  const shareList = useCallback(async (listId: string, email: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiFetch(`/api/lists/${listId}/share`, token!, {
      method: 'POST',
      body:   JSON.stringify({ email }),
    })
    return res.json() as Promise<{ ok: boolean; error?: string }>
  }, [token])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <UserContext.Provider value={{
      user, token, lists, notifications, unreadCount,
      login, logout,
      refreshLists, refreshNotifications,
      createList, deleteList,
      addToList, removeFromList, getListItems,
      markNotificationRead,
      updateDisplayName,
      shareList,
    }}>
      {children}
    </UserContext.Provider>
  )
}
