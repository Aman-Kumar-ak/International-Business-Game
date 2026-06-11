import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port:       5173,
    host:       '0.0.0.0',   // allow LAN access — phones on same WiFi can open http://192.168.x.x:5173
    strictPort: false,
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
  build: {
    outDir:   'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom'],
          socketio: ['socket.io-client'],
        },
      },
    },
  },
})
