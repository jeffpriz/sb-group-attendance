import { useId, useState, type FormEvent } from 'react'
import { api, type SessionInfo } from '../api.ts'
import { errorMessage } from '../util.ts'
import Notice from './Notice.tsx'

interface Props {
  onSuccess: (info: SessionInfo) => void
  submitLabel?: string
}

export default function LoginForm({ onSuccess, submitLabel = 'Continue' }: Props) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const id = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!password) {
      setError('Please enter the password.')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const info = await api.signIn(password)
      onSuccess(info)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      {error && <Notice kind="error">{error}</Notice>}
      <label className="field" htmlFor={`${id}-pw`}>
        <span>Password</span>
      </label>
      <div className="password-row">
        <input
          id={`${id}-pw`}
          type={show ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          disabled={busy}
        />
        <button
          type="button"
          className="button password-toggle"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          aria-controls={`${id}-pw`}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <button type="submit" className="button primary login-submit" disabled={busy}>
        {busy ? 'Checking…' : submitLabel}
      </button>
    </form>
  )
}
