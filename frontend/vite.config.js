import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em desenvolvimento o Vite e a API correm no mesmo contentor: /api e /photos vão para localhost:3000
const API_TARGET = process.env.API_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: process.env.CHOKIDAR_USEPOLLING ? { usePolling: true } : undefined,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/photos': { target: API_TARGET, changeOrigin: true }
    }
  }
})
