import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import type { Group, SeasonSummary, TrackSummary } from '../../shared/types.ts'
import { api, ApiRequestError } from '../api.ts'
import Notice from '../components/Notice.tsx'
import type { GroupContext } from '../groupContext.ts'
import { errorMessage } from '../util.ts'

export default function GroupLayout() {
  const { groupId = '' } = useParams()
  // Remount when switching groups so state starts fresh.
  return <GroupLoader key={groupId} groupId={groupId} />
}

function GroupLoader({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<Group>()
  const [seasons, setSeasons] = useState<SeasonSummary[]>()
  const [tracks, setTracks] = useState<TrackSummary[]>()
  const [groupLoading, setGroupLoading] = useState(true)
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [tracksLoading, setTracksLoading] = useState(true)
  const [error, setError] = useState<{ message: string; notFound: boolean }>()
  const [seasonsError, setSeasonsError] = useState<string>()
  const [tracksError, setTracksError] = useState<string>()
  const { pathname } = useLocation()
  const onMeetingPage = /\/meetings\//.test(pathname)
  const updateGroup = useCallback((updated: Group) => {
    setGroup(updated)
    setSeasons((current) =>
      current?.map((season) => {
        const groups = season.groups.filter((item) => item.id !== updated.id)
        if (season.id === updated.seasonId) {
          groups.push({
            id: updated.id,
            name: updated.name,
            ...(updated.seasonId ? { seasonId: updated.seasonId } : {}),
            ...(updated.trackId ? { trackId: updated.trackId } : {}),
            archived: Boolean(updated.archivedAt),
            memberCount: updated.members.filter((member) => !member.removedAt).length,
            meetingDates: updated.meetings.map((meeting) => meeting.date),
            recordedMeetingCount: updated.meetings.filter((meeting) => meeting.attendance).length,
          })
          groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        }
        return { ...season, groups }
      }),
    )
    setTracks((current) =>
      current?.map((track) => {
        const groups = track.groups.filter((item) => item.id !== updated.id)
        if (track.id === updated.trackId) {
          groups.push({
            id: updated.id,
            name: updated.name,
            ...(updated.seasonId ? { seasonId: updated.seasonId } : {}),
            ...(updated.trackId ? { trackId: updated.trackId } : {}),
            archived: Boolean(updated.archivedAt),
            memberCount: updated.members.filter((member) => !member.removedAt).length,
            meetingDates: updated.meetings.map((meeting) => meeting.date),
            recordedMeetingCount: updated.meetings.filter((meeting) => meeting.attendance).length,
          })
          groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        }
        return { ...track, groups }
      }),
    )
  }, [])

  const loadGroup = useCallback(() => {
    let cancelled = false
    api.getGroup(groupId).then(
      (g) => {
        if (!cancelled) {
          setGroup(g)
          setError(undefined)
        }
      },
      (err) => {
        if (!cancelled) {
          setError({
            message: errorMessage(err),
            notFound: err instanceof ApiRequestError && err.status === 404,
          })
        }
      },
    ).finally(() => {
      if (!cancelled) setGroupLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [groupId])

  const loadSeasons = useCallback(() => {
    let cancelled = false
    api.listSeasons().then(
      (items) => {
        if (!cancelled) {
          setSeasons(items)
          setSeasonsError(undefined)
        }
      },
      (err) => {
        if (!cancelled) setSeasonsError(errorMessage(err))
      },
    ).finally(() => {
      if (!cancelled) setSeasonsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const loadTracks = useCallback(() => {
    let cancelled = false
    api.listTracks().then(
      (items) => {
        if (!cancelled) {
          setTracks(items)
          setTracksError(undefined)
        }
      },
      (err) => {
        if (!cancelled) setTracksError(errorMessage(err))
      },
    ).finally(() => {
      if (!cancelled) setTracksLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => loadGroup(), [loadGroup])
  useEffect(() => loadSeasons(), [loadSeasons])
  useEffect(() => loadTracks(), [loadTracks])

  useEffect(() => {
    if (group) document.title = `${group.name} · Group Attendance`
  }, [group])

  function retryGroup() {
    setGroupLoading(true)
    loadGroup()
  }

  function retrySeasons() {
    setSeasonsLoading(true)
    loadSeasons()
  }

  function retryTracks() {
    setTracksLoading(true)
    loadTracks()
  }

  if (!group && groupLoading) return <p className="muted">Loading group…</p>
  if (!group && error) {
    return (
      <>
        <Notice kind="error">{error.notFound ? 'That group could not be found.' : error.message}</Notice>
        {!error.notFound && (
          <button type="button" onClick={retryGroup} disabled={groupLoading}>
            {groupLoading ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <Link to="/">← All groups</Link>
      </>
    )
  }
  if (!group) return null

  const context: GroupContext = {
    group,
    setGroup: updateGroup,
    seasons,
    seasonsLoading,
    seasonsError,
    retrySeasons,
    tracks,
    tracksLoading,
    tracksError,
    retryTracks,
  }
  const season = seasons?.find((item) => item.id === group.seasonId)
  const track = tracks?.find((item) => item.id === group.trackId)

  return (
    <>
      <Link to="/" className="back-link">
        ← All groups
      </Link>
      <div className="group-heading">
        <h1 className="group-title">{group.name}</h1>
        <Link to="members#group-settings" className="button">
          Change settings
        </Link>
      </div>
      <p className="group-season-summary">
        {group.seasonId ? (
          <Link to={`/seasons/${group.seasonId}`}>
            Season: {season?.name ?? 'View season'}
          </Link>
        ) : (
          <span className="muted">No season assigned</span>
        )}
      </p>
      <p className="group-season-summary">
        {group.trackId ? (
          <Link to={`/tracks/${group.trackId}`}>
            Track: {track?.name ?? 'View track'}
          </Link>
        ) : (
          <span className="muted">No track assigned</span>
        )}
      </p>
      {seasonsError && (
        <Notice kind="error">
          <span>{seasonsError} Season details may be unavailable.</span>{' '}
          <button
            type="button"
            className="link-button"
            onClick={retrySeasons}
            disabled={seasonsLoading}
          >
            Retry
          </button>
        </Notice>
      )}
      {tracksError && (
        <Notice kind="error">
          <span>{tracksError} Track details may be unavailable.</span>{' '}
          <button
            type="button"
            className="link-button"
            onClick={retryTracks}
            disabled={tracksLoading}
          >
            Retry
          </button>
        </Notice>
      )}
      <nav className="tabs" aria-label="Group sections">
        <NavLink to="" end className={({ isActive }) => (isActive || onMeetingPage ? 'active' : '')}>
          Attendance
        </NavLink>
        <NavLink to="members">Members & settings</NavLink>
        <NavLink to="schedule">Schedule</NavLink>
        <NavLink to="history">History</NavLink>
      </nav>
      <Outlet context={context} />
    </>
  )
}
