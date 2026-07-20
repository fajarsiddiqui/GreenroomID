/* global firebase */
const CACHE_NAME = 'greenroomid-pwa-v3'
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(self.location.hostname)
const APP_SHELL = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/greenroomid-192.png',
  '/icons/greenroomid-512.png',
  '/icons/greenroomid-maskable-512.png'
]

self.importScripts('/firebase-config.js')

const firebaseConfig = self.GREENROOM_FIREBASE_CONFIG || {}
const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
)

if (firebaseReady) {
  try {
    self.importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js')
    self.importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js')

    firebase.initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
      measurementId: firebaseConfig.measurementId || undefined
    })

    const messaging = firebase.messaging()
    messaging.onBackgroundMessage((payload) => {
      // Notification + data messages sudah ditampilkan otomatis oleh FCM ketika
      // PWA berada di background/ditutup. Handler manual hanya dipakai sebagai
      // fallback untuk pesan data-only lama agar tidak muncul dua kali.
      if (payload?.notification) return undefined

      const data = payload?.data || {}
      const title = data.title || 'Aktivitas baru di GreenroomID'
      const options = {
        body: data.body || 'Buka GreenroomID untuk melihat pembaruan.',
        icon: data.icon || '/icons/greenroomid-192.png',
        badge: data.badge || '/icons/greenroomid-badge-96.png',
        tag: data.tag || data.notification_id || 'greenroomid-activity',
        renotify: true,
        requireInteraction: ['critical', 'important'].includes(data.priority),
        silent: false,
        vibrate: [200, 80, 200],
        data: {
          link: data.link || '/admin/audit-logs',
          notificationId: data.notification_id || null,
          manualGreenroomNotification: true
        }
      }
      return self.registration.showNotification(title, options)
    })
  } catch (error) {
    console.warn('Firebase Messaging belum aktif:', error?.message || error)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (!IS_LOCAL) {
        const cache = await caches.open(CACHE_NAME)
        await Promise.allSettled(
          APP_SHELL.map(async (assetUrl) => {
            const response = await fetch(assetUrl, { cache: 'reload' })
            if (response.ok) await cache.put(assetUrl, response)
          })
        )
      }
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL) return
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => (await caches.match(request)) || caches.match('/offline.html'))
    )
    return
  }

  if (['style', 'script', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      }))
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  // Biarkan Firebase menangani notification message otomatis melalui
  // webpush.fcm_options.link. Handler ini khusus fallback data-only lama.
  if (!event.notification?.data?.manualGreenroomNotification) return

  event.notification.close()
  const targetUrl = new URL(
    event.notification?.data?.link || '/admin/audit-logs',
    self.location.origin
  ).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin))
      if (existing) {
        existing.navigate(targetUrl)
        return existing.focus()
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
