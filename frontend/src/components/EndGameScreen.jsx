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
            const delta    = startMoney != null ? p.balance - startMoney : null
            const positive = delta != null && delta >= 0
            const deltaStr = delta != null
              ? (positive ? '+' : '') + '$' + Math.abs(delta).toLocaleString()
              : null

            return (
              <div
                key={p.stableId || p.id}
                className={`flex items-center justify-between py-3 border-b border-gray-100 last:border-0 ${
                  i === 0 ? 'bg-amber-50 -mx-5 px-5 rounded-lg' : ''
                }`}
              >
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
                <span
                  className={`font-semibold ${
                    i === 0 ? 'text-brand-600 text-base' : 'text-sm text-gray-600'
                  }`}
                >
                  ${p.balance.toLocaleString()}
                </span>
              </div>
            )
          })}

          {(!players || players.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">No results available</p>
          )}
        </div>

        <button className="btn btn-primary w-full justify-center" onClick={onNewGame}>
          <i className="ti ti-refresh" /> New Game
        </button>
      </div>
    </div>
  )
}
