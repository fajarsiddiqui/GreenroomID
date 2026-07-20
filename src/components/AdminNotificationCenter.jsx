import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
  promptPwaInstall,
  registerGreenroomPwa,
  subscribeForegroundPush,
  subscribePwaInstallState
} from '../utils/pwaNotifications'
import '../styles/notification-center.css'

const preferenceOptions = [
  { value: 'important', label: 'Hanya aktivitas penting' },
  { value: 'operational', label: 'Penting dan operasional' },
  { value: 'all', label: 'Semua aktivitas' },
  { value: 'off', label: 'Push dinonaktifkan' }
]

function NotificationIcon({ name, size = 18 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }

  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    install: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="M6 6l12 12M18 6 6 18" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
    warning: <><path d="M12 3 2.5 20h19z" /><path d="M12 9v4M12 17h.01" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>
  }

  return <svg {...props}>{paths[name] || paths.bell}</svg>
}

function relativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const difference = Date.now() - date.getTime()
  if (Number.isNaN(difference)) return ''
  const minutes = Math.floor(difference / 60000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} hari lalu`
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function priorityLabel(priority) {
  if (priority === 'critical') return 'Kritis'
  if (priority === 'important') return 'Penting'
  if (priority === 'operational') return 'Operasional'
  return 'Informasi'
}

function AdminNotificationCenter({ user }) {
  const navigate = useNavigate()
  const userId = user?.id
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [pushState, setPushState] = useState({ status: 'loading', enabled: false })
  const [pushBusy, setPushBusy] = useState(false)
  const [preferenceMode, setPreferenceMode] = useState('important')
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [installState, setInstallState] = useState({ installed: false, installable: false })
  const [toast, setToast] = useState(null)

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  )

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, priority, title, body, target_route, metadata, read_at, created_at')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60)

    if (error) {
      setErrorMessage(error.code === '42P01'
        ? 'Notification Center belum diaktifkan. Jalankan SQL foundation di Supabase.'
        : error.message)
      setNotifications([])
    } else {
      setErrorMessage('')
      setNotifications(data || [])
    }
    setLoading(false)
  }, [userId])

  const fetchPreference = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notification_preferences')
      .select('notification_mode')
      .eq('user_id', userId)
      .maybeSingle()
    if (data?.notification_mode) setPreferenceMode(data.notification_mode)
  }, [userId])

  const refreshPushState = useCallback(async () => {
    const state = await getPushStatus(userId)
    setPushState(state)
  }, [userId])

  useEffect(() => {
    registerGreenroomPwa().catch((error) => console.warn('PWA registration:', error.message))
    const unsubscribeInstall = subscribePwaInstallState(setInstallState)
    return unsubscribeInstall
  }, [])

  useEffect(() => {
    fetchNotifications()
    fetchPreference()
    refreshPushState()
  }, [fetchNotifications, fetchPreference, refreshPushState])

  useEffect(() => {
    if (!userId) return undefined
    const channel = supabase
      .channel(`greenroom-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`
        },
        (payload) => {
          setNotifications((current) => [payload.new, ...current.filter((item) => item.id !== payload.new.id)].slice(0, 60))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => subscribeForegroundPush((payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'Aktivitas baru'
    const body = payload?.notification?.body || payload?.data?.body || 'Ada pembaruan di GreenroomID.'
    setToast({ title, body })
    fetchNotifications()
    window.setTimeout(() => setToast(null), 5000)
  }), [fetchNotifications])

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const markRead = async (notification) => {
    if (!notification.read_at) {
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
      await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id)
    }
  }

  const openNotification = async (notification) => {
    await markRead(notification)
    setOpen(false)
    navigate(notification.target_route || '/admin/audit-logs')
  }

  const markAllRead = async () => {
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })))
    const { error } = await supabase.rpc('mark_all_notifications_read')
    if (error) fetchNotifications()
  }

  const handleInstall = async () => {
    await promptPwaInstall()
  }

  const handlePushToggle = async () => {
    setPushBusy(true)
    setErrorMessage('')
    try {
      if (pushState.enabled) {
        await disablePushNotifications()
      } else {
        await enablePushNotifications(userId)
      }
      await refreshPushState()
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setPushBusy(false)
    }
  }

  const sendTestNotification = async () => {
    setTestBusy(true)
    setErrorMessage('')
    const { error } = await supabase.rpc('create_test_push_notification')
    if (error) setErrorMessage(error.message)
    else setToast({ title: 'Tes dibuat', body: 'Tunggu beberapa detik untuk push notification di perangkat.' })
    setTestBusy(false)
  }

  const savePreference = async (value) => {
    if (!userId) return
    setPreferenceMode(value)
    setPreferenceBusy(true)
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        notification_mode: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
    if (error) setErrorMessage(error.message)
    setPreferenceBusy(false)
  }

  const pushCopy = useMemo(() => {
    if (pushState.status === 'enabled') return 'Push aktif di perangkat ini'
    if (pushState.status === 'unconfigured') return 'Firebase belum dikonfigurasi'
    if (pushState.status === 'denied') return 'Izin notifikasi diblokir browser'
    if (pushState.status === 'unsupported') return 'Browser tidak mendukung push'
    if (pushState.status === 'database-not-ready') return 'Jalankan SQL Notification Center'
    return 'Push belum diaktifkan'
  }, [pushState.status])

  return (
    <div className="greenroom-notification-root" ref={rootRef}>
      {installState.installable && (
        <button
          type="button"
          className="greenroom-install-button"
          onClick={handleInstall}
          title="Pasang GreenroomID di perangkat"
        >
          <NotificationIcon name="install" size={17} />
          <span>Pasang App</span>
        </button>
      )}

      <button
        type="button"
        className={`greenroom-notification-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`}
        aria-expanded={open}
      >
        <NotificationIcon name="bell" size={19} />
        {unreadCount > 0 && <span className="greenroom-notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <section className="greenroom-notification-panel" aria-label="Notification Center">
          <div className="greenroom-notification-head">
            <div>
              <span className="greenroom-notification-eyebrow">GreenroomID</span>
              <h2>Notification Center</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup notifikasi">
              <NotificationIcon name="close" size={18} />
            </button>
          </div>

          <div className="greenroom-notification-status-grid">
            <div className="greenroom-notification-status-card">
              <span className={`greenroom-notification-status-icon${pushState.enabled ? ' is-success' : ''}`}>
                <NotificationIcon name="phone" size={17} />
              </span>
              <div>
                <strong>{pushCopy}</strong>
                <small>Android Chrome · PWA</small>
              </div>
              {!['unconfigured', 'unsupported', 'database-not-ready'].includes(pushState.status) && (
                <button type="button" onClick={handlePushToggle} disabled={pushBusy}>
                  {pushBusy ? 'Memproses…' : pushState.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              )}
            </div>

            <div className="greenroom-notification-status-foot">
              {installState.installed && (
                <div className="greenroom-notification-installed">
                  <NotificationIcon name="check" size={15} /> Aplikasi sudah terpasang
                </div>
              )}
              {pushState.enabled && (
                <button type="button" className="greenroom-notification-test-button" onClick={sendTestNotification} disabled={testBusy}>
                  {testBusy ? 'Mengirim tes…' : 'Kirim notifikasi tes'}
                </button>
              )}
            </div>
          </div>

          <div className="greenroom-notification-preference">
            <div>
              <NotificationIcon name="settings" size={17} />
              <span>
                <strong>Mode push</strong>
                <small>Semua aktivitas tetap tersimpan di inbox.</small>
              </span>
            </div>
            <select
              value={preferenceMode}
              onChange={(event) => savePreference(event.target.value)}
              disabled={preferenceBusy}
              aria-label="Mode push notification"
            >
              {preferenceOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="greenroom-notification-list-head">
            <div>
              <strong>Aktivitas terbaru</strong>
              <span>{unreadCount} belum dibaca</span>
            </div>
            <div>
              <button type="button" onClick={fetchNotifications} title="Muat ulang">
                <NotificationIcon name="refresh" size={16} />
              </button>
              {unreadCount > 0 && <button type="button" onClick={markAllRead}>Tandai semua dibaca</button>}
            </div>
          </div>

          {errorMessage && (
            <div className="greenroom-notification-error">
              <NotificationIcon name="warning" size={17} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="greenroom-notification-list">
            {loading && <div className="greenroom-notification-empty">Memuat aktivitas…</div>}
            {!loading && !errorMessage && notifications.length === 0 && (
              <div className="greenroom-notification-empty">
                <NotificationIcon name="bell" size={24} />
                <strong>Belum ada notifikasi</strong>
                <span>Aktivitas penting akan muncul di sini.</span>
              </div>
            )}
            {!loading && notifications.map((notification) => (
              <button
                type="button"
                className={`greenroom-notification-item${notification.read_at ? '' : ' is-unread'}`}
                key={notification.id}
                onClick={() => openNotification(notification)}
              >
                <span className={`greenroom-notification-priority is-${notification.priority || 'info'}`} />
                <span className="greenroom-notification-item-copy">
                  <span className="greenroom-notification-item-meta">
                    <em>{priorityLabel(notification.priority)}</em>
                    <time>{relativeTime(notification.created_at)}</time>
                  </span>
                  <strong>{notification.title}</strong>
                  {notification.body && <small>{notification.body}</small>}
                </span>
                <NotificationIcon name="arrow" size={16} />
              </button>
            ))}
          </div>

          <button type="button" className="greenroom-notification-all-link" onClick={() => {
            setOpen(false)
            navigate('/admin/audit-logs')
          }}>
            Buka seluruh log aktivitas <NotificationIcon name="arrow" size={16} />
          </button>
        </section>
      )}

      {toast && (
        <div className="greenroom-notification-toast" role="status">
          <span><NotificationIcon name="bell" size={18} /></span>
          <div><strong>{toast.title}</strong><small>{toast.body}</small></div>
          <button type="button" onClick={() => setToast(null)} aria-label="Tutup"><NotificationIcon name="close" size={15} /></button>
        </div>
      )}
    </div>
  )
}

export default AdminNotificationCenter
