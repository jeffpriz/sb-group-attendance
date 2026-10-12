import type { Group, GroupSummary, StatsResponse } from '../shared/types.ts'

export class ApiRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface SessionInfo {
  required: boolean
  authenticated: boolean
  expiresAt?: string
}

let onAuthRequired: (() => void) | undefined

/** Called whenever the server says the session is missing or has expired. */
export function setAuthRequiredHandler(handler: (() => void) | undefined) {
  onAuthRequired = handler
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError(0, 'Could not reach the server. Is it running?')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => undefined)
  if (!res.ok) {
    const message = (data as { error?: string } | undefined)?.error ?? `Request failed (${res.status})`
    if (res.status === 401 && (data as { code?: string } | undefined)?.code === 'auth_required') {
      onAuthRequired?.()
      throw new ApiRequestError(401, 'Your session has ended. Enter the password again, then try again.')
    }
    throw new ApiRequestError(res.status, message)
  }
  return data as T
}

const enc = encodeURIComponent

export interface StatsQuery {
  groupIds: string[]
  from?: string
  to?: string
  today: string
}

function statsQuery(q: StatsQuery): string {
  const params = new URLSearchParams()
  for (const id of q.groupIds) params.append('group', id)
  if (q.from) params.set('from', q.from)
  if (q.to) params.set('to', q.to)
  params.set('today', q.today)
  return params.toString()
}

export const api = {
  getSession: () => request<SessionInfo>('GET', '/session'),
  signIn: (password: string) => request<SessionInfo>('POST', '/session', { password }),
  signOut: () => request<SessionInfo>('DELETE', '/session'),

  getStats: (q: StatsQuery) => request<StatsResponse>('GET', `/stats?${statsQuery(q)}`),
  listGroups: () => request<GroupSummary[]>('GET', '/groups'),
  getGroup: (id: string) => request<Group>('GET', `/groups/${enc(id)}`),
  createGroup: (name: string) => request<Group>('POST', '/groups', { name }),
  renameGroup: (id: string, name: string) => request<Group>('PATCH', `/groups/${enc(id)}`, { name }),
  deleteGroup: (id: string) => request<void>('DELETE', `/groups/${enc(id)}`),

  addMember: (groupId: string, name: string) =>
    request<Group>('POST', `/groups/${enc(groupId)}/members`, { name }),
  renameMember: (groupId: string, memberId: string, name: string) =>
    request<Group>('PATCH', `/groups/${enc(groupId)}/members/${enc(memberId)}`, { name }),
  restoreMember: (groupId: string, memberId: string) =>
    request<Group>('PATCH', `/groups/${enc(groupId)}/members/${enc(memberId)}`, { restore: true }),
  removeMember: (groupId: string, memberId: string) =>
    request<Group>('DELETE', `/groups/${enc(groupId)}/members/${enc(memberId)}`),

  setMeetings: (groupId: string, dates: string[], force = false) =>
    request<Group>('PUT', `/groups/${enc(groupId)}/meetings`, { dates, force }),

  saveAttendance: (groupId: string, date: string, presentMemberIds: string[]) =>
    request<Group>('PUT', `/groups/${enc(groupId)}/meetings/${enc(date)}/attendance`, {
      presentMemberIds,
    }),
  clearAttendance: (groupId: string, date: string) =>
    request<Group>('DELETE', `/groups/${enc(groupId)}/meetings/${enc(date)}/attendance`),
}
