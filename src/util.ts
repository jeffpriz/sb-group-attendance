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
 * Members to show for a meeting: everyone currently in the group, plus any
 * removed members who were marked present at that meeting.
 */
export function meetingRoster(group: Group, meeting: Meeting): Member[] {
  const present = new Set(meeting.attendance?.presentMemberIds ?? [])
  return group.members.filter((m) => !m.removedAt || present.has(m.id)).sort(byName)
}
