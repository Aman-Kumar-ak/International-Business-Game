import { useState, useEffect, useRef, useCallback } from 'react'
import socket from '../socket'

// ── QR Scanner — uses jsqr (npm) + canvas, works on all browsers ──────────────
function QRScanner({ onScan, onClose }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const [status, setStatus]   = useState('starting') // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState('')

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      // Dynamically import jsqr so the rest of the app doesn't pay the cost
      let jsQR
      try {
        const mod = await import('jsqr')
        jsQR = mod.default
      } catch (e) {
        if (!cancelled) { setStatus('error'); setErrorMsg('Could not load QR library.') }
        return
      }
      if (cancelled) return

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('scanning')

        const tick = () => {
          if (cancelled) return
          const video  = videoRef.current
          const canvas = canvasRef.current
          if (!video || !canvas || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick); return
          }
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0)
          const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            let roomCode = code.data
            try {
              const url   = new URL(code.data)
              const param = url.searchParams.get('code')
              if (param) roomCode = param
            } catch (_) {}
            roomCode = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
            if (roomCode.length === 6) { stop(); onScan(roomCode); return }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)

      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg(
            e.name === 'NotAllowedError'
              ? 'Camera permission denied. Please allow camera access and try again.'
              : 'Could not open camera: ' + e.message
          )
        }
      }
    }

    start()
    return () => { cancelled = true; stop() }
  }, [onScan, stop])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ background: 'rgba(0,0,0,0.85)' }}>
        <span className="text-white font-semibold text-sm">Scan Room QR Code</span>
        <button className="text-white text-2xl leading-none p-1" onClick={() => { stop(); onClose() }}>
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Camera */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        {/* Viewfinder */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
            <div className="relative w-56 h-56" style={{ zIndex: 1 }}>
              {/* Clear cutout */}
              <div className="absolute inset-0 rounded-xl" style={{ background: 'transparent', boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
              {/* Corners */}
              {[
                { top:0,    left:0,    borderTop:'4px solid white', borderLeft:'4px solid white',   borderRadius:'8px 0 0 0' },
                { top:0,    right:0,   borderTop:'4px solid white', borderRight:'4px solid white',  borderRadius:'0 8px 0 0' },
                { bottom:0, left:0,    borderBottom:'4px solid white', borderLeft:'4px solid white',  borderRadius:'0 0 0 8px' },
                { bottom:0, right:0,   borderBottom:'4px solid white', borderRight:'4px solid white', borderRadius:'0 0 8px 0' },
              ].map((s, i) => <div key={i} className="absolute w-8 h-8" style={s} />)}
              {/* Scan line */}
              <div className="absolute left-2 right-2 h-0.5" style={{
                background: 'rgba(99,179,237,0.9)',
                top: '50%',
                animation: 'scanline 2s ease-in-out infinite'
              }} />
            </div>
          </div>
        )}

        {/* Starting */}
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="text-white text-sm text-center">
              <i className="ti ti-loader-2 text-3xl mb-2 block animate-spin" />
              Opening camera…
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div>
              <i className="ti ti-camera-off text-5xl text-red-400 mb-4 block" />
              <p className="text-white text-sm leading-relaxed">{errorMsg}</p>
              <button
                className="mt-5 px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={() => { stop(); onClose() }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center py-3 text-xs" style={{ background: 'rgba(0,0,0,0.85)', color: 'rgba(255,255,255,0.5)' }}>
        Point at the QR code shown on the banker's screen
      </div>

      <style>{`@keyframes scanline {
        0%   { transform:translateY(-80px); opacity:0.4; }
        50%  { opacity:1; }
        100% { transform:translateY(80px);  opacity:0.4; }
      }`}</style>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function JoinGameScreen({ onBack, showToast, setMyInfo, sessionId, prefillCode = '' }) {
  const [code, setCode]         = useState(prefillCode || '')
  const [name, setName]         = useState('')
  const [scanning, setScanning] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    if (prefillCode) {
      setCode(prefillCode)
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [prefillCode])

  const handleScan = useCallback((scannedCode) => {
    setCode(scannedCode)
    setScanning(false)
    showToast('QR code scanned!', 'success')
    setTimeout(() => nameRef.current?.focus(), 150)
  }, [showToast])

  const handleJoin = () => {
    if (!code.trim() || code.length < 6) { showToast('Enter the 6-character room code', 'error'); return }
    if (!name.trim()) { showToast('Enter your name', 'error'); return }
    const trimmedCode = code.trim().toUpperCase()
    const trimmedName = name.trim()
    setMyInfo(prev => ({ ...(prev || {}), isBanker: false, playerName: trimmedName, roomCode: trimmedCode, stableId: sessionId }))
    socket.emit('join_game', { roomCode: trimmedCode, playerName: trimmedName, sessionId })
  }

  return (
    <>
      {scanning && <QRScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-sm">
          <button className="btn btn-sm mb-5" onClick={onBack}>
            <i className="ti ti-arrow-left" /> Back
          </button>
          <h2 className="text-lg font-semibold mb-5">Join Game</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Room Code</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    className="input font-mono text-xl tracking-widest text-center uppercase w-full"
                    placeholder="A8X91B"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  />
                  {code.length === 6 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-xs font-medium">✓</span>
                  )}
                </div>
                <button
                  className="btn btn-outline px-3 flex-shrink-0 flex items-center gap-1.5"
                  onClick={() => setScanning(true)}
                  title="Scan QR code with camera"
                >
                  <i className="ti ti-qrcode text-lg" />
                  <span className="text-sm">Scan</span>
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Type the code or tap <strong>Scan</strong> to use your camera
              </p>
            </div>
            <div>
              <label className="label">Your Name</label>
              <input
                ref={nameRef}
                className="input"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
            </div>
            <button className="btn btn-primary w-full justify-center py-2.5" onClick={handleJoin}>
              <i className="ti ti-login" /> Join Game
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
