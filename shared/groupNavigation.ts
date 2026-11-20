export type GroupSection = 'attendance' | 'members' | 'schedule' | 'history'

export function groupSectionFromPath(
  pathname: string,
  groupId: string,
): GroupSection | undefined {
  const groupPath = `/groups/${encodeURIComponent(groupId)}`
  const relativePath = pathname === groupPath
    ? ''
    : pathname.startsWith(`${groupPath}/`)
      ? pathname.slice(groupPath.length)
      : undefined

  if (relativePath === undefined) return undefined
  if (relativePath === '' || relativePath === '/' || relativePath.startsWith('/meetings/')) {
    return 'attendance'
  }
  if (relativePath === '/members' || relativePath.startsWith('/members/')) return 'members'
  if (relativePath === '/schedule' || relativePath.startsWith('/schedule/')) return 'schedule'
  if (relativePath === '/history' || relativePath.startsWith('/history/')) return 'history'
  return undefined
}
