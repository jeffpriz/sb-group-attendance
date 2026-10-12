import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express'

/**
 * Shared-password sign-in.
 *
 * The session is a stateless signed cookie: `v1.<issuedAt>.<expiresAt>.<signature>`
 * (times in Unix seconds, signature = HMAC-SHA256). Nothing is stored on the
 * server. Expiry is absolute: it is fixed when you sign in and never extended,
 * and it is never more than one hour.
 *
 * The signing key is derived from SESSION_SECRET (or random bytes chosen at
 * startup) AND from the site password, so changing SITE_PASSWORD signs
 * everyone out.
 */

export const SESSION_COOKIE = 'sb_session'
export const MAX_SESSION_SECONDS = 60 * 60

export interface AuthOptions {
  /** The shared site password. */
  password: string
  /** Secret for signing cookies. Random per process when omitted (restarting signs everyone out). */
  secret?: string
  /** Session length in minutes, 1–60. Default 60. */
  ttlMinutes?: number
  /** 'auto' (default): Secure cookie when the request arrived over HTTPS. */
  secureCookie?: boolean | 'auto'
  /** Failed sign-ins allowed per IP per window. Default 10 per 15 minutes. */
  maxAttempts?: number
  attemptWindowMs?: number
  /** Clock, for tests. Milliseconds. */
  now?: () => number
}

export interface SessionInfo {
  /** Whether a password is needed at all (false only when auth is disabled in development). */
  required: boolean
  authenticated: boolean
  /** ISO time the session ends. */
  expiresAt?: string
}

export class Auth {
  readonly ttlSeconds: number
  private readonly key: Buffer
  private readonly passwordHash: Buffer
  private readonly secureCookie: boolean | 'auto'
  private readonly maxAttempts: number
  private readonly attemptWindowMs: number
  private readonly now: () => number
  private readonly attempts = new Map<string, { count: number; resetAt: number }>()

  constructor(options: AuthOptions) {
    if (!options.password) throw new Error('A site password is required')
    const ttl = options.ttlMinutes ?? 60
    if (!Number.isFinite(ttl) || ttl <= 0) throw new Error('Session length must be a positive number of minutes')
    this.ttlSeconds = Math.min(Math.round(ttl * 60), MAX_SESSION_SECONDS)
    this.passwordHash = sha256(options.password)
    const secret = options.secret || randomBytes(32).toString('hex')
    this.key = createHmac('sha256', secret).update('sb-session-v1\0').update(this.passwordHash).digest()
    this.secureCookie = options.secureCookie ?? 'auto'
    this.maxAttempts = options.maxAttempts ?? 10
    this.attemptWindowMs = options.attemptWindowMs ?? 15 * 60 * 1000
    this.now = options.now ?? Date.now
  }

  /** Constant-time check (compares fixed-length hashes). */
  checkPassword(candidate: unknown): boolean {
    if (typeof candidate !== 'string') return false
    return timingSafeEqual(sha256(candidate), this.passwordHash)
  }

  createToken(): { token: string; expiresAt: number } {
    const issuedAt = Math.floor(this.now() / 1000)
    const expiresAt = issuedAt + this.ttlSeconds
    const payload = `v1.${issuedAt}.${expiresAt}`
    return { token: `${payload}.${this.sign(payload)}`, expiresAt }
  }

  /** Returns the expiry (Unix seconds) of a valid token, or undefined. */
  verifyToken(token: string | undefined): number | undefined {
    if (!token) return undefined
    const parts = token.split('.')
    if (parts.length !== 4 || parts[0] !== 'v1') return undefined
    const [, iatText, expText, signature] = parts
    if (!/^\d{1,12}$/.test(iatText) || !/^\d{1,12}$/.test(expText)) return undefined
    const expected = Buffer.from(this.sign(`v1.${iatText}.${expText}`))
    const given = Buffer.from(signature)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined
    const iat = Number(iatText)
    const exp = Number(expText)
    const nowSec = this.now() / 1000
    if (exp - iat > MAX_SESSION_SECONDS || exp <= iat) return undefined
    if (iat > nowSec + 60) return undefined // issued in the future (clock skew allowance 60s)
    if (nowSec >= exp) return undefined
    return exp
  }

  session(req: Request): SessionInfo {
    const exp = this.verifyToken(readCookie(req, SESSION_COOKIE))
    return exp === undefined
      ? { required: true, authenticated: false }
      : { required: true, authenticated: true, expiresAt: new Date(exp * 1000).toISOString() }
  }

  /** Middleware: 401 JSON unless the request has a valid session cookie. */
  readonly requireSession: RequestHandler = (req, res, next) => {
    if (this.verifyToken(readCookie(req, SESSION_COOKIE)) !== undefined) return next()
    res.status(401).json({ error: 'Please enter the site password.', code: 'auth_required' })
  }

  /** GET/POST/DELETE /session routes. */
  routes(router: Router) {
    router.get('/session', (req, res) => {
      res.set('Cache-Control', 'no-store').json(this.session(req))
    })

    router.post('/session', (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store')
      const ip = req.ip || 'unknown'
      const now = this.now()
      let entry = this.attempts.get(ip)
      if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + this.attemptWindowMs }
      if (entry.count >= this.maxAttempts) {
        const minutes = Math.max(1, Math.ceil((entry.resetAt - now) / 60000))
        res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
        res.status(429).json({
          error: `Too many incorrect attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
          code: 'rate_limited',
        })
        return
      }
      if (!this.checkPassword(req.body?.password)) {
        entry.count++
        this.attempts.set(ip, entry)
        this.pruneAttempts(now)
        res.status(401).json({ error: 'That password isn’t right. Please try again.', code: 'wrong_password' })
        return
      }
      this.attempts.delete(ip)
      const { token, expiresAt } = this.createToken()
      res.setHeader('Set-Cookie', this.cookie(req, token, this.ttlSeconds))
      res.json({ required: true, authenticated: true, expiresAt: new Date(expiresAt * 1000).toISOString() } satisfies SessionInfo)
    })

    router.delete('/session', (req, res) => {
      res.setHeader('Set-Cookie', this.cookie(req, '', 0))
      res.set('Cache-Control', 'no-store').json({ required: true, authenticated: false } satisfies SessionInfo)
    })
  }

  private cookie(req: Request, value: string, maxAge: number): string {
    const secure = this.secureCookie === 'auto' ? req.secure : this.secureCookie
    return [
      `${SESSION_COOKIE}=${value}`,
      'Path=/',
      `Max-Age=${maxAge}`,
      ...(maxAge === 0 ? ['Expires=Thu, 01 Jan 1970 00:00:00 GMT'] : []),
      'HttpOnly',
      'SameSite=Strict',
      ...(secure ? ['Secure'] : []),
    ].join('; ')
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url')
  }

  private pruneAttempts(now: number) {
    if (this.attempts.size < 10000) return
    for (const [ip, e] of this.attempts) if (e.resetAt <= now) this.attempts.delete(ip)
  }
}

/** Session routes for development without a password: always signed in. */
export function openSessionRoutes(router: Router) {
  router.get('/session', (_req, res) => {
    res.json({ required: false, authenticated: true } satisfies SessionInfo)
  })
  router.post('/session', (_req, res) => {
    res.json({ required: false, authenticated: true } satisfies SessionInfo)
  })
  router.delete('/session', (_req, res) => {
    res.json({ required: false, authenticated: true } satisfies SessionInfo)
  })
}

export const allowAll = (_req: Request, _res: Response, next: NextFunction) => next()

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest()
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}
