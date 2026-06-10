import { useState } from 'react'
import socket from '../socket'

export default function JoinGameScreen({ onBack, showToast, setMyInfo, sessionId }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  const handleJoin = () => {
    if (!code.trim() || code.length < 6) { showToast('Enter the 6-character room code', 'error'); return }
    if (!name.trim()) { showToast('Enter your name', 'error'); return }

    const trimmedCode = code.trim().toUpperCase()
    const trimmedName = name.trim()

    // Pre-fill myInfo so WaitingApprovalScreen can display name immediately
    setMyInfo(prev => ({
      ...(prev || {}),
      isBanker: false,
      playerName: trimmedName,
      roomCode: trimmedCode,
      stableId: sessionId,
    }))

    socket.emit('join_game', {
      roomCode:   trimmedCode,
      playerName: trimmedName,
      sessionId,      // ← stable ID so player can reconnect
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <button className="btn btn-sm mb-5" onClick={onBack}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <h2 className="text-lg font-semibold mb-5">Join Game</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Room Code</label>
            <input
              className="input font-mono text-xl tracking-widest text-center uppercase"
              placeholder="A8X91B"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </div>
          <div>
            <label className="label">Your Name</label>
            <input className="input" placeholder="Enter your name" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()} />
          </div>
          <button className="btn btn-primary w-full justify-center py-2.5" onClick={handleJoin}>
            <i className="ti ti-login" /> Join Game
          </button>
        </div>
      </div>
    </div>
  )
}
