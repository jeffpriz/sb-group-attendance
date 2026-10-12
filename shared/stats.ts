import { weekStart, weekStartsBetween } from './weeks.ts'
import type { Group, Meeting, Member } from './types.ts'

/*
 * How attendance statistics are calculated
 * ----------------------------------------
 * Only meetings where attendance was taken (saved) count toward rates.
 *
 * For each of those meetings, the "expected" members are:
 *   - everyone who was in the group on the meeting day, or when the
 *     attendance was saved (so attendance entered later for a past meeting
 *     still counts members added just before entering it), plus
 *   - anyone marked present (even if since removed).
 * Members added after both the meeting and its attendance don't count
 * against that meeting, and removed members still count for meetings from
 * while they were in the group.
 *
 * Attendance % = total present marks / total expected, over all included
 * meetings (a weighted rate, so bigger meetings count more than small ones).
 */

/** True when the member belonged to the group at the ISO timestamp `at`. */
function inGroupAt(member: Member, at: string): boolean {
  return member.addedAt <= at && (!member.removedAt || member.removedAt > at)
}

/**
 * Members expected at a meeting (see the rules above). `savedAt` defaults
 * to when the attendance was saved, or now if it hasn't been saved yet (so
 * current members are included).
 */
export function expectedMembers(
  group: Group,
  meeting: Meeting,
  savedAt = meeting.attendance?.recordedAt ?? new Date().toISOString(),
): Member[] {
  const present = new Set(meeting.attendance?.presentMemberIds ?? [])
  const endOfMeetingDay = `${meeting.date}T23:59:59.999Z`
  return group.members.filter(
    (m) => present.has(m.id) || inGroupAt(m, savedAt) || inGroupAt(m, endOfMeetingDay),
  )
}

export interface StatsFilter {
  /** Only these groups (all groups when empty or missing). */
  groupIds?: string[]
  /** Only meetings on or after this date (YYYY-MM-DD). */
  from?: string
  /** Only meetings on or before this date (YYYY-MM-DD). */
  to?: string
  /** Today's date (YYYY-MM-DD), used to tell missed meetings from upcoming ones. */
  today: string
}

export interface Tally {
  present: number
  expected: number
  absent: number
  /** present / expected, 0–1, or null when nothing is expected. */
  rate: number | null
}

export interface WeekStats extends Tally {
  /** The Sunday that starts the week (YYYY-MM-DD). */
  weekStart: string
  /** Meetings with attendance taken that week. */
  meetings: number
}

export interface GroupStats extends Tally {
  id: string
  name: string
  meetingsWithAttendance: number
  /** Past (or today's) scheduled meetings with no attendance saved. */
  meetingsWithoutAttendance: number
}

export interface AttendanceStats {
  totals: Tally & {
    meetingsWithAttendance: number
    meetingsWithoutAttendance: number
    upcomingMeetings: number
  }
  /** Every week from the first to the last week with attendance (weeks with no meetings have rate null). */
  weeks: WeekStats[]
  groups: GroupStats[]
}

function tally(present: number, expected: number): Tally {
  return { present, expected, absent: expected - present, rate: expected > 0 ? present / expected : null }
}

export function computeStats(allGroups: Group[], filter: StatsFilter): AttendanceStats {
  const wanted = filter.groupIds?.length ? new Set(filter.groupIds) : undefined
  const groups = allGroups.filter((g) => !wanted || wanted.has(g.id))
  const inRange = (date: string) => (!filter.from || date >= filter.from) && (!filter.to || date <= filter.to)

  const weekly = new Map<string, { present: number; expected: number; meetings: number }>()
  const groupStats: GroupStats[] = []
  let present = 0
  let expected = 0
  let withAttendance = 0
  let withoutAttendance = 0
  let upcoming = 0

  for (const group of groups) {
    let gPresent = 0
    let gExpected = 0
    let gWith = 0
    let gWithout = 0
    for (const meeting of group.meetings) {
      if (!inRange(meeting.date)) continue
      if (!meeting.attendance) {
        if (meeting.date <= filter.today) gWithout++
        else upcoming++
        continue
      }
      const p = meeting.attendance.presentMemberIds.length
      const e = expectedMembers(group, meeting).length
      gPresent += p
      gExpected += e
      gWith++
      const key = weekStart(meeting.date)
      const week = weekly.get(key) ?? { present: 0, expected: 0, meetings: 0 }
      week.present += p
      week.expected += e
      week.meetings++
      weekly.set(key, week)
    }
    present += gPresent
    expected += gExpected
    withAttendance += gWith
    withoutAttendance += gWithout
    groupStats.push({
      id: group.id,
      name: group.name,
      meetingsWithAttendance: gWith,
      meetingsWithoutAttendance: gWithout,
      ...tally(gPresent, gExpected),
    })
  }

  const keys = [...weekly.keys()].sort()
  const weeks: WeekStats[] = keys.length
    ? weekStartsBetween(keys[0], keys[keys.length - 1]).map((start) => {
        const w = weekly.get(start) ?? { present: 0, expected: 0, meetings: 0 }
        return { weekStart: start, meetings: w.meetings, ...tally(w.present, w.expected) }
      })
    : []

  groupStats.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  return {
    totals: {
      ...tally(present, expected),
      meetingsWithAttendance: withAttendance,
      meetingsWithoutAttendance: withoutAttendance,
      upcomingMeetings: upcoming,
    },
    weeks,
    groups: groupStats,
  }
}
