import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SettingsPage from './pages/SettingsPage'
import StartPage from './pages/StartPage'
import FollowersPage from './pages/FollowersPage'
import ActionLogPage from './pages/ActionLogPage'
import PostsPage from './pages/PostsPage'
import UsersPage from './pages/UsersPage'
import MonitorPage from './pages/MonitorPage'
import ReportPage from './pages/ReportPage'
import FansPage from './pages/FansPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="start" element={<StartPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="session" element={<Navigate to="/settings" replace />} />
        <Route path="followers" element={<FollowersPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="monitor" element={<MonitorPage />} />
        <Route path="actions" element={<ActionLogPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="fans" element={<FansPage />} />
      </Route>
    </Routes>
  )
}
