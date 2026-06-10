import { io } from 'socket.io-client'

// Resolve backend URL:
//  1. Env var set at build time (production / staging)
//  2. Auto-detect for local dev (localhost or LAN IP)
function resolveBackendUrl() {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL
  }
  const { hostname, protocol } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:4000'
  }
  // LAN / local network access (e.g. 192.168.x.x)
  return `${protocol}//${hostname}:4000`
}

const BACKEND_URL = resolveBackendUrl()

if (import.meta.env.DEV) {
  console.log('[socket] connecting to', BACKEND_URL)
}

const socket = io(BACKEND_URL, {
  autoConnect: true,
  // Try WebSocket first, fall back to long-polling (important for Render free tier)
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,   // keep trying forever — game must survive flaky mobile networks
  reconnectionDelay: 1000,
  reconnectionDelayMax: 8000,       // back off up to 8 s
  randomizationFactor: 0.3,
  timeout: 20000,
})

export default socket
