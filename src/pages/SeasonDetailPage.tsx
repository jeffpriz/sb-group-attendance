import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { Group, GroupSummary, Season, SeasonDetail } from '../../shared/types.ts'
import { api, ApiRequestError } from '../api.ts'
import Dialog from '../components/Dialog.tsx'
import GroupCard from '../components/GroupCard.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { errorMessage, plural } from '../util.ts'

function toSummary(group: Group): GroupSummary {
  return {
    id: group.id,
    name: group.name,
    ...(group.seasonId ? { seasonId: group.seasonId } : {}),
    ...(group.trackId ? { trackId: group.trackId } : {}),
    archived: Boolean(group.archivedAt),
    memberCount: group.members.filter((member) => !member.removedAt).length,
    meetingDates: group.meetings.map((meeting) => meeting.date),
    recordedMeetingCount: group.meetings.filter((meeting) => meeting.attendance).length,
  }
}

function SeasonRenameForm({
  season,
  onRenamed,
}: {
  season: Season
  onRenamed: (season: Season) => void
}) {
  const [name, setName] = useState(season.name)
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const trimmedName = name.trim()

  function startRenaming() {
    setName(season.name)
    setError(undefined)
    setSuccess(undefined)
    setRenaming(true)
  }

  function cancel() {
    setName(season.name)
    setError(undefined)
    setRenaming(false)
  }

  function rename(event: FormEvent) {
    event.preventDefault()
    if (busy || !trimmedName || trimmedName === season.name) return
    void save()
  }

  async function save() {
    setBusy(true)
    setError(undefined)
    setSuccess(undefined)
    try {
      const updated = await api.renameSeason(season.id, trimmedName)
      setName(updated.name)
      onRenamed(updated)
      setRenaming(false)
      setSuccess('Season name saved.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && !renaming && (
        <Notice kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </Notice>
      )}
      {success && (
        <Notice kind="success" onDismiss={() => setSuccess(undefined)}>
          {success}
        </Notice>
      )}
      <button type="button" onClick={startRenaming} aria-haspopup="dialog">
        Rename season
      </button>
      <Dialog
        open={renaming}
        title="Rename season"
        onClose={cancel}
        closeDisabled={busy}
      >
        <form className="dialog-form" onSubmit={rename}>
          {error && (
            <Notice kind="error" onDismiss={() => setError(undefined)}>
              {error}
            </Notice>
          )}
          <label className="field">
            <span>Season name</span>
            <div className="input-row">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
                disabled={busy}
                data-dialog-autofocus
              />
              <button
                type="submit"
                className="primary"
                disabled={busy || !trimmedName || trimmedName === season.name}
              >
                {busy ? 'Saving…' : 'Save name'}
              </button>
              <button type="button" onClick={cancel} disabled={busy}>
                Cancel
              </button>
            </div>
          </label>
        </form>
      </Dialog>
    </>
  )
}

export default function SeasonDetailPage() {
  const { seasonId = '' } = useParams()
  return <SeasonLoader key={seasonId} seasonId={seasonId} />
}

