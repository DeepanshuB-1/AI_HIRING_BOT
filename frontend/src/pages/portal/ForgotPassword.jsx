import { useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await axios.post('/api/portal/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Forgot your password?</h1>
          <p className="text-slate-500 text-sm mt-1">Enter your email and we'll send you a reset link</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-green-700 text-sm font-medium">Check your inbox!</p>
              <p className="text-green-600 text-xs mt-1">If an account exists for <strong>{email}</strong>, a reset link has been sent. It expires in 15 minutes.</p>
            </div>
            <Link to="/portal/login" className="block text-sm text-violet-600 hover:text-violet-800 font-medium">
              ← Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Email address</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="you@example.com"
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div className="text-center">
              <Link to="/portal/login" className="text-sm text-slate-400 hover:text-violet-600 transition-colors">
                ← Back to login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
