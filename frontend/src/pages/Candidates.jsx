import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCandidates, deleteCandidate, getJobs, bulkReject, exportCandidatesCSV } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import UploadModal from '../components/UploadModal'

const STATUSES = ['all', 'pending', 'analyzed', 'pending_review', 'scheduled', 'in_call', 'completed', 'rejected', 'failed']

export default function Candidates() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeStatus = searchParams.get('status') || 'all'
  const activeJob = searchParams.get('job') || 'all'

  const [candidates, setCandidates] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = (status, jobId) => {
    setLoading(true)
    setSelected(new Set())
    const params = { limit: 100 }
    if (status && status !== 'all') params.status = status
    if (jobId && jobId !== 'all') params.jd_id = jobId
    getCandidates(params).then(setCandidates).finally(() => setLoading(false))
  }

  useEffect(() => { getJobs().then(setJobs).catch(() => {}) }, [])
  useEffect(() => { load(activeStatus, activeJob) }, [activeStatus, activeJob])

  const setStatus = (s) => {
    const next = new URLSearchParams(searchParams)
    if (s === 'all') next.delete('status'); else next.set('status', s)
    setSearchParams(next)
  }

  const setJob = (j) => {
    const next = new URLSearchParams(searchParams)
    if (j === 'all') next.delete('job'); else next.set('job', j)
    setSearchParams(next)
  }

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set())
    else setSelected(new Set(candidates.map(c => c.id)))
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this candidate and their resume? This cannot be undone.')) return
    setDeleting(id)
    try {
      await deleteCandidate(id)
      setCandidates(cs => cs.filter(c => c.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch { alert('Delete failed') }
    finally { setDeleting(null) }
  }

  const handleBulkReject = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`Reject ${ids.length} candidate${ids.length !== 1 ? 's' : ''} and send rejection emails?`)) return
    setBulkLoading(true)
    try {
      const res = await bulkReject(ids)
      setCandidates(cs => cs.map(c => selected.has(c.id) ? { ...c, status: 'rejected' } : c))
      setSelected(new Set())
      alert(`${res.rejected} candidate${res.rejected !== 1 ? 's' : ''} rejected and notified by email.`)
    } catch (err) {
      alert(err.response?.data?.detail || 'Bulk reject failed')
    } finally { setBulkLoading(false) }
  }

  const handleExport = async () => {
    if (activeJob === 'all') return
    setExporting(true)
    try { await exportCandidatesCSV(activeJob) }
    catch { alert('Export failed') }
    finally { setExporting(false) }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-gray-500 text-sm mt-1">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {activeJob !== 'all' && (
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {exporting ? 'Exporting...' : '↓ Export CSV'}
            </button>
          )}
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            + Upload Resume
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-x-auto scrollbar-hide flex-1">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeStatus === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}>
              {s === 'all' ? 'All Statuses' : s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        {jobs.length > 0 && (
          <select value={activeJob} onChange={e => setJob(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[200px]">
            <option value="all">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <span className="text-sm font-semibold text-indigo-700">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => setSelected(new Set())}
            className="text-sm text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 rounded-lg hover:bg-white transition-colors">
            Clear
          </button>
          <button onClick={handleBulkReject} disabled={bulkLoading}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors shadow-sm">
            {bulkLoading ? 'Rejecting...' : `✕ Reject ${selected.size}`}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <p className="p-8 text-gray-400 text-center">Loading...</p>
        ) : candidates.length === 0 ? (
          <p className="p-8 text-gray-400 text-center">No candidates found</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selected.size === candidates.length && candidates.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Job Applied</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Applied</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {candidates.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50 ${selected.has(c.id) ? 'bg-indigo-50/50' : ''}`}>
                  <td className="px-4 py-4">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                  </td>
                  <td className="px-5 py-4">
                    <Link to={`/candidates/${c.id}`} className="block group">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-indigo-600">{c.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.email}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    {c.job_title
                      ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-medium">{c.job_title}</span>
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    {c.match_score != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${c.match_score >= 70 ? 'bg-green-500' : c.match_score >= 45 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${c.match_score}%` }} />
                        </div>
                        <span className={`text-sm font-semibold ${c.match_score >= 70 ? 'text-green-600' : c.match_score >= 45 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {c.match_score}
                        </span>
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/candidates/${c.id}`} className="text-xs text-indigo-600 hover:underline font-medium">View</Link>
                      <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                        {deleting === c.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={c => {
            setCandidates(cs => [c, ...cs])
            setShowUpload(false)
            alert(`Resume uploaded for ${c.name}. Pipeline is running in background.`)
          }}
        />
      )}
    </div>
  )
}
