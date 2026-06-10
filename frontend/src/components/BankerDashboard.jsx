import { useEffect, useState } from 'react'
import socket from '../socket'

const COLORS = ['#185FA5','#639922','#A32D2D','#854F0B','#533AB7','#0F6E56','#993556','#5F5E5A']

function fmt(n) { return '$' + Math.abs(n).toLocaleString() }
function initials(name) { return name.slice(0, 2).toUpperCase() }

function formatTimer(endsAt, now) {
  if (!endsAt) return '--:--'
  const ms = Math.max(0, new Date(endsAt).getTime() - now)
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/**
 * Banker history color coding:
 *   from_bank        → red   (bank paid out money — bank's balance decreases)
 *   to_bank          → green (bank received money — bank's balance increases)
 *   player_to_player → gray  (neutral, bank uninvolved)
 */
function bankerHistoryColor(flowType) {
  if (flowType === 'from_bank') return 'text-red-500'    // bank spent money
  if (flowType === 'to_bank')   return 'text-green-600'  // bank received money
  return 'text-gray-500'                                  // player-to-player
}

function flowLabel(tx) {
  return `${tx.fromName || 'Unknown'} → ${tx.toName || 'Unknown'}`
}

export default function BankerDashboard({ gameState, myInfo, showToast, onLeave, onConnectionFailed }) {
  const [tab, setTab] = useState('players')
  const [actionPlayer, setActionPlayer] = useState('')
  const [actionAmt, setActionAmt] = useState('')
  const [fromPlayer, setFromPlayer] = useState('')
  const [toPlayer, setToPlayer] = useState('')
  const [transferAmt, setTransferAmt] = useState('')
  const [controlPlayer, setControlPlayer] = useState('')
  const [showParty, setShowParty] = useState(false)
  const [partyType, setPartyType] = useState('')
  const [partyLander, setPartyLander] = useState('')
  const [now, setNow] = useState(Date.now())
  const [loadingTooLong, setLoadingTooLong] = useState(false)

  useEffect(() => {
    if (!gameState?.endsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [gameState?.endsAt])

  useEffect(() => {
    if (gameState) { setLoadingTooLong(false); return }
    const t = setTimeout(() => setLoadingTooLong(true), 10000)
    return () => clearTimeout(t)
  }, [gameState])

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-lg text-gray-500 mb-4">Loading game…</div>
          {loadingTooLong && (
            <div className="mt-6">
              <p className="text-sm text-gray-400 mb-4">Still loading? Go back home.</p>
              <button className="btn btn-primary" onClick={onConnectionFailed}>
                <i className="ti ti-home" /> Go to Home
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const players = gameState.players?.filter(p => !p.pending) || []
  const totalMoney = players.reduce((s, p) => s + p.balance, 0)
  const timerLabel = formatTimer(gameState.endsAt, now)

  // ── Helpers ─────────────────────────────────────────────────────────────────
  // Normalise ID: accept either stableId or id
  const pid = (p) => p.stableId || p.id

  const doAdjust = (type) => {
    const id = actionPlayer || pid(players[0])
    const amt = parseInt(actionAmt)
    if (!id || !amt || amt <= 0) { showToast('Enter a valid player and amount', 'error'); return }
    socket.emit('banker_adjust', { playerId: id, amount: amt, type })
    setActionAmt('')
    showToast(type === 'add' ? `Added ${fmt(amt)}` : `Deducted ${fmt(amt)}`, 'success')
  }

  const doTransfer = () => {
    const fid = fromPlayer || pid(players[0])
    const tid = toPlayer || pid(players[1])
    const amt = parseInt(transferAmt)
    if (!fid || !tid || fid === tid) { showToast('Select two different players', 'error'); return }
    if (!amt || amt <= 0) { showToast('Enter amount', 'error'); return }
    socket.emit('banker_transfer', { fromId: fid, toId: tid, amount: amt })
    setTransferAmt('')
    showToast('Transfer done!', 'success')
  }

  const openPartyModal = (type) => {
    setPartyType(type)
    setPartyLander(pid(players[0]) || '')
    setShowParty(true)
  }

  const confirmParty = () => {
    if (!partyLander) { showToast('Select a player', 'error'); return }
    socket.emit(partyType === 'party' ? 'party_house' : 'resort', { landerId: partyLander })
    setShowParty(false)
    showToast(partyType === 'party' ? 'Party House done!' : 'Resort done!', 'success')
  }

  const ctrl = controlPlayer || pid(players[0])

  const copyCode = () => {
    navigator.clipboard.writeText(myInfo.roomCode).then(() => showToast('Room code copied!', 'success'))
  }

  // All-game transactions visible to banker
  const allTransactions = gameState.transactions || []

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-base font-semibold leading-tight">{gameState.roomName}</h1>
                <p className="text-xs text-gray-400">Banker: {myInfo?.bankerName}</p>
              </div>
              <div className="cursor-pointer group" onClick={copyCode} title="Click to copy room code">
                <div className="badge badge-blue font-mono text-sm px-3 py-1.5">
                  <i className="ti ti-copy text-xs mr-1" />{myInfo?.roomCode}
                </div>
                <p className="text-xs text-gray-400 text-center group-hover:text-brand-600 transition-colors mt-1">
                  Tap to copy
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-blue text-sm px-3 py-1.5">
              <i className="ti ti-clock" /> {timerLabel}
            </span>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => { if (window.confirm('End game and show results?')) socket.emit('end_game') }}
            >
              <i className="ti ti-flag" /> End Game
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => { if (window.confirm('Leave? Game will end for all players.')) onLeave() }}
            >
              <i className="ti ti-logout" /> Leave
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card p-4 text-center">
            <div className="text-2xl font-semibold">{players.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">Players</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xl font-semibold text-brand-600">${totalMoney.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-0.5">Total Money</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-semibold">{gameState.round ?? 1}</div>
            <div className="text-xs text-gray-400 mt-0.5">Round</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          {[
            { id: 'players', label: 'Players' },
            { id: 'actions', label: 'Actions' },
            { id: 'history', label: `History (${allTransactions.length})` },
          ].map(t => (
            <button
              key={t.id}
              className={`tab-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Players */}
        {tab === 'players' && (
          <div className="card">
            {players.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No players in game</p>
            )}
            {players.map((p, i) => (
              <div
                key={pid(p)}
                className={`flex items-center justify-between py-3 border-b border-gray-50 last:border-0 ${!p.online ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${!p.online ? 'grayscale' : ''}`}
                    style={{ background: COLORS[i % COLORS.length] + '20', color: COLORS[i % COLORS.length] }}
                  >
                    {initials(p.name)}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${!p.online ? 'text-gray-400' : ''}`}>
                      {p.name}
                      {!p.online && <span className="text-xs text-gray-400 ml-1">🔴 Offline</span>}
                    </div>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {p.jail && <span className="badge badge-red text-xs">In Jail</span>}
                      {!p.passport && <span className="badge badge-amber text-xs">Passport Suspended</span>}
                      {p.cc?.used && p.cc?.remaining > 0 && <span className="badge badge-blue text-xs">CC: {p.cc.remaining} left</span>}
                      {p.cc?.used && p.cc?.remaining === 0 && <span className="badge badge-green text-xs">CC Cleared</span>}
                    </div>
                  </div>
                </div>
                <div className={`text-lg font-semibold ${!p.online ? 'text-gray-400' : 'text-brand-600'}`}>
                  ${p.balance.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {tab === 'actions' && (
          <div className="space-y-4">
            {/* Add / Deduct */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-4">Add / Deduct Money</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="label">Player</label>
                  <select className="input" value={actionPlayer} onChange={e => setActionPlayer(e.target.value)}>
                    {players.map(p => (
                      <option key={pid(p)} value={pid(p)}>
                        {p.name} (${p.balance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Amount</label>
                  <input className="input" type="number" placeholder="0" value={actionAmt}
                    onChange={e => setActionAmt(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-success" onClick={() => doAdjust('add')}>
                  <i className="ti ti-plus" /> Add Money
                </button>
                <button className="btn btn-danger" onClick={() => doAdjust('deduct')}>
                  <i className="ti ti-minus" /> Deduct Money
                </button>
              </div>
            </div>

            {/* Transfer */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-4">Transfer Between Players</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="label">From</label>
                  <select className="input" value={fromPlayer} onChange={e => setFromPlayer(e.target.value)}>
                    {players.map(p => <option key={pid(p)} value={pid(p)}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">To</label>
                  <select className="input" value={toPlayer} onChange={e => setToPlayer(e.target.value)}>
                    {players.map(p => <option key={pid(p)} value={pid(p)}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="label">Amount</label>
                <input className="input" type="number" placeholder="0" value={transferAmt}
                  onChange={e => setTransferAmt(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={doTransfer}>
                <i className="ti ti-arrows-exchange" /> Transfer
              </button>
            </div>

            {/* Jail & Passport */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-4">Jail & Passport Controls</h3>
              <div className="mb-3">
                <label className="label">Player</label>
                <select className="input" value={controlPlayer} onChange={e => setControlPlayer(e.target.value)}>
                  {players.map(p => <option key={pid(p)} value={pid(p)}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm btn-danger"
                  onClick={() => { socket.emit('set_jail', { playerId: ctrl, jail: true }); showToast('Sent to jail', 'info') }}>
                  <i className="ti ti-lock" /> Send to Jail
                </button>
                <button className="btn btn-sm btn-success"
                  onClick={() => { socket.emit('set_jail', { playerId: ctrl, jail: false }); showToast('Released from jail', 'success') }}>
                  <i className="ti ti-lock-open" /> Release Jail
                </button>
                <button className="btn btn-sm btn-danger"
                  onClick={() => { socket.emit('set_passport', { playerId: ctrl, passport: false }); showToast('Passport suspended', 'info') }}>
                  <i className="ti ti-id-badge-off" /> Suspend Passport
                </button>
                <button className="btn btn-sm btn-success"
                  onClick={() => { socket.emit('set_passport', { playerId: ctrl, passport: true }); showToast('Passport restored', 'success') }}>
                  <i className="ti ti-id-badge" /> Restore Passport
                </button>
              </div>
            </div>

            {/* Special events */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-4">Special Events</h3>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm" onClick={() => openPartyModal('party')}>
                  <i className="ti ti-confetti" /> Party House (+$200 each)
                </button>
                <button className="btn btn-sm" onClick={() => openPartyModal('resort')}>
                  <i className="ti ti-building" /> Resort (−$200 each)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History — banker sees ALL transactions */}
        {tab === 'history' && (
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
              All Transactions
            </p>
            {allTransactions.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No transactions yet</p>
            )}
            {allTransactions.map(tx => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
              >
                <div>
                  <span className="text-sm font-medium">{flowLabel(tx)}</span>
                  <div className="text-xs text-gray-300 mt-0.5">{tx.time}</div>
                </div>
                <span className={`text-sm font-semibold ${bankerHistoryColor(tx.flowType)}`}>
                  {fmt(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Party / Resort modal */}
      {showParty && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm">
            <h3 className="text-sm font-semibold mb-4">
              {partyType === 'party' ? 'Party House — Who landed?' : 'Resort — Who landed?'}
            </h3>
            <div className="mb-4">
              <label className="label">Player who landed</label>
              <select className="input" value={partyLander} onChange={e => setPartyLander(e.target.value)}>
                {players.map(p => <option key={pid(p)} value={pid(p)}>{p.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {partyType === 'party'
                ? 'This player receives $200 from all other players.'
                : 'This player pays $200 to all other players.'}
            </p>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={confirmParty}>Confirm</button>
              <button className="btn" onClick={() => setShowParty(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
