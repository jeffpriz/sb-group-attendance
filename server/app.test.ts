import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Group } from '../shared/types.ts'
import { createApp } from './app.ts'

let dataDir: string
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'sb-attendance-api-'))
  app = createApp({ dataDir })
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

async function createGroupWithMembers(names: string[]): Promise<Group> {
  const created = await request(app).post('/api/groups').send({ name: 'Wednesday Group' }).expect(201)
  let group: Group = created.body
  for (const name of names) {
    group = (await request(app).post(`/api/groups/${group.id}/members`).send({ name }).expect(201)).body
  }
  return group
}

describe('API', () => {
  it('lists missing attendance for active groups in date and name order', async () => {
    const zeta = (await request(app).post('/api/groups').send({ name: 'Zeta Group' }).expect(201)).body as Group
    const alpha = (await request(app).post('/api/groups').send({ name: 'Alpha Group' }).expect(201)).body as Group
    const archived = (await request(app).post('/api/groups').send({ name: 'Old Group' }).expect(201)).body as Group

    await request(app)
      .put(`/api/groups/${zeta.id}/meetings`)
      .send({ dates: ['2026-11-10', '2026-11-12'] })
      .expect(200)
    await request(app)
      .put(`/api/groups/${alpha.id}/meetings`)
      .send({ dates: ['2026-11-10', '2026-11-09'] })
      .expect(200)
    await request(app)
      .put(`/api/groups/${alpha.id}/meetings/2026-11-09/attendance`)
      .send({ presentMemberIds: [] })
      .expect(200)
    await request(app)
      .put(`/api/groups/${archived.id}/meetings`)
      .send({ dates: ['2026-11-10'] })
      .expect(200)
    await request(app).patch(`/api/groups/${archived.id}`).send({ archived: true }).expect(200)

    const response = await request(app)
      .get('/api/attendance/missing')
      .query({ today: '2026-11-11' })
      .expect(200)

    expect(response.body).toEqual({
      asOf: '2026-11-11',
      meetings: [
        { date: '2026-11-10', groupId: alpha.id, groupName: 'Alpha Group' },
        { date: '2026-11-10', groupId: zeta.id, groupName: 'Zeta Group' },
      ],
    })
    await request(app).get('/api/attendance/missing').query({ today: '11/11/2026' }).expect(400)
  })

  it('creates a group, members, schedule and attendance, and saves it to JSON', async () => {
    const group = await createGroupWithMembers(['Ann', 'Ben', 'Cal'])
    expect(group.members.map((m) => m.name)).toEqual(['Ann', 'Ben', 'Cal'])

    const scheduled = await request(app)
      .put(`/api/groups/${group.id}/meetings`)
      .send({ dates: ['2026-10-14', '2026-10-07', '2026-10-14'] })
      .expect(200)
    expect(scheduled.body.meetings).toEqual([{ date: '2026-10-07' }, { date: '2026-10-14' }])

    const [ann, , cal] = group.members
    const saved = await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-10-07/attendance`)
      .send({ presentMemberIds: [ann.id, cal.id] })
      .expect(200)
    expect(saved.body.meetings[0].attendance.presentMemberIds).toEqual([ann.id, cal.id])

    const onDisk: Group = JSON.parse(await readFile(path.join(dataDir, 'groups', `${group.id}.json`), 'utf8'))
    expect(onDisk.meetings[0].attendance?.presentMemberIds).toEqual([ann.id, cal.id])

    const list = await request(app).get('/api/groups').expect(200)
    expect(list.body).toEqual([
      {
        id: group.id,
        name: 'Wednesday Group',
        archived: false,
        memberCount: 3,
        meetingDates: ['2026-10-07', '2026-10-14'],
        recordedMeetingCount: 1,
      },
    ])
  })

  it('validates input', async () => {
    await request(app).post('/api/groups').send({ name: '   ' }).expect(400)
    const group = await createGroupWithMembers(['Ann'])
    await request(app).put(`/api/groups/${group.id}/meetings`).send({ dates: ['10/7/2026'] }).expect(400)
    await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-10-07/attendance`)
      .send({ presentMemberIds: [] })
      .expect(404) // not on the schedule
    await request(app).put(`/api/groups/${group.id}/meetings`).send({ dates: ['2026-10-07'] }).expect(200)
    await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-10-07/attendance`)
      .send({ presentMemberIds: ['someone-else'] })
      .expect(400)
    await request(app).get('/api/groups/missing').expect(404)
  })

  it('keeps attendance when the schedule changes and protects recorded meetings', async () => {
    const group = await createGroupWithMembers(['Ann'])
    const url = `/api/groups/${group.id}/meetings`
    await request(app).put(url).send({ dates: ['2026-10-07'] }).expect(200)
    await request(app)
      .put(`${url}/2026-10-07/attendance`)
      .send({ presentMemberIds: [group.members[0].id] })
      .expect(200)

    const extended = await request(app).put(url).send({ dates: ['2026-10-07', '2026-10-14'] }).expect(200)
    expect(extended.body.meetings[0].attendance.presentMemberIds).toEqual([group.members[0].id])

    await request(app).put(url).send({ dates: ['2026-10-14'] }).expect(409)
    const forced = await request(app).put(url).send({ dates: ['2026-10-14'], force: true }).expect(200)
    expect(forced.body.meetings).toEqual([{ date: '2026-10-14' }])
  })

  it('renames, removes and restores members while keeping history', async () => {
    const group = await createGroupWithMembers(['Ann'])
    const member = group.members[0]
    const base = `/api/groups/${group.id}/members/${member.id}`

    const renamed = await request(app).patch(base).send({ name: 'Annie' }).expect(200)
    expect(renamed.body.members[0].name).toBe('Annie')

    const removed = await request(app).delete(base).expect(200)
    expect(removed.body.members[0].removedAt).toBeTruthy()
    const list = await request(app).get('/api/groups').expect(200)
    expect(list.body[0].memberCount).toBe(0)

    const restored = await request(app).patch(base).send({ restore: true }).expect(200)
    expect(restored.body.members[0].removedAt).toBeUndefined()
    expect(restored.body.members[0].membershipIntervals).toHaveLength(2)
  })

  it('backdates a removal and lets the removal date be corrected', async () => {
    const created = await request(app).post('/api/groups').send({ name: 'G' }).expect(201)
    const added = await request(app)
      .post(`/api/groups/${created.body.id}/members`)
      .send({ name: 'Ann', startDate: '2026-09-01' })
      .expect(201)
    const id = added.body.id as string
    const member = added.body.members[0]
    const base = `/api/groups/${id}/members/${member.id}`

    await request(app).patch(base).send({ removalDate: '2026-10-01' }).expect(400) // not removed yet
    const removed = await request(app).delete(base).send({ removalDate: '2026-10-14' }).expect(200)
    expect(removed.body.members[0].membershipIntervals).toEqual([{ startDate: '2026-09-01', endDate: '2026-10-14' }])

    const fixed = await request(app).patch(base).send({ removalDate: '2026-10-07' }).expect(200)
    expect(fixed.body.members[0].membershipIntervals).toEqual([{ startDate: '2026-09-01', endDate: '2026-10-07' }])
    await request(app).patch(base).send({ removalDate: '2026-08-01' }).expect(400)
    await request(app).patch(base).send({ removalDate: '2099-01-01' }).expect(400)
  })

  it('preserves removal intervals and supports retroactive restoration for a past meeting', async () => {
    const created = await request(app).post('/api/groups').send({ name: 'Wednesday Group' }).expect(201)
    let group: Group = created.body
    group = (await request(app)
      .post(`/api/groups/${group.id}/members`)
      .send({ name: 'Ann', startDate: '2026-09-09' })
      .expect(201)).body
    const member = group.members[0]
    await request(app)
      .put(`/api/groups/${group.id}/meetings`)
      .send({ dates: ['2026-10-14', '2026-11-11', '2026-11-18'] })
      .expect(200)

    await request(app)
      .delete(`/api/groups/${group.id}/members/${member.id}`)
      .send({ removalDate: '2026-10-01' })
      .expect(200)

    await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-10-14/attendance`)
      .send({ presentMemberIds: [] })
      .expect(200)
    await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-11-11/attendance`)
      .send({ presentMemberIds: [] })
      .expect(200)

    const restored = await request(app)
      .patch(`/api/groups/${group.id}/members/${member.id}`)
      .send({
        restore: true,
        restoreDate: '2026-11-13',
        retroactiveMeetingDate: '2026-11-11',
      })
      .expect(200)
    expect(restored.body.members[0].removedAt).toBeUndefined()
    expect(restored.body.members[0].membershipIntervals).toEqual([
      { startDate: '2026-09-09', endDate: '2026-10-01' },
      { startDate: '2026-11-13' },
    ])
    expect(restored.body.meetings.find((m: { date: string }) => m.date === '2026-11-11').attendance.presentMemberIds)
      .toEqual([member.id])

    const activeAgain = await request(app)
      .patch(`/api/groups/${group.id}/members/${member.id}`)
      .send({ restore: true, restoreDate: '2026-12-01' })
      .expect(200)
    expect(activeAgain.body.members[0].membershipIntervals).toHaveLength(2)

    await request(app)
      .patch(`/api/groups/${group.id}/members/${member.id}`)
      .send({ restore: true, restoreDate: '2026-11-13', retroactiveMeetingDate: '2026-11-10' })
      .expect(404)

    await request(app)
      .delete(`/api/groups/${group.id}/members/${member.id}`)
      .send({ removalDate: '2099-01-01' })
      .expect(400)
    await request(app)
      .patch(`/api/groups/${group.id}/members/${member.id}`)
      .send({ restore: true, retroactiveMeetingDate: '2099-01-01' })
      .expect(400)
  })

  it('reports health, including whether the data folder is writable', async () => {
    await request(app).post('/api/groups').send({ name: 'Make the folder' }).expect(201)
    const res = await request(app).get('/api/health').expect(200)
    expect(res.body).toEqual({ ok: true, dataWritable: true })
  })

  it('deletes a group', async () => {
    const group = await createGroupWithMembers([])
    await request(app).delete(`/api/groups/${group.id}`).expect(204)
    await request(app).get(`/api/groups/${group.id}`).expect(404)
  })

  it('archives and restores a group without deleting its history', async () => {
    const group = await createGroupWithMembers(['Ann'])

    const archived = await request(app)
      .patch(`/api/groups/${group.id}`)
      .send({ archived: true })
      .expect(200)
    expect(archived.body.archivedAt).toBeTruthy()

    const listed = await request(app).get('/api/groups').expect(200)
    expect(listed.body).toEqual([
      {
        id: group.id,
        name: group.name,
        archived: true,
        memberCount: 1,
        meetingDates: [],
        recordedMeetingCount: 0,
      },
    ])
    const direct = await request(app).get(`/api/groups/${group.id}`).expect(200)
    expect(direct.body.members).toHaveLength(1)

    const restored = await request(app)
      .patch(`/api/groups/${group.id}`)
      .send({ archived: false })
      .expect(200)
    expect(restored.body.archivedAt).toBeUndefined()
    await request(app).patch(`/api/groups/${group.id}`).send({ archived: 'yes' }).expect(400)
  })

  it('returns JSON errors for unknown API routes and bad JSON', async () => {
    const res = await request(app).get('/api/nope').expect(404)
    expect(res.body).toEqual({ error: 'Not found' })
    await request(app).post('/api/groups').set('Content-Type', 'application/json').send('{bad').expect(400)
  })
})

describe('Seasons API', () => {
  it('creates, lists and details seasons with their currently assigned groups', async () => {
    const listInitially = await request(app).get('/api/seasons').expect(200)
    expect(listInitially.body).toEqual([])

    const spring = (await request(app).post('/api/seasons').send({ name: '  Spring   2027 ' }).expect(201)).body
    const fall = (await request(app).post('/api/seasons').send({ name: 'Fall 2026' }).expect(201)).body
    expect(spring).toMatchObject({
      name: 'Spring 2027',
      id: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    const created = await request(app)
      .post('/api/groups')
      .send({ name: 'Assigned Group', seasonId: spring.id })
      .expect(201)
    expect(created.body.seasonId).toBe(spring.id)

    const list = await request(app).get('/api/seasons').expect(200)
    expect(list.body.map((season: { name: string }) => season.name)).toEqual(['Fall 2026', 'Spring 2027'])
    expect(list.body.find((season: { id: string }) => season.id === spring.id).groups).toMatchObject([
      { id: created.body.id, seasonId: spring.id },
    ])
    expect(list.body.find((season: { id: string }) => season.id === fall.id).groups).toEqual([])

    const detail = await request(app).get(`/api/seasons/${spring.id}`).expect(200)
    expect(detail.body.season).toEqual(spring)
    expect(detail.body.groups.map((group: Group) => group.id)).toEqual([created.body.id])
  })

  it('validates season names and rejects unknown season IDs', async () => {
    await request(app).post('/api/seasons').send({}).expect(400)
    await request(app).post('/api/seasons').send({ name: ' \t ' }).expect(400)
    await request(app).post('/api/seasons').send({ name: 'x'.repeat(101) }).expect(400)
    await request(app).post('/api/seasons').send({ name: 'Duplicate' }).expect(201)
    await request(app).post('/api/seasons').send({ name: 'Duplicate' }).expect(201)

    await request(app).post('/api/groups').send({ name: 'Bad Group', seasonId: 'missing' }).expect(400)
    await request(app).post('/api/groups').send({ name: 'Bad Group', seasonId: 42 }).expect(400)
    await request(app).get('/api/seasons/missing').expect(404)
    expect((await request(app).get('/api/groups').expect(200)).body).toEqual([])
  })

  it('renames a season using normalized validation and preserves assignments', async () => {
    const season = (await request(app).post('/api/seasons').send({ name: 'Spring 2027' }).expect(201)).body
    const group = (
      await request(app).post('/api/groups').send({ name: 'Assigned Group', seasonId: season.id }).expect(201)
    ).body

    const originalOnDisk = JSON.parse(
      await readFile(path.join(dataDir, 'seasons', `${season.id}.json`), 'utf8'),
    )
    originalOnDisk.updatedAt = '2020-01-01T00:00:00.000Z'
    await writeFile(
      path.join(dataDir, 'seasons', `${season.id}.json`),
      JSON.stringify(originalOnDisk, null, 2) + '\n',
    )

    const renamed = await request(app)
      .patch(`/api/seasons/${season.id}`)
      .send({ name: '  Fall   2027  ' })
      .expect(200)
    expect(renamed.body).toEqual({
      ...season,
      name: 'Fall 2027',
      updatedAt: expect.any(String),
    })
    expect(renamed.body.createdAt).toBe(season.createdAt)
    expect(renamed.body.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')

    const persisted = JSON.parse(await readFile(path.join(dataDir, 'seasons', `${season.id}.json`), 'utf8'))
    expect(persisted).toEqual(renamed.body)
    const detail = await request(app).get(`/api/seasons/${season.id}`).expect(200)
    expect(detail.body.season).toEqual(renamed.body)
    expect(detail.body.groups.map((assigned: Group) => assigned.id)).toEqual([group.id])
  })

  it('validates season renames and returns 404 for an unknown season', async () => {
    const season = (await request(app).post('/api/seasons').send({ name: 'Keep Me' }).expect(201)).body
    const invalidNames = [undefined, null, 42, ' \t ', 'x'.repeat(101)]
    for (const name of invalidNames) {
      const body = name === undefined ? {} : { name }
      await request(app).patch(`/api/seasons/${season.id}`).send(body).expect(400)
    }
    await request(app).patch('/api/seasons/missing').send({ name: 'Valid Name' }).expect(404)
    const persisted = (await request(app).get(`/api/seasons/${season.id}`).expect(200)).body.season
    expect(persisted).toEqual(season)
  })

  it('reassigns and unassigns groups while preserving rename, archive and attendance', async () => {
    const first = (await request(app).post('/api/seasons').send({ name: 'First' }).expect(201)).body
    const second = (await request(app).post('/api/seasons').send({ name: 'Second' }).expect(201)).body
    const group = (await request(app).post('/api/groups').send({ name: 'Group' }).expect(201)).body as Group
    await request(app).put(`/api/groups/${group.id}/meetings`).send({ dates: ['2026-10-07'] }).expect(200)
    await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-10-07/attendance`)
      .send({ presentMemberIds: [] })
      .expect(200)

    const assigned = await request(app)
      .patch(`/api/groups/${group.id}`)
      .send({ seasonId: first.id, name: 'Renamed', archived: true })
      .expect(200)
    expect(assigned.body).toMatchObject({ name: 'Renamed', seasonId: first.id, archivedAt: expect.any(String) })

    const reassigned = await request(app)
      .patch(`/api/groups/${group.id}`)
      .send({ seasonId: second.id })
      .expect(200)
    expect(reassigned.body.seasonId).toBe(second.id)
    expect((await request(app).get(`/api/seasons/${first.id}`).expect(200)).body.groups).toEqual([])
    expect((await request(app).get(`/api/seasons/${second.id}`).expect(200)).body.groups[0].id).toBe(group.id)

    const unassigned = await request(app).patch(`/api/groups/${group.id}`).send({ seasonId: null }).expect(200)
    expect(unassigned.body).not.toHaveProperty('seasonId')
    expect(unassigned.body.meetings[0].attendance).toEqual({
      presentMemberIds: [],
      recordedAt: expect.any(String),
    })
    const summary = (await request(app).get('/api/groups').expect(200)).body[0]
    expect(summary).not.toHaveProperty('seasonId')
    expect((await request(app).get(`/api/groups/${group.id}`).expect(200)).body).not.toHaveProperty('seasonId')
    expect((await request(app).get(`/api/seasons/${second.id}`).expect(200)).body.groups).toEqual([])
  })

  it('rejects an unknown reassignment without changing the group', async () => {
    const season = (await request(app).post('/api/seasons').send({ name: 'Known' }).expect(201)).body
    const group = (await request(app)
      .post('/api/groups')
      .send({ name: 'Assigned', seasonId: season.id })
      .expect(201)).body
    await request(app).patch(`/api/groups/${group.id}`).send({ seasonId: 'missing' }).expect(400)
    const saved = await request(app).get(`/api/groups/${group.id}`).expect(200)
    expect(saved.body.seasonId).toBe(season.id)
  })

  it('keeps legacy groups unassigned and exposes their JSON unchanged', async () => {
    await mkdir(path.join(dataDir, 'groups'), { recursive: true })
    const legacy: Group = {
      id: 'legacy-group',
      name: 'Legacy',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      members: [],
      meetings: [],
    }
    await writeFile(path.join(dataDir, 'groups', `${legacy.id}.json`), JSON.stringify(legacy))

    const direct = await request(app).get(`/api/groups/${legacy.id}`).expect(200)
    expect(direct.body).not.toHaveProperty('seasonId')
    expect((await request(app).get('/api/groups').expect(200)).body[0]).not.toHaveProperty('seasonId')
  })

  it('serializes concurrent assignments so the saved reference is consistent', async () => {
    const seasons = await Promise.all(
      ['A', 'B', 'C'].map(async (name) =>
        (await request(app).post('/api/seasons').send({ name }).expect(201)).body,
      ),
    )
    const group = (await request(app).post('/api/groups').send({ name: 'Busy' }).expect(201)).body as Group
    const responses = await Promise.all(
      Array.from({ length: 18 }, (_, index) =>
        request(app)
          .patch(`/api/groups/${group.id}`)
          .send(index % 4 === 0 ? { seasonId: null } : { seasonId: seasons[index % seasons.length].id }),
      ),
    )
    expect(responses.every((response) => response.status === 200)).toBe(true)

    const saved = (await request(app).get(`/api/groups/${group.id}`).expect(200)).body as Group
    const knownIds = new Set(seasons.map((season) => season.id))
    expect(saved.seasonId === undefined || knownIds.has(saved.seasonId)).toBe(true)
    const detailMemberships = await Promise.all(
      seasons.map(async (season) => {
        const detail = await request(app).get(`/api/seasons/${season.id}`).expect(200)
        return detail.body.groups.some((candidate: Group) => candidate.id === group.id)
      }),
    )
    expect(detailMemberships.filter(Boolean)).toHaveLength(saved.seasonId === undefined ? 0 : 1)
  })
})

