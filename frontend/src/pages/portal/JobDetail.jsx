import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { portalGetJob, portalApply } from '../../api/client'
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

function CompanyAvatar({ name }) {
  const initials = (name || 'Co').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-indigo-500']
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length]
  return (
    <div className={`w-16 h-16 ${color} rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-sm flex-shrink-0`}>
      {initials}
    </div>
  )
}

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, token, authHeader } = useCandidateAuth()

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState(user?.phone || '')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    portalGetJob(id).then(setJob).catch(() => navigate('/portal')).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (user?.phone) setPhone(user.phone)
  }, [user])

  const handleApply = async (e) => {
    e.preventDefault()
    if (!user) { navigate('/portal/login', { state: { from: `/portal/jobs/${id}` } }); return }

    const file = fileRef.current?.files[0]
    if (!file) { setError('Please select your resume file'); return }

    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'txt'].includes(ext)) {
      setError('Resume must be a PDF, DOCX, or TXT file'); return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Resume file is too large (max 10 MB)'); return
    }

    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) { setError('Please enter a valid phone number'); return }

    setApplying(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('resume', file)
      fd.append('phone', phone.trim())
      await portalApply(id, fd)
      setApplied(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit application')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading position...
      </div>
    </div>
  )
  if (!job) return null

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
            <span className="font-bold text-slate-900 text-sm">AI Hiring Bot</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link to="/portal/applications" className="text-sm text-violet-600 font-medium hover:text-violet-800">My Applications</Link>
                <div className="w-px h-4 bg-slate-200" />
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-violet-700">{user.name[0].toUpperCase()}</span>
                  </div>
                  <span className="text-sm text-slate-600 font-medium">{user.name.split(' ')[0]}</span>
                </div>
              </>
            ) : (
              <>
                <Link to="/portal/login" className="text-sm text-slate-600 hover:text-violet-600 font-medium">Sign in</Link>
                <Link to="/portal/register" className="text-sm bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 font-medium shadow-sm">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Job details */}
        <div className="lg:col-span-2 space-y-5">
          <Link to="/portal" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All positions
          </Link>

          {/* Job header card */}
          <div className="bg-white rounded-2xl p-7 border border-slate-100 shadow-sm">
            <div className="flex items-start gap-4 mb-5">
              <CompanyAvatar name={job.company} />
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">{job.title}</h1>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500 mt-1.5">
                  {job.company && <span className="font-semibold text-slate-700">{job.company}</span>}
                  {job.location && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      {job.location}
                    </span>
                  )}
                  {job.min_experience > 0 && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {job.min_experience}+ years
                    </span>
                  )}
                  {job.employment_type && (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[job.employment_type] || 'bg-slate-100 text-slate-600'}`}>
                      {TYPE_LABELS[job.employment_type] || job.employment_type}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 mb-5" />

            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Job Description</h3>
            <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{job.jd_text}</div>

            {job.required_skills?.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Required Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {job.required_skills.map(s => (
                    <span key={s} className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-medium">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Screening notice */}
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-5 border border-violet-100">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-violet-900 mb-1">AI-Powered Screening</h3>
                <p className="text-sm text-violet-700 leading-relaxed">
                  Shortlisted candidates receive an AI phone interview (~20–25 min). The AI identifies itself at the start. You'll get SMS and email notifications at each stage.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Apply card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm sticky top-24">
            {applied ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">Application Submitted!</h3>
                <p className="text-sm text-slate-500 mb-5">We'll review your application and reach out via SMS and email.</p>
                <Link to="/portal/applications"
                  className="block w-full text-center bg-violet-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors shadow-sm">
                  View My Applications
                </Link>
              </div>
            ) : (
              <>
                <h3 className="font-bold text-slate-800 text-lg mb-1">Apply Now</h3>
                <p className="text-xs text-slate-400 mb-5">Takes less than 2 minutes</p>

                {!user && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
                    <Link to="/portal/login" state={{ from: `/portal/jobs/${id}` }} className="font-semibold underline">Sign in</Link> or{' '}
                    <Link to="/portal/register" className="font-semibold underline">register</Link> to apply
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5 rounded-xl mb-4">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                <form onSubmit={handleApply} className="space-y-4">
                  {user && (
                    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-violet-700">{user.name[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-700">{user.name}</p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Phone Number *</label>
                    <input
                      required value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition-shadow" />
                    <p className="text-xs text-slate-400 mt-1">For AI interview scheduling</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Resume (PDF/DOCX) *</label>
                    <label className={`flex items-center gap-3 w-full border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-colors ${fileName ? 'border-violet-300 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'}`}>
                      <svg className={`w-5 h-5 flex-shrink-0 ${fileName ? 'text-violet-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className={`text-sm ${fileName ? 'text-violet-700 font-medium' : 'text-slate-400'}`}>
                        {fileName || 'Click to upload resume'}
                      </span>
                      <input
                        ref={fileRef} type="file" required accept=".pdf,.docx,.txt" className="hidden"
                        onChange={e => setFileName(e.target.files[0]?.name || '')} />
                    </label>
                  </div>
                  <button
                    type="submit" disabled={applying || !user}
                    className="w-full bg-violet-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2">
                    {applying ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Submitting...
                      </>
                    ) : user ? 'Submit Application' : 'Sign in to Apply'}
                  </button>
                </form>
                <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
                  By applying, you consent to an AI-conducted screening call
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
