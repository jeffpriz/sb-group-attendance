import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
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
  const navigate = useNavigate()

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

  const today = todayIso()

  return (
    <>
      <h1>Groups</h1>
      {error && <Notice kind="error">{error}</Notice>}

      {groups === undefined && !error && <p className="muted">Loading groups…</p>}
      {groups?.length === 0 && (
        <div className="card empty">
          <p>No groups yet. Start by creating your first group below.</p>
        </div>
      )}

      {groups && groups.length > 0 && (
        <ul className="group-list">
          {groups.map((group) => {
            const next = group.meetingDates.find((d) => d >= today)
            return (
              <li key={group.id}>
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
              </li>
            )
          })}
        </ul>
      )}

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
    </>
  )
}
