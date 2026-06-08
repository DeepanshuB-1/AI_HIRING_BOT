import { NavLink } from 'react-router-dom'

const links = [
  { to: '/',            icon: '▦',  label: 'Dashboard'  },
  { to: '/jobs',        icon: '📋', label: 'Jobs'        },
  { to: '/candidates',  icon: '👥', label: 'Candidates'  },
  { to: '/schedule',    icon: '📅', label: 'Schedule'    },
  { to: '/search',      icon: '🔍', label: 'Search'      },
]

export default function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-sidebar flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-indigo-800">
        <div className="text-white font-bold text-lg leading-tight">AI Hiring Bot</div>
        <div className="text-indigo-300 text-xs mt-0.5">HR Dashboard</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-indigo-800">
        <div className="text-indigo-400 text-xs">Phase 5 — HR Dashboard</div>
        <div className="text-indigo-500 text-xs mt-0.5">v3.0 · Ollama + pgvector</div>
      </div>
    </aside>
  )
}
