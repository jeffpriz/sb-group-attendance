import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { SeasonSummary } from '../../shared/types.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { errorMessage, plural } from '../util.ts'

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      setSeasons(await api.listSeasons())
      setError(undefined)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  function retry() {
    setLoading(true)
    void load()
  }

  useEffect(() => {
    document.title = 'Seasons · Group Attendance'
    let cancelled = false
    api.listSeasons().then(
      (items) => {
        if (cancelled) return
        setSeasons(items)
        setError(undefined)
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

  async function createSeason(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(undefined)
    try {
      const created = await api.createSeason(name)
      setSeasons((current) =>
        [...(current ?? []), { ...created, groups: [] }].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        ),
      )
      setName('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div className="section-head">
        <h1>Seasons</h1>
        <Link to="/" className="button">
          All groups
        </Link>
      </div>
      <p className="muted">Organize groups by their current attendance season.</p>
      {error && (
        <Notice kind="error">
          <span>{error}</span>{' '}
          <button type="button" className="link-button" onClick={retry} disabled={loading}>
            Retry
          </button>
        </Notice>
      )}
      {seasons === undefined && loading && <p className="muted">Loading seasons…</p>}
      {seasons?.length === 0 && (
        <div className="card empty">
          <p>No seasons yet. Create one below.</p>
        </div>
      )}
      {seasons && seasons.length > 0 && (
        <ul className="season-list">
          {seasons.map((season) => {
            const active = season.groups.filter((group) => !group.archived).length
            const archived = season.groups.length - active
            return (
              <li key={season.id}>
                <Link to={`/seasons/${season.id}`} className="season-card">
                  <span className="season-card-name">{season.name}</span>
                  <span className="muted">
                    {plural(active, 'active group')} · {plural(archived, 'archived group')}
                  </span>
                  <span className="season-card-link">View groups →</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <form className="card" onSubmit={createSeason}>
        <h2>Create a season</h2>
        <label className="field">
          <span>Season name</span>
          <div className="input-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Spring 2027"
              maxLength={100}
              required
            />
            <button type="submit" className="primary" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create season'}
            </button>
          </div>
        </label>
      </form>
    </>
  )
}
