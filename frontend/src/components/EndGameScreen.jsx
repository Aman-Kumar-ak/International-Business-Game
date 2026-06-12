const COLORS = ['#185FA5','#639922','#A32D2D','#854F0B','#533AB7','#0F6E56','#993556','#5F5E5A']

function initials(name) {
  return name?.slice(0, 2).toUpperCase() || '??'
}

export default function EndGameScreen({ players, startMoney, onNewGame }) {
  const ranked = (players || []).map((p, i) => {
    const ccDebt   = p.ccDebt ?? (p.cc?.remaining || 0) * 2000
    const netWorth = p.netWorth ?? (p.balance - ccDebt)
    const delta    = startMoney != null ? netWorth - startMoney : null
    return { ...p, ccDebt, netWorth, delta, rank: i + 1 }
  })

  const winner = ranked[0]
  const rest   = ranked.slice(1)
  const anyCC  = ranked.some(p => p.ccDebt > 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-800 via-brand-600 to-brand-400 flex flex-col items-center justify-center p-4 sm:p-8">

      {/* Trophy + Winner hero */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="relative inline-block mb-4">
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-full bg-yellow-400/30 blur-xl scale-150" />
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 flex items-center justify-center shadow-2xl">
            <span className="text-4xl sm:text-5xl">🏆</span>
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Game Over!</h1>
        {winner && (
          <p className="text-white/70 mt-1 text-sm sm:text-base">
            Winner: <span className="text-yellow-300 font-semibold">{winner.name}</span>
          </p>
        )}
      </div>

      {/* Leaderboard card */}
      <div className="w-full max-w-md sm:max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Winner row — elevated */}
        {winner && (
          <div className="bg-gradient-to-r from-yellow-400 to-amber-400 px-5 sm:px-6 py-4 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl flex-shrink-0">🥇</span>
                <div
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm sm:text-base font-bold text-white flex-shrink-0 shadow-md"
                  style={{ background: COLORS[0] }}
                >
                  {initials(winner.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-base sm:text-lg truncate">{winner.name}</p>
                  {winner.delta != null && (
                    <p className={`text-xs sm:text-sm font-medium ${winner.delta >= 0 ? 'text-yellow-900/70' : 'text-red-700'}`}>
                      {winner.delta >= 0 ? '+' : ''}${Math.abs(winner.delta).toLocaleString()} vs start
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">
                  ${winner.netWorth.toLocaleString()}
                </p>
                {winner.ccDebt > 0 && (
                  <p className="text-xs text-yellow-900/60 mt-0.5 tabular-nums">
                    ${winner.balance.toLocaleString()} − <span className="text-red-700">${winner.ccDebt.toLocaleString()}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rest of the rankings */}
        <div className="divide-y divide-gray-100">
          {rest.map((p, i) => {
            const medal  = ['🥈', '🥉'][i]
            const color  = COLORS[(i + 1) % COLORS.length]
            const isLast = i === rest.length - 1

            return (
              <div
                key={p.stableId || p.id}
                className={`flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 sm:py-4 ${isLast ? '' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl w-7 text-center flex-shrink-0">
                    {medal || <span className="text-sm font-semibold text-gray-400">#{p.rank}</span>}
                  </span>
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold text-white flex-shrink-0"
                    style={{ background: color + '22', color }}
                  >
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-medium text-gray-800 truncate">{p.name}</p>
                    {p.delta != null && (
                      <p className={`text-xs font-medium ${p.delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {p.delta >= 0 ? '+' : ''}${Math.abs(p.delta).toLocaleString()} vs start
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm sm:text-base font-semibold text-gray-700 tabular-nums">
                    ${p.netWorth.toLocaleString()}
                  </p>
                  {p.ccDebt > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                      ${p.balance.toLocaleString()} − <span className="text-red-400">${p.ccDebt.toLocaleString()} debt</span>
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {ranked.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No results available</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4 space-y-3 border-t border-gray-100">
          {anyCC && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <i className="ti ti-info-circle text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">Final score = wallet balance minus unpaid CC debt.</p>
            </div>
          )}
          <button className="btn btn-primary w-full justify-center text-sm sm:text-base py-2.5" onClick={onNewGame}>
            <i className="ti ti-refresh" /> New Game
          </button>
        </div>
      </div>
    </div>
  )
}