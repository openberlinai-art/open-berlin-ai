const CACHE_NAME = 'citizen-berlin-v1'
const STATIC_ASSETS = ['/', '/manifest.json']

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch strategies
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip auth-dependent routes
  if (url.pathname.startsWith('/api/auth') ||
      url.pathname.startsWith('/api/attendance') ||
      url.pathname.startsWith('/api/lists') ||
      url.pathname.startsWith('/api/notifications') ||
      url.pathname.startsWith('/api/push') ||
      url.pathname.startsWith('/api/reviews') && event.request.method === 'POST') {
    return
  }

  // API responses: stale-while-revalidate
  if (url.pathname.startsWith('/api/events') ||
      url.pathname.startsWith('/api/locations') ||
      url.pathname.startsWith('/api/pois') ||
      url.pathname.startsWith('/api/weather') ||
      url.pathname.startsWith('/api/trending') ||
      url.pathname.startsWith('/api/nearby') ||
      url.pathname.startsWith('/api/search')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request)
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) {
            cache.put(event.request, response.clone())
          }
          return response
        }).catch(() => cached)

        return cached || fetchPromise
      })
    )
    return
  }

  // Map tiles: cache-first
  if (url.hostname.includes('tiles.openfreemap.org') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request)
        if (cached) return cached
        const response = await fetch(event.request)
        if (response.ok) cache.put(event.request, response.clone())
        return response
      })
    )
    return
  }

  // Static assets (CSS, JS, fonts): cache-first
  if (url.pathname.match(/\.(js|css|woff2?|ttf|png|svg|ico|json)$/) ||
      url.pathname === '/') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request)
        if (cached) return cached
        const response = await fetch(event.request)
        if (response.ok) cache.put(event.request, response.clone())
        return response
      })
    )
    return
  }
})

// Push notification handler
self.addEventListener('push', event => {
  let data = { title: 'Citizen.Berlin', body: 'You have a notification' }
  try {
    data = event.data.json()
  } catch { /* use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data.data || {},
    })
  )
})

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url)
    })
  )
})
