import { useEffect, useState } from 'react'
import socket from '../socket'
import ConfirmModal from './ConfirmModal'

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

function bankerHistoryColor(flowType) {
  if (flowType === 'from_bank') return 'text-red-500'
  if (flowType === 'to_bank')   return 'text-green-600'
  return 'text-gray-500'
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

  // Custom confirm modal state
  const [confirm, setConfirm] = useState(null) // { title, message, subMessage, confirmLabel, confirmType, onConfirm }

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

  const pid = (p) => p.stableId || p.id

  // ── Actions ──────────────────────────────────────────────────────────────────

  const ALL_PLAYERS = '__all__'

  const doAdjust = (type) => {
    const id = actionPlayer || ALL_PLAYERS
    const amt = parseInt(actionAmt)
    if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return }

    if (id === ALL_PLAYERS) {
      if (players.length === 0) { showToast('No players in game', 'error'); return }
      setConfirm({
        title: type === 'add' ? 'Add to All Players' : 'Deduct from All Players',
        message: type === 'add'
          ? `Add ${fmt(amt)} to all ${players.length} players?`
          : `Deduct ${fmt(amt)} from all ${players.length} players?`,
        subMessage: `Every player in the game will be affected.`,
        confirmLabel: type === 'add' ? `Add to All (${players.length})` : `Deduct from All (${players.length})`,
        confirmType: type === 'add' ? 'success' : 'danger',
        onConfirm: () => {
          players.forEach(p => socket.emit('banker_adjust', { playerId: pid(p), amount: amt, type }))
          setActionAmt('')
          showToast(type === 'add' ? `Added ${fmt(amt)} to all ${players.length} players` : `Deducted ${fmt(amt)} from all ${players.length} players`, 'success')
          setConfirm(null)
        }
      })
    } else {
      const player = players.find(p => pid(p) === id)
      const playerName = player?.name || 'Player'
      setConfirm({
        title: type === 'add' ? 'Add Money' : 'Deduct Money',
        message: type === 'add'
          ? `Add ${fmt(amt)} to ${playerName}?`
          : `Deduct ${fmt(amt)} from ${playerName}?`,
        subMessage: type === 'add'
          ? `${playerName}'s balance will increase by ${fmt(amt)}.`
          : `${playerName}'s current balance: ${fmt(player?.balance || 0)}`,
        confirmLabel: type === 'add' ? 'Add Money' : 'Deduct Money',
        confirmType: type === 'add' ? 'success' : 'danger',
        onConfirm: () => {
          socket.emit('banker_adjust', { playerId: id, amount: amt, type })
          setActionAmt('')
          showToast(type === 'add' ? `Added ${fmt(amt)} to ${playerName}` : `Deducted ${fmt(amt)} from ${playerName}`, 'success')
          setConfirm(null)
        }
      })
    }
  }

  const doTransfer = () => {
    const fid = fromPlayer || pid(players[0])
    const tid = toPlayer || pid(players[1])
    const amt = parseInt(transferAmt)
    if (!fid || !tid || fid === tid) { showToast('Select two different players', 'error'); return }
    if (!amt || amt <= 0) { showToast('Enter amount', 'error'); return }
    const fromP = players.find(p => pid(p) === fid)
    const toP = players.find(p => pid(p) === tid)
    setConfirm({
      title: 'Transfer Money',
      message: `Transfer ${fmt(amt)} from ${fromP?.name} to ${toP?.name}?`,
      subMessage: `${fromP?.name}'s balance after: ${fmt((fromP?.balance || 0) - amt)}`,
      confirmLabel: 'Transfer',
      confirmType: 'primary',
      onConfirm: () => {
        socket.emit('banker_transfer', { fromId: fid, toId: tid, amount: amt })
        setTransferAmt('')
        showToast(`Transferred ${fmt(amt)} from ${fromP?.name} to ${toP?.name}`, 'success')
        setConfirm(null)
      }
    })
  }



  const openPartyModal = (type) => {
    setPartyType(type)
    setPartyLander(pid(players[0]) || '')
    setShowParty(true)
  }

  const confirmParty = () => {
    if (!partyLander) { showToast('Select a player', 'error'); return }
    const lander = players.find(p => pid(p) === partyLander)
    const eventName = partyType === 'party' ? 'Party House' : 'Resort'
    setShowParty(false)
    setConfirm({
      title: `${eventName} — Confirm`,
      message: partyType === 'party'
        ? `${lander?.name} receives $200 from all other players?`
        : `${lander?.name} pays $200 to all other players?`,
      subMessage: `This will affect all ${players.length} players.`,
      confirmLabel: `Yes, ${eventName}`,
      confirmType: partyType === 'party' ? 'success' : 'danger',
      onConfirm: () => {
        socket.emit(partyType === 'party' ? 'party_house' : 'resort', { landerId: partyLander })
        showToast(`${eventName} done!`, 'success')
        setConfirm(null)
      }
    })
  }

  const ctrl = controlPlayer || pid(players[0])

  const copyCode = () => {
    navigator.clipboard.writeText(myInfo.roomCode).then(() => showToast('Room code copied!', 'success'))
  }

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
              onClick={() => setConfirm({
                title: 'End Game',
                message: 'End the game and show final results to all players?',
                subMessage: 'This action cannot be undone.',
                confirmLabel: 'End Game',
                confirmType: 'danger',
                onConfirm: () => { socket.emit('end_game'); setConfirm(null) }
              })}
            >
              <i className="ti ti-flag" /> End Game
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => setConfirm({
                title: 'Leave Game',
                message: 'Leave the game? This will end the game for all players.',
                confirmLabel: 'Leave & End',
                confirmType: 'danger',
                onConfirm: () => { setConfirm(null); onLeave() }
              })}
            >
              <i className="ti ti-logout" /> Leave
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        {/* Stats — removed round count */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card p-4 text-center">
            <div className="text-2xl font-semibold">{players.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">Players</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xl font-semibold text-brand-600">${totalMoney.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-0.5">Total Money</div>
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
                  <select className="input" value={actionPlayer || ALL_PLAYERS} onChange={e => setActionPlayer(e.target.value)}>
                    <option value={ALL_PLAYERS}>⚡ All Players ({players.length})</option>
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
                  onClick={() => {
                    const p = players.find(pl => pid(pl) === ctrl)
                    setConfirm({
                      title: 'Send to Jail',
                      message: `Send ${p?.name} to jail?`,
                      confirmLabel: 'Send to Jail',
                      confirmType: 'danger',
                      onConfirm: () => { socket.emit('set_jail', { playerId: ctrl, jail: true }); showToast(`${p?.name} sent to jail`, 'info'); setConfirm(null) }
                    })
                  }}>
                  <i className="ti ti-lock" /> Send to Jail
                </button>
                <button className="btn btn-sm btn-success"
                  onClick={() => {
                    const p = players.find(pl => pid(pl) === ctrl)
                    setConfirm({
                      title: 'Release from Jail',
                      message: `Release ${p?.name} from jail?`,
                      confirmLabel: 'Release',
                      confirmType: 'success',
                      onConfirm: () => { socket.emit('set_jail', { playerId: ctrl, jail: false }); showToast(`${p?.name} released`, 'success'); setConfirm(null) }
                    })
                  }}>
                  <i className="ti ti-lock-open" /> Release Jail
                </button>
                <button className="btn btn-sm btn-danger"
                  onClick={() => {
                    const p = players.find(pl => pid(pl) === ctrl)
                    setConfirm({
                      title: 'Suspend Passport',
                      message: `Suspend ${p?.name}'s passport?`,
                      confirmLabel: 'Suspend',
                      confirmType: 'danger',
                      onConfirm: () => { socket.emit('set_passport', { playerId: ctrl, passport: false }); showToast(`${p?.name}'s passport suspended`, 'info'); setConfirm(null) }
                    })
                  }}>
                  <i className="ti ti-id-badge-off" /> Suspend Passport
                </button>
                <button className="btn btn-sm btn-success"
                  onClick={() => {
                    const p = players.find(pl => pid(pl) === ctrl)
                    setConfirm({
                      title: 'Restore Passport',
                      message: `Restore ${p?.name}'s passport?`,
                      confirmLabel: 'Restore',
                      confirmType: 'success',
                      onConfirm: () => { socket.emit('set_passport', { playerId: ctrl, passport: true }); showToast(`${p?.name}'s passport restored`, 'success'); setConfirm(null) }
                    })
                  }}>
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

      {/* Custom confirmation modal */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          subMessage={confirm.subMessage}
          confirmLabel={confirm.confirmLabel}
          confirmType={confirm.confirmType}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
