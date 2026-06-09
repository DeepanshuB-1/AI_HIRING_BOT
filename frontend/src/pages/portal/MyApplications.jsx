import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { portalMyApplications } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'

const STEPS = ['pending', 'analyzed', 'pending_review', 'scheduled', 'in_call', 'completed']

const STATUS_CONFIG = {
  pending:        { label: 'Under Review',          color: 'bg-slate-100 text-slate-600',     icon: '🔍', desc: 'Your resume is being analyzed by our AI system' },
  analyzed:       { label: 'Shortlisted',            color: 'bg-blue-100 text-blue-700',       icon: '⭐', desc: 'You\'ve been shortlisted! An AI interview will be scheduled soon' },
  pending_review: { label: 'HR Review',              color: 'bg-amber-100 text-amber-700',     icon: '👀', desc: 'A recruiter is reviewing your profile' },
  scheduled:      { label: 'Interview Scheduled',   color: 'bg-violet-100 text-violet-700',   icon: '📅', desc: 'Check your email and phone for interview details' },
  in_call:        { label: 'Interview In Progress',  color: 'bg-orange-100 text-orange-700',   icon: '📞', desc: 'Your AI interview is happening right now' },
  completed:      { label: 'Interview Complete',     color: 'bg-green-100 text-green-700',     icon: '✅', desc: 'Interview done! The team will be in touch soon' },
  rejected:       { label: 'Not Selected',           color: 'bg-red-50 text-red-500',          icon: '📋', desc: 'We\'ll keep your profile for future opportunities' },
  failed:         { label: 'Processing Error',       color: 'bg-slate-100 text-slate-400',     icon: '⚠️', desc: 'There was a technical issue. Please contact support' },
}

function ProgressBar({ status }) {
  if (status === 'rejected' || status === 'failed') return null
  const idx = STEPS.indexOf(status)
  if (idx < 0) return null
  const pct = Math.round(((idx + 1) / STEPS.length) * 100)
  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs text-slate-400 mb-1.5">
        <span>Application Progress</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={`text-xs ${i <= idx ? 'text-violet-600 font-medium' : 'text-slate-300'}`}>
            {i === 0 ? 'Applied' : i === STEPS.length - 1 ? 'Done' : ''}
          </div>
        ))}
      </div>
    </div>
  )
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/portal" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-sm">AI Hiring Bot</span>
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-violet-700">{user.name[0].toUpperCase()}</span>
                </div>
                <span className="text-sm text-slate-600 font-medium">{user.name.split(' ')[0]}</span>
              </div>
            )}
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Applications</h1>
            <p className="text-slate-500 text-sm mt-1">
              {loading ? '...' : `${apps.length} application${apps.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Link to="/portal"
            className="flex items-center gap-2 text-sm bg-violet-600 text-white px-4 py-2 rounded-xl hover:bg-violet-700 font-medium shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Browse Jobs
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2].map(i => <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse h-36" />)}
          </div>
        ) : apps.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-slate-100 shadow-sm">
            <div className="w-20 h-20 bg-violet-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-slate-700 font-semibold text-lg mb-1">No applications yet</p>
            <p className="text-slate-400 text-sm mb-6">Browse open positions and submit your first application</p>
            <Link to="/portal"
              className="inline-flex items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-xl hover:bg-violet-700 font-medium text-sm shadow-sm transition-colors">
              Browse Open Positions
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {apps.map(app => {
              const cfg = STATUS_CONFIG[app.status] || { label: app.status, color: 'bg-slate-100 text-slate-600', icon: '•', desc: '' }
              return (
                <div key={app.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 text-lg leading-tight">{app.job_title}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-1">
                        {app.company && (
                          <span className="font-medium text-slate-700">{app.company}</span>
                        )}
                        {app.location && (
                          <span className="flex items-center gap-0.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            {app.location}
                          </span>
                        )}
                        <span className="text-slate-300">·</span>
                        <span>Applied {new Date(app.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold ${cfg.color}`}>
                        <span>{cfg.icon}</span>
                        {cfg.label}
                      </span>
                      {app.match_score != null && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${app.match_score >= 70 ? 'bg-green-500' : app.match_score >= 45 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${app.match_score}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${app.match_score >= 70 ? 'text-green-600' : app.match_score >= 45 ? 'text-amber-600' : 'text-red-500'}`}>
                            {app.match_score}% match
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {cfg.desc && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5">
                      <svg className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {cfg.desc}
                    </div>
                  )}

                  <ProgressBar status={app.status} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 py-6 text-center mt-6">
        <p className="text-xs text-slate-400">Powered by <span className="font-medium text-violet-600">AI Hiring Bot</span> · Screening interviews are conducted by an AI system</p>
      </footer>
    </div>
  )
}
