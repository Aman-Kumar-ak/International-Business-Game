export default function WaitingApprovalScreen({ myInfo, gameState, onLeave }) {
  const gameStarted = gameState?.started

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm text-center">
        <div className="text-4xl mb-4">{gameStarted ? '🔄' : '⏳'}</div>

        {gameStarted ? (
          <>
            <h2 className="text-lg font-semibold mb-1">Reconnecting…</h2>
            <p className="text-sm text-gray-500 mb-6">
              The game has started. You're being reconnected automatically.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-1">Waiting for Banker</h2>
            <p className="text-sm text-gray-500 mb-6">
              You'll be approved and added to the game automatically
            </p>
          </>
        )}

        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-xs text-gray-400 mb-1">You joined as</p>
          <p className="text-xl font-semibold">{myInfo?.playerName}</p>
          {myInfo?.roomName && <p className="text-xs text-gray-400 mt-1">{myInfo.roomName}</p>}
        </div>

        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
          <i className="ti ti-check mr-1" />
          {gameStarted
            ? 'You were in this game — reconnection in progress'
            : 'Request sent — waiting for banker to approve'}
        </div>

        <button
          className="btn btn-outline-danger w-full justify-center"
          onClick={() => { if (window.confirm('Leave game?')) onLeave() }}
        >
          <i className="ti ti-logout" /> Leave
        </button>
      </div>
    </div>
  )
}
