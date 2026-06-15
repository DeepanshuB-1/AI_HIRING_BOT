import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAnalytics } from '../api/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { BarChart3, Loader2 } from 'lucide-react'

const FUNNEL_ORDER = ['pending', 'analyzed', 'pending_review', 'scheduled', 'in_call', 'completed', 'rejected', 'failed']
const FUNNEL_LABELS = {
  pending: 'Pending', analyzed: 'Analyzed', pending_review: 'In Review',
  scheduled: 'Scheduled', in_call: 'In Call', completed: 'Completed',
  rejected: 'Rejected', failed: 'Failed',
}
const FUNNEL_COLORS = {
  pending: '#94A3B8', analyzed: '#3B82F6', pending_review: '#F59E0B',
  scheduled: '#8B5CF6', in_call: '#F97316', completed: '#10B981',
  rejected: '#EF4444', failed: '#64748B',
}
const SCORE_COLORS = { '0-40': '#EF4444', '41-60': '#F59E0B', '61-80': '#3B82F6', '81-100': '#10B981' }

function StatCard({ label, value, sub, color = 'text-ink' }) {
  return (
    <div className="bg-white rounded-card shadow-card border border-slate-100 p-5">
      <div className={`font-display text-3xl font-bold ${color}`}>{value ?? '—'}</div>
      <div className="text-sm font-medium text-ink-soft mt-1">{label}</div>
      {sub && <div className="text-xs text-ink-faint mt-0.5">{sub}</div>}
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
    <div className="p-8 flex items-center gap-2 text-ink-faint">
      <Loader2 className="w-5 h-5 animate-spin" /> Loading analytics…
    </div>
  )
  if (!data) return <div className="p-8 text-ink-faint">No data available.</div>

  const funnelData = FUNNEL_ORDER.map(s => ({
    name: FUNNEL_LABELS[s], value: data.funnel[s] || 0, fill: FUNNEL_COLORS[s],
  }))

  const scoreData = Object.entries(data.score_distribution).map(([k, v]) => ({
    name: k, value: v, fill: SCORE_COLORS[k],
  }))

  const decisionData = [
    { name: 'Approved',  value: data.funnel.completed || 0, fill: '#10B981' },
    { name: 'Rejected',  value: data.funnel.rejected  || 0, fill: '#EF4444' },
    { name: 'In Review', value: (data.funnel.pending_review || 0) + (data.funnel.scheduled || 0), fill: '#F59E0B' },
  ].filter(d => d.value > 0)

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Analytics</h1>
        <p className="text-ink-soft text-sm mt-0.5">Pipeline overview across all your jobs</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Candidates" value={data.total} sub="all time" />
        <StatCard
          label="Avg Match Score"
          value={data.avg_score != null ? data.avg_score : null}
          sub="across all candidates"
          color={data.avg_score >= 70 ? 'text-green-600' : data.avg_score >= 45 ? 'text-amber-500' : 'text-ink'}
        />
        <StatCard
          label="Pass Rate"
          value={`${data.pass_rate}%`}
          sub={`${data.funnel.completed || 0} completed`}
          color={data.pass_rate >= 50 ? 'text-green-600' : 'text-ink'}
        />
        <StatCard
          label="Active Jobs"
          value={data.jobs.filter(j => j.is_active).length}
          sub={`${data.jobs.length} total`}
        />
      </div>

      {/* Funnel BarChart + Decision PieChart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-card shadow-card border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-4 h-4 text-ink-faint" />
            <h2 className="font-display text-base font-bold text-ink">Pipeline Funnel</h2>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData} layout="vertical" barSize={20}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [v, 'Candidates']}
                contentStyle={{ borderRadius: '10px', border: '1px solid #F1F5F9', fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {decisionData.length > 0 && (
          <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
            <h2 className="font-display text-base font-bold text-ink mb-5">Decisions</h2>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={decisionData} dataKey="value" cx="50%" cy="45%"
                  innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                  {decisionData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [v, n]}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #F1F5F9', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Score distribution */}
      <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
        <h2 className="font-display text-base font-bold text-ink mb-5">Score Distribution</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={scoreData} barSize={40}>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '10px', border: '1px solid #F1F5F9', fontSize: 12 }}
              formatter={(v) => [v, 'Candidates']}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {scoreData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-job table */}
      {data.jobs.length > 0 && (
        <div className="bg-white rounded-card shadow-card border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-display text-base font-bold text-ink">Per-Job Breakdown</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {data.jobs.map(job => (
              <div key={job.job_id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink text-sm">{job.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${job.is_active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-500'}`}>
                      {job.is_active ? 'Active' : 'Closed'}
                    </span>
                  </div>
                  {job.company && <div className="text-xs text-ink-faint mt-0.5">{job.company}</div>}
                </div>
                <div className="flex items-center gap-6 text-sm flex-shrink-0">
                  <div className="text-center">
                    <div className="font-bold text-ink">{job.total}</div>
                    <div className="text-xs text-ink-faint">Applied</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-bold ${job.avg_score >= 70 ? 'text-green-600' : job.avg_score >= 45 ? 'text-amber-500' : 'text-ink'}`}>
                      {job.avg_score ?? '—'}
                    </div>
                    <div className="text-xs text-ink-faint">Avg Score</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-ink">{job.screened}</div>
                    <div className="text-xs text-ink-faint">Screened</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-bold ${job.pass_rate >= 50 ? 'text-green-600' : 'text-ink'}`}>
                      {job.pass_rate != null ? `${job.pass_rate}%` : '—'}
                    </div>
                    <div className="text-xs text-ink-faint">Pass Rate</div>
                  </div>
                  <Link to={`/candidates?job=${job.job_id}`}
                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-card transition-colors">
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
