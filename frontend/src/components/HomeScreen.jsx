export default function HomeScreen({ onCreateGame, onJoinGame }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💳</div>
          <h1 className="text-2xl font-semibold text-gray-900">IB Digital Banker</h1>
          <p className="text-sm text-gray-500 mt-1">International Business — Digital Money Manager</p>
        </div>

        <div className="space-y-3">
          <button className="btn btn-primary w-full justify-center py-3" onClick={onCreateGame}>
            <i className="ti ti-crown text-base" />
            Create Game
            <span className="text-white/70 text-xs ml-1">(Banker)</span>
          </button>
          <button className="btn w-full justify-center py-3" onClick={onJoinGame}>
            <i className="ti ti-user text-base" />
            Join Game
            <span className="text-gray-400 text-xs ml-1">(Player)</span>
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          Real-time multiplayer · No paper money needed
        </p>
      </div>
    </div>
  )
}
