import { useEffect, useRef, useState } from 'react'
import socket from '../socket'
import ConfirmModal from './ConfirmModal'
import { fmt, formatTimer } from '../utils'

function haptic(ms = 80) {
  try {
    if (localStorage.getItem('ib_vibration') !== 'off') navigator.vibrate?.(ms)
  } catch (_) {}
}

// ── Animated balance counter ──────────────────────────────────────────────────
// Counts from the previous value to the new one over ~600ms.
function useAnimatedBalance(target) {
  const [display, setDisplay] = useState(target)
  const prevRef  = useRef(target)
  const rafRef   = useRef(null)

  useEffect(() => {
    const start = prevRef.current
    const end   = target
    if (start === end) return

    prevRef.current = end

    const duration = 600
    const startTime = performance.now()

    const tick = (now) => {
      const elapsed  = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.round(start + (end - start) * eased)
      setDisplay(value)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target])

  return display
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

function QuickAmounts({ onSelect }) {
  const amounts = [200, 500, 1000, 2000, 5000]
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {amounts.map(a => (
        <button
          key={a}
          type="button"
          className="btn btn-sm btn-outline text-xs px-2 py-1"
          onClick={() => onSelect(String(a))}
        >
          ${a.toLocaleString()}
        </button>
      ))}
    </div>
  )
}

export default function PlayerDashboard({ gameState, myInfo, showToast, onLeave, onConnectionFailed }) {
  const [tab, setTab] = useState('send')
  const [sendTo, setSendTo] = useState('bank')
  const [sendAmt, setSendAmt] = useState('')
  const [now, setNow] = useState(Date.now())
  const [connectingTooLong, setConnectingTooLong] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const lastSeenTxId = useRef(null)
  const [vibrationOn, setVibrationOn] = useState(() => localStorage.getItem('ib_vibration') !== 'off')

  // ── Determine live balance for animation target ────────────────────────────
  const stableId  = myInfo?.stableId
  const me        = gameState?.players?.find(p => p.stableId === stableId || p.id === stableId)
  const liveBalance = me?.balance ?? 0
  const animatedBalance = useAnimatedBalance(liveBalance)

  // ── Flash colour on balance change ────────────────────────────────────────
  const prevBalanceRef  = useRef(liveBalance)
  const [flashClass, setFlashClass] = useState('')
  useEffect(() => {
    if (!me) return
    const prev = prevBalanceRef.current
    if (prev === liveBalance) return
    prevBalanceRef.current = liveBalance
    const gained = liveBalance > prev
    setFlashClass(gained ? 'balance-flash-green' : 'balance-flash-red')
    const t = setTimeout(() => setFlashClass(''), 900)
    return () => clearTimeout(t)
  }, [liveBalance, me])

  const toggleVibration = () => {
    const next = !vibrationOn
    setVibrationOn(next)
    localStorage.setItem('ib_vibration', next ? 'on' : 'off')
    if (next) navigator.vibrate?.(60)
  }

  useEffect(() => {
    if (!gameState?.endsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [gameState?.endsAt])

  // Haptic on money received
  useEffect(() => {
    const onNotif = ({ message, type }) => {
      if (type === 'success' && (
        message.includes('credited') ||
        message.includes('Received') ||
        message.includes('received')
      )) {
        haptic(80)
      }
    }
    socket.on('notification', onNotif)
    return () => socket.off('notification', onNotif)
  }, [])

  useEffect(() => {
    if (!gameState) return
    const found = gameState.players?.find(p => p.stableId === stableId || p.id === stableId)
    if (found) { setConnectingTooLong(false); return }
    const t = setTimeout(() => setConnectingTooLong(true), 10000)
    return () => clearTimeout(t)
  }, [gameState, stableId])

  if (!gameState) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  }

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
  const timerMs = gameState.endsAt ? Math.max(0, new Date(gameState.endsAt).getTime() - now) : Infinity
  const timerColor = timerMs < 60000 ? 'text-red-500' : timerMs < 300000 ? 'text-amber-500' : 'text-gray-400'
  const allSorted = (gameState.players?.filter(p => !p.pending) || []).slice().sort((a, b) => b.balance - a.balance)
  const myRank = allSorted.findIndex(p => p.stableId === stableId || p.id === stableId) + 1
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
      {/* Keyframes injected once */}
      <style>{`
        @keyframes balanceFlashGreen {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          50%  { box-shadow: 0 0 0 12px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        @keyframes balanceFlashRed {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%  { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        .balance-flash-green { animation: balanceFlashGreen 0.9s ease-out; }
        .balance-flash-red   { animation: balanceFlashRed   0.9s ease-out; }
      `}</style>

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-lg mx-auto">
          {/* Row 1: Name/room info (left) + action buttons (right) — fixed positions */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">Hi, {me.name}!</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-xs text-gray-400 whitespace-nowrap">
                  {gameState.roomName} · <span className={timerColor + ' font-medium'}>{timerLabel}</span>
                </p>
                {myInfo?.roomCode && (
                  <span
                    className="cursor-pointer group badge badge-blue text-xs px-2 py-0.5 font-mono whitespace-nowrap"
                    onClick={copyCode}
                    title="Click to copy room code"
                  >
                    <i className="ti ti-copy text-xs" /> {myInfo.roomCode}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                className="btn btn-sm btn-outline"
                onClick={toggleVibration}
                title={vibrationOn ? 'Vibration On (tap to disable)' : 'Vibration Off (tap to enable)'}
              >
                <i className={`ti ${vibrationOn ? 'ti-device-mobile-vibration' : 'ti-device-mobile-off'}`} />
              </button>
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

          {/* Row 2: Status badges — wraps independently, never affects button positions */}
          {(me.jail || !me.passport || (me.cc?.used && me.cc?.remaining > 0)) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {me.jail && <span className="badge badge-red">In Jail</span>}
              {!me.passport && <span className="badge badge-amber">Passport Suspended</span>}
              {me.cc?.used && me.cc?.remaining > 0 && (
                <span className="badge badge-blue">CC: {me.cc.remaining} left</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Balance card — animated */}
        <div className={`bg-brand-600 text-white rounded-2xl p-6 mb-4 text-center shadow-sm transition-all ${flashClass}`}>
          <p className="text-sm text-white/70 mb-1">Your Balance</p>
          <p className="text-4xl font-semibold tabular-nums">${animatedBalance.toLocaleString()}</p>
          <p className="text-sm text-white/60 mt-1">
            {gameState.roomName}
            {myRank > 0 && allSorted.length > 1 && (
              <span className="ml-2 opacity-80">· #{myRank} of {allSorted.length}</span>
            )}
          </p>
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
                        {p.name} (${p.balance.toLocaleString()}){!p.online ? ' 🔴' : ''}
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
                  <QuickAmounts onSelect={setSendAmt} />
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

        {/* History */}
        {tab === 'history' && (
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
              Your Transactions
            </p>
            {myHistory.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No transactions yet</p>
            )}
            {myHistory.map((tx, idx) => {
              const color  = txColorClass(tx, stableId)
              const label  = txLabel(tx, stableId)
              const sign   = txSign(tx, stableId)
              const isNew  = idx === 0 && lastSeenTxId.current && tx.id !== lastSeenTxId.current
              if (idx === 0) lastSeenTxId.current = tx.id
              return (
                <div
                  key={tx.id}
                  className={`flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 transition-colors duration-1000 ${isNew ? 'bg-green-50 rounded-lg px-2' : ''}`}
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
