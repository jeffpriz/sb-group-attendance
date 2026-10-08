import { useRef, useState, type FormEvent } from 'react'
import { DayPicker } from 'react-day-picker'
import { Link } from 'react-router'
import {
  addDays,
  formatDate,
  fromIsoDate,
  recurringDates,
  toIsoDate,
  todayIso,
  uniqueSortedDates,
} from '../../shared/dates.ts'
import type { Group } from '../../shared/types.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { useGroup } from '../groupContext.ts'
import { useMediaQuery } from '../hooks.ts'
import { errorMessage, plural } from '../util.ts'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function SchedulePage() {
  const { group, setGroup } = useGroup()
  const wide = useMediaQuery('(min-width: 760px)')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [firstMonth] = useState(() => new Date())
  // Saves are queued so quick clicks on the calendar are applied in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const pending = useRef(0)

  const dates = group.meetings.map((m) => m.date)
  const recorded = new Set(group.meetings.filter((m) => m.attendance).map((m) => m.date))
  const today = todayIso()

  /** Saves a new schedule, asking first if recorded attendance would be lost. */
  function saveSchedule(next: string[], successMessage?: string) {
    const nextDates = uniqueSortedDates(next)
    const losing = dates.filter((d) => recorded.has(d) && !nextDates.includes(d))
    if (losing.length) {
      const list = losing.map((d) => formatDate(d)).join(', ')
      if (!confirm(`Attendance was already taken for ${list}. Remove anyway? That attendance will be deleted.`)) {
        return
      }
    }
    // Show the change right away, then save it in the background.
    setGroup(withDates(group, nextDates))
    setError(undefined)
    setMessage(undefined)
    setSaving(true)
    pending.current++
    queue.current = queue.current
      .then(() => api.setMeetings(group.id, nextDates, losing.length > 0))
      .then(
        (saved) => {
          if (pending.current === 1) setGroup(saved)
          if (successMessage) setMessage(successMessage)
        },
        async (err) => {
          setError(`Couldn't save the schedule: ${errorMessage(err)}`)
          setGroup(await api.getGroup(group.id).catch(() => group))
        },
      )
      .finally(() => {
        pending.current--
        if (pending.current === 0) setSaving(false)
      })
  }

  function onCalendarSelect(selected: Date[] | undefined) {
    saveSchedule((selected ?? []).map(toIsoDate))
  }

  return (
    <>
      {error && (
        <Notice kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </Notice>
      )}
      {message && (
        <Notice kind="success" onDismiss={() => setMessage(undefined)}>
          {message}
        </Notice>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Meeting calendar</h2>
          <span className="save-state" aria-live="polite">
            {saving ? 'Saving…' : 'All changes saved'}
          </span>
        </div>
        <p className="muted">Tap a date to add a meeting. Tap it again to remove it.</p>
        <div className="calendar-wrap">
          <DayPicker
            mode="multiple"
            selected={dates.map(fromIsoDate)}
            onSelect={onCalendarSelect}
            numberOfMonths={wide ? 2 : 1}
            defaultMonth={firstMonth}
            modifiers={{ recorded: [...recorded].map(fromIsoDate) }}
            modifiersClassNames={{ recorded: 'day-recorded' }}
            footer={
              <span className="calendar-footer">
                {plural(dates.length, 'meeting')} scheduled
                {recorded.size > 0 && (
                  <>
                    {' · '}
                    <span className="legend-recorded" /> attendance taken
                  </>
                )}
              </span>
            }
          />
        </div>
      </section>

      <RecurringForm
        onAdd={(newDates, label) =>
          saveSchedule([...dates, ...newDates], `Added ${label}.`)
        }
        existing={dates}
      />

      <section className="card">
        <h2>Scheduled meetings</h2>
        {dates.length === 0 ? (
          <p className="muted">No meetings yet. Pick dates on the calendar above.</p>
        ) : (
          <ul className="meeting-list compact">
            {group.meetings.map((meeting) => (
              <li key={meeting.date} className={meeting.date < today ? 'past' : ''}>
                <Link to={`../meetings/${meeting.date}`}>{formatDate(meeting.date)}</Link>
                {meeting.attendance && <span className="badge badge-ok">Attendance taken</span>}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove meeting on ${formatDate(meeting.date)}`}
                  title="Remove meeting"
                  onClick={() => saveSchedule(dates.filter((d) => d !== meeting.date))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function withDates(group: Group, dates: string[]): Group {
  const existing = new Map(group.meetings.map((m) => [m.date, m]))
  return { ...group, meetings: dates.map((date) => existing.get(date) ?? { date }) }
}

function RecurringForm({
  onAdd,
  existing,
}: {
  onAdd: (dates: string[], label: string) => void
  existing: string[]
}) {
  const today = todayIso()
  const [weekday, setWeekday] = useState(fromIsoDate(today).getDay())
  const [interval, setEvery] = useState(1)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(addDays(today, 91))

  const dates = recurringDates(start, end, weekday, interval)
  const newDates = dates.filter((d) => !existing.includes(d))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!newDates.length) return
    onAdd(newDates, `${plural(newDates.length, 'meeting')} on ${WEEKDAYS[weekday]}s`)
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add a repeating meeting</h2>
      <p className="muted">Quickly fill the calendar with a regular meeting day.</p>
      <div className="form-grid">
        <label className="field">
          <span>Meets every</span>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((day, i) => (
              <option key={day} value={i}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>How often</span>
          <select value={interval} onChange={(e) => setEvery(Number(e.target.value))}>
            <option value={1}>Every week</option>
            <option value={2}>Every other week</option>
            <option value={4}>Every 4 weeks</option>
          </select>
        </label>
        <label className="field">
          <span>Starting</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className="field">
          <span>Ending</span>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
        </label>
      </div>
      <button type="submit" className="primary" disabled={!newDates.length}>
        {newDates.length
          ? `Add ${plural(newDates.length, 'meeting')}`
          : dates.length
            ? 'Already on the calendar'
            : 'No matching dates'}
      </button>
    </form>
  )
}
