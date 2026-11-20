import type { Group, MissingAttendanceMeeting } from './types.ts'

export interface MissingAttendanceFilter {
  through: string
  includeArchived?: boolean
}

/**
 * Returns missing meetings newest-first, then groups alphabetically within
 * each date. The explicit through date keeps the result independent of the
 * server's time zone.
 */
export function findMissingAttendance(
  groups: Group[],
  { through, includeArchived = false }: MissingAttendanceFilter,
): MissingAttendanceMeeting[] {
  return groups
    .filter((group) => includeArchived || !group.archivedAt)
    .flatMap((group) =>
      group.meetings
        .filter((meeting) => meeting.date < through && !meeting.attendance)
        .map((meeting) => ({
          date: meeting.date,
          groupId: group.id,
          groupName: group.name,
        })),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.groupName.localeCompare(b.groupName, undefined, { sensitivity: 'base' }) ||
        a.groupId.localeCompare(b.groupId),
    )
}
