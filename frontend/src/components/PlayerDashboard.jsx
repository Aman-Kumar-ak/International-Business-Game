import { useEffect, useState } from 'react'
import socket from '../socket'
import ConfirmModal from './ConfirmModal'

function fmt(n) { return '$' + Math.abs(n).toLocaleString() }

function formatTimer(endsAt, now) {
  if (!endsAt) return '--:--'
  const ms = Math.max(0, new Date(endsAt).getTime() - now)
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function txColorClass(tx, myStableId) {
  if (tx.flowType === 'from_bank') return 'text-green-600'
  if (tx.flowType === 'to_bank')   return 'text-red-500'
  if (tx.toId === myStableId)      return 'text-green-600'
  return 'text-red-500'
}

function txLabel(tx, myStableId) {
  if (tx.flowType === 'from_bank') return `Credited by Bank`
  if (tx.flowType === 'to_bank')   return `Paid to Bank`
  if (tx.toId === myStableId)      return `Received from ${tx.fromName}`
  return `Sent to ${tx.toName}`
}

function txSign(tx, myStableId) {
  const incoming = tx.flowType === 'from_bank' || tx.toId === myStableId
  return incoming ? '+' : '-'
}

export default function PlayerDashboard({ gameState, myInfo, showToast, onLeave, onConnectionFailed }) {
  const [tab, setTab] = useState('send')
  const [sendTo, setSendTo] = useState('bank')
  const [sendAmt, setSendAmt] = useState('')
  const [now, setNow] = useState(Date.now())
  const [connectingTooLong, setConnectingTooLong] = useState(false)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    if (!gameState?.endsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [gameState?.endsAt])

  useEffect(() => {
    if (!gameState) return
    const stableId = myInfo?.stableId
    const me = gameState.players?.find(p => p.stableId === stableId || p.id === stableId)
    if (me) { setConnectingTooLong(false); return }
    const t = setTimeout(() => setConnectingTooLong(true), 10000)
    return () => clearTimeout(t)
  }, [gameState, myInfo])

  if (!gameState) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  }

  const stableId = myInfo?.stableId
  const me = gameState.players?.find(p => p.stableId === stableId || p.id === stableId)

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-lg text-gray-500 mb-2">Connecting…</div>
          <div className="text-sm text-gray-400 mb-4">Waiting for server sync</div>
          {connectingTooLong && (
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-4">Still stuck? Go back home.</p>
              <button className="btn btn-primary" onClick={onConnectionFailed}>
                <i className="ti ti-home" /> Go to Home
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const others = gameState.players?.filter(p =>
    (p.stableId !== stableId && p.id !== stableId) && !p.pending
  ) || []
  const timerLabel = formatTimer(gameState.endsAt, now)
  const myHistory = gameState.myHistory || me.history || []

  const doSend = () => {
    const amt = parseInt(sendAmt)
    if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return }

    if (sendTo === 'all_players') {
      const count = others.length
      if (count === 0) { showToast('No other players', 'error'); return }
      const total = amt * count
      setConfirm({
        title: 'Send to All Players',
        message: `Send ${fmt(amt)} to each of ${count} player${count > 1 ? 's' : ''}?`,
        subMessage: `Total: ${fmt(total)} · Your balance after: ${fmt(me.balance - total)}`,
        confirmLabel: 'Send to All',
        confirmType: 'primary',
        onConfirm: () => {
          socket.emit('player_send_all', { amount: amt })
          setSendAmt('')
          setConfirm(null)
        }
      })
      return
    }

    const recipientName = sendTo === 'bank'
      ? 'Bank'
      : others.find(p => (p.stableId || p.id) === sendTo)?.name || 'Player'
    setConfirm({
      title: 'Send Money',
      message: `Send ${fmt(amt)} to ${recipientName}?`,
      subMessage: `Your balance after: ${fmt(me.balance - amt)}`,
      confirmLabel: 'Send',
      confirmType: 'primary',
      onConfirm: () => {
        socket.emit('player_send', { toId: sendTo, amount: amt })
        setSendAmt('')
        setConfirm(null)
      }
    })
  }

  const takeCC = () => {
    if (me.cc?.used) { showToast('Credit card already used', 'error'); return }
    setConfirm({
      title: 'Take Credit Card Loan',
      message: 'Borrow $10,000 from the bank?',
      subMessage: 'You must repay $2,000 × 6 times = $12,000 total.',
      confirmLabel: 'Take Loan',
      confirmType: 'warning',
      onConfirm: () => {
        socket.emit('take_cc')
        setConfirm(null)
      }
    })
  }

  const repayCC = () => {
    if (me.balance < 2000) { showToast('Not enough balance', 'error'); return }
    setConfirm({
      title: 'Repay Instalment',
      message: `Pay $2,000 instalment to the bank?`,
      subMessage: `${me.cc?.remaining - 1} payments remaining after this.`,
      confirmLabel: 'Pay $2,000',
      confirmType: 'primary',
      onConfirm: () => {
        socket.emit('repay_cc')
        setConfirm(null)
      }
    })
  }

  const payJail = (method) => {
    if (!me.jail) { showToast("You're not in jail", 'error'); return }
    const cost = method === 'cash' ? '$500' : '$3,000 (credit card)'
    setConfirm({
      title: 'Pay Jail Fine',
      message: `Pay ${cost} to get out of jail?`,
      confirmLabel: 'Pay Fine',
      confirmType: 'danger',
      onConfirm: () => {
        socket.emit('pay_jail_fine', { method })
        setConfirm(null)
      }
    })
  }

  const copyCode = () => {
    navigator.clipboard.writeText(myInfo?.roomCode).then(() => showToast('Room code copied!', 'success'))
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto gap-2 flex-wrap">
          <div>
            <h1 className="text-base font-semibold">Hi, {me.name}!</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-gray-400">{gameState.roomName} · {timerLabel}</p>
              {myInfo?.roomCode && (
                <span
                  className="cursor-pointer group badge badge-blue text-xs px-2 py-0.5 font-mono"
                  onClick={copyCode}
                  title="Click to copy room code"
                >
                  <i className="ti ti-copy text-xs" /> {myInfo.roomCode}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {me.jail && <span className="badge badge-red">In Jail</span>}
            {!me.passport && <span className="badge badge-amber">Passport Suspended</span>}
            {me.cc?.used && me.cc?.remaining > 0 && (
              <span className="badge badge-blue">CC: {me.cc.remaining} left</span>
            )}
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => setConfirm({
                title: 'Leave Game',
                message: 'Leave the game?',
                subMessage: 'Your transaction history will be preserved.',
                confirmLabel: 'Leave',
                confirmType: 'danger',
                onConfirm: () => { setConfirm(null); onLeave() }
              })}
            >
              <i className="ti ti-logout" /> Leave
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Balance card */}
        <div className="bg-brand-600 text-white rounded-2xl p-6 mb-4 text-center shadow-sm">
          <p className="text-sm text-white/70 mb-1">Your Balance</p>
          <p className="text-4xl font-semibold">${me.balance.toLocaleString()}</p>
          <p className="text-sm text-white/60 mt-1">{gameState.roomName}</p>
        </div>

        {/* Other players */}
        {others.length > 0 && (
          <div className="card mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Other Players</p>
            {others.map(p => (
              <div
                key={p.stableId || p.id}
                className={`flex items-center justify-between py-2 border-b border-gray-50 last:border-0 ${!p.online ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${!p.online ? 'text-gray-400' : ''}`}>
                    {p.name}
                    {!p.online && <span className="text-xs text-gray-400 ml-1">🔴 Offline</span>}
                  </span>
                  {p.jail && <span className="badge badge-red text-xs">Jail</span>}
                  {!p.passport && <span className="badge badge-amber text-xs">No Passport</span>}
                </div>
                <span className={`text-sm font-semibold ${!p.online ? 'text-gray-400' : 'text-brand-600'}`}>
                  ${p.balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          {[
            { id: 'send',    label: 'Send Money' },
            { id: 'cc',      label: 'Credit Card' },
            { id: 'history', label: `History (${myHistory.length})` },
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

        {/* Send Money */}
        {tab === 'send' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="text-sm font-semibold mb-4">Send Money</h3>
              <div className="space-y-3">
                <div>
                  <label className="label">To</label>
                  <select className="input" value={sendTo} onChange={e => setSendTo(e.target.value)}>
                    <option value="bank">Bank (Penalties / Taxes / Fees)</option>
                    {others.length > 1 && (
                      <option value="all_players">⚡ All Players (×{others.length})</option>
                    )}
                    {others.map(p => (
                      <option key={p.stableId || p.id} value={p.stableId || p.id}>
                        {p.name} (${p.balance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Amount</label>
                  <input
                    className="input"
                    type="number"
                    placeholder="0"
                    value={sendAmt}
                    onChange={e => setSendAmt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSend()}
                  />
                </div>
                <button className="btn btn-primary w-full justify-center" onClick={doSend}>
                  <i className="ti ti-send" /> Send
                </button>
              </div>
            </div>

            {me.jail && (
              <div className="card border-red-100">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ti ti-lock text-red-700" />
                  <h3 className="text-sm font-semibold text-red-700">You're in Jail</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-sm btn-danger" onClick={() => payJail('cash')}>
                    <i className="ti ti-cash" /> Pay $500 Fine
                  </button>
                  {me.cc?.used && me.cc?.remaining > 0 && (
                    <button className="btn btn-sm btn-danger" onClick={() => payJail('cc')}>
                      <i className="ti ti-credit-card" /> Pay $3,000 via Credit Card
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">Or roll 12 on the board for free release</p>
              </div>
            )}
          </div>
        )}

        {/* Credit Card */}
        {tab === 'cc' && (
          <div className="space-y-4">
            {!me.cc?.used && (
              <div className="card">
                <div className="bg-gradient-to-br from-brand-600 to-brand-800 text-white rounded-xl p-5 mb-4">
                  <p className="text-sm text-white/70">Credit Card</p>
                  <p className="text-2xl font-semibold mt-1">$10,000 Available</p>
                  <p className="text-xs text-white/60 mt-1">Repay $2,000 × 6 = $12,000 total</p>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Take a one-time $10,000 loan from the bank. You must repay $2,000 six times.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-amber-700 font-medium">⚠️ This action requires confirmation</p>
                  <p className="text-xs text-amber-600 mt-0.5">You'll owe $12,000 total — $2,000 more than you receive.</p>
                </div>
                <button className="btn btn-primary w-full justify-center" onClick={takeCC}>
                  <i className="ti ti-credit-card" /> Take Credit Card Loan
                </button>
              </div>
            )}

            {me.cc?.used && me.cc?.remaining > 0 && (
              <div className="card">
                <div className="bg-gradient-to-br from-amber-500 to-amber-700 text-white rounded-xl p-5 mb-4">
                  <p className="text-sm text-white/70">Credit Card — Active</p>
                  <p className="text-2xl font-semibold mt-1">{me.cc.remaining} payments left</p>
                  <p className="text-xs text-white/60 mt-1">${(me.cc.remaining * 2000).toLocaleString()} remaining</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Remaining instalments</span>
                    <span className="font-medium">{me.cc.remaining} × $2,000</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total still owed</span>
                    <span className="font-medium">${(me.cc.remaining * 2000).toLocaleString()}</span>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={repayCC}>
                  <i className="ti ti-cash" /> Pay $2,000 Instalment
                </button>
              </div>
            )}

            {me.cc?.used && me.cc?.remaining === 0 && (
              <div className="card text-center py-8">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-semibold text-green-700">Credit Card Cleared!</p>
                <p className="text-sm text-gray-400 mt-1">All 6 payments completed</p>
              </div>
            )}
          </div>
        )}

        {/* History — only THIS player's transactions */}
        {tab === 'history' && (
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
              Your Transactions
            </p>
            {myHistory.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No transactions yet</p>
            )}
            {myHistory.map(tx => {
              const color  = txColorClass(tx, stableId)
              const label  = txLabel(tx, stableId)
              const sign   = txSign(tx, stableId)
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
                >
                  <div>
                    <p className="text-sm">{label}</p>
                    <p className="text-xs text-gray-300">{tx.time}</p>
                  </div>
                  <span className={`text-sm font-semibold ${color}`}>
                    {sign}{fmt(tx.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
