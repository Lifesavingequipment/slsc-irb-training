import { NavLink, Outlet } from 'react-router-dom'
import {
  Home,
  Calendar,
  Users,
  Wrench,
  MapPin,
  Settings,
  LogOut,
  Anchor,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home, end: true },
  { to: '/sessions', label: 'Sessions', icon: Calendar },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/equipment', label: 'Equipment', icon: Wrench },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  const { member, club, signOut } = useAuth()

  const displayName = member?.preferred_name || member?.first_name || 'User'

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Anchor size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate">IRB Training</p>
            <p className="text-gray-400 text-xs truncate">{club?.club_name ?? ''}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-4 border-t border-gray-700">
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">IRB Training</h1>
            {club && <p className="text-sm text-gray-500">{club.club_name}</p>}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{displayName}</p>
              <p className="text-xs text-gray-500">{member?.email}</p>
            </div>
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
