import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { portalMyApplications } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'

const STATUS_CONFIG = {
  pending:        { label: 'Under Review',    color: 'bg-gray-100 text-gray-600' },
  analyzed:       { label: 'Shortlisted',     color: 'bg-blue-100 text-blue-700' },
  pending_review: { label: 'HR Review',       color: 'bg-yellow-100 text-yellow-700' },
  scheduled:      { label: 'Interview Scheduled', color: 'bg-purple-100 text-purple-700' },
  in_call:        { label: 'Interview In Progress', color: 'bg-orange-100 text-orange-700' },
  completed:      { label: 'Completed',       color: 'bg-green-100 text-green-700' },
  rejected:       { label: 'Not Selected',    color: 'bg-red-100 text-red-600' },
  failed:         { label: 'Processing Error', color: 'bg-gray-100 text-gray-500' },
}

export default function MyApplications() {
  const { user, logout, ready } = useCandidateAuth()
  const navigate = useNavigate()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (ready && !user) { navigate('/portal/login', { state: { from: '/portal/applications' } }); return }
    if (user) {
      portalMyApplications().then(setApps).finally(() => setLoading(false))
    }
  }, [user, ready])

  const handleLogout = () => { logout(); navigate('/portal') }

  if (!ready) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/portal" className="text-indigo-700 font-bold text-xl">AI Hiring Bot</Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.name}</span>
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500">Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
            <p className="text-gray-500 text-sm mt-1">Track your job applications</p>
          </div>
          <Link to="/portal" className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium">
            Browse Jobs
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2].map(i => <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse h-24" />)}
          </div>
        ) : apps.length === 0 ? (
          <div className="bg-white rounded-xl p-16 text-center border border-gray-100">
            <p className="text-gray-400 text-lg mb-2">No applications yet</p>
            <p className="text-gray-400 text-sm mb-6">Browse open positions and submit your first application</p>
            <Link to="/portal" className="text-sm bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 font-medium">
              Browse Jobs
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {apps.map(app => {
              const cfg = STATUS_CONFIG[app.status] || { label: app.status, color: 'bg-gray-100 text-gray-600' }
              return (
                <div key={app.id} className="bg-white rounded-xl p-6 border border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{app.job_title}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mt-1">
                        {app.company && <span className="font-medium text-gray-700">{app.company}</span>}
                        {app.location && <span>📍 {app.location}</span>}
                        <span className="text-xs text-gray-400">
                          Applied {new Date(app.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                      {app.match_score != null && (
                        <span className={`text-sm font-bold ${app.match_score >= 70 ? 'text-green-600' : app.match_score >= 45 ? 'text-yellow-600' : 'text-red-500'}`}>
                          Match: {app.match_score}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status timeline hint */}
                  <div className="mt-4 pt-4 border-t border-gray-50 text-xs text-gray-400">
                    {app.status === 'pending' && <span>Your resume is being analyzed by our AI system</span>}
                    {app.status === 'analyzed' && <span>You have been shortlisted. We will schedule an AI interview soon</span>}
                    {app.status === 'pending_review' && <span>An HR reviewer is looking at your profile</span>}
                    {app.status === 'scheduled' && <span>An AI interview has been scheduled. Check your phone for the consent SMS</span>}
                    {app.status === 'in_call' && <span>Your AI interview is in progress</span>}
                    {app.status === 'completed' && <span>Your interview is complete. The team will be in touch soon</span>}
                    {app.status === 'rejected' && <span>Thank you for applying. We will keep your profile for future opportunities</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
