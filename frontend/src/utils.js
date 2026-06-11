// ─── Shared utilities ─────────────────────────────────────────────────────────

export function fmt(n) {
  return '$' + Math.abs(n).toLocaleString()
}

export function formatTimer(endsAt, now) {
  if (!endsAt) return '--:--'
  const ms = Math.max(0, new Date(endsAt).getTime() - now)
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}
