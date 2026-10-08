/**
 * Date helpers. Meetings are stored as plain calendar dates ("YYYY-MM-DD")
 * so they never shift because of time zones.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Converts a local Date to "YYYY-MM-DD" using its local calendar date. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parses "YYYY-MM-DD" into a local Date at midnight. Throws if invalid. */
export function fromIsoDate(value: string): Date {
  if (!isValidIsoDate(value)) throw new Error(`Invalid date: ${value}`)
  const [, y, m, d] = ISO_DATE.exec(value)!
  return new Date(Number(y), Number(m) - 1, Number(d))
}

/** True when the value is a real calendar date in "YYYY-MM-DD" form. */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** Today's local date as "YYYY-MM-DD". */
export function todayIso(): string {
  return toIsoDate(new Date())
}

/** Adds a number of days to a "YYYY-MM-DD" date. */
export function addDays(value: string, days: number): string {
  const date = fromIsoDate(value)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/**
 * Every date between start and end (inclusive) that falls on the given
 * weekday (0 = Sunday ... 6 = Saturday), repeating every `intervalWeeks`.
 */
export function recurringDates(
  start: string,
  end: string,
  weekday: number,
  intervalWeeks = 1,
): string[] {
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return []
  if (weekday < 0 || weekday > 6 || intervalWeeks < 1) return []
  const first = fromIsoDate(start)
  const offset = (weekday - first.getDay() + 7) % 7
  let current = addDays(start, offset)
  const result: string[] = []
  // Hard cap so a typo like year 9999 can't hang the page.
  while (current <= end && result.length < 520) {
    result.push(current)
    current = addDays(current, 7 * intervalWeeks)
  }
  return result
}

/** Sorted, de-duplicated copy of a list of dates. */
export function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates)].sort()
}

/** e.g. "Wed, Oct 7, 2026" */
export function formatDate(value: string, style: 'long' | 'short' = 'short'): string {
  if (!isValidIsoDate(value)) return value
  return fromIsoDate(value).toLocaleDateString('en-US', {
    weekday: style === 'long' ? 'long' : 'short',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
