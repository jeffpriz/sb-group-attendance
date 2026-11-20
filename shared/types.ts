import type { AttendanceStats, StatsFilter } from './stats.ts'

/** A person who belongs to a group. Only a name is tracked. */
export interface Member {
  id: string
  name: string
  /** ISO timestamp of when the member was added. */
  addedAt: string
  /** Durable membership periods. Newer/absent periods coexist with the legacy fields. */
  membershipIntervals?: MembershipInterval[]
  /**
   * Set when the member is removed from the group. Removed members are kept
   * in the file so past attendance records still show their name.
   */
  removedAt?: string
}

export interface MembershipInterval {
  /** First calendar date included in this membership period. */
  startDate: string
  /** Optional first calendar date excluded from this membership period. */
  endDate?: string
}

/** Attendance recorded for a single meeting. */
export interface AttendanceRecord {
  /** IDs of the members who were present. */
  presentMemberIds: string[]
  /** ISO timestamp of when attendance was last saved. */
  recordedAt: string
}

/** A scheduled meeting, identified by its calendar date (YYYY-MM-DD). */
export interface Meeting {
  date: string
  /** Session from the group's assigned track, when one has been selected. */
  sessionId?: string
  /** Missing until attendance has been taken for this meeting. */
  attendance?: AttendanceRecord
}

/** A named attendance season. Groups belong to at most one season at a time. */
export interface Season {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface TrackSession {
  id: string
  name: string
}

/** Course material that groups can work through in an ordered set of sessions. */
export interface Track {
  id: string
  name: string
  sessions: TrackSession[]
  createdAt: string
  updatedAt: string
}

/** A small group, stored as one JSON file per group. */
export interface Group {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** The group's current season. Omitted when the group is not assigned. */
  seasonId?: string
  /** The group's current course track. Omitted when the group is not assigned. */
  trackId?: string
  /** Set while the group is hidden from the active groups list. */
  archivedAt?: string
  members: Member[]
  /** Always kept sorted by date, ascending, with no duplicates. */
  meetings: Meeting[]
}

/** Lightweight info returned by the group list endpoint. */
export interface GroupSummary {
  id: string
  name: string
  seasonId?: string
  trackId?: string
  archived: boolean
  memberCount: number
  meetingDates: string[]
  recordedMeetingCount: number
}

/** A past scheduled meeting that still needs attendance recorded. */
export interface MissingAttendanceMeeting {
  date: string
  groupId: string
  groupName: string
}

/** GET /api/attendance/missing response. */
export interface MissingAttendanceResponse {
  asOf: string
  meetings: MissingAttendanceMeeting[]
}

export interface SeasonDetail {
  season: Season
  groups: Group[]
}

export interface SeasonSummary extends Season {
  groups: GroupSummary[]
}

export interface TrackDetail {
  track: Track
  groups: Group[]
}

export interface TrackSummary extends Track {
  groups: GroupSummary[]
}

export interface ApiError {
  error: string
}

/** GET /api/stats response. Unknown group IDs in the request are dropped from `filter.groupIds`. */
export interface StatsResponse extends AttendanceStats {
  filter: StatsFilter
  allGroups: { id: string; name: string }[]
}
