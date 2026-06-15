import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCandidates, getCandidate, deleteCandidate, getJobs, bulkReject, exportCandidatesCSV } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import UploadModal from '../components/UploadModal'
import { SkeletonRow } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { Users, Search, Upload, Download, ChevronRight, X } from 'lucide-react'

const STATUSES = ['all', 'pending', 'analyzed', 'pending_review', 'scheduled', 'in_call', 'completed', 'rejected', 'failed']

const STATE_COLORS = {
  pending:        'bg-slate-100 text-slate-600 border-slate-200',
  analyzed:       'bg-blue-100 text-blue-700 border-blue-200',
  pending_review: 'bg-amber-100 text-amber-700 border-amber-200',
  scheduled:      'bg-violet-100 text-violet-700 border-violet-200',
  in_call:        'bg-orange-100 text-orange-700 border-orange-200',
  completed:      'bg-green-100 text-green-700 border-green-200',
  rejected:       'bg-red-100 text-red-600 border-red-200',
  failed:         'bg-slate-50 text-slate-400 border-slate-200',
}

// Pipeline polling banner
const PIPELINE_STEPS = ['Parsing', 'Extracting', 'Scoring', 'Questions', 'Ready']

function getActiveStep(c) {
  if (!c) return 0
  if (c.questions_json?.length > 0) return 4
  if (c.match_score != null) return 3
  if (c.profile_json) return 2
  return 0
}

