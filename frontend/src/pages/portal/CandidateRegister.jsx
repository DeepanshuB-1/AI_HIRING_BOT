import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { portalRegister } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'

export default function CandidateRegister() {
  const { login } = useCandidateAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/portal'

  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      const data = await portalRegister(form)
      login(data.access_token, data.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
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
            <div className="text-4xl mb-3">👤</div>
            <h1 className="text-2xl font-bold text-gray-900">Create Candidate Account</h1>
            <p className="text-gray-500 text-sm mt-1">Browse and apply to open positions</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input required value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="Rahul Sharma"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="rahul@example.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" required value={form.password} onChange={e => set('password', e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 mt-2">
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
            <p className="text-sm text-center text-gray-500 mt-5">
              Already have an account?{' '}
              <Link to="/portal/login" state={{ from }} className="text-indigo-600 font-medium hover:underline">Sign in</Link>
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
