import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getCandidates, getSchedule, getHealth } from '../api/client'
import StatusBadge from '../components/StatusBadge'

const PIPELINE = [
  { s: 'pending',        label: 'Pending',      color: 'bg-slate-100 text-slate-600',    bar: 'bg-slate-400' },
  { s: 'analyzed',       label: 'Analyzed',     color: 'bg-blue-100 text-blue-700',      bar: 'bg-blue-500' },
  { s: 'pending_review', label: 'In Review',    color: 'bg-amber-100 text-amber-700',    bar: 'bg-amber-500' },
  { s: 'scheduled',      label: 'Scheduled',    color: 'bg-violet-100 text-violet-700',  bar: 'bg-violet-500' },
  { s: 'completed',      label: 'Completed',    color: 'bg-green-100 text-green-700',    bar: 'bg-green-500' },
  { s: 'rejected',       label: 'Rejected',     color: 'bg-red-100 text-red-600',        bar: 'bg-red-400' },
]

function StatCard({ label, value, sub, icon, accent }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900 leading-none">{value}</div>
        <div className="text-sm font-medium text-slate-600 mt-1">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function HealthDot({ ok, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className={`text-xs font-medium ${ok ? 'text-green-700' : 'text-red-600'}`}>{label}</span>
    </div>
  )
}

export default function Dashboard() {
  const [candidates, setCandidates] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = () =>
    Promise.all([getCandidates({ limit: 200 }), getSchedule(), getHealth()])
      .then(([cands, sched, h]) => { setCandidates(cands); setSchedule(sched); setHealth(h) })
      .finally(() => setLoading(false))

  useEffect(() => { fetchAll() }, [])

  // Refresh schedule + candidates every 30s so status changes appear without manual reload
  useEffect(() => {
    const id = setInterval(() => {
      Promise.all([getCandidates({ limit: 200 }), getSchedule()])
        .then(([cands, sched]) => { setCandidates(cands); setSchedule(sched) })
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const byStatus = s => candidates.filter(c => c.status === s).length
  const total = candidates.length
  const completed = byStatus('completed')
  const screened = candidates.filter(c => ['completed', 'rejected'].includes(c.status)).length
  const passRate = screened > 0 ? Math.round((completed / screened) * 100) : 0
  const recent = [...candidates].slice(0, 6)

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-400">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading dashboard...
    </div>
  )

  return (
    <div className="p-8 space-y-7 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Overview of your hiring pipeline</p>
        </div>
        {health && (
          <div className="flex items-center gap-4 bg-white rounded-xl px-4 py-2.5 shadow-sm border border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">System</span>
            <div className="w-px h-4 bg-slate-100" />
            <HealthDot ok={health.redis} label="Redis" />
            <HealthDot ok={health.ollama_analysis_model} label="llama3.1:8b" />
            <HealthDot ok={health.ollama_embed_model} label="nomic-embed" />
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Candidates" value={total} sub="all time"
          accent="bg-indigo-50"
          icon={<svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Pending Review" value={byStatus('pending_review')} sub="needs your attention"
          accent="bg-amber-50"
          icon={<svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
        />
        <StatCard
          label="Scheduled Today" value={schedule?.total ?? 0} sub="calls booked"
          accent="bg-violet-50"
          icon={<svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
        />
        <StatCard
          label="Pass Rate" value={`${passRate}%`} sub={`${completed} interviews done`}
          accent="bg-green-50"
          icon={<svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* Pipeline funnel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-800">Pipeline Breakdown</h2>
          <Link to="/candidates" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View all →</Link>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {PIPELINE.map(({ s, label, color, bar }) => {
            const count = byStatus(s)
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <Link key={s} to={`/candidates?status=${s}`}
                className="group text-center hover:scale-105 transition-transform">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 group-hover:border-indigo-200 group-hover:shadow-sm transition-all">
                  <div className="text-2xl font-bold text-slate-900 mb-1">{count}</div>
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block ${color}`}>{label}</div>
                  {total > 0 && (
                    <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="text-xs text-slate-400 mt-1">{pct}%</div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's schedule */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="font-semibold text-slate-800">Today's Calls</h2>
              {schedule?.total > 0 && (
                <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">{schedule.total}</span>
              )}
            </div>
            <Link to="/schedule" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {schedule?.calls?.length ? schedule.calls.map(c => (
              <div key={c.call_id} className="px-6 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-slate-500">{c.candidate_name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.candidate_name}</p>
                    <p className="text-xs text-slate-400">{c.scheduled_time} IST</p>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            )) : (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-slate-400">No calls scheduled for today</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent candidates */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="font-semibold text-slate-800">Recent Candidates</h2>
            </div>
            <Link to="/candidates" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recent.length ? recent.map(c => (
              <Link key={c.id} to={`/candidates/${c.id}`}
                className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-600">{c.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{c.name}</p>
                    <p className="text-xs text-slate-400 truncate">{c.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  {c.match_score != null && (
                    <span className={`text-sm font-bold ${c.match_score >= 70 ? 'text-green-600' : c.match_score >= 45 ? 'text-amber-500' : 'text-red-500'}`}>
                      {c.match_score}
                    </span>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </Link>
            )) : (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-slate-400">No candidates yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
