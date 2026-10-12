import { useCallback, useEffect, useRef, useState } from 'react'

export default function useTotpToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const closeToast = useCallback(() => {
    window.clearTimeout(timerRef.current)
    setToast(null)
  }, [])

  const showToast = useCallback((message, type = 'success') => {
    window.clearTimeout(timerRef.current)
    setToast({ id: Date.now(), message, type })
    timerRef.current = window.setTimeout(() => setToast(null), type === 'error' ? 5000 : 3000)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return { toast, showToast, closeToast }
}
