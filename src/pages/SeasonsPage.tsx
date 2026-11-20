import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { SeasonSummary } from '../../shared/types.ts'
import { api } from '../api.ts'
import Dialog from '../components/Dialog.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { errorMessage, plural } from '../util.ts'

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string>()

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
    if (creating || !name.trim()) return
    setCreating(true)
    setCreateError(undefined)
    try {
      const created = await api.createSeason(name)
      setSeasons((current) =>
        [...(current ?? []), { ...created, groups: [] }].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        ),
      )
      setName('')
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
        title="Seasons"
        description="Organize groups by their current attendance season."
        actions={
          <button type="button" className="primary" onClick={openCreate} aria-haspopup="dialog">
            New season
          </button>
        }
      />
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
          <p>No seasons yet.</p>
          <button type="button" className="primary" onClick={openCreate}>
            Create the first season
          </button>
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
      <Dialog
        open={createOpen}
        title="New season"
        onClose={closeCreate}
        closeDisabled={creating}
      >
        <form className="dialog-form" onSubmit={createSeason}>
          {createError && (
            <Notice kind="error" onDismiss={() => setCreateError(undefined)}>
              {createError}
            </Notice>
          )}
          <label className="field">
            <span>Season name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Spring 2027"
              maxLength={100}
              required
              disabled={creating}
              data-dialog-autofocus
            />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={closeCreate} disabled={creating}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create season'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
