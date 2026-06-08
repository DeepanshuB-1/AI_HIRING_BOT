import { useState } from 'react'
import { Link } from 'react-router-dom'
import { semanticSearch } from '../api/client'
import StatusBadge from '../components/StatusBadge'

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    try {
      const r = await semanticSearch(query, 15)
      setResults(r)
      setSearched(true)
    } finally { setLoading(false) }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Semantic Search</h1>
        <p className="text-gray-500 text-sm mt-1">Search candidates by skills, experience, or any natural language query</p>
      </div>

      <form onSubmit={search} className="flex gap-3">
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          placeholder='e.g. "Python developer with FastAPI experience" or "5+ years React frontend"'
        />
        <button type="submit" disabled={loading}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {['Python backend developer', 'React frontend 3+ years', 'ML engineer TensorFlow', 'Full stack Node.js'].map(s => (
          <button key={s} onClick={() => { setQuery(s) }}
            className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full hover:border-indigo-300 hover:text-indigo-600">
            {s}
          </button>
        ))}
      </div>

      {searched && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-600">{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</span>
          </div>
          {results.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">No matching candidates found</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Candidate</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Similarity</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Match Score</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <Link to={`/candidates/${c.id}`} className="group">
                        <p className="text-sm font-medium text-gray-800 group-hover:text-indigo-600">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.email}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.round(c.similarity_score * 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-indigo-600">{Math.round(c.similarity_score * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {c.match_score != null
                        ? <span className={`text-sm font-semibold ${c.match_score >= 70 ? 'text-green-600' : c.match_score >= 45 ? 'text-yellow-600' : 'text-red-500'}`}>{c.match_score}</span>
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
