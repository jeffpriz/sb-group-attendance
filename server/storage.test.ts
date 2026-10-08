import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GroupStore } from './storage.ts'

let dataDir: string
let store: GroupStore

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'sb-attendance-'))
  store = new GroupStore(dataDir)
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

describe('GroupStore', () => {
  it('returns an empty list before anything is saved', async () => {
    expect(await store.list()).toEqual([])
  })

  it('saves each group as its own JSON file', async () => {
    const group = await store.create('Tuesday Men')
    const file = path.join(dataDir, 'groups', `${group.id}.json`)
    const saved = JSON.parse(await readFile(file, 'utf8'))
    expect(saved).toMatchObject({ id: group.id, name: 'Tuesday Men', members: [], meetings: [] })
    expect(await store.get(group.id)).toEqual(group)
  })

  it('lists groups sorted by name', async () => {
    await store.create('Young Adults')
    await store.create('alpha group')
    expect((await store.list()).map((g) => g.name)).toEqual(['alpha group', 'Young Adults'])
  })

  it('applies concurrent updates one after another without losing any', async () => {
    const group = await store.create('Busy group')
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.update(group.id, (g) => {
          g.members.push({ id: `m${i}`, name: `Member ${i}`, addedAt: new Date().toISOString() })
        }),
      ),
    )
    const saved = await store.get(group.id)
    expect(saved?.members).toHaveLength(20)
    // No leftover temp files from the atomic writes.
    expect(await readdir(path.join(dataDir, 'groups'))).toEqual([`${group.id}.json`])
  })

  it('treats unknown or unsafe IDs as not found', async () => {
    expect(await store.get('does-not-exist')).toBeUndefined()
    expect(await store.get('../../etc/passwd')).toBeUndefined()
    await expect(store.update('nope', () => {})).rejects.toMatchObject({ status: 404 })
  })

  it('deletes a group file', async () => {
    const group = await store.create('Temp')
    await store.delete(group.id)
    expect(await store.get(group.id)).toBeUndefined()
  })
})

describe('GroupStore.init', () => {
  it('creates the data and groups folders when missing', async () => {
    const nested = path.join(dataDir, 'share', 'attendance')
    const fresh = new GroupStore(nested)
    await fresh.init()
    expect((await stat(path.join(nested, 'groups'))).isDirectory()).toBe(true)
    expect(await fresh.isWritable()).toBe(true)
    // The write test leaves nothing behind.
    expect(await readdir(path.join(nested, 'groups'))).toEqual([])
  })

  it('resolves relative paths to absolute ones', () => {
    expect(new GroupStore('some/relative').dataDir).toBe(path.resolve('some/relative'))
  })

  it('removes stale temp files but keeps recent ones and data', async () => {
    const groups = path.join(dataDir, 'groups')
    await mkdir(groups, { recursive: true })
    await writeFile(path.join(groups, 'old.json.1.x.tmp'), '{')
    await writeFile(path.join(groups, 'new.json.1.y.tmp'), '{')
    await writeFile(path.join(groups, 'keep.json'), '{}')
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await utimes(path.join(groups, 'old.json.1.x.tmp'), twoHoursAgo, twoHoursAgo)
    await store.init()
    expect((await readdir(groups)).sort()).toEqual(['keep.json', 'new.json.1.y.tmp'])
  })

  it.skipIf(process.getuid?.() === 0)('fails clearly when the folder is not writable', async () => {
    const locked = path.join(dataDir, 'locked')
    await mkdir(path.join(locked, 'groups'), { recursive: true })
    await chmod(path.join(locked, 'groups'), 0o555)
    try {
      await expect(new GroupStore(locked).init()).rejects.toThrow(/not writable/)
    } finally {
      await chmod(path.join(locked, 'groups'), 0o755)
    }
  })
})
