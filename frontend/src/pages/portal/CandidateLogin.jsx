import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { portalLogin } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'

export default function CandidateLogin() {
  const { login } = useCandidateAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/portal'

  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const data = await portalLogin(form)
      login(data.access_token, data.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex flex-col">
      <header className="py-5 px-6 border-b border-gray-200 bg-white">
        <Link to="/portal" className="text-indigo-700 font-bold text-lg">AI Hiring Bot</Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">👋</div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-gray-500 text-sm mt-1">Sign in to your candidate account</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 mt-2">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            <p className="text-sm text-center text-gray-500 mt-5">
              Don't have an account?{' '}
              <Link to="/portal/register" state={{ from }} className="text-indigo-600 font-medium hover:underline">Register</Link>
            </p>
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <Link to="/portal" className="text-xs text-gray-400 hover:text-gray-600">← Back to job board</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
