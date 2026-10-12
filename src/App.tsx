import { lazy, Suspense, useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router'
import { AuthProvider } from './auth.tsx'
import { useAuth } from './authContext.ts'
import LoginForm from './components/LoginForm.tsx'
import Notice from './components/Notice.tsx'
import AttendancePage from './pages/AttendancePage.tsx'
import GroupLayout from './pages/GroupLayout.tsx'
import GroupsPage from './pages/GroupsPage.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import MeetingsPage from './pages/MeetingsPage.tsx'
import MembersPage from './pages/MembersPage.tsx'
import SchedulePage from './pages/SchedulePage.tsx'

// Charts are only needed on this page, so load them on demand.
const StatsPage = lazy(() => import('./pages/StatsPage.tsx'))

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}

function Shell() {
  const { state, signOut } = useAuth()
  const signedIn = state.status === 'signedIn'
  const expired = signedIn && state.expired

  return (
    <>
      {/* While the sign-in dialog is open, the page underneath stays as it was (e.g. unsaved checkmarks) but can't be used. */}
      <div className="app" inert={expired}>
        <header className="site-header">
          <div className="header-inner">
            <Link to="/" className="brand">
              <img src="/favicon.svg" alt="" width={36} height={36} />
              <span>
                <span className="brand-church">Springbrook Community Church</span>
                <span className="brand-app">Group Attendance</span>
              </span>
            </Link>
            {signedIn && (
              <nav className="site-nav" aria-label="Main">
                <NavLink to="/" end>
                  Groups
                </NavLink>
                <NavLink to="/stats">Statistics</NavLink>
                {state.required && (
                  <button type="button" className="sign-out" onClick={() => void signOut()}>
                    Log out
                  </button>
                )}
              </nav>
            )}
          </div>
        </header>
        <main className="content">{signedIn ? <AppRoutes /> : <SignedOutContent />}</main>
      </div>
      {expired && <SessionExpiredDialog />}
    </>
  )
}

function SignedOutContent() {
  const { state, signedIn, retry } = useAuth()
  if (state.status === 'loading') return <p className="muted">Loading…</p>
  if (state.status === 'error') {
    return (
      <div className="card">
        <Notice kind="error">{state.message}</Notice>
        <button type="button" className="button" onClick={retry}>
          Try again
        </button>
      </div>
    )
  }
  // The address bar keeps the page that was asked for, so it opens straight after signing in.
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <p className="eyebrow">Springbrook Community Church</p>
        <h1>Welcome</h1>
        <p className="muted">Enter the site password to view and take group attendance.</p>
        <LoginForm onSuccess={signedIn} />
      </div>
    </div>
  )
}

function SessionExpiredDialog() {
  const { signedIn, signOut } = useAuth()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="card login-card session-dialog"
      aria-labelledby="session-expired-title"
      onCancel={(e) => e.preventDefault()}
    >
      <h2 id="session-expired-title">Your session has ended</h2>
      <p className="muted">
        For privacy, you need to enter the password again every hour. Anything you haven’t saved is still on the
        page; after you continue, save it again.
      </p>
      <LoginForm onSuccess={signedIn} />
      <button type="button" className="link-button session-dialog-out" onClick={() => void signOut()}>
        Log out instead
      </button>
    </dialog>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<GroupsPage />} />
      <Route path="groups/:groupId" element={<GroupLayout />}>
        <Route index element={<MeetingsPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="meetings/:date" element={<AttendancePage />} />
      </Route>
      <Route
        path="stats"
        element={
          <Suspense fallback={<p className="muted">Loading statistics…</p>}>
            <StatsPage />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

function NotFound() {
  return (
    <div className="card">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go back to all groups</Link>
      </p>
    </div>
  )
}
