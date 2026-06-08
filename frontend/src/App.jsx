import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Candidates from './pages/Candidates'
import CandidateDetail from './pages/CandidateDetail'
import Schedule from './pages/Schedule'
import Search from './pages/Search'

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
