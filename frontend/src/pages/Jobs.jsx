import { useState, useEffect } from 'react'
import { getJobs, createJob } from '../api/client'
import { Link } from 'react-router-dom'

function CreateJobModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ title: '', company: '', location: '', jd_text: '', employment_type: 'full_time' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const job = await createJob(form)
      onSuccess(job)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Create New Job</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Job Title *</label>
              <input required value={form.title} onChange={e => set('title', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Backend Python Developer" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company *</label>
              <input required value={form.company} onChange={e => set('company', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Acme Corp" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input value={form.location} onChange={e => set('location', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Remote / Bangalore" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
              <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job Description *</label>
            <textarea required value={form.jd_text} onChange={e => set('jd_text', e.target.value)}
              rows={10}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
              placeholder="Paste the full job description here. The AI uses this to score candidates and generate interview questions..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Job'}
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

  useEffect(() => {
    getJobs().then(setJobs).finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 text-sm mt-1">{jobs.length} active position{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          + New Job
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <p className="text-gray-400 text-lg mb-2">No jobs yet</p>
          <p className="text-gray-400 text-sm mb-6">Create your first job posting to start screening candidates</p>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            Create Job
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-indigo-200 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-base">{job.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span>{job.company}</span>
                    {job.location && <><span>·</span><span>{job.location}</span></>}
                    {job.employment_type && <><span>·</span><span className="capitalize">{job.employment_type.replace('_', ' ')}</span></>}
                  </div>
                  <p className="text-sm text-gray-400 mt-2 line-clamp-2">{job.jd_text?.slice(0, 180)}...</p>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <Link to={`/candidates?job_id=${job.id}`}
                    className="text-sm text-indigo-600 hover:underline font-medium">
                    View Candidates
                  </Link>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
                ID: {job.id} · Created {new Date(job.created_at).toLocaleDateString('en-IN')}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateJobModal
          onClose={() => setShowCreate(false)}
          onSuccess={job => { setJobs(j => [job, ...j]); setShowCreate(false) }}
        />
      )}
    </div>
  )
}
