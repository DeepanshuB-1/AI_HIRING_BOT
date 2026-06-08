import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getSchedule } from '../api/client'
import StatusBadge from '../components/StatusBadge'

function today() {
  return new Date().toISOString().split('T')[0]
}

export default function Schedule() {
  const [date, setDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getSchedule(date).then(setData).finally(() => setLoading(false))
  }, [date])

  const isToday = date === today()

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isToday ? "Today's" : new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} calls
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => {
            const d = new Date(date)
            d.setDate(d.getDate() - 1)
            setDate(d.toISOString().split('T')[0])
          }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">‹</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <button onClick={() => {
            const d = new Date(date)
            d.setDate(d.getDate() + 1)
            setDate(d.toISOString().split('T')[0])
          }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">›</button>
          <button onClick={() => setDate(today())}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Today
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : !data?.calls?.length ? (
        <div className="bg-white rounded-xl p-16 text-center shadow-sm border border-gray-100">
          <p className="text-gray-400 text-lg">No calls scheduled</p>
          <p className="text-gray-400 text-sm mt-1">
            {isToday ? 'No calls booked for today' : 'No calls on this date'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">
              {data.total} call{data.total !== 1 ? 's' : ''} · {date}
            </span>
          </div>

          {/* Timeline */}
          <div className="divide-y divide-gray-50">
            {data.calls.map((c, i) => {
              const isPast = isToday && c.scheduled_time < new Date().toTimeString().slice(0, 5)
              return (
                <div key={c.call_id} className={`flex items-center gap-5 px-6 py-4 ${isPast ? 'opacity-60' : ''}`}>
                  {/* Time */}
                  <div className="w-16 text-center flex-shrink-0">
                    <div className={`text-lg font-bold ${isToday && !isPast && c.status === 'pending' ? 'text-indigo-600' : 'text-gray-700'}`}>
                      {c.scheduled_time}
                    </div>
                    <div className="text-xs text-gray-400">IST</div>
                  </div>

                  {/* Connector */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-3 h-3 rounded-full border-2 ${c.status === 'completed' ? 'bg-green-500 border-green-500' : c.status === 'in_progress' ? 'bg-orange-500 border-orange-500 animate-pulse' : 'bg-white border-indigo-400'}`} />
                    {i < data.calls.length - 1 && <div className="w-0.5 h-8 bg-gray-200 mt-1" />}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <Link to={`/candidates/${c.candidate_id}`}
                      className="text-sm font-semibold text-gray-800 hover:text-indigo-600">
                      {c.candidate_name}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">{c.candidate_phone}</p>
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
