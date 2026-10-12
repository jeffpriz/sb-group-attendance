import { describe, expect, it } from 'vitest'
import { computeStats, expectedMembers } from './stats.ts'
import type { Group, Member } from './types.ts'

const member = (id: string, addedAt = '2026-09-01T12:00:00.000Z', removedAt?: string): Member => ({
  id,
  name: id.toUpperCase(),
  addedAt,
  ...(removedAt ? { removedAt } : {}),
})

const recorded = (date: string, present: string[], recordedAt = `${date}T23:00:00.000Z`) => ({
  date,
  attendance: { presentMemberIds: present, recordedAt },
})

function group(id: string, name: string, members: Member[], meetings: Group['meetings']): Group {
  return { id, name, createdAt: '', updatedAt: '', members, meetings }
}

// Sunday group: 4 members
const sunday = group(
  'sun',
  'Sunday Group',
  [member('a'), member('b'), member('c'), member('d')],
  [
    recorded('2026-10-04', ['a', 'b', 'c']), // 3/4
    recorded('2026-10-11', ['a', 'b']), // 2/4
    { date: '2026-10-18' }, // not taken (past)
    { date: '2026-11-01' }, // upcoming
  ],
)

// Wednesday group: 2 members
const wednesday = group(
  'wed',
  'Wednesday Group',
  [member('x'), member('y')],
  [
    recorded('2026-10-07', ['x', 'y']), // 2/2, week of Oct 4
    recorded('2026-10-14', ['x']), // 1/2, week of Oct 11
    recorded('2026-10-28', []), // 0/2, week of Oct 25
  ],
)

const today = '2026-10-20'

describe('computeStats', () => {
  it('computes the weighted total across all groups', () => {
    const { totals } = computeStats([sunday, wednesday], { today })
    // present 3+2+2+1+0 = 8, expected 4+4+2+2+2 = 14
    expect(totals.present).toBe(8)
    expect(totals.expected).toBe(14)
    expect(totals.absent).toBe(6)
    expect(totals.rate).toBeCloseTo(8 / 14)
    expect(totals.meetingsWithAttendance).toBe(5)
    expect(totals.meetingsWithoutAttendance).toBe(1)
    expect(totals.upcomingMeetings).toBe(1)
  })

  it('groups Sunday and Wednesday meetings into the same Sunday-start week, with empty weeks in between', () => {
    const { weeks } = computeStats([sunday, wednesday], { today })
    expect(weeks.map((w) => [w.weekStart, w.present, w.expected, w.meetings])).toEqual([
      ['2026-10-04', 5, 6, 2],
      ['2026-10-11', 3, 6, 2],
      ['2026-10-18', 0, 0, 0],
      ['2026-10-25', 0, 2, 1],
    ])
    expect(weeks[2].rate).toBeNull()
    expect(weeks[3].rate).toBe(0)
  })

  it('filters by group and date range', () => {
    const one = computeStats([sunday, wednesday], { today, groupIds: ['wed'] })
    expect(one.totals.rate).toBeCloseTo(3 / 6)
    expect(one.groups.map((g) => g.id)).toEqual(['wed'])

    const ranged = computeStats([sunday, wednesday], { today, from: '2026-10-08', to: '2026-10-20' })
    // Oct 11 (2/4) and Oct 14 (1/2); Oct 18 not taken
    expect([ranged.totals.present, ranged.totals.expected]).toEqual([3, 6])
    expect(ranged.totals.meetingsWithoutAttendance).toBe(1)
  })

  it('reports per-group summaries sorted by name', () => {
    const { groups } = computeStats([wednesday, sunday], { today })
    expect(groups.map((g) => [g.name, g.meetingsWithAttendance, g.meetingsWithoutAttendance, g.present, g.expected])).toEqual([
      ['Sunday Group', 2, 1, 5, 8],
      ['Wednesday Group', 3, 0, 3, 6],
    ])
  })

  it('returns empty results when nothing has been recorded', () => {
    const stats = computeStats([group('g', 'Empty', [member('a')], [{ date: '2026-10-01' }])], { today })
    expect(stats.totals.rate).toBeNull()
    expect(stats.weeks).toEqual([])
    expect(stats.totals.meetingsWithoutAttendance).toBe(1)
  })
})

describe('expectedMembers', () => {
  const meeting = recorded('2026-10-07', ['gone'], '2026-10-07T23:00:00.000Z')

  it('counts members removed later, and anyone marked present', () => {
    const g = group('g', 'G', [member('gone', undefined, '2026-10-10T00:00:00.000Z'), member('stay')], [meeting])
    expect(expectedMembers(g, meeting).map((m) => m.id)).toEqual(['gone', 'stay'])
  })

  it('does not count members removed before the meeting', () => {
    const m2 = recorded('2026-10-14', ['stay'])
    const g = group('g', 'G', [member('gone', undefined, '2026-10-10T00:00:00.000Z'), member('stay')], [m2])
    expect(expectedMembers(g, m2).map((m) => m.id)).toEqual(['stay'])
  })

  it('does not count members who joined after the meeting and after attendance was saved', () => {
    const g = group('g', 'G', [member('gone'), member('new', '2026-10-12T00:00:00.000Z')], [meeting])
    expect(expectedMembers(g, meeting).map((m) => m.id)).toEqual(['gone'])
  })

  it('counts members added before attendance was entered late for a past meeting', () => {
    const late = recorded('2026-10-07', [], '2026-10-12T15:00:00.000Z')
    const g = group('g', 'G', [member('new', '2026-10-12T14:00:00.000Z')], [late])
    expect(expectedMembers(g, late).map((m) => m.id)).toEqual(['new'])
  })
})
