import { useState, useEffect, useRef, useCallback } from 'react'
import socket from './socket'
import HomeScreen from './components/HomeScreen'
import CreateGameScreen from './components/CreateGameScreen'
import JoinGameScreen from './components/JoinGameScreen'
import WaitingCodeScreen from './components/WaitingCodeScreen'
import WaitingApprovalScreen from './components/WaitingApprovalScreen'
import BankerDashboard from './components/BankerDashboard'
import PlayerDashboard from './components/PlayerDashboard'
import EndGameScreen from './components/EndGameScreen'
import Toast from './components/Toast'

// ─── Stable session ID — survives hard refresh, unique per browser ────────────
function getOrCreateSessionId() {
  let id = localStorage.getItem('ib_session_id')
  if (!id) {
    id = 'sess_' + Math.random().toString(36).substr(2, 12)
    localStorage.setItem('ib_session_id', id)
  }
  return id
}
const SESSION_ID = getOrCreateSessionId()

// ─── LocalStorage persistence ─────────────────────────────────────────────────
const LS = {
  save(screen, myInfo, gameState) {
    try {
      localStorage.setItem('ib_screen', screen)
      localStorage.setItem('ib_myInfo', JSON.stringify(myInfo))
      if (gameState) localStorage.setItem('ib_gameState', JSON.stringify(gameState))
    } catch (_) { /* quota exceeded — non-fatal */ }
  },
  load() {
    try {
      return {
        screen:    localStorage.getItem('ib_screen'),
        myInfo:    JSON.parse(localStorage.getItem('ib_myInfo') || 'null'),
        gameState: JSON.parse(localStorage.getItem('ib_gameState') || 'null'),
      }
    } catch (_) {
      return { screen: null, myInfo: null, gameState: null }
    }
  },
  clear() {
    ['ib_screen', 'ib_myInfo', 'ib_gameState'].forEach(k => localStorage.removeItem(k))
  },
}

