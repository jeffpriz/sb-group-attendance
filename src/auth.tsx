import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setAuthRequiredHandler, type SessionInfo } from './api.ts'
import { AuthContext, type AuthState } from './authContext.ts'
import { errorMessage } from './util.ts'

// Longest delay setTimeout accepts.
const MAX_TIMEOUT = 2 ** 31 - 1

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.getSession().then(
      (info) => {
        if (cancelled) return
        setState(
          info.authenticated
            ? { status: 'signedIn', required: info.required, expiresAt: info.expiresAt, expired: false }
            : { status: 'signedOut' },
        )
      },
      (err) => !cancelled && setState({ status: 'error', message: errorMessage(err) }),
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Any API call that comes back 401 means the session is gone.
  useEffect(() => {
    setAuthRequiredHandler(() =>
      setState((s) => (s.status === 'signedIn' ? { ...s, expired: true } : { status: 'signedOut' })),
    )
    return () => setAuthRequiredHandler(undefined)
  }, [])

  // Show the sign-in dialog as soon as the session runs out, before anything fails.
  const expiresAt = state.status === 'signedIn' && !state.expired ? state.expiresAt : undefined
  useEffect(() => {
    if (!expiresAt) return
    const delay = Math.min(Math.max(new Date(expiresAt).getTime() - Date.now(), 0), MAX_TIMEOUT)
    const timer = setTimeout(
      () => setState((s) => (s.status === 'signedIn' ? { ...s, expired: true } : s)),
      delay,
    )
    return () => clearTimeout(timer)
  }, [expiresAt])

  const signedIn = useCallback((info: SessionInfo) => {
    setState({ status: 'signedIn', required: info.required, expiresAt: info.expiresAt, expired: false })
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.signOut()
    } finally {
      setState({ status: 'signedOut' })
    }
  }, [])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo(() => ({ state, signedIn, signOut, retry }), [state, signedIn, signOut, retry])
  return <AuthContext value={value}>{children}</AuthContext>
}
