import { describe, expect, it } from 'vitest'
import type { Group } from './types.ts'
import { findMissingAttendance } from './missingAttendance.ts'

function group(overrides: Partial<Group>): Group {
  return {
    id: 'group-1',
    name: 'Group One',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    members: [],
    meetings: [],
    ...overrides,
  }
}

describe('missing attendance', () => {
  it('includes only unrecorded past meetings from active groups', () => {
    const recorded = {
      presentMemberIds: [],
      recordedAt: '2026-11-10T00:00:00.000Z',
    }
    const groups = [
      group({
        id: 'zeta',
        name: 'Zeta',
        meetings: [
          { date: '2026-11-10' },
          { date: '2026-11-12' },
          { date: '2026-11-09', attendance: recorded },
        ],
      }),
      group({ id: 'alpha', name: 'Alpha', meetings: [{ date: '2026-11-10' }] }),
      group({
        id: 'archived',
        name: 'Archived',
        archivedAt: '2026-11-01T00:00:00.000Z',
        meetings: [{ date: '2026-11-08' }],
      }),
    ]

    expect(findMissingAttendance(groups, { through: '2026-11-11' })).toEqual([
      { date: '2026-11-10', groupId: 'alpha', groupName: 'Alpha' },
      { date: '2026-11-10', groupId: 'zeta', groupName: 'Zeta' },
    ])
  })

  it('can include archived groups for future reporting extensions', () => {
    const archived = group({
      archivedAt: '2026-11-01T00:00:00.000Z',
      meetings: [{ date: '2026-11-01' }],
    })

    expect(findMissingAttendance([archived], { through: '2026-11-02', includeArchived: true }))
      .toHaveLength(1)
  })
})