function PipelineBanner({ candidate, onDismiss }) {
  const step = getActiveStep(candidate)
  const done = step === 4
  const failed = ['rejected', 'failed'].includes(candidate?.status)
  return (
    <div className={`rounded-card p-4 border ${done ? 'bg-green-50 border-green-200' : failed ? 'bg-red-50 border-red-200' : 'bg-brand-50 border-brand-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-ink">
          {failed ? `Pipeline complete — ${candidate.name} scored below threshold`
            : done ? `Pipeline complete — ${candidate.name} is ready for review`
            : `Processing ${candidate.name}…`}
        </p>
        <button onClick={onDismiss} className="text-ink-faint hover:text-ink ml-4">
          <X className="w-4 h-4" />
        </button>
      </div>
      {!failed && (
        <div className="flex items-center">
          {PIPELINE_STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending'
            return (
              <div key={i} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center min-w-0 flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    state === 'done'   ? 'bg-green-500 text-white' :
                    state === 'active' ? 'bg-brand-600 text-white ring-4 ring-brand-100' :
                                        'bg-slate-200 text-slate-400'
                  }`}>
                    {state === 'done' ? '✓' : i + 1}
                  </div>
                  <span className="text-xs text-ink-faint mt-1 text-center hidden sm:block whitespace-nowrap">{label}</span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 transition-all ${i < step ? 'bg-green-400' : 'bg-slate-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function relativeDate(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30) return `${diff}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

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
  const [search, setSearch] = useState('')

  // Pipeline polling state
  const [pollingId, setPollingId] = useState(null)
  const [pollingCandidate, setPollingCandidate] = useState(null)

  useEffect(() => {
    if (!pollingId) return
    const intervalId = setInterval(async () => {
      try {
        const fresh = await getCandidate(pollingId)
        setPollingCandidate(fresh)
        setCandidates(cs => cs.map(c => c.id === fresh.id
          ? { ...c, status: fresh.status, match_score: fresh.match_score, questions_json: fresh.questions_json, profile_json: fresh.profile_json }
          : c
        ))
        const done = fresh.questions_json?.length > 0 || ['rejected', 'failed'].includes(fresh.status)
        if (done) {
          clearInterval(intervalId)
          setTimeout(() => { setPollingId(null); setPollingCandidate(null) }, 5000)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(intervalId)
  }, [pollingId])

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
    if (selected.size === displayCandidates.length) setSelected(new Set())
    else setSelected(new Set(displayCandidates.map(c => c.id)))
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
      alert(`${res.rejected} rejected.`)
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

  // Client-side search filter
  const displayCandidates = search
    ? candidates.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
      )
    : candidates

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Candidates</h1>
          <p className="text-ink-soft text-sm mt-0.5">{candidates.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          {activeJob !== 'all' && (
            <button onClick={handleExport} disabled={exporting}
              className="inline-flex items-center gap-1.5 border border-slate-200 text-ink-soft px-3 py-2 rounded-card text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors">
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting…' : 'CSV'}
            </button>
          )}
          <button onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-card text-sm font-semibold hover:bg-brand-700 transition-colors">
            <Upload className="w-4 h-4" />
            Upload Resume
          </button>
        </div>
      </div>

      {/* Pipeline banner */}
      {pollingCandidate && (
        <PipelineBanner
          candidate={pollingCandidate}
          onDismiss={() => { setPollingId(null); setPollingCandidate(null) }}
        />
      )}

      {/* Sticky toolbar */}
      <div className="bg-white rounded-card shadow-card border border-slate-100 p-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-ink placeholder-ink-faint"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Status pills */}
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map(s => {
            const color = s !== 'all' ? STATE_COLORS[s] : ''
            return (
              <button key={s} onClick={() => setStatus(s)}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-colors border ${
                  activeStatus === s
                    ? s === 'all'
                      ? 'bg-brand-600 text-white border-brand-600'
                      : `${color} font-bold`
                    : `text-ink-soft border-transparent hover:border-slate-200 hover:bg-slate-50`
                }`}>
                {s === 'all' ? 'All' : s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
              </button>
            )
          })}
        </div>

        {/* Job filter */}
        {jobs.length > 0 && (
          <select value={activeJob} onChange={e => setJob(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white min-w-[160px]">
            <option value="all">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-card px-4 py-3">
          <span className="text-sm font-semibold text-brand-700">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => setSelected(new Set())}
            className="text-sm text-ink-soft hover:text-ink font-medium px-3 py-1.5 rounded-xl hover:bg-white transition-colors">
            Clear
          </button>
          {activeJob !== 'all' && (
            <button onClick={handleExport} disabled={exporting}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 bg-white border border-brand-200 px-3 py-1.5 rounded-xl hover:bg-brand-50 transition-colors">
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
          <button onClick={handleBulkReject} disabled={bulkLoading}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-4 py-1.5 rounded-xl transition-colors shadow-sm">
            <X className="w-3.5 h-3.5" />
            {bulkLoading ? 'Rejecting…' : `Reject ${selected.size}`}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-card shadow-card border border-slate-100 overflow-hidden">
        {loading ? (
          <table className="w-full">
            <tbody className="divide-y divide-slate-50">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        ) : displayCandidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No candidates match your search' : 'No candidates found'}
            hint={search ? 'Try a different name or email' : 'Upload a resume to start the pipeline'}
            action={!search ? 'Upload Resume' : undefined}
            onAction={!search ? () => setShowUpload(true) : undefined}
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3">
                  <input type="checkbox"
                    checked={selected.size === displayCandidates.length && displayCandidates.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-brand-600 cursor-pointer" />
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Candidate</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Job Applied</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Score</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Applied</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayCandidates.map(c => (
                <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${selected.has(c.id) ? 'bg-brand-50/50' : ''}`}>
                  <td className="px-4 py-4">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                      className="w-4 h-4 accent-brand-600 cursor-pointer" />
                  </td>
                  <td className="px-5 py-4">
                    <Link to={`/candidates/${c.id}`} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-brand-600">{c.name?.[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink group-hover:text-brand-600 transition-colors">{c.name}</p>
                        <p className="text-xs text-ink-faint mt-0.5">{c.email}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    {c.job_title
                      ? <span className="text-xs bg-brand-50 text-brand-700 px-2.5 py-1 rounded-pill font-medium border border-brand-100">{c.job_title}</span>
                      : <span className="text-xs text-ink-faint">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    {c.match_score != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${c.match_score >= 70 ? 'bg-green-500' : c.match_score >= 45 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${c.match_score}%` }} />
                        </div>
                        <span className={`text-sm font-bold ${c.match_score >= 70 ? 'text-green-600' : c.match_score >= 45 ? 'text-amber-600' : 'text-red-500'}`}>
                          {c.match_score}
                        </span>
                      </div>
                    ) : <span className="text-xs text-ink-faint">—</span>}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-4 text-xs text-ink-faint">{relativeDate(c.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/candidates/${c.id}`}
                        className="text-xs text-brand-600 hover:underline font-medium flex items-center gap-0.5">
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                      <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors">
                        {deleting === c.id ? '…' : 'Del'}
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
            setPollingCandidate(c)
            setPollingId(c.id)
          }}
        />
      )}
    </div>
  )
}
