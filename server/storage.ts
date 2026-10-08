import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Group } from '../shared/types.ts'

/** Error with an HTTP status code, turned into a JSON response by the API. */
export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/

/**
 * Stores each group (members, meeting schedule and attendance) as its own
 * JSON file: `<dataDir>/groups/<groupId>.json`.
 *
 * Writes go to a temporary file first and are then renamed over the real
 * file, so a crash mid-write never leaves a half-written JSON file. Updates
 * to the same group are queued so concurrent requests can't overwrite each
 * other's changes.
 */
export class GroupStore {
  readonly groupsDir: string
  private readonly locks = new Map<string, Promise<unknown>>()

  constructor(dataDir: string) {
    this.groupsDir = path.join(dataDir, 'groups')
  }

  private fileFor(id: string): string {
    if (!ID_PATTERN.test(id)) throw new HttpError(404, 'Group not found')
    return path.join(this.groupsDir, `${id}.json`)
  }

  async list(): Promise<Group[]> {
    let names: string[]
    try {
      names = await readdir(this.groupsDir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    const groups: Group[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const group = await this.get(name.slice(0, -'.json'.length)).catch(() => undefined)
      if (group) groups.push(group)
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  async get(id: string): Promise<Group | undefined> {
    try {
      const text = await readFile(this.fileFor(id), 'utf8')
      return JSON.parse(text) as Group
    } catch (err) {
      if (err instanceof HttpError) return undefined
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw err
    }
  }

  async create(name: string): Promise<Group> {
    const now = new Date().toISOString()
    const group: Group = {
      id: randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      members: [],
      meetings: [],
    }
    await this.write(group)
    return group
  }

  /**
   * Loads a group, lets `change` modify it, and saves the result. Calls for
   * the same group run one after another.
   */
  async update(id: string, change: (group: Group) => void): Promise<Group> {
    return this.withLock(id, async () => {
      const group = await this.get(id)
      if (!group) throw new HttpError(404, 'Group not found')
      change(group)
      group.updatedAt = new Date().toISOString()
      await this.write(group)
      return group
    })
  }

  async delete(id: string): Promise<void> {
    await this.withLock(id, async () => {
      const file = this.fileFor(id)
      if (!(await this.get(id))) throw new HttpError(404, 'Group not found')
      await rm(file)
    })
  }

  private async write(group: Group): Promise<void> {
    const file = this.fileFor(group.id)
    await mkdir(this.groupsDir, { recursive: true })
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(group, null, 2) + '\n', 'utf8')
    // On Windows a rename can briefly fail if another program (e.g. antivirus)
    // has the file open, so retry a few times before giving up.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, file)
        return
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
          await rm(tmp, { force: true })
          throw err
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }
  }

  private async withLock<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(task)
    this.locks.set(id, run)
    try {
      return await run
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id)
    }
  }
}