// Screens that belong to an active game session
const IN_GAME_SCREENS = new Set(['waiting-code', 'waiting-approval', 'banker', 'player'])

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]       = useState('home')
  const [gameState, setGameState] = useState(null)
  const [myInfo, setMyInfo]       = useState(null)
  const [endData, setEndData]     = useState(null)
  const [toast, setToast]         = useState(null)
  const [isRestoring, setIsRestoring] = useState(true)

  // Refs so socket handlers (registered once) always read the latest state
  const screenRef    = useRef(screen)
  const myInfoRef    = useRef(myInfo)
  const gameStateRef = useRef(gameState)
  useEffect(() => { screenRef.current  = screen    }, [screen])
  useEffect(() => { myInfoRef.current  = myInfo    }, [myInfo])
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type, key: Date.now() })
  }, [])

  // ── Reset everything and go home ───────────────────────────────────────────
  const resetAll = useCallback(() => {
    setScreen('home')
    setGameState(null)
    setMyInfo(null)
    setEndData(null)
    LS.clear()
  }, [])

  // ── Step 1: Restore persisted session on mount ────────────────────────────
  const [qrCode, setQrCode] = useState('')
  useEffect(() => {
    // Check for ?code= from QR scan
    const params = new URLSearchParams(window.location.search)
    const scannedCode = params.get('code')
    if (scannedCode) {
      setQrCode(scannedCode.toUpperCase())
      setScreen('join')
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname)
    }

    const { screen: s, myInfo: m, gameState: g } = LS.load()
    if (!scannedCode && s && m && IN_GAME_SCREENS.has(s)) {
      setScreen(s)
      setMyInfo(m)
      if (g) setGameState(g)
    }
    setIsRestoring(false)
  }, [])

  // ── Step 2: Reconnect to server after restore ─────────────────────────────
  useEffect(() => {
    if (isRestoring) return

    const attemptReconnect = () => {
      const info = myInfoRef.current
      const sc   = screenRef.current
      if (!info || !IN_GAME_SCREENS.has(sc)) return

      if (info.isBanker) {
        socket.emit('reconnect_banker', { roomCode: info.roomCode, sessionId: SESSION_ID })
      } else if (info.stableId) {
        socket.emit('reconnect_player', { roomCode: info.roomCode, stableId: info.stableId })
      }
    }

    if (socket.connected) attemptReconnect()
    socket.on('connect', attemptReconnect)
    return () => socket.off('connect', attemptReconnect)
  }, [isRestoring])

  // ── Step 3: Persist on every relevant state change ────────────────────────
  useEffect(() => {
    if (!isRestoring && myInfo && IN_GAME_SCREENS.has(screen)) {
      LS.save(screen, myInfo, gameState)
    }
  }, [screen, myInfo, gameState, isRestoring])

  // ── Step 4: Resync on tab focus / visibility ──────────────────────────────
  useEffect(() => {
    const sync = () => {
      if (!document.hidden && myInfoRef.current && IN_GAME_SCREENS.has(screenRef.current)) {
        if (!socket.connected) socket.connect()
        else socket.emit('request_room_state', { roomCode: myInfoRef.current.roomCode })
      }
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  // ── Wake Lock — keep screen on during active game ───────────────────────────
  useEffect(() => {
    const activeScreens = new Set(['banker', 'player'])
    if (!activeScreens.has(screen)) return
    if (!('wakeLock' in navigator)) return   // browser doesn't support it

    let lock = null

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch (_) { /* silently ignore — not critical */ }
    }

    // Re-acquire when tab becomes visible again (required — lock is released on hide)
    const onVisible = () => { if (!document.hidden) acquire() }
    document.addEventListener('visibilitychange', onVisible)

    acquire()

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [screen])

  // ── All socket event handlers (registered once, read state via refs) ──────
  useEffect(() => {
    // ── Game created (banker) ────────────────────────────────────────────────
    const onGameCreated = ({ roomCode, roomName, bankerName, startMoney, durationMinutes, bankerSessionId }) => {
      const info = {
        isBanker: true,
        bankerName,
        roomCode,
        roomName,
        startMoney,
        durationMinutes,
        stableId: bankerSessionId || SESSION_ID,
      }
      setMyInfo(info)
      setScreen('waiting-code')
    }

    // ── Join pending (player) ────────────────────────────────────────────────
    const onJoinPending = ({ playerName, roomName, roomCode, stableId }) => {
      setMyInfo(prev => ({
        ...(prev || {}),
        isBanker: false,
        playerName,
        roomName,
        roomCode,
        stableId: stableId || SESSION_ID,
      }))
      setScreen('waiting-approval')
    }

    // ── Approved ─────────────────────────────────────────────────────────────
    const onApproved = () => {
      showToast('You have been approved!', 'success')
      // If game already started, navigate directly to player screen
      if (gameStateRef.current?.started) setScreen('player')
    }

    // ── Rejected ─────────────────────────────────────────────────────────────
    const onRejected = () => {
      showToast('Your join request was rejected.', 'error')
      resetAll()
    }

    // ── Game started ─────────────────────────────────────────────────────────
    const onGameStarted = () => {
      if (myInfoRef.current?.isBanker) setScreen('banker')
      else setScreen('player')
    }

    // ── Room update (live broadcast) ─────────────────────────────────────────
    const onRoomUpdate = (roomData) => {
      setGameState(roomData)

      const info = myInfoRef.current
      const sc   = screenRef.current

      // Player on waiting-approval: auto-navigate when approved + game started
      if (!info?.isBanker && sc === 'waiting-approval') {
        const me = roomData.players?.find(p => p.stableId === info?.stableId || p.id === info?.stableId)
        if (me && !me.pending && roomData.started) setScreen('player')
      }

      // Banker on waiting-code: auto-navigate when game started
      if (info?.isBanker && sc === 'waiting-code' && roomData.started) setScreen('banker')
    }

    // ── Reconnected to game (after page refresh) ─────────────────────────────
    const onReconnected = (roomData) => {
      setGameState(roomData)

      const info = myInfoRef.current
      if (!info) return

      if (roomData.isBankerView) {
        setScreen('banker')
      } else if (roomData.started) {
        setScreen('player')
      } else {
        // Game not started — put them back on the right waiting screen
        const me = roomData.players?.find(p => p.stableId === info.stableId || p.id === info.stableId)
        setScreen('waiting-approval')
        // If already approved, fire the event so the screen updates label
        if (me && !me.pending) socket.emit('approved')
      }
    }

    // ── Room state (pull response from request_room_state) ────────────────────
    const onRoomState = (roomData) => {
      setGameState(roomData)
    }

    // ── Game ended ────────────────────────────────────────────────────────────
    const onGameEnded = ({ players }) => {
      setEndData(players)
      setScreen('end')
      LS.clear()
    }

    // ── Player voluntarily left ────────────────────────────────────────────────
    const onYouLeft = () => {
      showToast('You left the game.', 'info')
      resetAll()
    }

    // ── Notifications & errors ────────────────────────────────────────────────
    const onNotification = ({ message, type }) => showToast(message, type || 'info')
    const onError        = ({ message })       => showToast(message, 'error')

    // ── Connection lifecycle ──────────────────────────────────────────────────
    const onDisconnect   = () => showToast('Connection lost. Reconnecting…', 'warning')
    const onReconnectOk  = () => showToast('Reconnected!', 'success')

    // Register all
    socket.on('game_created',       onGameCreated)
    socket.on('join_pending',       onJoinPending)
    socket.on('approved',           onApproved)
    socket.on('rejected',           onRejected)
    socket.on('game_started',       onGameStarted)
    socket.on('room_update',        onRoomUpdate)
    socket.on('reconnected_to_game',onReconnected)
    socket.on('room_state',         onRoomState)
    socket.on('game_ended',         onGameEnded)
    socket.on('you_left_game',      onYouLeft)
    socket.on('notification',       onNotification)
    socket.on('error',              onError)
    socket.on('disconnect',         onDisconnect)
    socket.on('reconnect',          onReconnectOk)

    // Heartbeat
    const hb = setInterval(() => { if (socket.connected) socket.emit('ping') }, 25000)

    return () => {
      socket.off('game_created',       onGameCreated)
      socket.off('join_pending',       onJoinPending)
      socket.off('approved',           onApproved)
      socket.off('rejected',           onRejected)
      socket.off('game_started',       onGameStarted)
      socket.off('room_update',        onRoomUpdate)
      socket.off('reconnected_to_game',onReconnected)
      socket.off('room_state',         onRoomState)
      socket.off('game_ended',         onGameEnded)
      socket.off('you_left_game',      onYouLeft)
      socket.off('notification',       onNotification)
      socket.off('error',              onError)
      socket.off('disconnect',         onDisconnect)
      socket.off('reconnect',          onReconnectOk)
      clearInterval(hb)
    }
  }, [showToast, resetAll]) // stable refs, won't re-register

  // ── Leave handler ──────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    socket.emit('player_leave')
    const sc = screenRef.current
    if (sc === 'waiting-approval') showToast('Cancelled join request.', 'info')
    else if (sc === 'waiting-code') showToast('Game cancelled.', 'info')
    else if (sc === 'banker') showToast('Game ended for all players.', 'info')
    else showToast('You left the game.', 'info')
    resetAll()
  }, [showToast, resetAll])

  const handleConnectionFailed = useCallback(() => {
    showToast('Could not reconnect. Returning home.', 'error')
    resetAll()
  }, [showToast, resetAll])

  // ── Loading splash ─────────────────────────────────────────────────────────
  if (isRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-3">💳</div>
          <div className="text-xl font-semibold mb-1">IB Digital Banker</div>
          <div className="text-sm text-gray-400">Loading…</div>
        </div>
      </div>
    )
  }

  // ── Render screens ─────────────────────────────────────────────────────────
  const common = { showToast, onLeave: handleLeave }

  return (
    <div className="min-h-screen bg-gray-50">
      {screen === 'home'             && <HomeScreen onCreateGame={() => setScreen('create')} onJoinGame={() => setScreen('join')} />}
      {screen === 'create'           && <CreateGameScreen {...common} onBack={() => setScreen('home')} sessionId={SESSION_ID} />}
      {screen === 'join'             && <JoinGameScreen   {...common} onBack={() => setScreen('home')} setMyInfo={setMyInfo} sessionId={SESSION_ID} prefillCode={qrCode} />}
      {screen === 'waiting-code'     && <WaitingCodeScreen {...common} myInfo={myInfo} gameState={gameState} />}
      {screen === 'waiting-approval' && <WaitingApprovalScreen myInfo={myInfo} gameState={gameState} onLeave={handleLeave} />}
      {screen === 'banker'           && <BankerDashboard {...common} gameState={gameState} myInfo={myInfo} onConnectionFailed={handleConnectionFailed} />}
      {screen === 'player'           && <PlayerDashboard {...common} gameState={gameState} myInfo={myInfo} onConnectionFailed={handleConnectionFailed} />}
      {screen === 'end'              && <EndGameScreen players={endData} onNewGame={resetAll} />}

      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
