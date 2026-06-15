import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'
import { Bot, Menu, X, Briefcase, FileText, ChevronDown, LogOut, User } from 'lucide-react'

export default function PortalNav() {
  const { user, logout } = useCandidateAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/portal')
    setDropOpen(false)
    setOpen(false)
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-card">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link to="/portal" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 bg-port-600 rounded-lg flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-ink text-sm tracking-tight">HiringBot</span>
        </Link>

        {/* Center nav — desktop */}
        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/portal"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-port-50 text-port-700' : 'text-ink-soft hover:text-ink hover:bg-slate-50'
              }`
            }>
            <Briefcase className="w-3.5 h-3.5" />
            Browse Jobs
          </NavLink>
          {user && (
            <NavLink to="/portal/applications"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-port-50 text-port-700' : 'text-ink-soft hover:text-ink hover:bg-slate-50'
                }`
              }>
              <FileText className="w-3.5 h-3.5" />
              My Applications
            </NavLink>
          )}
        </nav>

        {/* Right — desktop */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setDropOpen(v => !v)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="w-7 h-7 bg-port-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-port-700">{initials}</span>
                </div>
                <span className="text-sm font-medium text-ink">{user.name.split(' ')[0]}</span>
                <ChevronDown className="w-3.5 h-3.5 text-ink-faint" />
              </button>
              {dropOpen && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-card shadow-pop border border-slate-100 py-1 z-40">
                  <Link to="/portal/profile"
                    onClick={() => setDropOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-slate-50">
                    <User className="w-3.5 h-3.5 text-ink-faint" />
                    My Profile
                  </Link>
                  <Link to="/portal/applications"
                    onClick={() => setDropOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-slate-50">
                    <FileText className="w-3.5 h-3.5 text-ink-faint" />
                    My Applications
                  </Link>
                  <div className="h-px bg-slate-100 my-1" />
                  <button onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50">
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/portal/login"
                className="text-sm font-medium text-ink-soft hover:text-ink transition-colors">
                Sign in
              </Link>
              <Link to="/portal/register"
                className="text-sm font-semibold bg-port-600 text-white px-4 py-1.5 rounded-card hover:bg-port-700 transition-colors shadow-sm">
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Hamburger — mobile */}
        <button className="md:hidden p-1.5 rounded-lg text-ink-soft hover:text-ink" onClick={() => setOpen(v => !v)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="md:hidden border-t border-slate-100 bg-white px-6 py-4 space-y-1">
          <NavLink to="/portal" end onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink hover:bg-slate-50">
            <Briefcase className="w-4 h-4 text-ink-faint" /> Browse Jobs
          </NavLink>
          {user && (
            <>
              <NavLink to="/portal/applications" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink hover:bg-slate-50">
                <FileText className="w-4 h-4 text-ink-faint" /> My Applications
              </NavLink>
              <NavLink to="/portal/profile" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink hover:bg-slate-50">
                <User className="w-4 h-4 text-ink-faint" /> My Profile
              </NavLink>
            </>
          )}
          {user ? (
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/portal/login" onClick={() => setOpen(false)}
                className="text-sm font-medium text-center py-2.5 rounded-xl border border-slate-200 text-ink hover:bg-slate-50">
                Sign in
              </Link>
              <Link to="/portal/register" onClick={() => setOpen(false)}
                className="text-sm font-semibold text-center py-2.5 rounded-xl bg-port-600 text-white hover:bg-port-700">
                Get Started
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
