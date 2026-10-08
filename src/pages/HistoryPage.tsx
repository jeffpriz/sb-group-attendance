import { Link } from 'react-router'
import { formatDate } from '../../shared/dates.ts'
import type { Group, Member } from '../../shared/types.ts'
import { useGroup } from '../groupContext.ts'
import { byName, meetingRoster, plural } from '../util.ts'

/** Review attendance for past meetings: per meeting and per member. */
export default function HistoryPage() {
  const { group } = useGroup()
  const recorded = group.meetings.filter((m) => m.attendance)

  if (recorded.length === 0) {
    return (
      <div className="card">
        <h2>No attendance yet</h2>
        <p className="muted">
          Once attendance is taken for a meeting, it shows up here. <Link to="..">Take attendance →</Link>
        </p>
      </div>
    )
  }

  const nameById = new Map(group.members.map((m) => [m.id, m.name]))
  const totals = recorded.map((m) => ({
    meeting: m,
    present: m.attendance!.presentMemberIds.length,
    roster: meetingRoster(group, m).length,
  }))
  const average = totals.reduce((sum, t) => sum + t.present, 0) / totals.length
  const newestFirst = [...totals].reverse()

  // Everyone who is in the group now or attended at least once.
  const attendedIds = new Set(recorded.flatMap((m) => m.attendance!.presentMemberIds))
  const people = group.members.filter((m) => !m.removedAt || attendedIds.has(m.id)).sort(byName)
  const memberStats = people.map((member) => {
    const attended = recorded.filter((m) => m.attendance!.presentMemberIds.includes(member.id))
    return { member, count: attended.length, last: attended.at(-1)?.date }
  })

  return (
    <>
      <section className="stats">
        <div className="stat">
          <span className="stat-value">{recorded.length}</span>
          <span className="stat-label">{recorded.length === 1 ? 'meeting' : 'meetings'} recorded</span>
        </div>
        <div className="stat">
          <span className="stat-value">{average.toFixed(1)}</span>
          <span className="stat-label">average attendance</span>
        </div>
        <div className="stat">
          <span className="stat-value">{Math.max(...totals.map((t) => t.present))}</span>
          <span className="stat-label">highest attendance</span>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>By meeting</h2>
          <button type="button" onClick={() => downloadCsv(group, people)}>
            Download CSV
          </button>
        </div>
        <ul className="history-list">
          {newestFirst.map(({ meeting, present, roster }) => (
            <li key={meeting.date}>
              <details>
                <summary>
                  <span>{formatDate(meeting.date)}</span>
                  <span className="badge badge-ok">
                    {present} of {roster}
                  </span>
                </summary>
                <p>
                  <strong>Present:</strong>{' '}
                  {meeting.attendance!.presentMemberIds.map((id) => nameById.get(id) ?? 'Unknown').sort().join(', ') ||
                    'Nobody'}
                </p>
                <p>
                  <strong>Absent:</strong>{' '}
                  {meetingRoster(group, meeting)
                    .filter((m) => !meeting.attendance!.presentMemberIds.includes(m.id))
                    .map((m) => m.name)
                    .join(', ') || 'Nobody'}
                </p>
                <Link to={`../meetings/${meeting.date}`}>Edit attendance</Link>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>By member</h2>
        <ul className="member-stats">
          {memberStats.map(({ member, count, last }) => {
            const pct = Math.round((count / recorded.length) * 100)
            return (
              <li key={member.id}>
                <div className="member-stats-row">
                  <span className="member-name">
                    {member.name}
                    {member.removedAt && <span className="muted"> (removed)</span>}
                  </span>
                  <span>
                    {count} of {recorded.length} · {pct}%
                  </span>
                </div>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <span className="muted small">
                  {last ? `Last attended ${formatDate(last)}` : 'Has not attended a recorded meeting'}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Attendance grid</h2>
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr>
                <th scope="col">Member</th>
                {recorded.map((m) => (
                  <th key={m.date} scope="col" title={formatDate(m.date)}>
                    {shortDate(m.date)}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {memberStats.map(({ member, count }) => (
                <tr key={member.id}>
                  <th scope="row">{member.name}</th>
                  {recorded.map((m) => {
                    const here = m.attendance!.presentMemberIds.includes(member.id)
                    return (
                      <td key={m.date} className={here ? 'present' : 'absent'}>
                        {here ? '✓' : '–'}
                      </td>
                    )
                  })}
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">{plural(recorded.length, 'meeting')} with attendance recorded.</p>
      </section>
    </>
  )
}

function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function downloadCsv(group: Group, people: Member[]) {
  const recorded = group.meetings.filter((m) => m.attendance)
  const rows = [
    ['Member', ...recorded.map((m) => m.date), 'Total'],
    ...people.map((p) => {
      const marks = recorded.map((m) => (m.attendance!.presentMemberIds.includes(p.id) ? 'Present' : ''))
      return [p.name, ...marks, String(marks.filter(Boolean).length)]
    }),
  ]
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${group.name.replace(/[^\w -]+/g, '').trim() || 'group'} attendance.csv`
  link.click()
  URL.revokeObjectURL(url)
}
