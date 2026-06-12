export default function EndGameScreen({ players, startMoney, onNewGame }) {
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-2xl font-semibold">Game Over!</h1>
          {players?.[0] && (
            <p className="text-sm text-gray-500 mt-1">
              Winner:{' '}
              <span className="font-semibold text-brand-600">{players[0].name}</span>
            </p>
          )}
        </div>

        <div className="space-y-0 mb-6">
          {(players || []).map((p, i) => {
            // netWorth comes from the server; fall back to computing it client-side
            const ccDebt    = p.ccDebt ?? (p.cc?.remaining || 0) * 2000
            const netWorth  = p.netWorth ?? (p.balance - ccDebt)
            const delta     = startMoney != null ? netWorth - startMoney : null
            const positive  = delta != null && delta >= 0
            const deltaStr  = delta != null
              ? (positive ? '+' : '') + '$' + Math.abs(delta).toLocaleString()
              : null

            return (
              <div
                key={p.stableId || p.id}
                className={`py-3 border-b border-gray-100 last:border-0 ${
                  i === 0 ? 'bg-amber-50 -mx-5 px-5 rounded-lg' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl w-8 text-center">
                      {medals[i] || `${i + 1}.`}
                    </span>
                    <div>
                      <span className={`text-sm ${i === 0 ? 'font-semibold' : ''}`}>
                        {p.name}
                      </span>
                      {deltaStr && (
                        <p className={`text-xs mt-0.5 font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
                          {deltaStr} vs start
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${i === 0 ? 'text-brand-600 text-base' : 'text-sm text-gray-600'}`}>
                      ${netWorth.toLocaleString()}
                    </p>
                    {ccDebt > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        ${p.balance.toLocaleString()} − <span className="text-red-400">${ccDebt.toLocaleString()} CC debt</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {(!players || players.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">No results available</p>
          )}
        </div>

        {(players || []).some(p => (p.ccDebt ?? (p.cc?.remaining || 0) * 2000) > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-amber-700">
              <i className="ti ti-info-circle mr-1" />
              Final score = wallet balance minus any unpaid CC debt.
            </p>
          </div>
        )}

        <button className="btn btn-primary w-full justify-center" onClick={onNewGame}>
          <i className="ti ti-refresh" /> New Game
        </button>
      </div>
    </div>
  )
}
