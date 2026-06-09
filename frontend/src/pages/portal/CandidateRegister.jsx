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
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-violet-700 via-violet-600 to-indigo-700 text-white flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwVjI4aC02djZoNnptNiAwaDZ2LTZoLTZ2NnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
        <div className="relative">
          <Link to="/portal" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
            </div>
            <span className="font-bold text-lg">AI Hiring Bot</span>
          </Link>
        </div>

        <div className="relative space-y-6">
          <div>
            <h2 className="text-3xl font-extrabold leading-tight mb-3">Join thousands of candidates</h2>
            <p className="text-violet-200 text-base">One profile. Apply everywhere. Get results faster than traditional hiring.</p>
          </div>
          <div className="space-y-3">
            {[
              { icon: '🚀', text: 'Apply in under 2 minutes' },
              { icon: '🤖', text: 'AI scores and ranks your profile' },
              { icon: '🔔', text: 'SMS & email updates at every step' },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3">
                <span className="text-xl">{f.icon}</span>
                <span className="text-sm text-violet-100">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-violet-300 text-xs">
          Screening interviews are conducted by an AI system
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-4">
          <Link to="/portal" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
            </div>
            <span className="font-bold text-slate-900">AI Hiring Bot</span>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
              <p className="text-slate-500 text-sm mt-1">Start applying to open positions today</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input required value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Rahul Sharma"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-shadow" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                  <input type="email" required value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="rahul@example.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-shadow" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Phone <span className="text-slate-400 font-normal text-xs">(optional — for interview SMS)</span>
                  </label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-shadow" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                  <input type="password" required value={form.password} onChange={e => set('password', e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-shadow" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-violet-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm mt-1 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating account...
                    </>
                  ) : 'Create Account'}
                </button>
              </form>
              <p className="text-xs text-center text-slate-400 mt-4">
                By registering, you consent to AI-conducted screening calls
              </p>
              <p className="text-sm text-center text-slate-500 mt-4 pt-4 border-t border-slate-100">
                Already have an account?{' '}
                <Link to="/portal/login" state={{ from }} className="text-violet-600 font-semibold hover:text-violet-800">Sign in</Link>
              </p>
            </div>

            <div className="text-center mt-5">
              <Link to="/portal" className="text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to job board
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
