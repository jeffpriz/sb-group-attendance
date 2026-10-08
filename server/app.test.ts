import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
  })

  it('deletes a group', async () => {
    const group = await createGroupWithMembers([])
    await request(app).delete(`/api/groups/${group.id}`).expect(204)
    await request(app).get(`/api/groups/${group.id}`).expect(404)
  })

  it('returns JSON errors for unknown API routes and bad JSON', async () => {
    const res = await request(app).get('/api/nope').expect(404)
    expect(res.body).toEqual({ error: 'Not found' })
    await request(app).post('/api/groups').set('Content-Type', 'application/json').send('{bad').expect(400)
  })
})
