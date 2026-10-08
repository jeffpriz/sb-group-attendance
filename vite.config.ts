import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiPort = process.env.PORT ?? '3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The Express API (server/index.ts) runs alongside Vite during `npm run dev`.
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
})
