'use client'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/providers/UserProvider'

export function usePushSubscription() {
  const { token } = useUser()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setIsSubscribed(!!sub)
      })
    })
  }, [])

  const subscribe = useCallback(async () => {
    if (!token || !('serviceWorker' in navigator)) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      // Try to get VAPID key from a meta tag or env - for now use a placeholder
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: document.querySelector('meta[name="vapid-key"]')?.getAttribute('content') || undefined,
      })
      const json = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      })
      setIsSubscribed(true)
    } catch (err) {
      console.error('Push subscription failed:', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  const unsubscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      setIsSubscribed(false)
    } catch (err) {
      console.error('Push unsubscribe failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { isSubscribed, loading, subscribe, unsubscribe }
}
