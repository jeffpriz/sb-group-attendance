import { describe, expect, it } from 'vitest'
import { dayNumber, fromDayNumber, shortDateLabel, weekStart, weekStartsBetween, weekday } from './weeks.ts'

describe('week bucketing (weeks start on Sunday)', () => {
  it('puts Sunday through Saturday in the same week', () => {
    // Sunday Oct 11 2026 ... Saturday Oct 17 2026
    for (const d of ['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-17']) {
      expect(weekStart(d)).toBe('2026-10-11')
    }
  })

  it('starts a new week on Sunday and ends it on Saturday', () => {
    expect(weekStart('2026-10-10')).toBe('2026-10-04') // Saturday before
    expect(weekStart('2026-10-18')).toBe('2026-10-18') // next Sunday
  })

  it('knows the weekday of a date', () => {
    expect(weekday('2026-10-11')).toBe(0) // Sunday
    expect(weekday('2026-10-14')).toBe(3) // Wednesday
    expect(weekday('2026-10-17')).toBe(6) // Saturday
    expect(weekday('1970-01-01')).toBe(4) // Thursday
    expect(weekday('1969-12-28')).toBe(0) // before the epoch
  })

  it('handles month and year boundaries', () => {
    expect(weekStart('2026-11-03')).toBe('2026-11-01')
    expect(weekStart('2026-10-01')).toBe('2026-09-27') // Thursday -> Sunday in September
    expect(weekStart('2027-01-01')).toBe('2026-12-27') // Friday -> Sunday in the previous year
    expect(weekStart('2028-03-01')).toBe('2028-02-27') // leap year (Feb 29 2028 exists)
    expect(weekStart('2028-02-29')).toBe('2028-02-27')
  })

  it('is unaffected by daylight saving time changes (US: Mar 8 and Nov 1, 2026)', () => {
    expect(weekStart('2026-03-08')).toBe('2026-03-08') // DST starts (Sunday)
    expect(weekStart('2026-03-14')).toBe('2026-03-08')
    expect(weekStart('2026-03-07')).toBe('2026-03-01')
    expect(weekStart('2026-11-01')).toBe('2026-11-01') // DST ends (Sunday)
    expect(weekStart('2026-11-07')).toBe('2026-11-01')
    expect(weekStart('2026-10-31')).toBe('2026-10-25')
    expect(weekStartsBetween('2026-02-25', '2026-03-20')).toEqual([
      '2026-02-22',
      '2026-03-01',
      '2026-03-08',
      '2026-03-15',
    ])
    expect(weekStartsBetween('2026-10-20', '2026-11-12')).toEqual([
      '2026-10-18',
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
    ])
  })

  it('round-trips day numbers', () => {
    expect(fromDayNumber(dayNumber('2026-10-14'))).toBe('2026-10-14')
    expect(dayNumber('2026-10-18') - dayNumber('2026-10-11')).toBe(7)
  })

  it('formats labels without shifting the date', () => {
    expect(shortDateLabel('2026-10-11')).toBe('Oct 11')
    expect(shortDateLabel('2027-01-03', true)).toBe('Jan 3, 2027')
  })

  it('rejects invalid input', () => {
    expect(() => weekStart('10/11/2026')).toThrow()
  })
})
