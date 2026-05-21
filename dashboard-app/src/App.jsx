import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './utils/auth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ReportsArchivePage from './pages/ReportsArchivePage'
import ReportDetailPage from './pages/ReportDetailPage'
import DiffComparisonPage from './pages/DiffComparisonPage'
import AdminPage from './pages/AdminPage'

function Protected({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/reports" element={<Protected><ReportsArchivePage /></Protected>} />
        <Route path="/reports/:uid" element={<Protected><ReportDetailPage /></Protected>} />
        <Route path="/reports/:uid/compare" element={<Protected><DiffComparisonPage /></Protected>} />
        <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
