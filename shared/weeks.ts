/**
 * Week helpers for "YYYY-MM-DD" calendar dates. Weeks start on Sunday.
 *
 * All arithmetic uses UTC day numbers built with Date.UTC(), never
 * `new Date('YYYY-MM-DD')` or local-time math, so results don't depend on
 * the computer's time zone or daylight saving time.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

/** Days since 1970-01-01 for a calendar date. */
export function dayNumber(date: string): number {
  const match = ISO_DATE.exec(date)
  if (!match) throw new Error(`Invalid date: ${date}`)
  const [, y, m, d] = match.map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** Calendar date for a day number. */
export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: string): number {
  // 1970-01-01 was a Thursday (4).
  return (((dayNumber(date) + 4) % 7) + 7) % 7
}

/** The Sunday that starts the week containing `date`. */
export function weekStart(date: string): string {
  return fromDayNumber(dayNumber(date) - weekday(date))
}

/** Every week start (Sundays) from the week of `first` to the week of `last`, inclusive. */
export function weekStartsBetween(first: string, last: string): string[] {
  const start = dayNumber(weekStart(first))
  const end = dayNumber(weekStart(last))
  const weeks: string[] = []
  for (let day = start; day <= end && weeks.length < 1000; day += 7) weeks.push(fromDayNumber(day))
  return weeks
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 11" (or "Oct 11, 2026" with `withYear`) without any time zone conversion. */
export function shortDateLabel(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`
}
