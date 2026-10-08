import { Link } from 'react-router'
import { formatDate, todayIso } from '../../shared/dates.ts'
import type { Group, Meeting } from '../../shared/types.ts'
import { useGroup } from '../groupContext.ts'
import { activeMembers, meetingRoster } from '../util.ts'

/** Group home: pick a meeting to take (or review) attendance. */
export default function MeetingsPage() {
  const { group } = useGroup()
  const today = todayIso()
  const members = activeMembers(group)
  const past = group.meetings.filter((m) => m.date <= today).reverse()
  const upcoming = group.meetings.filter((m) => m.date > today)

  // The meeting a leader most likely wants: today's, or the most recent one.
  const featured = past[0]

  return (
    <>
      {members.length === 0 && (
        <div className="card callout">
          <p>
            This group has no members yet. <Link to="members">Add members</Link> so you can take
            attendance.
          </p>
        </div>
      )}
      {group.meetings.length === 0 && (
        <div className="card callout">
          <p>
            No meetings are scheduled yet. <Link to="schedule">Set up the meeting schedule</Link> on
            the calendar.
          </p>
        </div>
      )}

      {featured && (
        <Link to={`meetings/${featured.date}`} className="card featured-meeting">
          <span className="eyebrow">{featured.date === today ? 'Today' : 'Most recent meeting'}</span>
          <span className="featured-date">{formatDate(featured.date, 'long')}</span>
          <span className="featured-status">
            <Status group={group} meeting={featured} />
          </span>
          <span className="button primary">
            {featured.attendance ? 'Review attendance' : 'Take attendance'}
          </span>
        </Link>
      )}

      {past.length > 0 && (
        <section>
          <h2>Past meetings</h2>
          <MeetingList group={group} meetings={past} />
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h2>Upcoming meetings</h2>
          <MeetingList group={group} meetings={upcoming} />
        </section>
      )}
    </>
  )
}

function MeetingList({ group, meetings }: { group: Group; meetings: Meeting[] }) {
  return (
    <ul className="meeting-list">
      {meetings.map((meeting) => (
        <li key={meeting.date}>
          <Link to={`meetings/${meeting.date}`}>
            <span>{formatDate(meeting.date)}</span>
            <Status group={group} meeting={meeting} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Status({ group, meeting }: { group: Group; meeting: Meeting }) {
  if (!meeting.attendance) {
    return meeting.date > todayIso() ? (
      <span className="badge">Scheduled</span>
    ) : (
      <span className="badge badge-warn">Not taken</span>
    )
  }
  const present = meeting.attendance.presentMemberIds.length
  return (
    <span className="badge badge-ok">
      {present} of {meetingRoster(group, meeting).length} present
    </span>
  )
}
