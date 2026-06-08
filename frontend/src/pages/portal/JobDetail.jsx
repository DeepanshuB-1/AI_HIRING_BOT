import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { portalGetJob, portalApply } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'

const TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time',
  contract: 'Contract', internship: 'Internship',
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
    if (!phone.trim()) { setError('Please enter your phone number'); return }

    setApplying(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('resume', file)
      fd.append('phone', phone.trim())
      await axios.post(`/api/portal/apply/${id}`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      })
      setApplied(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit application')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading...</div>
  if (!job) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/portal" className="text-indigo-700 font-bold text-xl">AI Hiring Bot</Link>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link to="/portal/applications" className="text-sm text-indigo-600 font-medium hover:underline">My Applications</Link>
                <span className="text-sm text-gray-500">Hi, {user.name.split(' ')[0]}</span>
              </>
            ) : (
              <>
                <Link to="/portal/login" className="text-sm text-gray-600 hover:text-indigo-600 font-medium">Sign in</Link>
                <Link to="/portal/register" className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Job details */}
        <div className="lg:col-span-2 space-y-6">
          <Link to="/portal" className="text-sm text-indigo-600 hover:underline">← Back to all jobs</Link>

          <div className="bg-white rounded-xl p-7 border border-gray-100">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{job.title}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-5">
              {job.company && <span className="font-semibold text-gray-700">{job.company}</span>}
              {job.location && <span>📍 {job.location}</span>}
              {job.min_experience > 0 && <span>💼 {job.min_experience}+ years experience</span>}
              {job.employment_type && (
                <span className="bg-indigo-50 text-indigo-700 px-3 py-0.5 rounded-full font-medium">
                  {TYPE_LABELS[job.employment_type] || job.employment_type}
                </span>
              )}
            </div>

            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Job Description</h3>
            <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{job.jd_text}</div>

            {job.required_skills?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Required Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {job.required_skills.map(s => (
                    <span key={s} className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Screening notice */}
          <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
            <h3 className="font-semibold text-indigo-900 mb-2">🤖 AI-Powered Screening</h3>
            <p className="text-sm text-indigo-700">
              Shortlisted candidates will receive an AI phone interview conducted by our system.
              The AI will identify itself at the start of the call. Interviews are approximately 20–25 minutes.
            </p>
          </div>
        </div>

        {/* Apply card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl p-6 border border-gray-100 sticky top-24">
            {applied ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="font-bold text-gray-900 mb-2">Application Submitted!</h3>
                <p className="text-sm text-gray-500 mb-4">We'll review your application and reach out soon.</p>
                <Link to="/portal/applications"
                  className="block w-full text-center bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700">
                  View My Applications
                </Link>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-gray-800 mb-4">Apply for this position</h3>

                {!user && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                    <Link to="/portal/login" state={{ from: `/portal/jobs/${id}` }} className="font-medium underline">Sign in</Link> or{' '}
                    <Link to="/portal/register" className="font-medium underline">register</Link> to apply
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
                )}

                <form onSubmit={handleApply} className="space-y-4">
                  {user && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                        <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500">{user.name}</div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500">{user.email}</div>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number *</label>
                    <input
                      required value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Resume (PDF/DOCX) *</label>
                    <input
                      ref={fileRef} type="file" required accept=".pdf,.doc,.docx"
                      className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  </div>
                  <button
                    type="submit" disabled={applying || !user}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {applying ? 'Submitting...' : user ? 'Submit Application' : 'Sign in to Apply'}
                  </button>
                </form>
                <p className="text-xs text-gray-400 text-center mt-4">
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
