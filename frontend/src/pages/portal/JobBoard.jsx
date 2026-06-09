import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { portalGetJobs, portalMyApplications } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'

const TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time',
  contract: 'Contract', internship: 'Internship',
}
const TYPE_COLORS = {
  full_time: 'bg-violet-100 text-violet-700',
  part_time: 'bg-blue-100 text-blue-700',
  contract: 'bg-amber-100 text-amber-700',
  internship: 'bg-green-100 text-green-700',
}

function CompanyAvatar({ name, size = 'md' }) {
  const initials = (name || 'Co').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-indigo-500']
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length]
  const sz = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} ${color} rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}

function JobCard({ job, isApplied }) {
  const sharedBody = (
    <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className={`text-base font-semibold transition-colors ${isApplied ? 'text-slate-500' : 'text-slate-900 group-hover:text-violet-700'}`}>
            {job.title}
          </h4>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-0.5">
            {job.company && <span className="font-medium text-slate-600">{job.company}</span>}
            {job.company && job.location && <span className="text-slate-300">·</span>}
            {job.location && <span>{job.location}</span>}
            {job.min_experience > 0 && (
              <><span className="text-slate-300">·</span><span>{job.min_experience}+ yrs</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isApplied && (
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Applied
            </span>
          )}
          {job.employment_type && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${TYPE_COLORS[job.employment_type] || 'bg-slate-100 text-slate-600'}`}>
              {TYPE_LABELS[job.employment_type] || job.employment_type}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {new Date(job.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
      {job.required_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {job.required_skills.slice(0, 5).map(s => (
            <span key={s} className="text-xs bg-slate-50 text-slate-500 border border-slate-100 px-2 py-0.5 rounded-md">{s}</span>
          ))}
          {job.required_skills.length > 5 && (
            <span className="text-xs text-slate-400">+{job.required_skills.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  )

  if (isApplied) {
    return (
      <div className="flex items-start gap-4 bg-slate-50 rounded-2xl p-5 border border-slate-100 opacity-60 cursor-not-allowed">
        <CompanyAvatar name={job.company} />
        {sharedBody}
      </div>
    )
  }
  return (
    <Link to={`/portal/jobs/${job.id}`}
      className="flex items-start gap-4 bg-white rounded-2xl p-5 border border-slate-100 hover:border-violet-300 hover:shadow-md transition-all group">
      <CompanyAvatar name={job.company} />
      {sharedBody}
      <svg className="w-5 h-5 text-slate-300 group-hover:text-violet-400 transition-colors flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

export default function JobBoard() {
  const { user, logout } = useCandidateAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [appliedJobIds, setAppliedJobIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    portalGetJobs().then(setJobs).finally(() => setLoading(false))
  }, [])

  // Load already-applied jobs so we can disable those cards
  useEffect(() => {
    if (!user) return
    portalMyApplications()
      .then(apps => setAppliedJobIds(new Set(apps.map(a => a.jd_id).filter(Boolean))))
      .catch(() => {})
  }, [user])

  const filtered = jobs.filter(j => {
    const matchSearch = !search ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.company || '').toLowerCase().includes(search.toLowerCase()) ||
      (j.location || '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || j.employment_type === typeFilter
    return matchSearch && matchType
  })

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/portal" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm">AI Hiring Bot</span>
              <span className="text-xs text-slate-400 ml-1.5">Job Portal</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link to="/portal/applications"
                  className="text-sm text-violet-600 font-medium hover:text-violet-800 transition-colors">
                  My Applications
                </Link>
                <div className="w-px h-4 bg-slate-200" />
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-violet-700">{user.name[0].toUpperCase()}</span>
                  </div>
                  <span className="text-sm text-slate-600 font-medium">{user.name.split(' ')[0]}</span>
                </div>
                <button onClick={logout}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/portal/login"
                  className="text-sm text-slate-600 hover:text-violet-600 font-medium transition-colors">Sign in</Link>
                <Link to="/portal/register"
                  className="text-sm bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 font-medium transition-colors shadow-sm">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-700 via-violet-600 to-indigo-700 text-white py-16 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwVjI4aC02djZoNnptNiAwaDZ2LTZoLTZ2NnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-40" />
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm text-violet-100 mb-5">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            AI-powered screening • Results in 48 hours
          </div>
          <h2 className="text-4xl font-extrabold mb-3 tracking-tight">Find Your Next Opportunity</h2>
          <p className="text-violet-200 mb-8 text-lg">Browse open positions · Apply in minutes · Get AI-screened fast</p>
          <div className="max-w-xl mx-auto relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" placeholder="Search by title, company, or location..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-5 py-3.5 rounded-xl text-slate-900 text-sm focus:outline-none shadow-xl focus:ring-2 focus:ring-violet-300"
            />
          </div>
        </div>
      </div>

      {/* Filters + Job list */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Filter chips */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <p className="text-sm font-semibold text-slate-700">
            {loading ? 'Loading positions...' : `${filtered.length} open position${filtered.length !== 1 ? 's' : ''}`}
          </p>
          <div className="flex gap-2 flex-wrap">
            {['all', 'full_time', 'part_time', 'contract', 'internship'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:text-violet-600'
                }`}>
                {t === 'all' ? 'All Types' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse h-28" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-base font-medium text-slate-500">No positions found</p>
            <p className="text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => (
              <JobCard key={job.id} job={job} isApplied={appliedJobIds.has(job.id)} />
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 py-8 text-center mt-10">
        <p className="text-xs text-slate-400">Powered by <span className="font-medium text-violet-600">AI Hiring Bot</span> · Screening interviews are conducted by an AI system</p>
      </footer>
    </div>
  )
}
