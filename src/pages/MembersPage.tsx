import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { todayIso } from '../../shared/dates.ts'
import type { Member } from '../../shared/types.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { useGroup } from '../groupContext.ts'
import { activeMembers, byName, errorMessage, plural } from '../util.ts'

function GroupSettingsSection({
  groupName,
  groupSeasonId,
  groupTrackId,
  seasons,
  seasonsLoading,
  seasonsError,
  retrySeasons,
  tracks,
  tracksLoading,
  tracksError,
  retryTracks,
  busy,
  onSave,
  onClose,
  onDelete,
}: {
  groupName: string
  groupSeasonId: string | undefined
  groupTrackId: string | undefined
  seasons: ReturnType<typeof useGroup>['seasons']
  seasonsLoading: boolean
  seasonsError: string | undefined
  retrySeasons: () => void
  tracks: ReturnType<typeof useGroup>['tracks']
  tracksLoading: boolean
  tracksError: string | undefined
  retryTracks: () => void
  busy: boolean
  onSave: (name: string, seasonId: string | null, trackId: string | null) => Promise<void>
  onClose: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(groupName)
  const [seasonSelection, setSeasonSelection] = useState(groupSeasonId ?? '')
  const [trackSelection, setTrackSelection] = useState(groupTrackId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const trimmedName = name.trim()
  const invalid = !trimmedName || trimmedName.length > 100
  const unchanged =
    trimmedName === groupName &&
    seasonSelection === (groupSeasonId ?? '') &&
    trackSelection === (groupTrackId ?? '')
  const controlsDisabled = busy || saving

  function save(event: FormEvent) {
    event.preventDefault()
    if (controlsDisabled || invalid || unchanged) return
    void updateSettings()
  }

  async function updateSettings() {
    setSaving(true)
    setError(undefined)
    try {
      await onSave(trimmedName, seasonSelection || null, trackSelection || null)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" id="group-settings">
      <div className="section-head">
        <h2>Group settings</h2>
        <button type="button" className="link-button" onClick={onClose} disabled={controlsDisabled}>
          Close
        </button>
      </div>
      {error && (
        <Notice kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </Notice>
      )}
      <form onSubmit={save}>
        <label className="field">
          <span>Group name</span>
          <div className="input-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              disabled={controlsDisabled}
            />
          </div>
        </label>
        <label className="field">
          <span>Season</span>
          <div className="input-row">
            <select
              value={seasonSelection}
              onChange={(event) => setSeasonSelection(event.target.value)}
              disabled={
                controlsDisabled ||
                seasonsLoading ||
                (!seasons && Boolean(seasonsError))
              }
            >
              <option value="">No season</option>
              {groupSeasonId && !seasons?.some((season) => season.id === groupSeasonId) && (
                <option value={groupSeasonId}>
                  {seasons ? 'Current season unavailable' : 'Current season (details unavailable)'}
                </option>
              )}
              {seasons?.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
        </label>
        {seasonsLoading && <p className="muted small">Loading seasons…</p>}
        {seasonsError && (
          <p className="notice notice-error">
            <span>{seasonsError}</span>
            <button type="button" className="link-button" onClick={retrySeasons}>
              Retry
            </button>
          </p>
        )}
        <label className="field">
          <span>Track</span>
          <div className="input-row">
            <select
              value={trackSelection}
              onChange={(event) => setTrackSelection(event.target.value)}
              disabled={controlsDisabled || tracksLoading || (!tracks && Boolean(tracksError))}
            >
              <option value="">No track</option>
              {groupTrackId && !tracks?.some((track) => track.id === groupTrackId) && (
                <option value={groupTrackId}>
                  {tracks ? 'Current track unavailable' : 'Current track (details unavailable)'}
                </option>
              )}
              {tracks?.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </div>
        </label>
        {tracksLoading && <p className="muted small">Loading tracks…</p>}
        {tracksError && (
          <p className="notice notice-error">
            <span>{tracksError}</span>
            <button type="button" className="link-button" onClick={retryTracks}>
              Retry
            </button>
          </p>
        )}
        {trackSelection && trackSelection !== (groupTrackId ?? '') && (
          <p className="muted small">
            Changing tracks clears the session assigned to existing meetings.
          </p>
        )}
        <div className="group-settings-actions">
          <div className="group-settings-primary-actions">
            <button
              type="submit"
              className="primary"
              disabled={controlsDisabled || invalid || unchanged}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={onClose} disabled={controlsDisabled}>
              Cancel
            </button>
          </div>
          <button
            type="button"
            className="danger group-settings-delete"
            onClick={onDelete}
            disabled={controlsDisabled}
          >
            Delete group…
          </button>
        </div>
      </form>
    </section>
  )
}

export default function MembersPage() {
  const {
    group,
    setGroup,
    seasons,
    seasonsLoading,
    seasonsError,
    retrySeasons,
    tracks,
    tracksLoading,
    tracksError,
    retryTracks,
  } = useGroup()
  const location = useLocation()
  const navigate = useNavigate()
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated
  const [name, setName] = useState('')
  const settingsOpen = location.hash === '#group-settings'
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [editingId, setEditingId] = useState<string>()
  const [editName, setEditName] = useState('')
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

  function closeSettings() {
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: '',
      },
      { replace: true },
    )
  }

  async function saveSettings(name: string, seasonId: string | null, trackId: string | null) {
    let updated = group
    if (name !== group.name) {
      updated = await api.renameGroup(group.id, name)
      setGroup(updated)
    }
    if (seasonId !== (updated.seasonId ?? null)) {
      updated = await api.setGroupSeason(group.id, seasonId)
      setGroup(updated)
    }
    if (trackId !== (updated.trackId ?? null)) {
      updated = await api.setGroupTrack(group.id, trackId)
      setGroup(updated)
    }
    setMessage('Group settings saved.')
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

      {settingsOpen && (
        <GroupSettingsSection
          groupName={group.name}
          groupSeasonId={group.seasonId}
          groupTrackId={group.trackId}
          seasons={seasons}
          seasonsLoading={seasonsLoading}
          seasonsError={seasonsError}
          retrySeasons={retrySeasons}
          tracks={tracks}
          tracksLoading={tracksLoading}
          tracksError={tracksError}
          retryTracks={retryTracks}
          busy={busy}
          onSave={saveSettings}
          onClose={closeSettings}
          onDelete={deleteGroup}
        />
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

    </>
  )
}
