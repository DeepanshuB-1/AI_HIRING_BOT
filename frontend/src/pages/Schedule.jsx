import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getSchedule } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { CalendarClock, ChevronLeft, ChevronRight, Phone, RefreshCw } from 'lucide-react'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function friendlyDate(iso) {
  const t = todayStr()
  const tm = shiftDate(t, 1)
  if (iso === t) return 'Today'
  if (iso === tm) return 'Tomorrow'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function StatusDot({ status }) {
  const map = {
    completed:   'bg-state-done',
    in_progress: 'bg-state-incall animate-pulse',
    pending:     'bg-white border-2 border-brand-400',
  }
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${map[status] || 'bg-slate-300'}`} />
}

export default function Schedule() {
  const [date, setDate] = useState(todayStr())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = () => {
    setLoading(true)
    getSchedule(date).then(setData).finally(() => setLoading(false))
  }

  useEffect(fetch, [date])

  useEffect(() => {
    if (date !== todayStr()) return
    const id = setInterval(fetch, 15000)
    return () => clearInterval(id)
  }, [date])

  const isToday = date === todayStr()
  const calls = data?.calls || []

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Schedule</h1>
          <p className="text-ink-soft text-sm mt-0.5">{friendlyDate(date)} · {calls.length} call{calls.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => shiftDate(d, -1))}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-ink-soft transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <button onClick={() => setDate(d => shiftDate(d, 1))}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-ink-soft transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setDate(todayStr())}
            className="px-3 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors">
            Today
          </button>
          <button onClick={fetch} title="Refresh"
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-ink-soft transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-card shadow-card border border-slate-100 animate-pulse" />)}
        </div>
      ) : calls.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No calls scheduled"
          hint={isToday ? 'No calls booked for today' : 'No calls on this date'}
        />
      ) : (
        <div className="bg-white rounded-card shadow-card border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft uppercase tracking-wide">
              {data.total} call{data.total !== 1 ? 's' : ''}
            </span>
            {isToday && <span className="text-xs text-green-600 font-medium">Live · auto-refreshing</span>}
          </div>
          <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
            {calls.map((c, i) => {
              const nowHHMM = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
              const isPast = isToday && c.scheduled_time < nowHHMM
              return (
                <div key={c.call_id} className={`flex items-center gap-5 px-6 py-4 transition-opacity ${isPast ? 'opacity-50' : ''}`}>
                  {/* Time */}
                  <div className="w-16 text-center flex-shrink-0">
                    <div className={`text-base font-bold ${isToday && !isPast && c.status === 'pending' ? 'text-brand-600' : 'text-ink'}`}>
                      {c.scheduled_time}
                    </div>
                    <div className="text-xs text-ink-faint">IST</div>
                  </div>

                  {/* Connector */}
                  <div className="flex flex-col items-center flex-shrink-0 gap-0.5">
                    <StatusDot status={c.status} />
                    {i < calls.length - 1 && <div className="w-px h-8 bg-slate-200" />}
                  </div>

                  {/* Candidate info */}
                  <div className="flex-1 min-w-0">
                    <Link to={`/candidates/${c.candidate_id}`}
                      className="text-sm font-semibold text-ink hover:text-brand-600 transition-colors">
                      {c.candidate_name}
                    </Link>
                    <div className="flex items-center gap-1 text-xs text-ink-faint mt-0.5">
                      <Phone className="w-3 h-3" />
                      {c.candidate_phone}
                    </div>
                  </div>

                  <StatusBadge status={c.status} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
