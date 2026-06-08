import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CandidateAuthProvider } from './contexts/CandidateAuthContext'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Candidates from './pages/Candidates'
import CandidateDetail from './pages/CandidateDetail'
import Schedule from './pages/Schedule'
import Search from './pages/Search'
import Login from './pages/Login'
import Register from './pages/Register'
import JobBoard from './pages/portal/JobBoard'
import JobDetail from './pages/portal/JobDetail'
import CandidateLogin from './pages/portal/CandidateLogin'
import CandidateRegister from './pages/portal/CandidateRegister'
import MyApplications from './pages/portal/MyApplications'

function ProtectedLayout() {
  const { user, ready } = useAuth()
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Routes>
          <Route path="/"               element={<Dashboard />} />
          <Route path="/jobs"           element={<Jobs />} />
          <Route path="/candidates"     element={<Candidates />} />
          <Route path="/candidates/:id" element={<CandidateDetail />} />
          <Route path="/schedule"       element={<Schedule />} />
          <Route path="/search"         element={<Search />} />
        </Routes>
      </main>
    </div>
  )
}

function AuthGuard({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <CandidateAuthProvider>
        <Routes>
          {/* ── Candidate Portal (no HR auth needed) ── */}
          <Route path="/portal"                element={<JobBoard />} />
          <Route path="/portal/jobs/:id"       element={<JobDetail />} />
          <Route path="/portal/login"          element={<CandidateLogin />} />
          <Route path="/portal/register"       element={<CandidateRegister />} />
          <Route path="/portal/applications"   element={<MyApplications />} />

          {/* ── HR Dashboard ── */}
          <Route path="/*" element={
            <AuthProvider>
              <Routes>
                <Route path="/login"    element={<AuthGuard><Login /></AuthGuard>} />
                <Route path="/register" element={<AuthGuard><Register /></AuthGuard>} />
                <Route path="/*"        element={<ProtectedLayout />} />
              </Routes>
            </AuthProvider>
          } />
        </Routes>
      </CandidateAuthProvider>
    </BrowserRouter>
  )
}
