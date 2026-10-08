/** A person who belongs to a group. Only a name is tracked. */
export interface Member {
  id: string
  name: string
  /** ISO timestamp of when the member was added. */
  addedAt: string
  /**
   * Set when the member is removed from the group. Removed members are kept
   * in the file so past attendance records still show their name.
   */
  removedAt?: string
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
  /** Missing until attendance has been taken for this meeting. */
  attendance?: AttendanceRecord
}

/** A small group, stored as one JSON file per group. */
export interface Group {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  members: Member[]
  /** Always kept sorted by date, ascending, with no duplicates. */
  meetings: Meeting[]
}

/** Lightweight info returned by the group list endpoint. */
export interface GroupSummary {
  id: string
  name: string
  memberCount: number
  meetingDates: string[]
  recordedMeetingCount: number
}

export interface ApiError {
  error: string
}
