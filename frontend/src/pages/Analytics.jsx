import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAnalytics } from '../api/client'

const FUNNEL_ORDER = ['pending', 'analyzed', 'pending_review', 'scheduled', 'in_call', 'completed', 'rejected', 'failed']
const FUNNEL_LABELS = {
  pending: 'Pending', analyzed: 'Analyzed', pending_review: 'In Review',
  scheduled: 'Scheduled', in_call: 'In Call', completed: 'Completed',
  rejected: 'Rejected', failed: 'Failed',
}
const FUNNEL_COLORS = {
  pending: 'bg-slate-400', analyzed: 'bg-blue-500', pending_review: 'bg-amber-500',
  scheduled: 'bg-violet-500', in_call: 'bg-orange-500', completed: 'bg-green-500',
  rejected: 'bg-red-400', failed: 'bg-slate-300',
}
const FUNNEL_TEXT = {
  pending: 'text-slate-600', analyzed: 'text-blue-700', pending_review: 'text-amber-700',
  scheduled: 'text-violet-700', in_call: 'text-orange-700', completed: 'text-green-700',
  rejected: 'text-red-600', failed: 'text-slate-500',
}
const FUNNEL_BG = {
  pending: 'bg-slate-50', analyzed: 'bg-blue-50', pending_review: 'bg-amber-50',
  scheduled: 'bg-violet-50', in_call: 'bg-orange-50', completed: 'bg-green-50',
  rejected: 'bg-red-50', failed: 'bg-slate-50',
}

const SCORE_COLORS = {
  '0-40': 'bg-red-400', '41-60': 'bg-amber-400', '61-80': 'bg-blue-400', '81-100': 'bg-green-500',
}

function StatCard({ label, value, sub, color = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className={`text-3xl font-bold ${color}`}>{value ?? '—'}</div>
      <div className="text-sm font-medium text-slate-600 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAnalytics().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-400">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading analytics...
    </div>
  )

  if (!data) return <div className="p-8 text-slate-400">No data available.</div>

  const maxFunnel = Math.max(...FUNNEL_ORDER.map(s => data.funnel[s] || 0), 1)

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Pipeline overview across all your jobs</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Candidates" value={data.total} sub="all time" />
        <StatCard
          label="Avg Match Score"
          value={data.avg_score != null ? `${data.avg_score}` : null}
          sub="across all candidates"
          color={data.avg_score >= 70 ? 'text-green-600' : data.avg_score >= 45 ? 'text-amber-500' : 'text-slate-900'}
        />
        <StatCard
          label="Pass Rate"
          value={`${data.pass_rate}%`}
          sub={`${data.funnel.completed || 0} interviews completed`}
          color={data.pass_rate >= 50 ? 'text-green-600' : 'text-slate-900'}
        />
        <StatCard
          label="Active Jobs"
          value={data.jobs.filter(j => j.is_active).length}
          sub={`${data.jobs.length} total jobs`}
        />
      </div>

      {/* Pipeline funnel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-800 mb-5">Pipeline Funnel</h2>
        <div className="space-y-3">
          {FUNNEL_ORDER.map(s => {
            const count = data.funnel[s] || 0
            const pct = data.total > 0 ? Math.round(count / data.total * 100) : 0
            const barPct = Math.round(count / maxFunnel * 100)
            return (
              <Link key={s} to={`/candidates?status=${s}`} className="flex items-center gap-4 group">
                <div className="w-24 text-right">
                  <span className={`text-xs font-semibold ${FUNNEL_TEXT[s]}`}>{FUNNEL_LABELS[s]}</span>
                </div>
                <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className={`h-full ${FUNNEL_COLORS[s]} rounded-lg transition-all group-hover:opacity-80`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <div className="w-20 flex items-center gap-2">
                  <span className={`text-sm font-bold ${FUNNEL_TEXT[s]}`}>{count}</span>
                  <span className="text-xs text-slate-400">({pct}%)</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Score distribution */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-800 mb-5">Score Distribution</h2>
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(data.score_distribution).map(([bucket, count]) => {
            const maxBucket = Math.max(...Object.values(data.score_distribution), 1)
            const pct = Math.round(count / maxBucket * 100)
            const label = bucket === '0-40' ? 'Reject' : bucket === '41-60' ? 'Review' : bucket === '61-80' ? 'Proceed' : 'Strong'
            return (
              <div key={bucket} className="text-center">
                <div className="h-32 flex items-end justify-center mb-2">
                  <div
                    className={`w-12 rounded-t-lg ${SCORE_COLORS[bucket]} transition-all`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                </div>
                <div className="text-lg font-bold text-slate-900">{count}</div>
                <div className="text-xs font-semibold text-slate-600">{bucket}</div>
                <div className="text-xs text-slate-400">{label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-job stats */}
      {data.jobs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Per-Job Breakdown</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {data.jobs.map(job => (
              <div key={job.job_id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">{job.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${job.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {job.is_active ? 'Active' : 'Closed'}
                    </span>
                  </div>
                  {job.company && <div className="text-xs text-slate-400 mt-0.5">{job.company}</div>}
                </div>
                <div className="flex items-center gap-6 text-sm flex-shrink-0">
                  <div className="text-center">
                    <div className="font-bold text-slate-900">{job.total}</div>
                    <div className="text-xs text-slate-400">Applied</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-bold ${job.avg_score >= 70 ? 'text-green-600' : job.avg_score >= 45 ? 'text-amber-500' : 'text-slate-700'}`}>
                      {job.avg_score ?? '—'}
                    </div>
                    <div className="text-xs text-slate-400">Avg Score</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-slate-900">{job.screened}</div>
                    <div className="text-xs text-slate-400">Screened</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-bold ${job.pass_rate >= 50 ? 'text-green-600' : 'text-slate-700'}`}>
                      {job.pass_rate != null ? `${job.pass_rate}%` : '—'}
                    </div>
                    <div className="text-xs text-slate-400">Pass Rate</div>
                  </div>
                  <Link to={`/candidates?job=${job.job_id}`}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
