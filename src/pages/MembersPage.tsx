import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { todayIso } from '../../shared/dates.ts'
import type { Member } from '../../shared/types.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { useGroup } from '../groupContext.ts'
import { activeMembers, byName, errorMessage, plural } from '../util.ts'

export default function MembersPage() {
  const { group, setGroup } = useGroup()
  const location = useLocation()
  const navigate = useNavigate()
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated
  const [name, setName] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [editingId, setEditingId] = useState<string>()
  const [editName, setEditName] = useState('')
  const [groupName, setGroupName] = useState(group.name)
  const [showRemoved, setShowRemoved] = useState(false)
  const [removingId, setRemovingId] = useState<string>()
  const [removalDate, setRemovalDate] = useState(todayIso())
  const [restoringId, setRestoringId] = useState<string>()
  const [changingRemovalId, setChangingRemovalId] = useState<string>()
  const [restoreDate, setRestoreDate] = useState(todayIso())
  const [retroMeetingDate, setRetroMeetingDate] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

  const members = activeMembers(group)
  const removed = group.members.filter((m) => m.removedAt).sort(byName)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function addMember(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    void run(async () => {
      setGroup(await api.addMember(group.id, name))
      setMessage(`Added ${name.trim()}.`)
      setName('')
      nameInput.current?.focus()
    })
  }

  function addMany(event: FormEvent) {
    event.preventDefault()
    const names = bulkText
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean)
    if (!names.length) return
    void run(async () => {
      let latest = group
      for (const n of names) latest = await api.addMember(group.id, n)
      setGroup(latest)
      setMessage(`Added ${plural(names.length, 'member')}.`)
      setBulkText('')
      setBulkMode(false)
    })
  }

  function startEdit(member: Member) {
    setEditingId(member.id)
    setEditName(member.name)
  }

  function saveEdit(event: FormEvent, member: Member) {
    event.preventDefault()
    void run(async () => {
      setGroup(await api.renameMember(group.id, member.id, editName))
      setEditingId(undefined)
    })
  }

  function removeMember(member: Member) {
    void run(async () => {
      setGroup(await api.removeMember(group.id, member.id, removalDate))
      setMessage(`Removed ${member.name}.`)
      setRemovingId(undefined)
    })
  }

  function changeRemovalDate(member: Member) {
    void run(async () => {
      setGroup(await api.setRemovalDate(group.id, member.id, removalDate))
      setMessage(`${member.name} is now counted as removed from ${removalDate}.`)
      setChangingRemovalId(undefined)
    })
  }

  function restoreMember(member: Member) {
    void run(async () => {
      setGroup(await api.restoreMember(
        group.id,
        member.id,
        restoreDate,
        retroMeetingDate || undefined,
      ))
      setMessage(
        retroMeetingDate
          ? `${member.name} restored and marked present for ${retroMeetingDate}.`
          : `${member.name} is back in the group from ${restoreDate}.`,
      )
      setRestoringId(undefined)
      setRetroMeetingDate('')
    })
  }

  function renameGroup(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      const updated = await api.renameGroup(group.id, groupName)
      setGroup(updated)
      setGroupName(updated.name)
      setMessage('Group name saved.')
    })
  }

  function deleteGroup() {
    const answer = prompt(
      `This permanently deletes "${group.name}", its members, schedule and all attendance.\n\nType DELETE to confirm.`,
    )
    if (answer?.trim().toUpperCase() !== 'DELETE') return
    void run(async () => {
      await api.deleteGroup(group.id)
      navigate('/')
    })
  }

  return (
    <>
      {justCreated && members.length === 0 && (
        <Notice kind="success">
          Group created! Add your members below, then set up the meeting schedule.
        </Notice>
      )}
      {error && (
        <Notice kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </Notice>
      )}
      {message && (
        <Notice kind="success" onDismiss={() => setMessage(undefined)}>
          {message}
        </Notice>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Add members</h2>
          <button type="button" className="link-button" onClick={() => setBulkMode(!bulkMode)}>
            {bulkMode ? 'Add one at a time' : 'Add several at once'}
          </button>
        </div>
        {bulkMode ? (
          <form onSubmit={addMany}>
            <label className="field">
              <span>Names (one per line)</span>
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'Jane Smith\nJohn Doe'}
              />
            </label>
            <button type="submit" className="primary" disabled={busy || !bulkText.trim()}>
              Add members
            </button>
          </form>
        ) : (
          <form onSubmit={addMember}>
            <label className="field">
              <span>Member name</span>
              <div className="input-row">
                <input
                  ref={nameInput}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First and last name"
                  maxLength={100}
                  autoFocus={justCreated}
                />
                <button type="submit" className="primary" disabled={busy || !name.trim()}>
                  Add
                </button>
              </div>
            </label>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Members ({members.length})</h2>
        {members.length === 0 ? (
          <p className="muted">No members yet.</p>
        ) : (
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.id}>
                {editingId === member.id ? (
                  <form className="input-row" onSubmit={(e) => saveEdit(e, member)}>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={100}
                      autoFocus
                      aria-label={`New name for ${member.name}`}
                    />
                    <button type="submit" className="primary" disabled={busy || !editName.trim()}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(undefined)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="member-name">{member.name}</span>
                    {removingId === member.id ? (
                      <form className="input-row" onSubmit={(e) => { e.preventDefault(); removeMember(member) }}>
                        <label className="field">
                          <span>Removal date</span>
                          <input
                            type="date"
                            value={removalDate}
                            onChange={(e) => setRemovalDate(e.target.value)}
                            max={todayIso()}
                            required
                          />
                        </label>
                        <button type="submit" className="danger" disabled={busy}>
                          Confirm remove
                        </button>
                        <button type="button" onClick={() => setRemovingId(undefined)}>Cancel</button>
                        <p className="muted small">
                          Meetings on or after this date no longer count this member, even if attendance was already
                          taken. Anyone marked present stays marked present.
                        </p>
                      </form>
                    ) : (
                      <span className="row-actions">
                        <button type="button" onClick={() => startEdit(member)} disabled={busy}>
                          Rename
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setRemovingId(member.id)
                            setRemovalDate(todayIso())
                          }}
                          disabled={busy}
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {members.length > 0 && group.meetings.length === 0 && (
          <p>
            Next: <Link to="../schedule">set up the meeting schedule →</Link>
          </p>
        )}
      </section>

      {removed.length > 0 && (
        <section className="card">
          <button type="button" className="link-button" onClick={() => setShowRemoved(!showRemoved)}>
            {showRemoved ? 'Hide' : 'Show'} removed members ({removed.length})
          </button>
          {showRemoved && (
            <ul className="member-list">
              {removed.map((member) => (
                <li key={member.id}>
                  {restoringId === member.id ? (
                    <form
                      className="input-row"
                      onSubmit={(e) => { e.preventDefault(); restoreMember(member) }}
                    >
                      <label className="field">
                        <span>Restore date</span>
                        <input
                          type="date"
                          value={restoreDate}
                          onChange={(e) => setRestoreDate(e.target.value)}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Retroactive meeting (optional)</span>
                        <select
                          value={retroMeetingDate}
                          onChange={(e) => setRetroMeetingDate(e.target.value)}
                        >
                          <option value="">None</option>
                          {group.meetings
                            .filter((meeting) => meeting.date <= todayIso())
                            .map((meeting) => (
                              <option key={meeting.date} value={meeting.date}>
                                {meeting.date}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="submit" className="primary" disabled={busy}>Confirm restore</button>
                      <button type="button" onClick={() => setRestoringId(undefined)}>Cancel</button>
                    </form>
                  ) : changingRemovalId === member.id ? (
                    <form
                      className="input-row"
                      onSubmit={(e) => { e.preventDefault(); changeRemovalDate(member) }}
                    >
                      <label className="field">
                        <span>Removed on</span>
                        <input
                          type="date"
                          value={removalDate}
                          onChange={(e) => setRemovalDate(e.target.value)}
                          max={todayIso()}
                          required
                        />
                      </label>
                      <button type="submit" className="primary" disabled={busy}>Save date</button>
                      <button type="button" onClick={() => setChangingRemovalId(undefined)}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className="member-name muted">
                        {member.name}
                        {member.removedAt && ` (removed ${member.removedAt.slice(0, 10)})`}
                      </span>
                      <span className="row-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setChangingRemovalId(member.id)
                            setRemovalDate(member.removedAt?.slice(0, 10) ?? todayIso())
                          }}
                          disabled={busy}
                        >
                          Change removal date
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRestoringId(member.id)
                            setRestoreDate(todayIso())
                            setRetroMeetingDate('')
                          }}
                          disabled={busy}
                        >
                          Restore
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card">
        <h2>Group settings</h2>
        <form onSubmit={renameGroup}>
          <label className="field">
            <span>Group name</span>
            <div className="input-row">
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={100} />
              <button
                type="submit"
                disabled={busy || !groupName.trim() || groupName.trim() === group.name}
              >
                Rename
              </button>
            </div>
          </label>
        </form>
        <button type="button" className="danger" onClick={deleteGroup} disabled={busy}>
          Delete group…
        </button>
      </section>
    </>
  )
}
