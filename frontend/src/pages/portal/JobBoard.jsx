import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  portalGetJobs, portalMyApplications,
  portalGetSavedJobs, portalSaveJob, portalUnsaveJob,
  portalRecentlyViewed,
} from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'
import { Search, Briefcase, CheckCircle2, SlidersHorizontal, X, Bookmark, Clock } from 'lucide-react'
import EmptyState from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'

const TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time',
  contract: 'Contract', internship: 'Internship',
}
const TYPE_COLORS = {
  full_time:  'bg-port-50 text-port-700 border-port-200',
  part_time:  'bg-blue-50 text-blue-700 border-blue-200',
  contract:   'bg-amber-50 text-amber-700 border-amber-200',
  internship: 'bg-violet-50 text-violet-700 border-violet-200',
}

function relativeDate(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30) return `${diff}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function CompanyAvatar({ name }) {
  const initials = (name || 'Co').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['bg-port-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-brand-500']
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length]
  return (
    <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}

function JobCard({ job, isApplied, isSaved, onToggleSave }) {
  const typeColor = TYPE_COLORS[job.employment_type] || 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <div className={`bg-white rounded-card shadow-card border transition-all group relative ${
      isApplied ? 'border-slate-100 opacity-70' : 'border-slate-100 hover:shadow-pop hover:border-port-200'
    }`}>
      <div className="p-5 flex items-start gap-4">
        <CompanyAvatar name={job.company} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h4 className={`text-base font-semibold transition-colors ${
                isApplied ? 'text-ink-soft' : 'text-ink group-hover:text-port-600'
              }`}>{job.title}</h4>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft mt-0.5">
                {job.company && <span className="font-medium text-ink">{job.company}</span>}
                {job.location && <><span className="text-ink-faint">·</span><span>{job.location}</span></>}
                {job.min_experience > 0 && <><span className="text-ink-faint">·</span><span>{job.min_experience}+ yrs</span></>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isApplied ? (
                <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 font-semibold px-2.5 py-1 rounded-pill">
                  <CheckCircle2 className="w-3 h-3" /> Applied
                </span>
              ) : (
                <>
                  {job.salary_min && (
                    <span className="text-xs text-ink-soft font-medium">
                      ₹{job.salary_min}–{job.salary_max || '?'} LPA
                    </span>
                  )}
                  {job.employment_type && (
                    <span className={`text-xs px-2.5 py-1 rounded-pill border font-medium ${typeColor}`}>
                      {TYPE_LABELS[job.employment_type] || job.employment_type}
                    </span>
                  )}
                </>
              )}
              <button
                onClick={e => { e.preventDefault(); onToggleSave(job.id) }}
                className={`p-1.5 rounded-lg transition-colors ${isSaved ? 'text-port-600 bg-port-50' : 'text-ink-faint hover:text-port-600 hover:bg-port-50'}`}
                title={isSaved ? 'Unsave' : 'Save job'}>
                <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between mt-2.5 gap-2">
            {job.required_skills?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {job.required_skills.slice(0, 4).map(s => (
                  <span key={s} className="text-xs bg-slate-50 text-ink-soft border border-slate-100 px-2 py-0.5 rounded-md">{s}</span>
                ))}
                {job.required_skills.length > 4 && (
                  <span className="text-xs text-ink-faint">+{job.required_skills.length - 4}</span>
                )}
              </div>
            )}
            <span className="text-xs text-ink-faint ml-auto">{relativeDate(job.created_at)}</span>
          </div>
        </div>
      </div>
      {!isApplied && (
        <Link to={`/portal/jobs/${job.id}`} className="absolute inset-0 rounded-card" aria-label={job.title} />
      )}
    </div>
  )
}

const EXP_OPTIONS = [
  { label: 'Any', value: 'all' },
  { label: '0–1 yr', value: '0-1' },
  { label: '1–3 yrs', value: '1-3' },
  { label: '3–5 yrs', value: '3-5' },
  { label: '5+ yrs', value: '5-99' },
]
const TYPE_OPTIONS = [
  { label: 'All Types', value: 'all' },
  ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ value: k, label: v })),
]

function matchesExp(job, band) {
  if (band === 'all') return true
  const [lo, hi] = band.split('-').map(Number)
  const exp = job.min_experience || 0
  return exp >= lo && exp <= hi
}

export default function JobBoard() {
  const { user } = useCandidateAuth()
  const [jobs, setJobs] = useState([])
  const [appliedJobIds, setAppliedJobIds] = useState(new Set())
  const [savedIds, setSavedIds] = useState(new Set())
  const [recentJobs, setRecentJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [expFilter, setExpFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)

  useEffect(() => {
    portalGetJobs().then(setJobs).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    portalMyApplications()
      .then(apps => setAppliedJobIds(new Set(apps.map(a => a.jd_id).filter(Boolean))))
      .catch(() => {})
    portalGetSavedJobs()
      .then(data => setSavedIds(new Set(data.saved_job_ids)))
      .catch(() => {})
    portalRecentlyViewed()
      .then(setRecentJobs)
      .catch(() => {})
  }, [user])

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      j.title.toLowerCase().includes(q) ||
      (j.company || '').toLowerCase().includes(q) ||
      (j.location || '').toLowerCase().includes(q) ||
      (j.required_skills || []).some(s => s.toLowerCase().includes(q))
    const matchType = typeFilter === 'all' || j.employment_type === typeFilter
    const matchExp  = matchesExp(j, expFilter)
    return matchSearch && matchType && matchExp
  })

  const toggleSave = async (jobId) => {
    if (!user) return
    const wasSaved = savedIds.has(jobId)
    setSavedIds(prev => {
      const next = new Set(prev)
      wasSaved ? next.delete(jobId) : next.add(jobId)
      return next
    })
    try {
      await (wasSaved ? portalUnsaveJob(jobId) : portalSaveJob(jobId))
    } catch {
      // revert on error
      setSavedIds(prev => {
        const next = new Set(prev)
        wasSaved ? next.add(jobId) : next.delete(jobId)
        return next
      })
    }
  }

  const EXAMPLE_CHIPS = ['React dev, 3+ yrs', 'Python backend', 'Product manager', 'Fintech background']

  return (
    <div className="space-y-8">
      {/* Hero strip */}
      <div className="bg-canvas-portal rounded-2xl py-10 px-6 text-center -mx-6 -mt-8 border-b border-slate-100">
        <h1 className="font-display text-4xl font-bold text-ink mb-2">Find your next role</h1>
        <p className="text-ink-soft text-base mb-6 max-w-xl mx-auto">
          Apply in minutes. Interview with our AI on a phone call — no awkward scheduling.
        </p>
        <div className="max-w-xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, skill, company, or location…"
            className="w-full pl-11 pr-4 py-3 rounded-xl text-ink text-sm bg-white shadow-pop border border-slate-200 focus:outline-none focus:ring-2 focus:ring-port-400 transition-shadow"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {!search && (
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {EXAMPLE_CHIPS.map(chip => (
              <button key={chip} onClick={() => setSearch(chip)}
                className="text-xs bg-white text-ink-soft border border-slate-200 px-3 py-1.5 rounded-pill hover:border-port-300 hover:text-port-700 transition-colors">
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter + results header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">
          {loading ? 'Loading positions…' : `${filtered.length} open role${filtered.length !== 1 ? 's' : ''}`}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Desktop type pills */}
          <div className="hidden sm:flex gap-1">
            {TYPE_OPTIONS.map(({ label, value }) => (
              <button key={value} onClick={() => setTypeFilter(value)}
                className={`text-xs px-3 py-1.5 rounded-pill font-medium transition-colors border ${
                  typeFilter === value
                    ? 'bg-port-600 text-white border-port-600'
                    : 'bg-white text-ink-soft border-slate-200 hover:border-port-300 hover:text-port-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {/* Experience filter */}
          <select value={expFilter} onChange={e => setExpFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-pill px-3 py-1.5 bg-white text-ink-soft focus:outline-none focus:ring-2 focus:ring-port-400">
            {EXP_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {/* Mobile: show filter toggle */}
          <button onClick={() => setFilterOpen(v => !v)}
            className="sm:hidden text-xs flex items-center gap-1.5 border border-slate-200 rounded-pill px-3 py-1.5 bg-white text-ink-soft">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
          </button>
        </div>
      </div>

      {/* Mobile type filter sheet */}
      {filterOpen && (
        <div className="sm:hidden flex flex-wrap gap-1.5 pb-1">
          {TYPE_OPTIONS.map(({ label, value }) => (
            <button key={value} onClick={() => { setTypeFilter(value); setFilterOpen(false) }}
              className={`text-xs px-3 py-1.5 rounded-pill border font-medium ${
                typeFilter === value ? 'bg-port-600 text-white border-port-600' : 'bg-white text-ink-soft border-slate-200'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Recently viewed rail (J7) */}
      {recentJobs.length > 0 && !search && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-ink-faint" />
            <h3 className="text-sm font-semibold text-ink-soft">Recently viewed</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {recentJobs.map(job => (
              <Link key={job.id} to={`/portal/jobs/${job.id}`}
                className="flex-shrink-0 w-52 bg-white border border-slate-100 rounded-card shadow-card hover:shadow-pop hover:border-port-200 transition-all p-3">
                <p className="text-xs font-semibold text-ink line-clamp-2 leading-snug">{job.title}</p>
                {job.company && <p className="text-xs text-ink-faint mt-1 truncate">{job.company}</p>}
                {job.location && <p className="text-xs text-ink-faint truncate">{job.location}</p>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full rounded-card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No positions found"
          hint="Try adjusting your search or filters"
          tone="port"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(job => (
            <JobCard
              key={job.id}
              job={job}
              isApplied={appliedJobIds.has(job.id)}
              isSaved={savedIds.has(job.id)}
              onToggleSave={toggleSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
