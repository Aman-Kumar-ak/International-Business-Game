import { useEffect, useState } from 'react'

const TYPE_STYLES = {
  info:    'bg-gray-800 text-white',
  success: 'bg-green-600 text-white',
  error:   'bg-red-600   text-white',
  warning: 'bg-amber-500 text-white',
}

const TYPE_ICONS = {
  info:    'ti-info-circle',
  success: 'ti-circle-check',
  error:   'ti-alert-circle',
  warning: 'ti-alert-triangle',
}

// DURATION constants (ms)
const VISIBLE_MS  = 2500   // how long the toast stays fully visible
const FADE_MS     = 300    // CSS transition-duration for the fade-out

export default function Toast({ msg, type = 'info', onDone }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Reset to visible whenever msg/type changes (new toast)
    setVisible(true)

    // Start fade-out just before onDone fires
    const fadeTimer = setTimeout(() => setVisible(false), VISIBLE_MS)

    // Tell parent to clear toast state after fade completes
    const doneTimer = setTimeout(() => {
      if (onDone) onDone()
    }, VISIBLE_MS + FADE_MS)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [msg, type]) // re-run when a new toast arrives (key prop in App handles full remount)

  return (
    <div
      className={`
        fixed bottom-6 left-4 right-4 z-50
        flex items-center gap-2
        px-4 py-3 rounded-xl text-sm font-medium shadow-lg
        animate-slide-up
        transition-opacity
        ${TYPE_STYLES[type] || TYPE_STYLES.info}
      `}
      style={{
        // Horizontally centre but cap at 360px so it never wraps on phones
        maxWidth: '360px',
        margin: '0 auto',
        left: '50%',
        right: 'auto',
        transform: 'translateX(-50%)',
        opacity: visible ? 1 : 0,
        transitionDuration: `${FADE_MS}ms`,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      role="status"
      aria-live="polite"
    >
      <i className={`ti ${TYPE_ICONS[type] || TYPE_ICONS.info} text-base flex-shrink-0`} />
      <span className="truncate">{msg}</span>
    </div>
  )
}
