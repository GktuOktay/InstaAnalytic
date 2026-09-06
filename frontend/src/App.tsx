import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/SessionPage'
import FollowersPage from './pages/FollowersPage'
import ActionLogPage from './pages/ActionLogPage'
import PostsPage from './pages/PostsPage'
import UsersPage from './pages/UsersPage'
import MonitorPage from './pages/MonitorPage'
import ReportPage from './pages/ReportPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="session" element={<SessionPage />} />
        <Route path="followers" element={<FollowersPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="monitor" element={<MonitorPage />} />
        <Route path="actions" element={<ActionLogPage />} />
        <Route path="report" element={<ReportPage />} />
      </Route>
    </Routes>
  )
}
