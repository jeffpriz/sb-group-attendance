import { Link } from 'react-router'
import { formatDate, todayIso } from '../../shared/dates.ts'
import type { GroupSummary } from '../../shared/types.ts'
import { plural } from '../util.ts'

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

  return (
    <li className={`group-list-item${removeAction ? ' group-list-item-removable' : ''}`}>
      <div className={`group-card${removeAction ? ' group-card-removable' : ''}`}>
        <Link to={`/groups/${group.id}`} className="group-card-main">
          <span className="group-card-name">{group.name}</span>
          <span className="group-card-meta">
            {plural(group.memberCount, 'member')} · {plural(group.meetingDates.length, 'meeting')}
          </span>
          <span className="group-card-meta">
            {next
              ? next === today
                ? 'Meeting today'
                : `Next meeting: ${formatDate(next)}`
              : 'No upcoming meetings'}
          </span>
        </Link>
        {group.seasonId && (
          <Link to={`/seasons/${group.seasonId}`} className="group-season-link">
            Season: {seasonName ?? 'View season'}
          </Link>
        )}
      </div>
      {archiveAction && (
        <button
          type="button"
          className="group-card-action link-button"
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
          className="group-card-action link-button danger"
          onClick={removeAction}
          disabled={removing}
          aria-busy={removing}
          aria-label={`Remove ${group.name} from season`}
        >
          {removing ? 'Removing…' : 'Remove from season'}
        </button>
      )}
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
