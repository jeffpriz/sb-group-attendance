import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { isValidIsoDate, uniqueSortedDates } from '../shared/dates.ts'
import type { Group, GroupSummary } from '../shared/types.ts'
import { GroupStore, HttpError } from './storage.ts'

export interface AppOptions {
  /** Folder that holds the JSON data files. */
  dataDir: string
  /** Built frontend (Vite `dist/` folder) to serve, if it exists. */
  staticDir?: string
}

const MAX_NAME_LENGTH = 100

function requireName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${label} is required`)
  }
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length > MAX_NAME_LENGTH) {
    throw new HttpError(400, `${label} must be ${MAX_NAME_LENGTH} characters or fewer`)
  }
  return name
}

function requireDate(value: unknown): string {
  if (!isValidIsoDate(value)) throw new HttpError(400, 'Dates must look like YYYY-MM-DD')
  return value
}

function findMeeting(group: Group, date: string) {
  const meeting = group.meetings.find((m) => m.date === date)
  if (!meeting) throw new HttpError(404, `No meeting is scheduled on ${date}`)
  return meeting
}

function toSummary(group: Group): GroupSummary {
  return {
    id: group.id,
    name: group.name,
    memberCount: group.members.filter((m) => !m.removedAt).length,
    meetingDates: group.meetings.map((m) => m.date),
    recordedMeetingCount: group.meetings.filter((m) => m.attendance).length,
  }
}

export function createApp({ dataDir, staticDir }: AppOptions) {
  const store = new GroupStore(dataDir)
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  const api = express.Router()

  api.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  // ---- Groups -------------------------------------------------------------

  api.get('/groups', async (_req, res) => {
    const groups = await store.list()
    res.json(groups.map(toSummary))
  })

  api.post('/groups', async (req, res) => {
    const name = requireName(req.body?.name, 'Group name')
    const group = await store.create(name)
    res.status(201).json(group)
  })

  api.get('/groups/:groupId', async (req, res) => {
    const group = await store.get(req.params.groupId)
    if (!group) throw new HttpError(404, 'Group not found')
    res.json(group)
  })

  api.patch('/groups/:groupId', async (req, res) => {
    const name = requireName(req.body?.name, 'Group name')
    const group = await store.update(req.params.groupId, (g) => {
      g.name = name
    })
    res.json(group)
  })

  api.delete('/groups/:groupId', async (req, res) => {
    await store.delete(req.params.groupId)
    res.status(204).end()
  })

  // ---- Members ------------------------------------------------------------

  api.post('/groups/:groupId/members', async (req, res) => {
    const name = requireName(req.body?.name, 'Member name')
    const group = await store.update(req.params.groupId, (g) => {
      g.members.push({ id: randomUUID(), name, addedAt: new Date().toISOString() })
    })
    res.status(201).json(group)
  })

  api.patch('/groups/:groupId/members/:memberId', async (req, res) => {
    const name = req.body?.name === undefined ? undefined : requireName(req.body.name, 'Member name')
    const restore = req.body?.restore === true
    const group = await store.update(req.params.groupId, (g) => {
      const member = g.members.find((m) => m.id === req.params.memberId)
      if (!member) throw new HttpError(404, 'Member not found')
      if (name) member.name = name
      if (restore) delete member.removedAt
    })
    res.json(group)
  })

  /**
   * Removes a member from the group. The member stays in the file (marked
   * with `removedAt`) so attendance history keeps their name.
   */
  api.delete('/groups/:groupId/members/:memberId', async (req, res) => {
    const group = await store.update(req.params.groupId, (g) => {
      const member = g.members.find((m) => m.id === req.params.memberId)
      if (!member) throw new HttpError(404, 'Member not found')
      member.removedAt ??= new Date().toISOString()
    })
    res.json(group)
  })

  // ---- Meeting schedule ---------------------------------------------------

  /**
   * Replaces the meeting schedule with the given list of dates. Attendance
   * already recorded for dates that stay on the schedule is kept. Removing
   * a meeting that already has attendance requires `force: true`.
   */
  api.put('/groups/:groupId/meetings', async (req, res) => {
    const raw: unknown = req.body?.dates
    if (!Array.isArray(raw)) throw new HttpError(400, '"dates" must be a list of dates')
    if (raw.length > 2000) throw new HttpError(400, 'Too many meetings')
    const dates = uniqueSortedDates(raw.map(requireDate))
    const force = req.body?.force === true
    const group = await store.update(req.params.groupId, (g) => {
      const keep = new Set(dates)
      const losing = g.meetings.filter((m) => m.attendance && !keep.has(m.date))
      if (losing.length && !force) {
        throw new HttpError(
          409,
          `Attendance has already been recorded for ${losing.map((m) => m.date).join(', ')}. ` +
            'Send force: true to remove those meetings anyway.',
        )
      }
      const existing = new Map(g.meetings.map((m) => [m.date, m]))
      g.meetings = dates.map((date) => existing.get(date) ?? { date })
    })
    res.json(group)
  })

  // ---- Attendance ---------------------------------------------------------

  api.put('/groups/:groupId/meetings/:date/attendance', async (req, res) => {
    const date = requireDate(req.params.date)
    const raw: unknown = req.body?.presentMemberIds
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) {
      throw new HttpError(400, '"presentMemberIds" must be a list of member IDs')
    }
    const group = await store.update(req.params.groupId, (g) => {
      const meeting = findMeeting(g, date)
      const memberIds = new Set(g.members.map((m) => m.id))
      const unknown = raw.filter((id) => !memberIds.has(id))
      if (unknown.length) throw new HttpError(400, `Unknown member IDs: ${unknown.join(', ')}`)
      meeting.attendance = {
        presentMemberIds: [...new Set(raw as string[])],
        recordedAt: new Date().toISOString(),
      }
    })
    res.json(group)
  })

  /** Clears recorded attendance so the meeting shows as "not taken" again. */
  api.delete('/groups/:groupId/meetings/:date/attendance', async (req, res) => {
    const date = requireDate(req.params.date)
    const group = await store.update(req.params.groupId, (g) => {
      delete findMeeting(g, date).attendance
    })
    res.json(group)
  })

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')))
  app.use('/api', api)

  // ---- Built frontend (production) ----------------------------------------

  if (staticDir && existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir))
    // Let React Router handle every other page URL.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      res.sendFile(path.join(staticDir, 'index.html'))
    })
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err)
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const status = (err as { status?: number }).status
    if (status && status >= 400 && status < 500) {
      // e.g. malformed JSON body
      res.status(status).json({ error: (err as Error).message })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Something went wrong on the server' })
  })

  return app
}
