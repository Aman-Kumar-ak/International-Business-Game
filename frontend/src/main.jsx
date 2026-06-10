import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Note: StrictMode intentionally omitted — it double-invokes effects in dev,
// which causes duplicate socket.on registrations that are hard to debug.
// Use the React DevTools Profiler for performance analysis instead.
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
