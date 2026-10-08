import { describe, expect, it } from 'vitest'
import { addDays, fromIsoDate, isValidIsoDate, recurringDates, toIsoDate, uniqueSortedDates } from './dates.ts'

describe('date helpers', () => {
  it('round-trips local dates without time zone drift', () => {
    expect(toIsoDate(fromIsoDate('2026-10-07'))).toBe('2026-10-07')
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('validates YYYY-MM-DD dates', () => {
    expect(isValidIsoDate('2026-10-07')).toBe(true)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('10/7/2026')).toBe(false)
    expect(isValidIsoDate(20261007)).toBe(false)
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('builds weekly and every-other-week schedules', () => {
    // Oct 1, 2026 is a Thursday; Wednesdays after it:
    expect(recurringDates('2026-10-01', '2026-10-31', 3)).toEqual([
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
      '2026-10-28',
    ])
    expect(recurringDates('2026-10-07', '2026-11-04', 3, 2)).toEqual([
      '2026-10-07',
      '2026-10-21',
      '2026-11-04',
    ])
    expect(recurringDates('2026-10-31', '2026-10-01', 3)).toEqual([])
  })

  it('sorts and de-duplicates dates', () => {
    expect(uniqueSortedDates(['2026-10-14', '2026-10-07', '2026-10-14'])).toEqual(['2026-10-07', '2026-10-14'])
  })
})
