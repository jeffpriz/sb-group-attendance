import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { GroupStore } from './storage.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

// Local development convenience: load settings from a `.env` file in the
// project folder if there is one. Variables already set in the real
// environment (Docker, Azure Container Apps, the shell) take precedence.
const envFile = path.join(projectRoot, '.env')
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
  console.log(`Loaded settings from ${envFile}`)
}

/**
 * DATA_DIR: where JSON files are saved. An absolute path is used as-is (e.g.
 * /data or a mounted file share); a relative path is resolved against the
 * current working directory. Defaults to the project's `data/` folder.
 */
const dataDir = process.env.DATA_DIR?.trim()
  ? path.resolve(process.env.DATA_DIR.trim())
  : path.join(projectRoot, 'data')
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST?.trim() || '0.0.0.0'
const staticDir = path.join(projectRoot, 'dist')

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid PORT "${process.env.PORT}"`)
  process.exit(1)
}

const store = new GroupStore(dataDir)
try {
  await store.init()
} catch (err) {
  console.error(`ERROR: ${(err as Error).message}`)
  console.error('Set DATA_DIR to a folder this process can write to (and check mount permissions).')
  process.exit(1)
}

const app = createApp({ store, staticDir })
const server = app.listen(port, host, () => {
  console.log(`SB Group Attendance server listening on http://${host}:${port}`)
  console.log(`Data folder: ${store.dataDir}${process.env.DATA_DIR?.trim() ? ' (from DATA_DIR)' : ''}`)
})
server.on('error', (err) => {
  console.error(`ERROR: could not start the server: ${err.message}`)
  process.exit(1)
})

// Stop cleanly on `docker stop` / Ctrl+C.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