describe('Tracks API', () => {
  it('creates and edits a track and its sessions', async () => {
    await request(app).get('/api/tracks').expect(200, [])
    const created = (
      await request(app)
        .post('/api/tracks')
        .send({ name: '  Thinking   Track ', sessions: ['Session 1', ' Session 2 '] })
        .expect(201)
    ).body
    expect(created).toMatchObject({
      name: 'Thinking Track',
      sessions: [
        { name: 'Session 1', id: expect.any(String) },
        { name: 'Session 2', id: expect.any(String) },
      ],
    })

    const renamed = (
      await request(app).patch(`/api/tracks/${created.id}`).send({ name: 'Foundations' }).expect(200)
    ).body
    const added = (
      await request(app)
        .post(`/api/tracks/${created.id}/sessions`)
        .send({ name: 'Session 3' })
        .expect(201)
    ).body
    expect(renamed.name).toBe('Foundations')
    expect(added.sessions.map((session: { name: string }) => session.name)).toEqual([
      'Session 1',
      'Session 2',
      'Session 3',
    ])

    const sessionId = added.sessions[0].id
    const sessionRenamed = (
      await request(app)
        .patch(`/api/tracks/${created.id}/sessions/${sessionId}`)
        .send({ name: 'Introduction' })
        .expect(200)
    ).body
    expect(sessionRenamed.sessions[0].name).toBe('Introduction')
    expect((await request(app).get(`/api/tracks/${created.id}`).expect(200)).body.track).toEqual(
      sessionRenamed,
    )
  })

  it('validates track and session input', async () => {
    await request(app).post('/api/tracks').send({}).expect(400)
    await request(app).post('/api/tracks').send({ name: 'Track', sessions: 'Session 1' }).expect(400)
    await request(app).post('/api/tracks').send({ name: 'Track', sessions: [' '] }).expect(400)
    await request(app).get('/api/tracks/missing').expect(404)
    await request(app).patch('/api/tracks/missing').send({ name: 'Track' }).expect(404)
    const track = (await request(app).post('/api/tracks').send({ name: 'Track' }).expect(201)).body
    await request(app).post(`/api/tracks/${track.id}/sessions`).send({}).expect(400)
    await request(app)
      .patch(`/api/tracks/${track.id}/sessions/missing`)
      .send({ name: 'Session' })
      .expect(404)
  })

  it('assigns groups to tracks and lists assignments', async () => {
    const track = (
      await request(app).post('/api/tracks').send({ name: 'Thinking', sessions: ['Session 1'] }).expect(201)
    ).body
    const group = (
      await request(app).post('/api/groups').send({ name: 'Group 1', trackId: track.id }).expect(201)
    ).body
    expect(group.trackId).toBe(track.id)
    expect((await request(app).get('/api/groups').expect(200)).body[0].trackId).toBe(track.id)
    expect((await request(app).get('/api/tracks').expect(200)).body[0].groups[0].id).toBe(group.id)
    expect((await request(app).get(`/api/tracks/${track.id}`).expect(200)).body.groups[0].id).toBe(group.id)

    const cleared = await request(app)
      .patch(`/api/groups/${group.id}`)
      .send({ trackId: null })
      .expect(200)
    expect(cleared.body).not.toHaveProperty('trackId')
    expect((await request(app).get(`/api/tracks/${track.id}`).expect(200)).body.groups).toEqual([])
  })

  it('only assigns sessions from the group track and preserves them when dates change', async () => {
    const thinking = (
      await request(app).post('/api/tracks').send({ name: 'Thinking', sessions: ['Session 1'] }).expect(201)
    ).body
    const other = (
      await request(app).post('/api/tracks').send({ name: 'Other', sessions: ['Other Session'] }).expect(201)
    ).body
    const group = (
      await request(app).post('/api/groups').send({ name: 'Group 1', trackId: thinking.id }).expect(201)
    ).body
    await request(app)
      .put(`/api/groups/${group.id}/meetings`)
      .send({ dates: ['2026-10-07'] })
      .expect(200)

    const assigned = await request(app)
      .patch(`/api/groups/${group.id}/meetings/2026-10-07/session`)
      .send({ sessionId: thinking.sessions[0].id })
      .expect(200)
    expect(assigned.body.meetings[0].sessionId).toBe(thinking.sessions[0].id)
    await request(app)
      .patch(`/api/groups/${group.id}/meetings/2026-10-07/session`)
      .send({ sessionId: other.sessions[0].id })
      .expect(400)

    const extended = await request(app)
      .put(`/api/groups/${group.id}/meetings`)
      .send({ dates: ['2026-10-07', '2026-10-14'] })
      .expect(200)
    expect(extended.body.meetings[0].sessionId).toBe(thinking.sessions[0].id)

    const changed = await request(app)
      .patch(`/api/groups/${group.id}`)
      .send({ trackId: other.id })
      .expect(200)
    expect(changed.body.meetings[0]).not.toHaveProperty('sessionId')
  })

  it('requires a group track for session assignment and rejects unknown tracks', async () => {
    const group = (await request(app).post('/api/groups').send({ name: 'Unassigned' }).expect(201)).body
    await request(app)
      .put(`/api/groups/${group.id}/meetings`)
      .send({ dates: ['2026-10-07'] })
      .expect(200)
    await request(app)
      .patch(`/api/groups/${group.id}/meetings/2026-10-07/session`)
      .send({ sessionId: 'session' })
      .expect(400)
    await request(app).patch(`/api/groups/${group.id}`).send({ trackId: 'missing' }).expect(400)
    await request(app).post('/api/groups').send({ name: 'Bad', trackId: 'missing' }).expect(400)
  })
})

