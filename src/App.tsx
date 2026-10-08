import { Link, Route, Routes } from 'react-router'
import AttendancePage from './pages/AttendancePage.tsx'
import GroupLayout from './pages/GroupLayout.tsx'
import GroupsPage from './pages/GroupsPage.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import MeetingsPage from './pages/MeetingsPage.tsx'
import MembersPage from './pages/MembersPage.tsx'
import SchedulePage from './pages/SchedulePage.tsx'

export default function App() {
  return (
    <div className="app">
      <header className="site-header">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          <span>
            <span className="brand-church">Springbrook Community Church</span>
            <span className="brand-app">Group Attendance</span>
          </span>
        </Link>
      </header>
      <main className="content">
        <Routes>
          <Route index element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupLayout />}>
            <Route index element={<MeetingsPage />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="meetings/:date" element={<AttendancePage />} />
          </Route>
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
