import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { portalGetJobs } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'

const TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time',
  contract: 'Contract', internship: 'Internship',
}

export default function JobBoard() {
  const { user, logout } = useCandidateAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    portalGetJobs().then(setJobs).finally(() => setLoading(false))
  }, [])

  const filtered = jobs.filter(j =>
    !search || j.title.toLowerCase().includes(search.toLowerCase()) ||
    (j.company || '').toLowerCase().includes(search.toLowerCase()) ||
    (j.location || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-indigo-700">AI Hiring Bot</h1>
            <p className="text-xs text-gray-400">Job Portal</p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link to="/portal/applications"
                  className="text-sm text-indigo-600 font-medium hover:underline">
                  My Applications
                </Link>
                <span className="text-sm text-gray-500">Hi, {user.name.split(' ')[0]}</span>
                <button onClick={logout}
                  className="text-sm text-gray-400 hover:text-red-500">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/portal/login"
                  className="text-sm text-gray-600 hover:text-indigo-600 font-medium">Sign in</Link>
                <Link to="/portal/register"
                  className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white py-14 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-3">Find Your Next Opportunity</h2>
          <p className="text-indigo-200 mb-8">Browse open positions from top companies — apply in minutes</p>
          <div className="max-w-xl mx-auto">
            <input
              type="text" placeholder="Search by title, company, or location..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-5 py-3 rounded-xl text-gray-900 text-sm focus:outline-none shadow-lg"
            />
          </div>
        </div>
      </div>

      {/* Job list */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800">
            {loading ? 'Loading...' : `${filtered.length} open position${filtered.length !== 1 ? 's' : ''}`}
          </h3>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse h-28" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No positions found</p>
            <p className="text-sm mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(job => (
              <Link key={job.id} to={`/portal/jobs/${job.id}`}
                className="block bg-white rounded-xl p-6 border border-gray-100 hover:border-indigo-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-gray-900 mb-1">{job.title}</h4>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      {job.company && <span className="font-medium text-gray-700">{job.company}</span>}
                      {job.location && <span>📍 {job.location}</span>}
                      {job.min_experience > 0 && <span>💼 {job.min_experience}+ yrs</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {job.employment_type && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">
                        {TYPE_LABELS[job.employment_type] || job.employment_type}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(job.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400 mt-10">
        Powered by AI Hiring Bot · Screening interviews are conducted by an AI system
      </footer>
    </div>
  )
}
