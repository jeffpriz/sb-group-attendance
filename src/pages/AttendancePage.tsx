import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { formatDate, todayIso } from '../../shared/dates.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { useGroup } from '../groupContext.ts'
import { errorMessage, meetingRoster } from '../util.ts'

/** Mark which members attended one meeting. */
export default function AttendancePage() {
  const { date = '' } = useParams()
  const { group } = useGroup()
  const index = group.meetings.findIndex((m) => m.date === date)
  const meeting = group.meetings[index]

  if (!meeting) {
    return (
      <div className="card">
        <h2>No meeting on {formatDate(date)}</h2>
        <p>
          This date isn't on {group.name}'s schedule. <Link to="../schedule">Add it on the schedule page</Link>.
        </p>
      </div>
    )
  }

  // Remount the checklist when switching meetings so it starts fresh.
  return (
    <AttendanceChecklist
      key={date}
      date={date}
      previous={group.meetings[index - 1]?.date}
      next={group.meetings[index + 1]?.date}
    />
  )
}

function AttendanceChecklist({ date, previous, next }: { date: string; previous?: string; next?: string }) {
  const { group, setGroup } = useGroup()
  const meeting = group.meetings.find((m) => m.date === date)!
  const roster = useMemo(() => meetingRoster(group, meeting), [group, meeting])
  const savedIds = meeting.attendance?.presentMemberIds
  const [present, setPresent] = useState<Set<string>>(() => new Set(savedIds ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [justSaved, setJustSaved] = useState(false)

  const dirty =
    !meeting.attendance ||
    present.size !== savedIds!.length ||
    savedIds!.some((id) => !present.has(id))

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || !meeting.attendance) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, meeting.attendance])

  function toggle(id: string) {
    setJustSaved(false)
    setPresent((current) => {
      const copy = new Set(current)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })
  }

  function setAll(on: boolean) {
    setJustSaved(false)
    setPresent(new Set(on ? roster.map((m) => m.id) : []))
  }

  async function save() {
    setSaving(true)
    setError(undefined)
    try {
      setGroup(await api.saveAttendance(group.id, date, [...present]))
      setJustSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const isFuture = date > todayIso()

  return (
    <div className="attendance">
      <div className="meeting-nav">
        {previous ? (
          <Link to={`../meetings/${previous}`} aria-label="Previous meeting">
            ‹ {formatDate(previous)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`../meetings/${next}`} aria-label="Next meeting">
            {formatDate(next)} ›
          </Link>
        ) : (
          <span />
        )}
      </div>

      <h2 className="meeting-title">{formatDate(date, 'long')}</h2>
      <p className="muted">
        {meeting.attendance
          ? `Attendance saved ${new Date(meeting.attendance.recordedAt).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}`
          : isFuture
            ? 'This meeting is in the future. You can still take attendance ahead of time.'
            : 'Attendance has not been taken yet.'}
      </p>

      {error && (
        <Notice kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </Notice>
      )}
      {justSaved && !dirty && <Notice kind="success">Attendance saved.</Notice>}

      {roster.length === 0 ? (
        <div className="card">
          <p>
            This group has no members yet. <Link to="../members">Add members</Link> first.
          </p>
        </div>
      ) : (
        <>
          <div className="checklist-toolbar">
            <strong>
              {present.size} of {roster.length} present
            </strong>
            <span className="row-actions">
              <button type="button" onClick={() => setAll(true)}>
                Mark all
              </button>
              <button type="button" onClick={() => setAll(false)}>
                Clear
              </button>
            </span>
          </div>
          <ul className="checklist">
            {roster.map((member) => {
              const checked = present.has(member.id)
              return (
                <li key={member.id}>
                  <label className={checked ? 'checked' : ''}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(member.id)} />
                    <span className="check" aria-hidden="true">
                      {checked ? '✓' : ''}
                    </span>
                    <span className="member-name">
                      {member.name}
                      {member.removedAt && <span className="muted"> (no longer in group)</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="save-bar">
            <span className="muted">{dirty ? (meeting.attendance ? 'Unsaved changes' : 'Not saved yet') : 'Saved'}</span>
            <button type="button" className="primary" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save attendance'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