describe('GET /api/stats', () => {
  it('returns totals, weekly and per-group stats, honouring filters', async () => {
    const group = await createGroupWithMembers(['Ann', 'Ben', 'Cal', 'Dee'])
    const other = (await request(app).post('/api/groups').send({ name: 'Another Group' }).expect(201)).body as Group
    await request(app)
      .put(`/api/groups/${group.id}/meetings`)
      .send({ dates: ['2026-09-30', '2026-10-07', '2026-10-14'] })
      .expect(200)
    const [ann, ben] = group.members
    await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-09-30/attendance`)
      .send({ presentMemberIds: [ann.id, ben.id] })
      .expect(200)
    await request(app)
      .put(`/api/groups/${group.id}/meetings/2026-10-07/attendance`)
      .send({ presentMemberIds: [ann.id] })
      .expect(200)

    const all = await request(app).get('/api/stats?today=2026-10-14').expect(200)
    expect(all.body.totals).toMatchObject({
      present: 3,
      expected: 8,
      absent: 5,
      meetingsWithAttendance: 2,
      meetingsWithoutAttendance: 1,
      upcomingMeetings: 0,
    })
    expect(all.body.weeks.map((w: { weekStart: string }) => w.weekStart)).toEqual(['2026-09-27', '2026-10-04'])
    expect(all.body.allGroups.map((g: { name: string }) => g.name)).toEqual(['Another Group', 'Wednesday Group'])

    const filtered = await request(app)
      .get(`/api/stats?group=${other.id}&group=unknown&today=2026-10-14`)
      .expect(200)
    expect(filtered.body.filter.groupIds).toEqual([other.id])
    expect(filtered.body.totals.rate).toBeNull()

    const ranged = await request(app).get('/api/stats?from=2026-10-01&to=2026-10-31&today=2026-10-14').expect(200)
    expect(ranged.body.totals).toMatchObject({ present: 1, expected: 4 })

    await request(app).get('/api/stats?from=10/01/2026').expect(400)
    await request(app).get('/api/stats?from=2026-10-31&to=2026-10-01').expect(400)
  })

  it('uses current season assignments and intersects season, group and date filters', async () => {
    const spring = (await request(app).post('/api/seasons').send({ name: 'Spring' }).expect(201)).body
    const fall = (await request(app).post('/api/seasons').send({ name: 'Fall' }).expect(201)).body
    const empty = (await request(app).post('/api/seasons').send({ name: 'Empty' }).expect(201)).body
    const springGroup = (
      await request(app).post('/api/groups').send({ name: 'Spring Group', seasonId: spring.id }).expect(201)
    ).body as Group
    const fallGroup = (
      await request(app).post('/api/groups').send({ name: 'Fall Group', seasonId: fall.id }).expect(201)
    ).body as Group
    const unassigned = (await request(app).post('/api/groups').send({ name: 'Unassigned Group' }).expect(201))
      .body as Group

    for (const group of [springGroup, fallGroup, unassigned]) {
      await request(app)
        .put(`/api/groups/${group.id}/meetings`)
        .send({ dates: ['2026-10-07', '2026-10-14'] })
        .expect(200)
      await request(app)
        .put(`/api/groups/${group.id}/meetings/2026-10-07/attendance`)
        .send({ presentMemberIds: [] })
        .expect(200)
    }

    const seasonOnly = await request(app)
      .get(`/api/stats?season=${spring.id}&today=2026-10-14`)
      .expect(200)
    expect(seasonOnly.body.filter.seasonId).toBe(spring.id)
    expect(seasonOnly.body.groups.map((group: Group) => group.id)).toEqual([springGroup.id])
    expect(seasonOnly.body.totals).toMatchObject({ meetingsWithAttendance: 1, meetingsWithoutAttendance: 1 })

    const intersection = await request(app)
      .get(
        `/api/stats?season=${spring.id}&group=${springGroup.id}&from=2026-10-14&to=2026-10-14&today=2026-10-14`,
      )
      .expect(200)
    expect(intersection.body.filter.groupIds).toEqual([springGroup.id])
    expect(intersection.body.groups.map((group: Group) => group.id)).toEqual([springGroup.id])
    expect(intersection.body.totals.meetingsWithAttendance).toBe(0)
    expect(intersection.body.totals.meetingsWithoutAttendance).toBe(1)

    const disjointGroups = await request(app)
      .get(`/api/stats?season=${spring.id}&group=${fallGroup.id}&today=2026-10-14`)
      .expect(200)
    expect(disjointGroups.body.groups).toEqual([])
    expect(disjointGroups.body.filter.groupIds).toEqual([fallGroup.id])

    const unknownGroupsOnly = await request(app)
      .get(`/api/stats?season=${spring.id}&group=missing&today=2026-10-14`)
      .expect(200)
    expect(unknownGroupsOnly.body.filter.groupIds).toEqual([])
    expect(unknownGroupsOnly.body.groups).toEqual([])

    const previouslySpring = await request(app)
      .patch(`/api/groups/${springGroup.id}`)
      .send({ seasonId: fall.id })
      .expect(200)
    expect(previouslySpring.body.seasonId).toBe(fall.id)
    const oldSeason = await request(app)
      .get(`/api/stats?season=${spring.id}&today=2026-10-14`)
      .expect(200)
    const newSeason = await request(app)
      .get(`/api/stats?season=${fall.id}&today=2026-10-14`)
      .expect(200)
    expect(oldSeason.body.groups).toEqual([])
    expect(newSeason.body.groups.map((group: Group) => group.id)).toEqual([fallGroup.id, springGroup.id])

    for (const seasonId of ['missing', empty.id]) {
      const noMatches = await request(app).get(`/api/stats?season=${seasonId}&today=2026-10-14`).expect(200)
      expect(noMatches.body.filter.seasonId).toBe(seasonId)
      expect(noMatches.body.groups).toEqual([])
      expect(noMatches.body.weeks).toEqual([])
      expect(noMatches.body.totals).toMatchObject({
        present: 0,
        expected: 0,
        meetingsWithAttendance: 0,
        meetingsWithoutAttendance: 0,
        upcomingMeetings: 0,
      })
    }
  })
})
