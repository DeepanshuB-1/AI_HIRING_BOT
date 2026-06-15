import { useState } from 'react'
import { Link } from 'react-router-dom'
import { semanticSearch } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { Search as SearchIcon, Loader2 } from 'lucide-react'

const EXAMPLE_QUERIES = [
  'Python backend developer',
  'React frontend 3+ years',
  'ML engineer TensorFlow',
  'Full stack Node.js',
]

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const doSearch = async (e) => {
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
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Hero */}
      <div className="bg-brand-50 rounded-2xl px-8 py-10 border border-brand-100">
        <h1 className="font-display text-2xl font-bold text-ink mb-1">Semantic Search</h1>
        <p className="text-ink-soft text-sm mb-5">
          Search candidates by skills, experience, or any natural language query — powered by vector embeddings.
        </p>
        <form onSubmit={doSearch} className="flex gap-3 max-w-xl">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 shadow-sm"
              placeholder='"Python developer with FastAPI experience"'
            />
          </div>
          <button type="submit" disabled={loading}
            className="px-5 py-3 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-60 transition-colors flex items-center gap-2 shadow-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLE_QUERIES.map(s => (
            <button key={s} onClick={() => setQuery(s)}
              className="text-xs bg-white text-ink-soft border border-slate-200 px-3 py-1.5 rounded-pill hover:border-brand-300 hover:text-brand-700 transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {!searched && !loading && (
        <div className="text-center py-16 text-ink-faint">
          <SearchIcon className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Type a query above and hit Search to find candidates</p>
        </div>
      )}

      {searched && (
        <div className="bg-white rounded-card shadow-card border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
            <span className="text-sm font-medium text-ink-soft">
              {results.length} result{results.length !== 1 ? 's' : ''} for <span className="text-ink font-semibold">"{query}"</span>
            </span>
          </div>
          {results.length === 0 ? (
            <EmptyState icon={SearchIcon} title="No matching candidates" hint="Try a different query or keywords" />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left bg-slate-50 border-b border-slate-100">
                  <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Candidate</th>
                  <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Similarity</th>
                  <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Match Score</th>
                  <th className="px-5 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {results.map(c => {
                  const sim = Math.round(c.similarity_score * 100)
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <Link to={`/candidates/${c.id}`} className="group">
                          <p className="text-sm font-semibold text-ink group-hover:text-brand-600 transition-colors">{c.name}</p>
                          <p className="text-xs text-ink-faint">{c.email}</p>
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${sim}%` }} />
                          </div>
                          <span className="text-sm font-bold text-brand-600">{sim}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {c.match_score != null
                          ? <span className={`text-sm font-bold ${c.match_score >= 70 ? 'text-green-600' : c.match_score >= 45 ? 'text-amber-500' : 'text-red-500'}`}>
                              {c.match_score}
                            </span>
                          : <span className="text-xs text-ink-faint">—</span>
                        }
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
