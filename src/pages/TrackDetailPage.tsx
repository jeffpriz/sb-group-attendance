import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { TrackDetail } from '../../shared/types.ts'
import { api, ApiRequestError } from '../api.ts'
import Dialog from '../components/Dialog.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { errorMessage, plural } from '../util.ts'

export default function TrackDetailPage() {
  const { trackId = '' } = useParams()
  const [detail, setDetail] = useState<TrackDetail>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [notFound, setNotFound] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [editingSessionId, setEditingSessionId] = useState<string>()
  const [editingName, setEditingName] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const loaded = await api.getTrack(trackId)
      setDetail(loaded)
      setName(loaded.track.name)
      setError(undefined)
      setNotFound(false)
    } catch (err) {
      setError(errorMessage(err))
      setNotFound(err instanceof ApiRequestError && err.status === 404)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    api.getTrack(trackId).then(
      (loaded) => {
        if (cancelled) return
        setDetail(loaded)
        setName(loaded.track.name)
        setError(undefined)
        setNotFound(false)
        setLoading(false)
      },
      (err) => {
        if (cancelled) return
        setError(errorMessage(err))
        setNotFound(err instanceof ApiRequestError && err.status === 404)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [trackId])

  useEffect(() => {
    if (detail) document.title = `${detail.track.name} · Group Attendance`
  }, [detail])

  async function saveName(event: FormEvent) {
    event.preventDefault()
    if (busy || !name.trim() || name.trim() === detail?.track.name) return
    setBusy(true)
    try {
      const track = await api.renameTrack(trackId, name)
      setDetail((current) => current ? { ...current, track } : current)
      setName(track.name)
      setRenaming(false)
      setError(undefined)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function addSession(event: FormEvent) {
    event.preventDefault()
    if (busy || !sessionName.trim()) return
    setBusy(true)
    try {
      const track = await api.addTrackSession(trackId, sessionName)
      setDetail((current) => current ? { ...current, track } : current)
      setSessionName('')
      setError(undefined)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function renameSession(event: FormEvent, sessionId: string) {
    event.preventDefault()
    if (busy || !editingName.trim()) return
    setBusy(true)
    try {
      const track = await api.renameTrackSession(trackId, sessionId, editingName)
      setDetail((current) => current ? { ...current, track } : current)
      setEditingSessionId(undefined)
      setError(undefined)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!detail && loading) return <p className="muted">Loading track…</p>
  if (!detail) {
    return (
      <>
        <Notice kind="error">{notFound ? 'That track could not be found.' : error}</Notice>
        {!notFound && <button type="button" onClick={() => void load()} disabled={loading}>Retry</button>}
        <Link to="/tracks" className="back-link">← All tracks</Link>
      </>
    )
  }

  return (
    <>
      <Link to="/tracks" className="back-link">← All tracks</Link>
      <PageHeader
        title={detail.track.name}
        actions={
          <span className="badge">
            {plural(detail.track.sessions.length, 'session')} · {plural(detail.groups.length, 'group')}
          </span>
        }
      />
      {error && !renaming && (
        <Notice kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </Notice>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setError(undefined)
          setRenaming(true)
        }}
      >
        Rename track
      </button>
      <Dialog
        open={renaming}
        title="Rename track"
        onClose={() => {
          setName(detail.track.name)
          setError(undefined)
          setRenaming(false)
        }}
        closeDisabled={busy}
      >
        <form className="dialog-form" onSubmit={saveName}>
          {error && (
            <Notice kind="error" onDismiss={() => setError(undefined)}>
              {error}
            </Notice>
          )}
          <label className="field">
            <span>Track name</span>
            <div className="input-row">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
                data-dialog-autofocus
              />
              <button type="submit" className="primary" disabled={busy || !name.trim()}>Save name</button>
              <button
                type="button"
                onClick={() => {
                  setName(detail.track.name)
                  setError(undefined)
                  setRenaming(false)
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </label>
        </form>
      </Dialog>
      <section className="card">
        <h2>Sessions</h2>
        {detail.track.sessions.length === 0 ? (
          <p className="muted">No sessions yet. Add the first one below.</p>
        ) : (
          <ol className="track-session-list">
            {detail.track.sessions.map((session) => (
              <li key={session.id}>
                {editingSessionId === session.id ? (
                  <form
                    className="input-row inline-edit-form"
                    onSubmit={(event) => renameSession(event, session.id)}
                  >
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={100}
                      aria-label={`New name for ${session.name}`}
                      autoFocus
                      required
                    />
                    <button type="submit" className="primary" disabled={busy || !editingName.trim()}>Save</button>
                    <button type="button" onClick={() => setEditingSessionId(undefined)} disabled={busy}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span>{session.name}</span>
                    <button
                      type="button"
                      onClick={() => { setEditingSessionId(session.id); setEditingName(session.name) }}
                      disabled={busy}
                    >
                      Rename
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
        <form onSubmit={addSession}>
          <label className="field">
            <span>Add a session</span>
            <div className="input-row">
              <input
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="Session name"
                maxLength={100}
              />
              <button type="submit" className="primary" disabled={busy || !sessionName.trim()}>Add session</button>
            </div>
          </label>
        </form>
      </section>
      <section className="card">
        <h2>Assigned groups</h2>
        {detail.groups.length === 0 ? (
          <p className="muted">No groups are assigned to this track.</p>
        ) : (
          <ul className="plain-list">
            {detail.groups.map((group) => (
              <li key={group.id}><Link to={`/groups/${group.id}`}>{group.name}</Link></li>
            ))}
          </ul>
        )}
        <p className="muted small">Assign a track from a group's settings.</p>
      </section>
    </>
  )
}
