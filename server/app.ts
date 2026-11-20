import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { isValidIsoDate, todayIso, uniqueSortedDates } from '../shared/dates.ts'
import { computeStats } from '../shared/stats.ts'
import type { Group, GroupSummary, SeasonDetail, SeasonSummary, StatsResponse } from '../shared/types.ts'
import { GroupStore, HttpError } from './storage.ts'

export interface AppOptions {
  /** Folder that holds the JSON data files (ignored when `store` is given). */
  dataDir?: string
  /** An already-initialized store to use. */
  store?: GroupStore
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
    ...(group.seasonId !== undefined ? { seasonId: group.seasonId } : {}),
    archived: Boolean(group.archivedAt),
    memberCount: group.members.filter((m) => !m.removedAt).length,
    meetingDates: group.meetings.map((m) => m.date),
    recordedMeetingCount: group.meetings.filter((m) => m.attendance).length,
  }
}

async function optionalSeasonId(store: GroupStore, value: unknown, required = false): Promise<string | undefined> {
  if (!required && value === undefined) return undefined
  if (value === null) return undefined
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'seasonId must be a string or null')
  if (!(await store.getSeason(value))) throw new HttpError(400, 'Season not found')
  return value
}

export function createApp({ dataDir, store: givenStore, staticDir }: AppOptions) {
  if (!givenStore && !dataDir) throw new Error('createApp needs a dataDir or a store')
  const store = givenStore ?? new GroupStore(dataDir!)
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  const api = express.Router()

  /** Used by the Docker HEALTHCHECK: fails if the data folder disappears or turns read-only. */
  api.get('/health', async (_req, res) => {
    const writable = await store.isWritable()
    res.status(writable ? 200 : 503).json({ ok: writable, dataWritable: writable })
  })

  // ---- Groups -------------------------------------------------------------

  api.get('/groups', async (_req, res) => {
    const groups = await store.list()
    res.json(groups.map(toSummary))
  })

  api.post('/groups', async (req, res) => {
    const name = requireName(req.body?.name, 'Group name')
    const seasonId = await optionalSeasonId(store, req.body?.seasonId)
    const group = await store.create(name, seasonId)
    res.status(201).json(group)
  })

  api.get('/groups/:groupId', async (req, res) => {
    const group = await store.get(req.params.groupId)
    if (!group) throw new HttpError(404, 'Group not found')
    res.json(group)
  })

  api.patch('/groups/:groupId', async (req, res) => {
    const hasName = req.body?.name !== undefined
    const hasArchived = req.body?.archived !== undefined
    const hasSeason = req.body?.seasonId !== undefined
    if (!hasName && !hasArchived && !hasSeason) {
      throw new HttpError(400, 'Provide a group name, archived status or seasonId')
    }
    const name = hasName ? requireName(req.body.name, 'Group name') : undefined
    if (hasArchived && typeof req.body.archived !== 'boolean') {
      throw new HttpError(400, 'Archived status must be true or false')
    }
    const seasonId = hasSeason ? await optionalSeasonId(store, req.body.seasonId, true) : undefined
    const group = await store.update(req.params.groupId, (g) => {
      if (name !== undefined) g.name = name
      if (hasSeason) {
        if (seasonId === undefined) delete g.seasonId
        else g.seasonId = seasonId
      }
      if (hasArchived) {
        if (req.body.archived) g.archivedAt = g.archivedAt ?? new Date().toISOString()
        else delete g.archivedAt
      }
    })
    res.json(group)
  })

  // ---- Seasons ------------------------------------------------------------

  api.get('/seasons', async (_req, res) => {
    const [seasons, groups] = await Promise.all([store.listSeasons(), store.list()])
    const body: SeasonSummary[] = seasons.map((season) => ({
      ...season,
      groups: groups.filter((group) => group.seasonId === season.id).map(toSummary),
    }))
    res.json(body)
  })

  api.post('/seasons', async (req, res) => {
    const name = requireName(req.body?.name, 'Season name')
    res.status(201).json(await store.createSeason(name))
  })

  api.patch('/seasons/:seasonId', async (req, res) => {
    const name = requireName(req.body?.name, 'Season name')
    res.json(
      await store.updateSeason(req.params.seasonId, (season) => {
        season.name = name
      }),
    )
  })

  api.get('/seasons/:seasonId', async (req, res) => {
    const season = await store.getSeason(req.params.seasonId)
    if (!season) throw new HttpError(404, 'Season not found')
    const groups = (await store.list()).filter((group) => group.seasonId === season.id)
    const body: SeasonDetail = { season, groups }
    res.json(body)
  })

  api.delete('/groups/:groupId', async (req, res) => {
    await store.delete(req.params.groupId)
    res.status(204).end()
  })

  // ---- Members ------------------------------------------------------------

  api.post('/groups/:groupId/members', async (req, res) => {
    const name = requireName(req.body?.name, 'Member name')
    const startDate = req.body?.startDate === undefined ? todayIso() : requireDate(req.body.startDate)
    const group = await store.update(req.params.groupId, (g) => {
      const now = new Date()
      const isoForStart = `${startDate}T${now.toISOString().slice(11)}`
      g.members.push({
        id: randomUUID(),
        name,
        addedAt: isoForStart,
        membershipIntervals: [{ startDate }],
      })
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
      if (req.body?.removalDate !== undefined) {
        // Correct when an already-removed member actually left.
        const newEnd = requireDate(req.body.removalDate)
        if (!member.removedAt) throw new HttpError(400, 'Only removed members have a removal date to change')
        if (newEnd > todayIso()) throw new HttpError(400, 'Removal date cannot be in the future')
        const intervals = (member.membershipIntervals ??= [
          { startDate: member.addedAt.slice(0, 10), endDate: member.removedAt.slice(0, 10) },
        ])
        const last = intervals[intervals.length - 1]
        if (newEnd < last.startDate) {
          throw new HttpError(400, 'Removal date cannot be before the member joined or was restored')
        }
        last.endDate = newEnd
        member.removedAt = `${newEnd}T23:59:59.999Z`
      }
      if (restore) {
        const restoreDate = req.body?.restoreDate === undefined ? todayIso() : requireDate(req.body.restoreDate)
        if (!member.removedAt) {
          // Restoring an active member is idempotent.
        } else {
          const previousEnd = member.removedAt.slice(0, 10)
          if (restoreDate < previousEnd) {
            throw new HttpError(400, 'Restore date cannot be before the member was removed')
          }
          member.membershipIntervals ??= [{ startDate: member.addedAt.slice(0, 10), endDate: previousEnd }]
          member.membershipIntervals.push({ startDate: restoreDate })
          delete member.removedAt
        }

        const retroactiveMeetingDate =
          req.body?.retroactiveMeetingDate === undefined ? undefined : requireDate(req.body.retroactiveMeetingDate)
        if (retroactiveMeetingDate) {
          if (retroactiveMeetingDate > todayIso()) {
            throw new HttpError(400, 'A retroactive meeting date cannot be in the future')
          }
          const meeting = findMeeting(g, retroactiveMeetingDate)
          const present = req.body?.present !== false
          const ids = new Set(meeting.attendance?.presentMemberIds ?? [])
          if (present) ids.add(member.id)
          else ids.delete(member.id)
          meeting.attendance = {
            presentMemberIds: [...ids],
            recordedAt: new Date().toISOString(),
          }
        }
      }
    })
    res.json(group)
  })

  /**
   * Removes a member from the group. The member stays in the file (marked
   * with `removedAt`) so attendance history keeps their name.
   */
  api.delete('/groups/:groupId/members/:memberId', async (req, res) => {
    const removalDate =
      req.body?.removalDate === undefined ? todayIso() : requireDate(req.body.removalDate)
    if (removalDate > todayIso()) throw new HttpError(400, 'Removal date cannot be in the future')
    const group = await store.update(req.params.groupId, (g) => {
      const member = g.members.find((m) => m.id === req.params.memberId)
      if (!member) throw new HttpError(404, 'Member not found')
      if (member.removedAt) return
      const intervals = member.membershipIntervals
      if (intervals?.length) {
        const open = intervals.find((interval) => !interval.endDate)
        if (open) {
          if (removalDate < open.startDate) {
            throw new HttpError(400, 'Removal date cannot be before the member joined or was restored')
          }
          open.endDate = removalDate
        }
      } else {
        const startDate = member.addedAt.slice(0, 10)
        if (removalDate < startDate) throw new HttpError(400, 'Removal date cannot be before the member was added')
        member.membershipIntervals = [{ startDate, endDate: removalDate }]
      }
      member.removedAt = `${removalDate}T23:59:59.999Z`
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

  // Attendance statistics. Query: group (repeatable; all groups if omitted),
  // season (exact current group assignment), from / to (YYYY-MM-DD, inclusive),
  // today (the client's local date, so "missed" vs "upcoming" matches the
  // user's calendar, not the server's).
  api.get('/stats', async (req, res) => {
    const list = (v: unknown): string[] =>
      (Array.isArray(v) ? v : v === undefined ? [] : [v]).filter((x): x is string => typeof x === 'string' && x !== '')
    const optionalDate = (v: unknown, label: string): string | undefined => {
      if (v === undefined || v === '') return undefined
      if (typeof v !== 'string' || !isValidIsoDate(v)) throw new HttpError(400, `"${label}" must look like YYYY-MM-DD`)
      return v
    }
    const optionalString = (v: unknown, label: string): string | undefined => {
      if (v === undefined || v === '') return undefined
      if (typeof v !== 'string') throw new HttpError(400, `"${label}" must be a string`)
      return v
    }
    const from = optionalDate(req.query.from, 'from')
    const to = optionalDate(req.query.to, 'to')
    const today = optionalDate(req.query.today, 'today') ?? new Date().toISOString().slice(0, 10)
    const seasonId = optionalString(req.query.season, 'season')
    if (from && to && from > to) throw new HttpError(400, '"from" must be on or before "to"')
    const groups = await store.list()
    const known = new Set(groups.map((g) => g.id))
    const requestedGroupIds = list(req.query.group)
    const groupIds = req.query.group === undefined ? undefined : requestedGroupIds.filter((id) => known.has(id))
    const body: StatsResponse = {
      ...computeStats(groups, { groupIds, seasonId, from, to, today }),
      filter: { groupIds, seasonId, from, to, today },
      allGroups: groups.map((g) => ({ id: g.id, name: g.name })).sort((a, b) => a.name.localeCompare(b.name)),
    }
    res.json(body)
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
