import { supabase } from '../supabase'

const FIREBASE_SDK_VERSION = '10.13.2'
const INSTALL_EVENT_NAME = 'greenroom:pwa-install-state'
const PUSH_EVENT_NAME = 'greenroom:push-message'

let deferredInstallPrompt = null
let serviceWorkerPromise = null
let messagingPromise = null
let foregroundListenerAttached = false

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function emitInstallState() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(INSTALL_EVENT_NAME, {
    detail: getPwaInstallState()
  }))
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstallPrompt = event
    emitInstallState()
  })

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    emitInstallState()
  })
}

function ensureHeadLink(rel, href, attributes = {}) {
  if (typeof document === 'undefined') return
  let element = document.querySelector(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  element.href = href
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
}

function ensureMeta(name, content) {
  if (typeof document === 'undefined') return
  let element = document.querySelector(`meta[name="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.name = name
    document.head.appendChild(element)
  }
  element.content = content
}

export function getPwaInstallState() {
  return {
    installed: isStandaloneMode(),
    installable: Boolean(deferredInstallPrompt) && !isStandaloneMode()
  }
}

export function subscribePwaInstallState(listener) {
  if (typeof window === 'undefined') return () => {}
  const handler = (event) => listener(event.detail || getPwaInstallState())
  window.addEventListener(INSTALL_EVENT_NAME, handler)
  listener(getPwaInstallState())
  return () => window.removeEventListener(INSTALL_EVENT_NAME, handler)
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) {
    return { outcome: isStandaloneMode() ? 'installed' : 'unavailable' }
  }

  const prompt = deferredInstallPrompt
  deferredInstallPrompt = null
  await prompt.prompt()
  const choice = await prompt.userChoice
  emitInstallState()
  return choice
}

export async function registerGreenroomPwa() {
  if (typeof window === 'undefined') return null

  ensureHeadLink('manifest', '/manifest.webmanifest')
  ensureHeadLink('apple-touch-icon', '/icons/greenroomid-192.png')
  ensureMeta('theme-color', '#07110d')
  ensureMeta('mobile-web-app-capable', 'yes')
  ensureMeta('apple-mobile-web-app-capable', 'yes')
  ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
  ensureMeta('apple-mobile-web-app-title', 'GreenroomID')

  if (!('serviceWorker' in navigator)) return null
  if (!serviceWorkerPromise) {
    serviceWorkerPromise = navigator.serviceWorker
      .register('/firebase-messaging-sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => {
        serviceWorkerPromise = null
        throw error
      })
  }
  return serviceWorkerPromise
}

function loadScript(src, id) {
  if (typeof document === 'undefined') return Promise.reject(new Error('Browser tidak tersedia'))
  const existing = document.getElementById(id)
  if (existing?.dataset.loaded === 'true') return Promise.resolve()
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error(`Gagal memuat ${src}`))
    document.head.appendChild(script)
  })
}

async function loadFirebaseConfig() {
  if (typeof window === 'undefined') return null
  if (!window.GREENROOM_FIREBASE_CONFIG) {
    await loadScript('/firebase-config.js', 'greenroom-firebase-config')
  }
  return window.GREENROOM_FIREBASE_CONFIG || null
}

function isFirebaseConfigReady(config) {
  return Boolean(
    config?.apiKey &&
    config?.projectId &&
    config?.messagingSenderId &&
    config?.appId &&
    config?.vapidKey
  )
}

async function getMessagingInstance() {
  if (messagingPromise) return messagingPromise

  messagingPromise = (async () => {
    const config = await loadFirebaseConfig()
    if (!isFirebaseConfigReady(config)) {
      throw new Error('Firebase belum dikonfigurasi. Isi public/firebase-config.js terlebih dahulu.')
    }

    await loadScript(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`,
      'greenroom-firebase-app'
    )
    await loadScript(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`,
      'greenroom-firebase-messaging'
    )

    if (!window.firebase) throw new Error('Firebase SDK gagal dimuat.')
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
        measurementId: config.measurementId || undefined
      })
    }

    const messaging = window.firebase.messaging()
    if (!foregroundListenerAttached) {
      messaging.onMessage((payload) => {
        window.dispatchEvent(new CustomEvent(PUSH_EVENT_NAME, { detail: payload }))
      })
      foregroundListenerAttached = true
    }

    return { messaging, config }
  })().catch((error) => {
    messagingPromise = null
    throw error
  })

  return messagingPromise
}

function detectPlatform() {
  const userAgent = navigator.userAgent || ''
  const uaPlatform =
    navigator.userAgentData?.platform?.toLowerCase() || ''

  const isAndroid =
    uaPlatform === 'android' ||
    /Android/i.test(userAgent)

  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent)

  if (isAndroid) return 'android-web'
  if (isIOS) return 'ios-web'

  return 'web'
}

function detectDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Browser'
  const browser = navigator.userAgentData?.brands?.[0]?.brand || 'Web App'
  return `${browser} · ${platform}`.slice(0, 120)
}

export function subscribeForegroundPush(listener) {
  if (typeof window === 'undefined') return () => {}
  const handler = (event) => listener(event.detail)
  window.addEventListener(PUSH_EVENT_NAME, handler)
  return () => window.removeEventListener(PUSH_EVENT_NAME, handler)
}

export async function getPushStatus(userId) {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator)
  ) {
    return {
      status: 'unsupported',
      enabled: false,
    }
  }

  let configured

  try {
    configured = isFirebaseConfigReady(await loadFirebaseConfig())
  } catch {
    configured = false
  }

  if (!configured) {
    return {
      status: 'unconfigured',
      enabled: false,
    }
  }

  if (Notification.permission === 'denied') {
    return {
      status: 'denied',
      enabled: false,
    }
  }

  if (!userId || Notification.permission !== 'granted') {
    return {
      status: 'available',
      enabled: false,
    }
  }

  try {
    const registration = await registerGreenroomPwa()
    const { messaging, config } = await getMessagingInstance()

    const currentToken = await messaging.getToken({
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    })

    if (!currentToken) {
      return {
        status: 'available',
        enabled: false,
      }
    }

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, enabled, platform, device_name')
      .eq('user_id', userId)
      .eq('fcm_token', currentToken)
      .maybeSingle()

    if (error) {
      return {
        status: 'database-not-ready',
        enabled: false,
        error,
      }
    }

    return {
      status: data?.enabled ? 'enabled' : 'available',
      enabled: Boolean(data?.enabled),
      subscription: data || null,
    }
  } catch (error) {
    return {
      status: 'available',
      enabled: false,
      error,
    }
  }
}

export async function enablePushNotifications(userId) {
  if (!userId) throw new Error('Sesi pengguna tidak ditemukan.')
  if (!window.isSecureContext) throw new Error('Push notification membutuhkan HTTPS atau localhost.')
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Browser ini belum mendukung push notification.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Izin notifikasi ditolak. Aktifkan kembali melalui pengaturan browser.'
      : 'Izin notifikasi belum diberikan.')
  }

  const registration = await registerGreenroomPwa()
  const { messaging, config } = await getMessagingInstance()
  const token = await messaging.getToken({
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration
  })

  if (!token) throw new Error('Firebase tidak mengembalikan token perangkat.')

  const { error } = await supabase.rpc('register_push_subscription', {
    p_fcm_token: token,
    p_platform: detectPlatform(),
    p_device_name: detectDeviceName()
  })
  if (error) throw new Error(error.message)

  return { token }
}

export async function disablePushNotifications() {
  const registration = await registerGreenroomPwa()
  const { messaging, config } = await getMessagingInstance()
  const token = await messaging.getToken({
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration
  }).catch(() => null)

  if (token) {
    const { error } = await supabase.rpc('disable_push_subscription', {
      p_fcm_token: token
    })
    if (error) throw new Error(error.message)
    await messaging.deleteToken().catch(() => false)
  } else {
    const { error } = await supabase.rpc('disable_all_push_subscriptions')
    if (error) throw new Error(error.message)
  }
}
