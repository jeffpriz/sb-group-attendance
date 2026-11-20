import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { TrackSummary } from '../../shared/types.ts'
import { api } from '../api.ts'
import Dialog from '../components/Dialog.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { errorMessage, plural } from '../util.ts'

export default function TracksPage() {
  const [tracks, setTracks] = useState<TrackSummary[]>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [sessions, setSessions] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string>()

  async function load() {
    setLoading(true)
    try {
      setTracks(await api.listTracks())
      setError(undefined)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    document.title = 'Tracks · Group Attendance'
    let cancelled = false
    api.listTracks().then(
      (items) => {
        if (cancelled) return
        setTracks(items)
        setLoading(false)
      },
      (err) => {
        if (cancelled) return
        setError(errorMessage(err))
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (creating || !name.trim()) return
    setCreating(true)
    setCreateError(undefined)
    const sessionNames = sessions
      .split(/\r?\n/)
      .map((session) => session.trim())
      .filter(Boolean)
    try {
      const track = await api.createTrack(name, sessionNames)
      setTracks((current) =>
        [...(current ?? []), { ...track, groups: [] }].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        ),
      )
      setName('')
      setSessions('')
      setCreateOpen(false)
    } catch (err) {
      setCreateError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  function openCreate() {
    setCreateError(undefined)
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateError(undefined)
    setCreateOpen(false)
  }

  return (
    <>
      <PageHeader
        title="Tracks"
        description="Define the course material and sessions groups will work through."
        actions={
          <button type="button" className="primary" onClick={openCreate} aria-haspopup="dialog">
            New track
          </button>
        }
      />
      {error && (
        <Notice kind="error">
          <span>{error}</span>{' '}
          <button type="button" className="link-button" onClick={() => void load()} disabled={loading}>
            Retry
          </button>
        </Notice>
      )}
      {tracks === undefined && loading && <p className="muted">Loading tracks…</p>}
      {tracks?.length === 0 && (
        <div className="card empty">
          <p>No tracks yet.</p>
          <button type="button" className="primary" onClick={openCreate}>
            Create the first track
          </button>
        </div>
      )}
      {tracks && tracks.length > 0 && (
        <ul className="season-list">
          {tracks.map((track) => (
            <li key={track.id}>
              <Link to={`/tracks/${track.id}`} className="season-card">
                <span className="season-card-name">{track.name}</span>
                <span className="muted">
                  {plural(track.sessions.length, 'session')} · {plural(track.groups.length, 'group')}
                </span>
                <span className="season-card-link">View track →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={createOpen}
        title="New track"
        onClose={closeCreate}
        closeDisabled={creating}
      >
        <form className="dialog-form" onSubmit={create}>
          {createError && (
            <Notice kind="error" onDismiss={() => setCreateError(undefined)}>
              {createError}
            </Notice>
          )}
          <label className="field">
            <span>Track name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Thinking"
              maxLength={100}
              required
              disabled={creating}
              data-dialog-autofocus
            />
          </label>
          <label className="field">
            <span>Sessions (one per line, optional)</span>
            <textarea
              rows={5}
              value={sessions}
              onChange={(event) => setSessions(event.target.value)}
              placeholder={'Session 1\nSession 2\nSession 3'}
              disabled={creating}
            />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={closeCreate} disabled={creating}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create track'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
