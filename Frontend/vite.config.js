import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174, // ✅ must match backend CORS (5174, 5175 allowed)
    strictPort: true, // fail if 5174 in use so we stay on allowed port
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000', // ✅ Flask backend
        changeOrigin: true,
        secure: false,
      },
      '/orders': {
        target: 'http://127.0.0.1:5000', // ✅ Flask backend
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000', // ✅ Flask-SocketIO backend
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxy
      },
    },
  },
})
