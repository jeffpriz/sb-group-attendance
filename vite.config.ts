import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read PORT from the shell or a local .env file so the dev proxy targets
  // the same port the API server (server/index.ts) listens on.
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = process.env.PORT || env.PORT || '3001'

  return {
    plugins: [react()],
    server: {
      // The Express API runs alongside Vite during `npm run dev`.
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
