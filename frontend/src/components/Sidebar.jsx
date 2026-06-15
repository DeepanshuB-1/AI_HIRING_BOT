import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Briefcase, Users, CalendarClock,
  Search, BarChart3, Bot, LogOut, ExternalLink, Bell, X, AlertTriangle,
} from 'lucide-react'
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../api/client'

const NAV = [
  { to: '/',          label: 'Dashboard',  end: true,  Icon: LayoutDashboard },
  { to: '/jobs',      label: 'Jobs',       end: false, Icon: Briefcase },
  { to: '/candidates',label: 'Candidates', end: false, Icon: Users },
  { to: '/schedule',  label: 'Schedule',   end: false, Icon: CalendarClock },
  { to: '/search',    label: 'AI Search',  end: false, Icon: Search },
  { to: '/analytics', label: 'Analytics',  end: false, Icon: BarChart3 },
]

function NotificationPanel({ onClose }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getNotifications()
      .then(setNotifications)
      .finally(() => setLoading(false))
  }, [])

  const handleRead = async (notif) => {
    if (!notif.read) {
      await markNotificationRead(notif.id)
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
    }
    if (notif.candidate_id) {
      navigate(`/candidates/${notif.candidate_id}`)
      onClose()
    }
  }

  const handleReadAll = async () => {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unread = notifications.filter(n => !n.read).length

  return (
    <div className="absolute left-full top-0 ml-2 w-80 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white font-semibold text-sm">Notifications</span>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={handleReadAll} className="text-xs text-brand-400 hover:text-brand-300">
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="px-4 py-6 text-slate-400 text-sm text-center">Loading…</div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="px-4 py-6 text-slate-400 text-sm text-center">No notifications</div>
        )}
        {!loading && notifications.map(n => (
          <button
            key={n.id}
            onClick={() => handleRead(n)}
            className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
              !n.read ? 'bg-white/[0.03]' : ''
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                n.type === 'call_interrupted' ? 'bg-orange-500/20' : 'bg-brand-500/20'
              }`}>
                <AlertTriangle className={`w-3.5 h-3.5 ${
                  n.type === 'call_interrupted' ? 'text-orange-400' : 'text-brand-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white text-xs font-semibold truncate">{n.title}</p>
                  {!n.read && <span className="w-1.5 h-1.5 bg-orange-400 rounded-full flex-shrink-0" />}
                </div>
                <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-slate-500 text-xs mt-1">
                  {new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const bellRef = useRef(null)

  useEffect(() => {
    const fetchCount = () => getUnreadCount().then(d => setUnreadCount(d.count)).catch(() => {})
    fetchCount()
    const interval = setInterval(fetchCount, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [])

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelOpen])

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col flex-shrink-0">
      {/* Brand row */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-white text-sm tracking-tight">HiringBot</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ to, Icon, label, end }) => (
          <NavLink
            key={to} to={to} end={end}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-500/20 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-brand-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-white/10 pt-3 space-y-0.5">
        <a href="/portal" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-all">
          <ExternalLink className="w-4 h-4" />
          Candidate Portal
        </a>

        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setPanelOpen(p => !p)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-all"
          >
            <div className="relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            Notifications
          </button>
          {panelOpen && (
            <NotificationPanel
              onClose={() => {
                setPanelOpen(false)
                getUnreadCount().then(d => setUnreadCount(d.count)).catch(() => {})
              }}
            />
          )}
        </div>

        {/* User chip */}
        {user && (
          <div className="flex items-center gap-2 px-3 py-2.5 mt-1">
            <div className="w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{user.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-xs font-semibold truncate">{user.name}</div>
              <div className="text-slate-400 text-xs truncate">{user.company_name}</div>
            </div>
          </div>
        )}

        <button onClick={() => { logout(); navigate('/login') }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-all">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
