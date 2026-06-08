import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getCandidates, getSchedule, getHealth } from '../api/client'
import StatusBadge from '../components/StatusBadge'

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [candidates, setCandidates] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getCandidates({ limit: 200 }),
      getSchedule(),
      getHealth(),
    ]).then(([cands, sched, h]) => {
      setCandidates(cands)
      setSchedule(sched)
      setHealth(h)
    }).finally(() => setLoading(false))
  }, [])

  const byStatus = (s) => candidates.filter(c => c.status === s).length
  const completed = byStatus('completed')
  const total = candidates.length
  const passRate = total > 0
    ? Math.round((candidates.filter(c => ['scheduled','in_call','completed'].includes(c.status)).length / total) * 100)
    : 0

  const recent = [...candidates].slice(0, 6)

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of your hiring pipeline</p>
      </div>

      {/* System health */}
      {health && (
        <div className="flex items-center gap-6 bg-white rounded-xl px-5 py-3 shadow-sm border border-gray-100 text-sm">
          <span className="font-medium text-gray-600">System</span>
          <span className={`flex items-center gap-1.5 ${health.redis ? 'text-green-600' : 'text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${health.redis ? 'bg-green-500' : 'bg-red-500'}`}/>
            Redis
          </span>
          <span className={`flex items-center gap-1.5 ${health.ollama_analysis_model ? 'text-green-600' : 'text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${health.ollama_analysis_model ? 'bg-green-500' : 'bg-red-500'}`}/>
            llama3.1:8b
          </span>
          <span className={`flex items-center gap-1.5 ${health.ollama_embed_model ? 'text-green-600' : 'text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${health.ollama_embed_model ? 'bg-green-500' : 'bg-red-500'}`}/>
            nomic-embed
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Candidates" value={total} sub="all time" color="text-gray-800" />
        <StatCard label="Pending Review" value={byStatus('pending_review')} sub="needs attention" color="text-yellow-600" />
        <StatCard label="Scheduled Today" value={schedule?.total ?? 0} sub="calls booked" color="text-purple-600" />
        <StatCard label="Pass Rate" value={`${passRate}%`} sub={`${completed} completed`} color="text-green-600" />
      </div>

      {/* Pipeline breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { s: 'pending',   label: 'Pending'   },
          { s: 'analyzed',  label: 'Analyzed'  },
          { s: 'scheduled', label: 'Scheduled' },
          { s: 'completed', label: 'Completed' },
          { s: 'rejected',  label: 'Rejected'  },
        ].map(({ s, label }) => (
          <Link key={s} to={`/candidates?status=${s}`}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center hover:border-indigo-300 transition-colors">
            <div className="text-2xl font-bold text-gray-800">{byStatus(s)}</div>
            <StatusBadge status={s} />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Today's Calls</h2>
            <Link to="/schedule" className="text-xs text-indigo-600 hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {schedule?.calls?.length ? schedule.calls.map(c => (
              <div key={c.call_id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.candidate_name}</p>
                  <p className="text-xs text-gray-400">{c.scheduled_time} IST</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
            )) : (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No calls scheduled today</p>
            )}
          </div>
        </div>

        {/* Recent candidates */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Recent Candidates</h2>
            <Link to="/candidates" className="text-xs text-indigo-600 hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recent.map(c => (
              <Link key={c.id} to={`/candidates/${c.id}`}
                className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {c.match_score != null && (
                    <span className={`text-sm font-semibold ${c.match_score >= 70 ? 'text-green-600' : c.match_score >= 45 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {c.match_score}
                    </span>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
