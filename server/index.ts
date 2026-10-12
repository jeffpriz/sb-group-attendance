import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { Auth } from './auth.ts'
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

/**
 * SITE_PASSWORD: the shared password for the whole site (read at startup, so
 * it can be changed with a restart, no rebuild). Required when
 * NODE_ENV=production: the server refuses to start without it (fail closed).
 * In development it is optional, and the site is open with a warning.
 * SESSION_SECRET: optional key for signing session cookies. Without it a
 * random key is used, so restarting the server signs everyone out.
 * SESSION_TTL_MINUTES: optional, 1–60 (default 60). Never longer than an hour.
 * COOKIE_SECURE: 'auto' (default, Secure when the request came over HTTPS),
 * 'true' or 'false'.
 */
const isProduction = process.env.NODE_ENV === 'production'
const sitePassword = process.env.SITE_PASSWORD ?? ''
let auth: Auth | 'disabled'
if (!sitePassword) {
  if (isProduction) {
    console.error('ERROR: SITE_PASSWORD is not set. Refusing to start without a site password (NODE_ENV=production).')
    console.error('Set SITE_PASSWORD (for example from an Azure Container Apps secret).')
    process.exit(1)
  }
  console.warn('WARNING: SITE_PASSWORD is not set, so the site is OPEN with no password (development only).')
  console.warn('         Set SITE_PASSWORD in .env to try the sign-in page.')
  auth = 'disabled'
} else {
  const ttlText = process.env.SESSION_TTL_MINUTES?.trim()
  const ttlMinutes = ttlText ? Number(ttlText) : 60
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    console.error(`Invalid SESSION_TTL_MINUTES "${ttlText}" (use 1–60)`)
    process.exit(1)
  }
  if (ttlMinutes > 60) console.warn('SESSION_TTL_MINUTES is capped at 60 minutes.')
  const secureText = (process.env.COOKIE_SECURE ?? 'auto').trim().toLowerCase()
  const secureCookie = secureText === 'true' ? true : secureText === 'false' ? false : 'auto'
  const secret = process.env.SESSION_SECRET?.trim() || undefined
  auth = new Auth({ password: sitePassword, secret, ttlMinutes, secureCookie })
  if (!secret) console.log('SESSION_SECRET not set: using a random signing key (restarting signs everyone out).')
  console.log(`Site password required. Sessions last ${auth.ttlSeconds / 60} minutes.`)
}

const store = new GroupStore(dataDir)
try {
  await store.init()
} catch (err) {
  console.error(`ERROR: ${(err as Error).message}`)
  console.error('Set DATA_DIR to a folder this process can write to (and check mount permissions).')
  process.exit(1)
}

const app = createApp({ store, staticDir, auth })
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
