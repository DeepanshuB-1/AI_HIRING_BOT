import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', company_name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      const { data } = await axios.post('/auth/register', form)
      login(data.access_token, data.user)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-5/12 bg-slate-900 text-white flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 to-slate-900" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full -translate-y-32 translate-x-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-600/10 rounded-full translate-y-24 -translate-x-24" />

        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-base">AI Hiring Bot</div>
            <div className="text-slate-400 text-xs">HR Dashboard</div>
          </div>
        </div>

        <div className="relative space-y-6">
          <div>
            <h2 className="text-3xl font-extrabold leading-tight mb-3">Set up your hiring pipeline in minutes</h2>
            <p className="text-slate-400 text-base leading-relaxed">Create jobs, upload resumes, and let AI handle the initial screening — so your team focuses on the best candidates only.</p>
          </div>
          <div className="space-y-3">
            {[
              { icon: '⚡', text: 'Resume scoring in under 2 minutes' },
              { icon: '🔒', text: 'Isolated data per company account' },
              { icon: '🌐', text: 'Candidate self-serve portal included' },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-lg">{f.icon}</span>
                <span className="text-sm text-slate-300">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-slate-500 text-xs">
          By registering, AI involvement is disclosed to all candidates as required by applicable regulations.
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col bg-slate-50">
        <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
            </svg>
          </div>
          <span className="font-bold text-slate-900">AI Hiring Bot</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Create HR account</h1>
              <p className="text-slate-500 text-sm mt-1">Get your hiring pipeline running today</p>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                    <input required value={form.name} onChange={e => set('name', e.target.value)}
                      placeholder="Priya Sharma"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name</label>
                    <input required value={form.company_name} onChange={e => set('company_name', e.target.value)}
                      placeholder="Acme Technologies Pvt Ltd"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Work Email</label>
                    <input type="email" required value={form.email} onChange={e => set('email', e.target.value)}
                      placeholder="priya@acme.com"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                    <input type="password" required value={form.password} onChange={e => set('password', e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow" />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2">
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
              <p className="text-sm text-center text-slate-500 mt-6">
                Already have an account?{' '}
                <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-800">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
