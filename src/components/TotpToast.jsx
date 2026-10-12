export default function TotpToast({ toast, onClose }) {
  if (!toast) return null

  const isError = toast.type === 'error'
  return (
    <div className="totp-toast-region" aria-live={isError ? 'assertive' : 'polite'} aria-atomic="true">
      <div className={`totp-toast ${isError ? 'error' : 'success'}`} role={isError ? 'alert' : 'status'}>
        <span className="totp-toast-icon" aria-hidden="true">{isError ? '!' : '✓'}</span>
        <p>{toast.message}</p>
        <button type="button" className="totp-toast-close" onClick={onClose} aria-label="Tutup notifikasi">×</button>
      </div>
    </div>
  )
}
