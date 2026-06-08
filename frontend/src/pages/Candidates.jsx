import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCandidates, deleteCandidate } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import UploadModal from '../components/UploadModal'

const STATUSES = ['all', 'pending', 'analyzed', 'pending_review', 'scheduled', 'in_call', 'completed', 'rejected']

export default function Candidates() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeStatus = searchParams.get('status') || 'all'

  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = (status) => {
    setLoading(true)
    const params = { limit: 100 }
    if (status && status !== 'all') params.status = status
    getCandidates(params).then(setCandidates).finally(() => setLoading(false))
  }

  useEffect(() => { load(activeStatus) }, [activeStatus])

  const setStatus = (s) => {
    if (s === 'all') searchParams.delete('status')
    else setSearchParams({ status: s })
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this candidate and their resume? This cannot be undone.')) return
    setDeleting(id)
    try {
      await deleteCandidate(id)
      setCandidates(cs => cs.filter(c => c.id !== id))
    } catch { alert('Delete failed') }
    finally { setDeleting(null) }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-gray-500 text-sm mt-1">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          + Upload Resume
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-x-auto scrollbar-hide">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeStatus === s
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}>
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <p className="p-8 text-gray-400 text-center">Loading...</p>
        ) : candidates.length === 0 ? (
          <p className="p-8 text-gray-400 text-center">No candidates in this status</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Applied</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {candidates.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <Link to={`/candidates/${c.id}`} className="block group">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-indigo-600">{c.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.email}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    {c.match_score != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${c.match_score >= 70 ? 'bg-green-500' : c.match_score >= 45 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${c.match_score}%` }}
                          />
                        </div>
                        <span className={`text-sm font-semibold ${c.match_score >= 70 ? 'text-green-600' : c.match_score >= 45 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {c.match_score}
                        </span>
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/candidates/${c.id}`}
                        className="text-xs text-indigo-600 hover:underline font-medium">View</Link>
                      <button onClick={() => handleDelete(c.id)}
                        disabled={deleting === c.id}
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
