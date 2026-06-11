import { io } from 'socket.io-client'

// Resolve backend URL:
//  1. Env var set at build time (VITE_BACKEND_URL in .env.development or .env.production)
//  2. Auto-detect: localhost → :4000, LAN IP → same host :4000
function resolveBackendUrl() {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL
  }
  const { hostname } = window.location
  return `http://${hostname}:4000`
}

const BACKEND_URL = resolveBackendUrl()

if (import.meta.env.DEV) {
  console.log('[socket] connecting to', BACKEND_URL)
}

const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 8000,
  randomizationFactor: 0.3,
  timeout: 20000,
})

export default socket
