import { Link } from 'react-router'
import { formatDate, todayIso } from '../../shared/dates.ts'
import type { GroupSummary } from '../../shared/types.ts'

interface Props {
  group: GroupSummary
  seasonName?: string
  changing?: boolean
  archiveAction?: () => void
  removing?: boolean
  removeAction?: () => void
  removeError?: string
}

export default function GroupCard({
  group,
  seasonName,
  changing,
  archiveAction,
  removing,
  removeAction,
  removeError,
}: Props) {
  const today = todayIso()
  const next = group.meetingDates.find((date) => date >= today)
  const initials = group.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')

  return (
    <li className={`group-list-item${removeAction ? ' group-list-item-removable' : ''}`}>
      <div className={`group-card${removeAction ? ' group-card-removable' : ''}`}>
        <Link to={`/groups/${group.id}`} className="group-card-main">
          <span className="group-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="group-card-identity">
            <span className="group-card-name">{group.name}</span>
            <span className="group-card-meta">
              {group.archived ? 'Archived group' : 'Active group'}
            </span>
          </span>
        </Link>
        <div className="group-card-season">
          {group.seasonId ? (
            <Link to={`/seasons/${group.seasonId}`} className="group-season-link">
              {seasonName ?? 'View season'}
            </Link>
          ) : (
            <span className="group-card-empty">No season</span>
          )}
        </div>
        <div className="group-card-members">
          <strong>{group.memberCount}</strong>
          <span>{group.memberCount === 1 ? 'member' : 'members'}</span>
        </div>
        <div className="group-card-next">
          <strong>
            {next
              ? next === today
                ? 'Meeting today'
                : formatDate(next)
              : 'No upcoming meetings'}
          </strong>
          <span>
            {group.recordedMeetingCount} of {group.meetingDates.length} attendance records
          </span>
        </div>
        <div className="group-card-actions">
          {archiveAction && (
            <button
              type="button"
              className="group-card-action"
              onClick={archiveAction}
              disabled={changing}
              aria-label={`${group.archived ? 'Restore' : 'Archive'} ${group.name}`}
            >
              {changing ? 'Saving…' : group.archived ? 'Restore' : 'Archive'}
            </button>
          )}
          {removeAction && (
            <button
              type="button"
              className="group-card-action danger"
              onClick={removeAction}
              disabled={removing}
              aria-busy={removing}
              aria-label={`Remove ${group.name} from season`}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>
      {removeError && (
        <p className="group-card-row-error" role="alert">
          {removeError}{' '}
          <button
            type="button"
            className="link-button"
            onClick={removeAction}
            disabled={removing}
          >
            Retry
          </button>
        </p>
      )}
    </li>
  )
}
