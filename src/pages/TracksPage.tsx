import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { TrackSummary } from '../../shared/types.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { errorMessage, plural } from '../util.ts'

export default function TracksPage() {
  const [tracks, setTracks] = useState<TrackSummary[]>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [sessions, setSessions] = useState('')
  const [creating, setCreating] = useState(false)

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
    if (!name.trim()) return
    setCreating(true)
    setError(undefined)
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
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div className="section-head">
        <h1>Tracks</h1>
        <Link to="/" className="button">All groups</Link>
      </div>
      <p className="muted">Define the course material and sessions groups will work through.</p>
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
        <div className="card empty"><p>No tracks yet. Create one below.</p></div>
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
      <form className="card" onSubmit={create}>
        <h2>Create a track</h2>
        <label className="field">
          <span>Track name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Thinking"
            maxLength={100}
            required
          />
        </label>
        <label className="field">
          <span>Sessions (one per line, optional)</span>
          <textarea
            rows={5}
            value={sessions}
            onChange={(event) => setSessions(event.target.value)}
            placeholder={'Session 1\nSession 2\nSession 3'}
          />
        </label>
        <button type="submit" className="primary" disabled={creating || !name.trim()}>
          {creating ? 'Creating…' : 'Create track'}
        </button>
      </form>
    </>
  )
}
