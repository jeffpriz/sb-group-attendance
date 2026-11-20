import { lazy, Suspense } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import AttendancePage from './pages/AttendancePage.tsx'
import GroupLayout from './pages/GroupLayout.tsx'
import GroupsPage from './pages/GroupsPage.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import MeetingsPage from './pages/MeetingsPage.tsx'
import MissingAttendancePage from './pages/MissingAttendancePage.tsx'
import MembersPage from './pages/MembersPage.tsx'
import SchedulePage from './pages/SchedulePage.tsx'
import SeasonDetailPage from './pages/SeasonDetailPage.tsx'
import SeasonsPage from './pages/SeasonsPage.tsx'
import TrackDetailPage from './pages/TrackDetailPage.tsx'
import TracksPage from './pages/TracksPage.tsx'

// Charts are only needed on this page, so load them on demand.
const StatsPage = lazy(() => import('./pages/StatsPage.tsx'))

export default function App() {
  const { pathname } = useLocation()
  const groupsActive = pathname === '/' || pathname.startsWith('/groups/')

  return (
    <div className="app">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              <img src="/favicon.svg" alt="" width={28} height={28} />
            </span>
            <span>
              <span className="brand-church">Springbrook Community Church</span>
              <span className="brand-app">Group Attendance</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Main">
            <Link
              to="/"
              className={groupsActive ? 'active' : undefined}
              aria-current={groupsActive ? 'page' : undefined}
            >
              Groups
            </Link>
            <NavLink to="/seasons">Seasons</NavLink>
            <NavLink to="/tracks">Tracks</NavLink>
            <NavLink to="/stats">Statistics</NavLink>
          </nav>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route index element={<GroupsPage />} />
          <Route path="seasons" element={<SeasonsPage />} />
          <Route path="seasons/:seasonId" element={<SeasonDetailPage />} />
          <Route path="tracks" element={<TracksPage />} />
          <Route path="tracks/:trackId" element={<TrackDetailPage />} />
          <Route path="attendance/missing" element={<MissingAttendancePage />} />
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
      </main>
    </div>
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
