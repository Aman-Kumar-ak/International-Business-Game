import { useState } from 'react'
import socket from '../socket'

export default function CreateGameScreen({ onBack, showToast, sessionId }) {
  const [bankerName, setBankerName] = useState('')
  const [roomName, setRoomName]     = useState('')
  const [startMoney, setStartMoney] = useState('25000')
  const [duration, setDuration]     = useState('60')

  const handleCreate = () => {
    if (!bankerName.trim()) { showToast('Enter your name', 'error'); return }
    if (!roomName.trim())   { showToast('Enter a room name', 'error'); return }
    const money = parseInt(startMoney) || 25000
    const dur   = parseInt(duration)   || 60
    socket.emit('create_game', {
      bankerName:      bankerName.trim(),
      roomName:        roomName.trim(),
      startMoney:      money,
      durationMinutes: dur,
      sessionId,          // ← sends stable ID so banker can reconnect
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <button className="btn btn-sm mb-5" onClick={onBack}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <h2 className="text-lg font-semibold mb-5">Create Game</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Your Name (Banker)</label>
            <input className="input" placeholder="Your name" value={bankerName}
              onChange={e => setBankerName(e.target.value)} />
          </div>
          <div>
            <label className="label">Room Name</label>
            <input className="input" placeholder="e.g. Family Game Night" value={roomName}
              onChange={e => setRoomName(e.target.value)} />
          </div>
          <div>
            <label className="label">Starting Money</label>
            <select className="input" value={startMoney} onChange={e => setStartMoney(e.target.value)}>
              <option value="10000">$10,000</option>
              <option value="15000">$15,000</option>
              <option value="20000">$20,000</option>
              <option value="25000">$25,000</option>
              <option value="30000">$30,000</option>
              <option value="50000">$50,000</option>
            </select>
          </div>
          <div>
            <label className="label">Game Duration</label>
            <select className="input" value={duration} onChange={e => setDuration(e.target.value)}>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>
          <button className="btn btn-primary w-full justify-center py-2.5" onClick={handleCreate}>
            <i className="ti ti-plus" /> Create Game
          </button>
        </div>
      </div>
    </div>
  )
}