function SeasonLoader({ seasonId }: { seasonId: string }) {
  const [detail, setDetail] = useState<SeasonDetail>()
  const [groups, setGroups] = useState<GroupSummary[]>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; notFound: boolean }>()
  const [groupsError, setGroupsError] = useState<string>()
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState<string>()
  const [attachSuccess, setAttachSuccess] = useState<string>()
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set())
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({})
  const [removeSuccess, setRemoveSuccess] = useState<string>()

  const load = useCallback(async () => {
    const [seasonResult, groupResult] = await Promise.allSettled([
      api.getSeason(seasonId),
      api.listGroups(),
    ])
    if (seasonResult.status === 'fulfilled') {
      setDetail(seasonResult.value)
      setError(undefined)
    } else {
      setError({
        message: errorMessage(seasonResult.reason),
        notFound:
          seasonResult.reason instanceof ApiRequestError && seasonResult.reason.status === 404,
      })
    }
    if (groupResult.status === 'fulfilled') {
      setGroups(groupResult.value)
      setGroupsError(undefined)
    } else {
      setGroupsError(errorMessage(groupResult.reason))
    }
    setLoading(false)
  }, [seasonId])

  function retry() {
    setLoading(true)
    void load()
  }

  useEffect(() => {
    document.title = 'Season · Group Attendance'
    let cancelled = false
    Promise.allSettled([api.getSeason(seasonId), api.listGroups()]).then(
      ([seasonResult, groupResult]) => {
        if (cancelled) return
        if (seasonResult.status === 'fulfilled') {
          setDetail(seasonResult.value)
          setError(undefined)
        } else {
          setError({
            message: errorMessage(seasonResult.reason),
            notFound:
              seasonResult.reason instanceof ApiRequestError &&
              seasonResult.reason.status === 404,
          })
        }
        if (groupResult.status === 'fulfilled') {
          setGroups(groupResult.value)
          setGroupsError(undefined)
        } else {
          setGroupsError(errorMessage(groupResult.reason))
        }
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [seasonId])

  useEffect(() => {
    if (detail) document.title = `${detail.season.name} · Group Attendance`
  }, [detail])

  async function attachSelectedGroup() {
    if (!selectedGroupId || attaching) return
    setAttaching(true)
    setAttachError(undefined)
    setAttachSuccess(undefined)
    try {
      const updated = await api.setGroupSeason(selectedGroupId, seasonId)
      const summary = toSummary(updated)

      setGroups((current) =>
        current?.map((group) => (group.id === updated.id ? summary : group)),
      )
      setDetail((current) =>
        current
          ? {
              ...current,
              groups: [
                ...current.groups.filter((group) => group.id !== updated.id),
                updated,
              ],
            }
          : current,
      )
      setSelectedGroupId('')
      setAttachSuccess(`${updated.name} was added to ${detail?.season.name ?? 'this season'}.`)

      try {
        const refreshed = await api.getSeason(seasonId)
        setDetail(refreshed)
        setError(undefined)
      } catch (err) {
        setError({
          message: `The group was added, but the season could not be refreshed: ${errorMessage(err)}`,
          notFound: false,
        })
      }
    } catch (err) {
      setAttachError(errorMessage(err))
    } finally {
      setAttaching(false)
    }
  }

  function addGroup(event: FormEvent) {
    event.preventDefault()
    void attachSelectedGroup()
  }

  async function removeGroup(group: GroupSummary) {
    if (removingIds.has(group.id)) return
    if (
      !confirm(
        `Remove "${group.name}" from ${detail?.season.name ?? 'this season'}? The group and its history will be kept.`,
      )
    ) {
      return
    }

    setRemovingIds((current) => new Set(current).add(group.id))
    setRemoveErrors((current) => {
      const next = { ...current }
      delete next[group.id]
      return next
    })
    setRemoveSuccess(undefined)

    try {
      const updated = await api.setGroupSeason(group.id, null)
      const summary = toSummary(updated)
      setGroups((current) =>
        current?.map((item) => (item.id === updated.id ? summary : item)),
      )
      setDetail((current) =>
        current
          ? { ...current, groups: current.groups.filter((item) => item.id !== updated.id) }
          : current,
      )
      setRemoveSuccess(`${updated.name} was removed from this season.`)

      const [seasonResult, groupResult] = await Promise.allSettled([
        api.getSeason(seasonId),
        api.listGroups(),
      ])
      if (seasonResult.status === 'fulfilled') {
        setDetail(seasonResult.value)
        setError(undefined)
      } else {
        setError({
          message: `The group was removed, but the season could not be refreshed: ${errorMessage(seasonResult.reason)}`,
          notFound: false,
        })
      }
      if (groupResult.status === 'fulfilled') {
        setGroups(groupResult.value)
        setGroupsError(undefined)
      } else {
        setGroupsError(
          `The group was removed, but unassigned groups could not be refreshed: ${errorMessage(groupResult.reason)}`,
        )
      }
    } catch (err) {
      setRemoveErrors((current) => ({
        ...current,
        [group.id]: errorMessage(err),
      }))
    } finally {
      setRemovingIds((current) => {
        const next = new Set(current)
        next.delete(group.id)
        return next
      })
    }
  }

  if (!detail && loading) return <p className="muted">Loading season…</p>

  if (!detail) {
    return (
      <>
        <Notice kind="error">
          {error?.notFound ? 'That season could not be found.' : error?.message}
        </Notice>
        {!error?.notFound && (
          <button type="button" onClick={retry} disabled={loading}>
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <Link to="/seasons" className="back-link">
          ← All seasons
        </Link>
      </>
    )
  }

  const seasonGroups = detail.groups.map(toSummary)
  const active = seasonGroups.filter((group) => !group.archived)
  const archived = seasonGroups.filter((group) => group.archived)
  const unassignedGroups =
    groups
      ?.filter((group) => group.seasonId === undefined)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) ?? []

  return (
    <>
      <Link to="/seasons" className="back-link">
        ← All seasons
      </Link>
      <PageHeader
        title={detail.season.name}
        actions={
          <>
            <span className="badge">{plural(seasonGroups.length, 'group')}</span>
            <SeasonRenameForm
              key={detail.season.id}
              season={detail.season}
              onRenamed={(season) =>
                setDetail((current) => (current ? { ...current, season } : current))
              }
            />
          </>
        }
      />
      {error && (
        <Notice kind="error">
          <span>{error.message} Showing the last loaded groups.</span>{' '}
          <button type="button" className="link-button" onClick={retry} disabled={loading}>
            Retry
          </button>
        </Notice>
      )}
      {removeSuccess && (
        <Notice kind="success" onDismiss={() => setRemoveSuccess(undefined)}>
          {removeSuccess}
        </Notice>
      )}
      <section>
        <h2>Active groups</h2>
        {active.length === 0 ? (
          <div className="card empty">
            <p className="muted">No active groups are assigned to this season.</p>
          </div>
        ) : (
          <ul className="group-list">
            {active.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                seasonName={detail.season.name}
                removeAction={() => void removeGroup(group)}
                removing={removingIds.has(group.id)}
                removeError={removeErrors[group.id]}
              />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>Archived groups</h2>
        {archived.length === 0 ? (
          <p className="muted">No archived groups are assigned to this season.</p>
        ) : (
          <ul className="group-list">
            {archived.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                seasonName={detail.season.name}
                removeAction={() => void removeGroup(group)}
                removing={removingIds.has(group.id)}
                removeError={removeErrors[group.id]}
              />
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>Add an existing group</h2>
        <p className="muted">
          Choose a group that is not assigned to a season. Archived groups remain archived.
        </p>
        {attachError && (
          <Notice kind="error">
            <span>{attachError} </span>
            <button
              type="button"
              className="link-button"
              onClick={() => void attachSelectedGroup()}
              disabled={attaching || !selectedGroupId}
            >
              Retry
            </button>
          </Notice>
        )}
        {attachSuccess && (
          <Notice kind="success" onDismiss={() => setAttachSuccess(undefined)}>
            {attachSuccess}
          </Notice>
        )}
        {groups === undefined && loading && <p className="muted">Loading unassigned groups…</p>}
        {groupsError && (
          <Notice kind="error">
            <span>{groupsError} </span>
            <button
              type="button"
              className="link-button"
              onClick={retry}
              disabled={loading || attaching}
            >
              {loading ? 'Retrying…' : 'Retry'}
            </button>
          </Notice>
        )}
        {groups && unassignedGroups.length === 0 && (
          <p className="muted">No unassigned groups are available.</p>
        )}
        {groups && unassignedGroups.length > 0 && (
          <form onSubmit={addGroup}>
            <label className="field">
              <span>Unassigned group</span>
              <div className="input-row">
                <select
                  value={selectedGroupId}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                  disabled={loading || attaching}
                  required
                >
                  <option value="">Select a group</option>
                  {unassignedGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                      {group.archived ? ' (Archived)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="primary"
                  disabled={loading || attaching || !selectedGroupId}
                >
                  {attaching ? 'Adding…' : 'Add to season'}
                </button>
              </div>
            </label>
          </form>
        )}
      </section>
    </>
  )
}
