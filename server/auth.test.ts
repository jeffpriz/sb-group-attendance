import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { Auth, SESSION_COOKIE } from './auth.ts'

let dataDir: string
let clock: number
const now = () => clock

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'sb-attendance-auth-'))
  clock = Date.UTC(2026, 9, 12, 15, 0, 0)
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

function makeApp(options: Partial<ConstructorParameters<typeof Auth>[0]> = {}) {
  const auth = new Auth({ password: 'correct horse', secret: 'test-secret', now, ...options })
  return { auth, app: createApp({ dataDir, auth }) }
}

async function login(app: ReturnType<typeof createApp>, password = 'correct horse') {
  const res = await request(app).post('/api/session').send({ password })
  const cookie = res.headers['set-cookie']?.[0]
  return { res, cookie: cookie?.split(';')[0] }
}

describe('site password', () => {
  it('rejects API calls without a session', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/api/groups').expect(401)
    expect(res.body).toEqual({ error: expect.any(String), code: 'auth_required' })
    await request(app).post('/api/groups').send({ name: 'X' }).expect(401)
    await request(app).get('/api/stats').expect(401)
    await request(app).get('/api/nope').expect(401)
  })

  it('keeps /api/health open without exposing data', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/api/health')
    expect(res.status).not.toBe(401)
    expect(Object.keys(res.body).sort()).toEqual(['dataWritable', 'ok'])
  })

  it('reports the session state', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/api/session').expect(200)
    expect(res.body).toEqual({ required: true, authenticated: false })
  })

  it('signs in with the right password and sets a secure-looking cookie', async () => {
    const { app } = makeApp()
    const { res, cookie } = await login(app)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ required: true, authenticated: true, expiresAt: '2026-10-12T16:00:00.000Z' })
    const header = res.headers['set-cookie'][0]
    expect(header).toMatch(new RegExp(`^${SESSION_COOKIE}=v1\\.`))
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Strict')
    expect(header).toContain('Max-Age=3600')
    expect(header).not.toContain('Secure') // plain HTTP test request
    await request(app).get('/api/groups').set('Cookie', cookie!).expect(200)
    const session = await request(app).get('/api/session').set('Cookie', cookie!).expect(200)
    expect(session.body.authenticated).toBe(true)
  })

  it('sets Secure when the request came through an HTTPS proxy', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/session').set('X-Forwarded-Proto', 'https').send({ password: 'correct horse' })
    expect(res.headers['set-cookie'][0]).toContain('; Secure')
  })

  it('rejects a wrong or missing password', async () => {
    const { app } = makeApp()
    const { res, cookie } = await login(app, 'wrong')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('wrong_password')
    expect(cookie).toBeUndefined()
    await request(app).post('/api/session').send({}).expect(401)
    await request(app).post('/api/session').send({ password: 42 }).expect(401)
  })

  it('expires sessions exactly one hour after sign-in (not sliding)', async () => {
    const { app } = makeApp()
    const { cookie } = await login(app)
    clock += 59 * 60 * 1000
    await request(app).get('/api/groups').set('Cookie', cookie!).expect(200) // activity doesn't extend it
    clock += 60 * 1000
    await request(app).get('/api/groups').set('Cookie', cookie!).expect(401)
  })

  it('caps the session length at one hour', async () => {
    const { auth } = makeApp({ ttlMinutes: 600 })
    expect(auth.ttlSeconds).toBe(3600)
    const short = makeApp({ ttlMinutes: 1 })
    const { cookie } = await login(short.app)
    clock += 61 * 1000
    await request(short.app).get('/api/groups').set('Cookie', cookie!).expect(401)
  })

  it('rejects tampered and forged tokens', async () => {
    const { app } = makeApp()
    const { cookie } = await login(app)
    const [name, value] = cookie!.split('=')
    const [v, iat, exp, sig] = value.split('.')
    const longer = `${name}=${v}.${iat}.${Number(exp) + 3600}.${sig}`
    await request(app).get('/api/groups').set('Cookie', longer).expect(401)
    const flipped = `${name}=${v}.${iat}.${exp}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`
    await request(app).get('/api/groups').set('Cookie', flipped).expect(401)
    await request(app).get('/api/groups').set('Cookie', `${name}=garbage`).expect(401)
    // Signed with a different secret
    const other = makeApp({ secret: 'other-secret' })
    const { cookie: otherCookie } = await login(other.app)
    await request(app).get('/api/groups').set('Cookie', otherCookie!).expect(401)
  })

  it('signs everyone out when the password changes', async () => {
    const { app } = makeApp()
    const { cookie } = await login(app)
    const changed = makeApp({ password: 'new password' })
    await request(changed.app).get('/api/groups').set('Cookie', cookie!).expect(401)
    const same = makeApp()
    await request(same.app).get('/api/groups').set('Cookie', cookie!).expect(200)
  })

  it('signs out', async () => {
    const { app } = makeApp()
    await login(app)
    const res = await request(app).delete('/api/session').expect(200)
    expect(res.headers['set-cookie'][0]).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Max-Age=0`))
  })

  it('limits failed sign-ins per IP', async () => {
    const { app } = makeApp({ maxAttempts: 3, attemptWindowMs: 15 * 60 * 1000 })
    for (let i = 0; i < 3; i++) await login(app, 'wrong').then(({ res }) => expect(res.status).toBe(401))
    const blocked = await login(app)
    expect(blocked.res.status).toBe(429)
    expect(blocked.res.body.error).toMatch(/wait 15 minutes/)
    expect(blocked.res.headers['retry-after']).toBe('900')
    clock += 15 * 60 * 1000
    const ok = await login(app)
    expect(ok.res.status).toBe(200)
  })

  it('compares passwords exactly', () => {
    const { auth } = makeApp()
    expect(auth.checkPassword('correct horse')).toBe(true)
    expect(auth.checkPassword('correct horse ')).toBe(false)
    expect(auth.checkPassword('')).toBe(false)
  })
})
