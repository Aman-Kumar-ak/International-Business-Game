import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port:       5173,
    host:       '0.0.0.0',  // allow LAN access during dev
    strictPort: false,
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
  build: {
    outDir:          'dist',
    sourcemap:       false,
    // Chunk size warning threshold (bytes) — raise if needed
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split vendor code from app code for better caching
        manualChunks: {
          vendor:        ['react', 'react-dom'],
          socketio:      ['socket.io-client'],
        },
      },
    },
  },
})
