import { expectedMembers } from '../shared/stats.ts'
import type { Group, Meeting, Member } from '../shared/types.ts'

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function activeMembers(group: Group): Member[] {
  return group.members.filter((m) => !m.removedAt).sort(byName)
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`
}

/**
 * Members counted for a meeting, using the same rules as the statistics
 * (see shared/stats.ts): members in the group on the meeting day or when
 * attendance was saved (or now, if not saved yet), plus anyone marked present.
 */
export function meetingRoster(group: Group, meeting: Meeting): Member[] {
  return expectedMembers(group, meeting).sort(byName)
}

/**
 * Members to show when taking or editing attendance. Saving stamps the
 * attendance with the current time, so current members are always included.
 */
export function editableRoster(group: Group, meeting: Meeting): Member[] {
  return expectedMembers(group, meeting, new Date().toISOString()).sort(byName)
}
