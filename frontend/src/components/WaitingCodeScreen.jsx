import { useState, useEffect, useRef } from 'react'
import socket from '../socket'

function QRCode({ value, size = 160 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !value) return
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    script.onload = () => {
      if (ref.current) {
        ref.current.innerHTML = ''
        new window.QRCode(ref.current, { text: value, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.M })
      }
    }
    if (window.QRCode) {
      ref.current.innerHTML = ''
      new window.QRCode(ref.current, { text: value, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.M })
    } else {
      document.head.appendChild(script)
    }
  }, [value, size])
  return <div ref={ref} className="flex items-center justify-center" />
}

export default function WaitingCodeScreen({ myInfo, gameState, showToast, onLeave }) {
  const [approvingAll, setApprovingAll] = useState(false)

  if (!myInfo) return null

  // Use stableId as the canonical player identifier
  const pid = (p) => p.stableId || p.id

  const pending  = gameState?.players?.filter(p =>  p.pending) || []
  const approved = gameState?.players?.filter(p => !p.pending) || []

  const approve = (id) => socket.emit('approve_player', { playerId: id })

  const approveAll = () => {
    setApprovingAll(true)
    socket.emit('approve_all_players')
    setTimeout(() => setApprovingAll(false), 800)
  }

  const reject = (id) => {
    if (window.confirm('Reject this player?')) {
      socket.emit('reject_player', { playerId: id })
    }
  }

  const startGame = () => {
    if (pending.length > 0) {
      showToast('Approve or reject all pending players before starting', 'error')
      return
    }
    if (approved.length === 0) {
      showToast('Approve at least one player first', 'error')
      return
    }
    socket.emit('start_game')
  }

  const copyCode = () => {
    navigator.clipboard
      .writeText(myInfo.roomCode)
      .then(() => showToast('Room code copied!', 'success'))
      .catch(() => showToast('Copy failed — copy it manually', 'error'))
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        {/* Room code */}
        <p className="text-xs text-gray-400 text-center mb-1">{myInfo.roomName}</p>
        <h2 className="text-lg font-semibold text-center mb-4">Share Room Code</h2>

        <div
          className="bg-gray-50 border border-gray-200 rounded-xl py-5 text-center cursor-pointer group mb-1 select-none"
          onClick={copyCode}
          title="Tap to copy"
        >
          <div className="font-mono text-3xl font-semibold tracking-widest text-brand-600">
            {myInfo.roomCode}
          </div>
          <p className="text-xs text-gray-400 mt-1 group-hover:text-brand-600 transition-colors">
            Tap to copy
          </p>
        </div>
        <p className="text-xs text-gray-400 text-center mb-3">Share this code with all players</p>

        {/* QR Code */}
        <div className="flex flex-col items-center mb-5">
          <div className="bg-white border border-gray-100 rounded-xl p-3 inline-block">
            <QRCode value={`${window.location.origin}?code=${myInfo.roomCode}`} size={140} />
          </div>
          <p className="text-xs text-gray-400 mt-2">Or scan to join</p>
        </div>

        {/* Game info */}
        <div className="flex justify-between text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2 mb-5">
          <span>Start money: <span className="font-semibold text-gray-600">${myInfo.startMoney?.toLocaleString()}</span></span>
          <span>Duration: <span className="font-semibold text-gray-600">{myInfo.durationMinutes} min</span></span>
        </div>

        {/* Waiting room header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Waiting Room</h3>
          <span className="badge badge-blue">{pending.length + approved.length} players</span>
        </div>

        {pending.length === 0 && approved.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            No players yet — share the code!
          </p>
        )}

        {/* Pending players */}
        {pending.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                Waiting Approval ({pending.length})
              </p>
              <button
                className="btn btn-sm btn-success"
                onClick={approveAll}
                disabled={approvingAll}
              >
                <i className="ti ti-checks" /> Approve All
              </button>
            </div>
            {pending.map(p => (
              <div
                key={pid(p)}
                className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <div className="flex gap-1.5">
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => approve(pid(p))}
                    title="Approve"
                  >
                    <i className="ti ti-check" />
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => reject(pid(p))}
                    title="Reject"
                  >
                    <i className="ti ti-x" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Approved players */}
        {approved.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
              Approved ({approved.length})
            </p>
            {approved.map(p => (
              <div
                key={pid(p)}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <span className="text-sm">{p.name}</span>
                <span className="badge badge-green">
                  <i className="ti ti-check text-xs" /> Ready
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Pending warning */}
        {pending.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            <i className="ti ti-alert-triangle mr-1" />
            Approve or reject all pending players to start the game.
          </p>
        )}

        {/* Start button — only shown when all clear */}
        {pending.length === 0 && approved.length > 0 && (
          <button
            className="btn btn-success w-full justify-center mt-2 py-2.5"
            onClick={startGame}
          >
            <i className="ti ti-player-play" /> Start Game ({approved.length} player{approved.length !== 1 ? 's' : ''})
          </button>
        )}

        <button
          className="btn btn-outline-danger w-full justify-center mt-2"
          onClick={() => {
            if (window.confirm('Leave? All players will be removed.')) onLeave()
          }}
        >
          <i className="ti ti-logout" /> Leave
        </button>
      </div>
    </div>
  )
}
