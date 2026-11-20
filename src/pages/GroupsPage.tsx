import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { GroupSummary, SeasonSummary } from '../../shared/types.ts'
import { api } from '../api.ts'
import GroupCard from '../components/GroupCard.tsx'
import Notice from '../components/Notice.tsx'
import { errorMessage } from '../util.ts'

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>()
  const [seasons, setSeasons] = useState<SeasonSummary[]>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [seasonId, setSeasonId] = useState('')
  const [creating, setCreating] = useState(false)
  const [changingId, setChangingId] = useState<string>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const showingArchived = searchParams.get('view') === 'archived'

  const load = useCallback(async () => {
    const [groupResult, seasonResult] = await Promise.allSettled([
      api.listGroups(),
      api.listSeasons(),
    ])
    const errors: string[] = []
    if (groupResult.status === 'fulfilled') setGroups(groupResult.value)
    else errors.push(`Groups: ${errorMessage(groupResult.reason)}`)
    if (seasonResult.status === 'fulfilled') setSeasons(seasonResult.value)
    else errors.push(`Seasons: ${errorMessage(seasonResult.reason)}`)
    setError(errors.length ? errors.join(' ') : undefined)
    setLoading(false)
  }, [])

  function retry() {
    setLoading(true)
    void load()
  }

  useEffect(() => {
    document.title = 'Group Attendance · Springbrook Community Church'
    let cancelled = false
    Promise.allSettled([api.listGroups(), api.listSeasons()]).then(([groupResult, seasonResult]) => {
      if (cancelled) return
      const errors: string[] = []
      if (groupResult.status === 'fulfilled') setGroups(groupResult.value)
      else errors.push(`Groups: ${errorMessage(groupResult.reason)}`)
      if (seasonResult.status === 'fulfilled') setSeasons(seasonResult.value)
      else errors.push(`Seasons: ${errorMessage(seasonResult.reason)}`)
      setError(errors.length ? errors.join(' ') : undefined)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function createGroup(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(undefined)
    try {
      const group = await api.createGroup(name, seasonId || undefined)
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
      {error && (
        <Notice kind="error">
          <span>{error}</span>{' '}
          <button type="button" className="link-button" onClick={retry} disabled={loading}>
            Retry
          </button>
        </Notice>
      )}

      {groups === undefined && loading && <p className="muted">Loading groups…</p>}
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
          {visibleGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              seasonName={seasons?.find((season) => season.id === group.seasonId)?.name}
              archiveAction={() => void setArchived(group)}
              changing={changingId === group.id}
            />
          ))}
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
          <label className="field">
            <span>Season (optional)</span>
            <select
              value={seasonId}
              onChange={(event) => setSeasonId(event.target.value)}
              disabled={loading || creating || (seasons === undefined && Boolean(error))}
            >
              <option value="">No season</option>
              {seasons?.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
        </form>
      )}
    </>
  )
}
