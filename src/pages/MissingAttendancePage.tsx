import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { formatDate, todayIso } from '../../shared/dates.ts'
import type { MissingAttendanceMeeting } from '../../shared/types.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { errorMessage } from '../util.ts'

export default function MissingAttendancePage() {
  const [meetings, setMeetings] = useState<MissingAttendanceMeeting[]>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    api.getMissingAttendance(todayIso()).then(
      (response) => {
        if (cancelled) return
        setMeetings(response.meetings)
        setError(undefined)
      },
      (reason) => {
        if (cancelled) return
        setError(errorMessage(reason))
      },
    ).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.title = 'Missing Attendance · Group Attendance'
    let cancelled = false
    api.getMissingAttendance(todayIso()).then(
      (response) => {
        if (cancelled) return
        setMeetings(response.meetings)
        setError(undefined)
      },
      (reason) => {
        if (cancelled) return
        setError(errorMessage(reason))
      },
    ).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const byDate = useMemo(() => {
    const grouped = new Map<string, MissingAttendanceMeeting[]>()
    for (const meeting of meetings ?? []) {
      const items = grouped.get(meeting.date)
      if (items) items.push(meeting)
      else grouped.set(meeting.date, [meeting])
    }
    return [...grouped]
  }, [meetings])

  return (
    <>
      <PageHeader
        title="Missing attendance"
        description="Past scheduled meetings in active groups that still need attendance recorded."
        actions={
          <Link to="/" className="button">
            All groups
          </Link>
        }
      />

      {error && (
        <Notice kind="error">
          <span>{error}</span>{' '}
          <button type="button" className="link-button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </Notice>
      )}
      {meetings === undefined && loading && (
        <p className="muted" role="status">
          Loading meetings…
        </p>
      )}
      {meetings?.length === 0 && (
        <div className="card empty">
          <p>All caught up. No active groups have past meetings missing attendance.</p>
        </div>
      )}
      {byDate.length > 0 && (
        <div className="missing-attendance-list" aria-label="Meetings missing attendance">
          {byDate.map(([date, items]) => (
            <section key={date} aria-labelledby={`missing-date-${date}`}>
              <h2 id={`missing-date-${date}`}>{formatDate(date, 'long')}</h2>
              <ul className="missing-meeting-list">
                {items.map((meeting) => (
                  <li key={`${meeting.groupId}-${meeting.date}`}>
                    <Link to={`/groups/${meeting.groupId}/meetings/${meeting.date}`}>
                      <span>
                        <strong>{meeting.groupName}</strong>
                        <span className="muted missing-meeting-label">Attendance not recorded</span>
                      </span>
                      <span className="button primary">Record attendance</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
