import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCandidates, getSchedule, getHealth } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { Users, Eye, CalendarDays, TrendingUp, CheckCircle2, XCircle, Minus } from 'lucide-react'

const PIPELINE_STAGES = [
  { s: 'pending',        label: 'Pending',    color: 'bg-state-pending',   text: 'text-slate-600' },
  { s: 'analyzed',       label: 'Analyzed',   color: 'bg-state-analyzed',  text: 'text-blue-700' },
  { s: 'pending_review', label: 'In Review',  color: 'bg-state-review',    text: 'text-amber-700' },
  { s: 'scheduled',      label: 'Scheduled',  color: 'bg-state-scheduled', text: 'text-violet-700' },
  { s: 'in_call',        label: 'In Call',    color: 'bg-state-incall',    text: 'text-orange-700' },
  { s: 'completed',      label: 'Completed',  color: 'bg-state-done',      text: 'text-green-700' },
  { s: 'rejected',       label: 'Rejected',   color: 'bg-state-rejected',  text: 'text-red-600' },
  { s: 'failed',         label: 'Failed',     color: 'bg-state-failed',    text: 'text-slate-500' },
]

function StatCard({ label, value, sub, Icon, accentBg, accentIcon }) {
  return (
    <div className="bg-white rounded-card shadow-card border border-slate-100 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accentBg}`}>
        <Icon className={`w-5 h-5 ${accentIcon}`} />
      </div>
      <div>
        <div className="font-display text-3xl font-bold text-ink leading-none">{value}</div>
        <div className="text-sm font-medium text-ink-soft mt-1">{label}</div>
        {sub && <div className="text-xs text-ink-faint mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function HealthPill({ ok, label }) {
  return (
    <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-pill border ${
      ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'
    }`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = () =>
    Promise.all([getCandidates({ limit: 200 }), getSchedule(), getHealth()])
      .then(([cands, sched, h]) => { setCandidates(cands); setSchedule(sched); setHealth(h) })
      .finally(() => setLoading(false))

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    const id = setInterval(() => {
      Promise.all([getCandidates({ limit: 200 }), getSchedule()])
        .then(([cands, sched]) => { setCandidates(cands); setSchedule(sched) })
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const byStatus = s => candidates.filter(c => c.status === s).length
  const total = candidates.length
  const inPipeline = candidates.filter(c =>
    ['pending', 'analyzed', 'pending_review', 'scheduled', 'in_call'].includes(c.status)
  ).length
  const completed = byStatus('completed')
  const screened = candidates.filter(c => ['completed', 'rejected'].includes(c.status)).length
  const avgScore = candidates.filter(c => c.match_score != null).length
    ? Math.round(candidates.filter(c => c.match_score != null).reduce((s, c) => s + c.match_score, 0) / candidates.filter(c => c.match_score != null).length)
    : 0
  const recent = [...candidates].slice(0, 6)
  const totalForBar = total || 1

  if (loading) return (
    <div className="p-8 space-y-4">
      <div className="h-8 w-40 bg-slate-100 animate-pulse rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-card" />)}
      </div>
    </div>
  )

  return (
    <div className="p-8 space-y-7 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Dashboard</h1>
          <p className="text-ink-soft text-sm mt-1">Overview of your hiring pipeline</p>
        </div>
        {health && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-faint uppercase tracking-wide mr-1">System</span>
            <HealthPill ok={health.redis}                label="Redis" />
            <HealthPill ok={health.ollama_analysis_model} label="Analysis LLM" />
            <HealthPill ok={health.ollama_interview_model} label="Interview LLM" />
            <HealthPill ok={health.database}              label="Database" />
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Candidates" value={total}   sub="all time"
          Icon={Users} accentBg="bg-brand-50" accentIcon="text-brand-600" />
        <StatCard label="In Pipeline"      value={inPipeline} sub="active now"
          Icon={TrendingUp} accentBg="bg-amber-50" accentIcon="text-amber-600" />
        <StatCard label="Interviews Today" value={schedule?.total ?? 0} sub="calls booked"
          Icon={CalendarDays} accentBg="bg-violet-50" accentIcon="text-violet-600" />
        <StatCard label="Avg Match Score"  value={avgScore ? `${avgScore}` : '—'} sub={`${completed} interviews done`}
          Icon={Eye} accentBg="bg-green-50" accentIcon="text-green-600" />
      </div>

      {/* Pipeline conveyor */}
      <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-ink">Pipeline Conveyor</h2>
          <Link to="/candidates" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all →</Link>
        </div>

        {/* Labels row */}
        <div className="flex gap-1 mb-2">
          {PIPELINE_STAGES.map(({ s, label, color }) => {
            const count = byStatus(s)
            const pct = Math.max((count / totalForBar) * 100, count > 0 ? 2 : 0)
            if (count === 0) return null
            return (
              <div key={s} className="text-center" style={{ flexBasis: `${pct}%`, minWidth: count > 0 ? '2%' : 0 }}>
                <span className={`text-xs font-semibold ${color.replace('bg-', 'text-').replace('state-', 'state-')}`}>
                  {count}
                </span>
              </div>
            )
          })}
        </div>

        {/* Bar */}
        <div className="flex h-8 rounded-xl overflow-hidden gap-px">
          {PIPELINE_STAGES.map(({ s, label, color }) => {
            const count = byStatus(s)
            const pct = Math.max((count / totalForBar) * 100, count > 0 ? 2 : 0)
            if (count === 0) return null
            return (
              <button
                key={s}
                onClick={() => navigate(`/candidates?status=${s}`)}
                className={`${color} flex-shrink-0 transition-all duration-500 hover:opacity-80 cursor-pointer`}
                style={{ flexBasis: `${pct}%` }}
                title={`${label}: ${count}`}
              />
            )
          })}
          {total === 0 && (
            <div className="flex-1 bg-slate-100 flex items-center justify-center text-xs text-ink-faint">
              No candidates yet
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
          {PIPELINE_STAGES.map(({ s, label, color }) => {
            const count = byStatus(s)
            return (
              <Link key={s} to={`/candidates?status=${s}`}
                className="flex items-center gap-1.5 hover:opacity-80">
                <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${color}`} />
                <span className="text-xs text-ink-soft">{label}</span>
                <span className="text-xs font-semibold text-ink">{count}</span>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's schedule */}
        <div className="bg-white rounded-card shadow-card border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-violet-600" />
              </div>
              <h2 className="font-semibold text-ink">Today's Calls</h2>
              {schedule?.total > 0 && (
                <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-pill font-medium">
                  {schedule.total}
                </span>
              )}
            </div>
            <Link to="/schedule" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {schedule?.calls?.length ? schedule.calls.slice(0, 5).map(c => (
              <div key={c.call_id} className="px-6 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-ink-soft">{c.candidate_name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{c.candidate_name}</p>
                    <p className="text-xs text-ink-faint">{c.scheduled_time} IST</p>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            )) : (
              <div className="px-6 py-10 text-center">
                <Minus className="w-5 h-5 text-ink-faint mx-auto mb-2" />
                <p className="text-sm text-ink-faint">No calls scheduled for today</p>
              </div>
            )}
            {schedule?.calls?.length > 5 && (
              <div className="px-6 py-3 text-center">
                <Link to="/schedule" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  +{schedule.calls.length - 5} more — view all →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent candidates */}
        <div className="bg-white rounded-card shadow-card border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-brand-50 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-brand-600" />
              </div>
              <h2 className="font-semibold text-ink">Recent Candidates</h2>
            </div>
            <Link to="/candidates" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recent.length ? recent.map(c => (
              <Link key={c.id} to={`/candidates/${c.id}`}
                className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-brand-600">{c.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink group-hover:text-brand-600 transition-colors truncate">{c.name}</p>
                    <p className="text-xs text-ink-faint truncate">{c.email}</p>
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
                <p className="text-sm text-ink-faint">No candidates yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
