import { describe, expect, it } from 'vitest'
import { groupSectionFromPath } from './groupNavigation.ts'

describe('groupSectionFromPath', () => {
  it('keeps attendance active for the group home and meeting details', () => {
    expect(groupSectionFromPath('/groups/group-1', 'group-1')).toBe('attendance')
    expect(groupSectionFromPath('/groups/group-1/', 'group-1')).toBe('attendance')
    expect(groupSectionFromPath('/groups/group-1/meetings/2026-11-20', 'group-1')).toBe(
      'attendance',
    )
  })

  it.each([
    ['/groups/group-1/members', 'members'],
    ['/groups/group-1/schedule', 'schedule'],
    ['/groups/group-1/history', 'history'],
  ])('identifies the %s route as %s', (pathname, expected) => {
    expect(groupSectionFromPath(pathname, 'group-1')).toBe(expected)
  })

  it('does not mark a tab active for another group or unknown route', () => {
    expect(groupSectionFromPath('/groups/group-2/members', 'group-1')).toBeUndefined()
    expect(groupSectionFromPath('/groups/group-1/unknown', 'group-1')).toBeUndefined()
  })
})
