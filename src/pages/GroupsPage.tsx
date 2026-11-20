import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { formatDate, todayIso } from '../../shared/dates.ts'
import type { GroupSummary } from '../../shared/types.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { errorMessage, plural } from '../util.ts'

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>()
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [changingId, setChangingId] = useState<string>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const showingArchived = searchParams.get('view') === 'archived'

  useEffect(() => {
    document.title = 'Group Attendance · Springbrook Community Church'
    api.listGroups().then(setGroups, (err) => setError(errorMessage(err)))
  }, [])

  async function createGroup(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(undefined)
    try {
      const group = await api.createGroup(name)
      navigate(`/groups/${group.id}/members`, { state: { justCreated: true } })
    } catch (err) {
      setError(errorMessage(err))
      setCreating(false)
    }
  }

  async function setArchived(group: GroupSummary) {
    setChangingId(group.id)
    setError(undefined)
    try {
      await api.setGroupArchived(group.id, !group.archived)
      setGroups((current) =>
        current?.map((item) => (item.id === group.id ? { ...item, archived: !item.archived } : item)),
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setChangingId(undefined)
    }
  }

  const today = todayIso()
  const activeCount = groups?.filter((group) => !group.archived).length
  const archivedCount = groups?.filter((group) => group.archived).length
  const visibleGroups = groups?.filter((group) => group.archived === showingArchived)

  return (
    <>
      <div className="section-head">
        <h1>{showingArchived ? 'Archived groups' : 'Groups'}</h1>
        <div className="section-actions">
          <Link to={showingArchived ? '/' : '/?view=archived'} className="button">
            {showingArchived
              ? `Active groups${activeCount === undefined ? '' : ` (${activeCount})`}`
              : `Archived groups${archivedCount === undefined ? '' : ` (${archivedCount})`}`}
          </Link>
          {groups && groups.length > 0 && (
            <Link to="/stats" className="button">
              View statistics
            </Link>
          )}
        </div>
      </div>
      {showingArchived && (
        <p className="muted">
          Archived groups are kept with all their members, meetings, and attendance history.
        </p>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      {groups === undefined && !error && <p className="muted">Loading groups…</p>}
      {visibleGroups?.length === 0 && (
        <div className="card empty">
          <p>
            {showingArchived
              ? 'No archived groups.'
              : 'No active groups yet. Restore an archived group or create one below.'}
          </p>
        </div>
      )}

      {visibleGroups && visibleGroups.length > 0 && (
        <ul className="group-list">
          {visibleGroups.map((group) => {
            const next = group.meetingDates.find((d) => d >= today)
            return (
              <li key={group.id} className="group-list-item">
                <Link to={`/groups/${group.id}`} className="group-card">
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
                <button
                  type="button"
                  className="group-card-action link-button"
                  onClick={() => void setArchived(group)}
                  disabled={changingId === group.id}
                  aria-label={`${group.archived ? 'Restore' : 'Archive'} ${group.name}`}
                >
                  {changingId === group.id ? 'Saving…' : group.archived ? 'Restore' : 'Archive'}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!showingArchived && (
        <form className="card" onSubmit={createGroup}>
          <h2>Create a group</h2>
          <label className="field">
            <span>Group name</span>
            <div className="input-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tuesday Night Men's Group"
                maxLength={100}
                required
              />
              <button type="submit" className="primary" disabled={creating || !name.trim()}>
                {creating ? 'Creating…' : 'Create group'}
              </button>
            </div>
          </label>
        </form>
      )}
    </>
  )
}
