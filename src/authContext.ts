import { createContext, use } from 'react'
import type { SessionInfo } from './api.ts'

export type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'signedOut' }
  /** `expired`: the session ended while the app was open; the page stays mounted under a sign-in dialog. */
  | { status: 'signedIn'; required: boolean; expiresAt?: string; expired: boolean }

interface AuthContextValue {
  state: AuthState
  signedIn: (info: SessionInfo) => void
  signOut: () => Promise<void>
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
