import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import type { Group } from '../../shared/types.ts'
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
  const [error, setError] = useState<{ message: string; notFound: boolean }>()
  const { pathname } = useLocation()
  const onMeetingPage = /\/meetings\//.test(pathname)

  useEffect(() => {
    let cancelled = false
    api.getGroup(groupId).then(
      (g) => !cancelled && setGroup(g),
      (err) =>
        !cancelled &&
        setError({
          message: errorMessage(err),
          notFound: err instanceof ApiRequestError && err.status === 404,
        }),
    )
    return () => {
      cancelled = true
    }
  }, [groupId])

  useEffect(() => {
    if (group) document.title = `${group.name} · Group Attendance`
  }, [group])

  if (error) {
    return (
      <>
        <Notice kind="error">{error.notFound ? 'That group could not be found.' : error.message}</Notice>
        <Link to="/">← All groups</Link>
      </>
    )
  }
  if (!group) return <p className="muted">Loading group…</p>

  const context: GroupContext = { group, setGroup }

  return (
    <>
      <Link to="/" className="back-link">
        ← All groups
      </Link>
      <h1 className="group-title">{group.name}</h1>
      <nav className="tabs" aria-label="Group sections">
        <NavLink to="" end className={({ isActive }) => (isActive || onMeetingPage ? 'active' : '')}>
          Attendance
        </NavLink>
        <NavLink to="members">Members</NavLink>
        <NavLink to="schedule">Schedule</NavLink>
        <NavLink to="history">History</NavLink>
      </nav>
      <Outlet context={context} />
    </>
  )
}
