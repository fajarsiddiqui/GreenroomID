import { useEffect, useMemo, useState } from 'react'
import {
  formatPromptToolDeployCountdown,
  getPromptToolDeployProgress,
} from '../../utils/promptTools'

export default function PromptToolDeployProgress({
  tool,
  compact = false,
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  const progress = useMemo(() => (
    getPromptToolDeployProgress(tool, now)
  ), [now, tool])

  if (!progress.visible) {
    return null
  }

  const countdown = formatPromptToolDeployCountdown(
    progress.remainingMs,
  )

  if (compact) {
    return (
      <div
        className="mt-3 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-800"
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">{progress.label}</span>
          {!progress.complete && (
            <span className="shrink-0 font-mono font-bold">
              {countdown}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-green-800">
        <span className="font-bold">{progress.label}</span>
        {!progress.complete && (
          <span className="font-mono font-bold">{countdown}</span>
        )}
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-green-100"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progress.progressPercent}
        aria-label="Perkiraan progres deployment"
      >
        <div
          className="h-full rounded-full bg-green-600 transition-[width] duration-1000"
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-green-700">
        Progres ini merupakan perkiraan waktu proses, bukan konfirmasi hasil build Vercel.
      </p>
    </div>
  )
}
