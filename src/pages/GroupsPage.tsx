import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { todayIso } from '../../shared/dates.ts'
import type { GroupSummary, SeasonSummary } from '../../shared/types.ts'
import { api } from '../api.ts'
import Dialog from '../components/Dialog.tsx'
import GroupCard from '../components/GroupCard.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { errorMessage } from '../util.ts'

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>()
  const [seasons, setSeasons] = useState<SeasonSummary[]>()
  const [missingAttendanceCount, setMissingAttendanceCount] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [seasonId, setSeasonId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const [changingId, setChangingId] = useState<string>()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const showingArchived = searchParams.get('view') === 'archived'

  const load = useCallback(async () => {
    const today = todayIso()
    const [groupResult, seasonResult, missingResult] = await Promise.allSettled([
      api.listGroups(),
      api.listSeasons(),
      api.getMissingAttendance(today),
    ])
    const errors: string[] = []
    if (groupResult.status === 'fulfilled') setGroups(groupResult.value)
    else errors.push(`Groups: ${errorMessage(groupResult.reason)}`)
    if (seasonResult.status === 'fulfilled') setSeasons(seasonResult.value)
    else errors.push(`Seasons: ${errorMessage(seasonResult.reason)}`)
    if (missingResult.status === 'fulfilled') {
      setMissingAttendanceCount(missingResult.value.meetings.length)
    } else errors.push(`Missing attendance: ${errorMessage(missingResult.reason)}`)
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
    Promise.allSettled([
      api.listGroups(),
      api.listSeasons(),
      api.getMissingAttendance(todayIso()),
    ]).then(([groupResult, seasonResult, missingResult]) => {
      if (cancelled) return
      const errors: string[] = []
      if (groupResult.status === 'fulfilled') setGroups(groupResult.value)
      else errors.push(`Groups: ${errorMessage(groupResult.reason)}`)
      if (seasonResult.status === 'fulfilled') setSeasons(seasonResult.value)
      else errors.push(`Seasons: ${errorMessage(seasonResult.reason)}`)
      if (missingResult.status === 'fulfilled') {
        setMissingAttendanceCount(missingResult.value.meetings.length)
      } else errors.push(`Missing attendance: ${errorMessage(missingResult.reason)}`)
      setError(errors.length ? errors.join(' ') : undefined)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function createGroup(event: FormEvent) {
    event.preventDefault()
    if (creating || !name.trim()) return
    setCreating(true)
    setCreateError(undefined)
    try {
      const group = await api.createGroup(name, seasonId || undefined)
      navigate(`/groups/${group.id}/members`, { state: { justCreated: true } })
    } catch (err) {
      setCreateError(errorMessage(err))
      setCreating(false)
    }
  }

  function closeCreateDialog() {
    if (creating) return
    setCreateOpen(false)
    setCreateError(undefined)
    setName('')
    setSeasonId('')
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
  const visibleGroups = groups?.filter(
    (group) =>
      group.archived === showingArchived &&
      group.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  const overview = useMemo(() => {
    if (!groups) return
    const active = groups.filter((group) => !group.archived)
    const today = todayIso()
    return {
      groups: active.length,
      members: active.reduce((total, group) => total + group.memberCount, 0),
      upcoming: active.reduce(
        (total, group) => total + group.meetingDates.filter((date) => date >= today).length,
        0,
      ),
      past: active.reduce(
        (total, group) => total + group.meetingDates.filter((date) => date < today).length,
        0,
      ),
      missing: missingAttendanceCount,
    }
  }, [groups, missingAttendanceCount])

  return (
    <>
      <PageHeader
        eyebrow="Group attendance workspace"
        title={showingArchived ? 'Archived groups' : 'Groups'}
        description={
          showingArchived
            ? 'Restore a group at any time without losing its history.'
            : activeCount !== undefined
              ? 'Lead well, connect consistently, and keep attendance simple.'
              : undefined
        }
        actions={
          <>
            {!showingArchived && (
              <Link to="/attendance/missing" className="button">
                Missing attendance
              </Link>
            )}
            <Link to={showingArchived ? '/' : '/?view=archived'} className="button">
              {showingArchived
                ? `Active groups${activeCount === undefined ? '' : ` (${activeCount})`}`
                : `Archived groups${archivedCount === undefined ? '' : ` (${archivedCount})`}`}
            </Link>
            <button
              type="button"
              className="primary"
              onClick={() => setCreateOpen(true)}
              aria-haspopup="dialog"
            >
              New group
            </button>
          </>
        }
      />
      {!showingArchived && (
        <section
          className="dashboard-overview"
          aria-label="Workspace overview"
          aria-busy={loading}
        >
          <div className="overview-card">
            <span>Active groups</span>
            <strong>{overview?.groups ?? '—'}</strong>
            <small>In your workspace</small>
          </div>
          <div className="overview-card">
            <span>Members</span>
            <strong>{overview?.members ?? '—'}</strong>
            <small>Across active groups</small>
          </div>
          <div className="overview-card">
            <span>Upcoming meetings</span>
            <strong>{overview?.upcoming ?? '—'}</strong>
            <small>On current schedules</small>
          </div>
          <div className="overview-card">
            <span>Past meetings</span>
            <strong>{overview?.past ?? '—'}</strong>
            <small>Scheduled before today</small>
          </div>
          <Link to="/attendance/missing" className="overview-card overview-card-attention">
            <span>Past meetings missing attendance</span>
            <strong>{overview?.missing ?? '—'}</strong>
            <small>
              {overview?.missing === undefined
                ? 'Availability unknown'
                : overview.missing
                  ? 'Review and record →'
                  : 'All caught up'}
            </small>
          </Link>
        </section>
      )}
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
      {visibleGroups?.length === 0 && !query && (
        <div className="card empty">
          <p>
            {showingArchived
              ? 'No archived groups.'
              : 'No active groups yet. Restore an archived group or use New group to create one.'}
          </p>
        </div>
      )}

      {groups && groups.some((group) => group.archived === showingArchived) && (
        <section className="group-collection">
          <div className="collection-toolbar">
            <label className="collection-search">
              <span className="sr-only">Search groups</span>
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search groups"
              />
            </label>
            <span className="collection-count">
              Showing {visibleGroups?.length ?? 0} of{' '}
              {groups?.filter((group) => group.archived === showingArchived).length ?? 0}
            </span>
          </div>
          <div className="group-list-head" aria-hidden="true">
            <span>Group</span>
            <span>Season</span>
            <span>Members</span>
            <span>Next meeting</span>
            <span />
          </div>
          {visibleGroups && visibleGroups.length > 0 && <ul className="group-list">
            {visibleGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                seasonName={seasons?.find((season) => season.id === group.seasonId)?.name}
                archiveAction={() => void setArchived(group)}
                changing={changingId === group.id}
              />
            ))}
          </ul>}
          {visibleGroups?.length === 0 && (
            <div className="card empty">
              <p>No groups match “{query}”.</p>
            </div>
          )}
        </section>
      )}

      <Dialog
        open={createOpen}
        title="New group"
        description="Start with the basics. Add members and a schedule next."
        onClose={closeCreateDialog}
        closeDisabled={creating}
      >
        <form className="dialog-form" onSubmit={createGroup}>
          {createError && <Notice kind="error">{createError}</Notice>}
          <label className="field">
            <span>Group name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tuesday Night Men's Group"
              maxLength={100}
              required
              disabled={creating}
              data-dialog-autofocus
            />
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
          <div className="dialog-actions">
            <button type="button" onClick={closeCreateDialog} disabled={creating}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create group'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
