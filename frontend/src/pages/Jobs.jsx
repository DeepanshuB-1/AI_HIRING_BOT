import { useState, useEffect } from 'react'
import { getJobs, createJob, updateJob, toggleJobActive } from '../api/client'
import { Link } from 'react-router-dom'

const TYPE_LABELS = { full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', internship: 'Internship' }
const TYPE_COLORS = {
  full_time: 'bg-indigo-50 text-indigo-700', part_time: 'bg-blue-50 text-blue-700',
  contract: 'bg-amber-50 text-amber-700', internship: 'bg-green-50 text-green-700',
}

function JobFormModal({ onClose, onSuccess, existing = null }) {
  const isEdit = !!existing
  const [form, setForm] = useState(existing
    ? { title: existing.title, company: existing.company || '', location: existing.location || '', jd_text: existing.jd_text || '', employment_type: existing.employment_type || 'full_time', min_experience: existing.min_experience || 0 }
    : { title: '', company: '', location: '', jd_text: '', employment_type: 'full_time', min_experience: 0 }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const job = isEdit ? await updateJob(existing.id, form) : await createJob(form)
      onSuccess(job)
    } catch (err) {
      setError(err.response?.data?.detail || (isEdit ? 'Failed to update job' : 'Failed to create job'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-900">{isEdit ? 'Edit Job' : 'Create New Job'}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Job Title *</label>
            <input required value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              placeholder="e.g. Senior Backend Engineer" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Company *</label>
              <input required value={form.company} onChange={e => set('company', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder="Acme Corp" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Location</label>
              <input value={form.location} onChange={e => set('location', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder="Mumbai / Remote" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Type</label>
              <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Min. Experience (yrs)</label>
              <input type="number" min="0" max="20" value={form.min_experience} onChange={e => set('min_experience', parseInt(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Job Description *</label>
            <p className="text-xs text-slate-400 mb-2">The AI uses this to score candidates and generate interview questions</p>
            <textarea required value={form.jd_text} onChange={e => set('jd_text', e.target.value)}
              rows={10}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent font-mono resize-none"
              placeholder="Paste the full job description here..." />
          </div>
          <div className="flex gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isEdit ? 'Saving...' : 'Creating...'}
                </>
              ) : (isEdit ? 'Save Changes' : 'Create Job')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Jobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingJob, setEditingJob] = useState(null)

  useEffect(() => {
    getJobs().then(setJobs).finally(() => setLoading(false))
  }, [])

  const handleToggleActive = async (job) => {
    const next = !job.is_active
    setJobs(js => js.map(j => j.id === job.id ? { ...j, is_active: next } : j))
    try {
      await toggleJobActive(job.id, next)
    } catch {
      setJobs(js => js.map(j => j.id === job.id ? { ...j, is_active: job.is_active } : j))
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="text-slate-500 text-sm mt-1">{jobs.length} active position{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Job
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse h-28" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center shadow-sm border border-slate-100">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-slate-700 font-semibold text-lg mb-1">No jobs yet</p>
          <p className="text-slate-400 text-sm mb-6">Create your first job posting to start screening candidates</p>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Job
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <div key={job.id} className={`bg-white rounded-2xl p-6 shadow-sm border transition-all group ${job.is_active ? 'border-slate-100 hover:border-indigo-200 hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-700 transition-colors">{job.title}</h3>
                    {job.employment_type && (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[job.employment_type] || 'bg-slate-100 text-slate-600'}`}>
                        {TYPE_LABELS[job.employment_type] || job.employment_type}
                      </span>
                    )}
                    {job.is_active !== false && (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                    <span className="font-medium text-slate-700">{job.company}</span>
                    {job.location && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          {job.location}
                        </span>
                      </>
                    )}
                    {job.min_experience > 0 && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{job.min_experience}+ yrs exp</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-2 line-clamp-2 leading-relaxed">{job.jd_text?.slice(0, 200)}...</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(job)}
                    title={job.is_active ? 'Close job (stop accepting applications)' : 'Reopen job'}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      job.is_active
                        ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                        : 'border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100'
                    }`}>
                    {job.is_active ? '● Active' : '○ Closed'}
                  </button>
                  <button
                    onClick={() => setEditingJob(job)}
                    className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-700 font-medium bg-slate-50 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <Link to={`/candidates?job=${job.id}`}
                    className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-semibold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Candidates
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-400">
                <span>Created {new Date(job.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="font-mono text-slate-300">{job.id.slice(0, 8)}…</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <JobFormModal
          onClose={() => setShowCreate(false)}
          onSuccess={job => { setJobs(j => [job, ...j]); setShowCreate(false) }}
        />
      )}
      {editingJob && (
        <JobFormModal
          existing={editingJob}
          onClose={() => setEditingJob(null)}
          onSuccess={updated => {
            setJobs(js => js.map(j => j.id === updated.id ? { ...j, ...updated } : j))
            setEditingJob(null)
          }}
        />
      )}
    </div>
  )
}
