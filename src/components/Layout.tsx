import { useState } from 'react'
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
  Menu,
  X,
  MoreHorizontal,
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

const bottomTabItems = [
  { to: '/', label: 'Dashboard', icon: Home, end: true },
  { to: '/sessions', label: 'Sessions', icon: Calendar },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/equipment', label: 'Equipment', icon: Wrench },
]

const moreDrawerItems = [
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  const { member, club, signOut } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const displayName = member?.preferred_name || member?.first_name || 'User'

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar — hidden on mobile, visible on md+ */}
      <aside className="hidden md:flex w-64 bg-gray-900 flex-col flex-shrink-0">
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

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-3 md:py-4 flex items-center justify-between flex-shrink-0">
          {/* App name + logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 md:hidden">
              <Anchor size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-semibold text-gray-900">IRB Training</h1>
              {club && <p className="text-sm text-gray-500 hidden md:block">{club.club_name}</p>}
            </div>
          </div>

          {/* Mobile: hamburger */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg text-gray-500 hover:bg-gray-100 transition"
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>

          {/* Desktop: user info */}
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{displayName}</p>
              <p className="text-xs text-gray-500">{member?.email}</p>
            </div>
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content — bottom padding on mobile for tab bar */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile full-screen nav overlay (hamburger) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col md:hidden">
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Anchor size={17} className="text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">IRB Training</p>
                {club && <p className="text-gray-400 text-xs">{club.club_name}</p>}
              </div>
            </div>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center justify-center w-11 h-11 text-gray-400 hover:text-white transition"
              aria-label="Close menu"
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-4 rounded-lg text-base font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="px-3 py-4 border-t border-gray-700 flex-shrink-0">
            <button
              onClick={() => { signOut(); setMobileNavOpen(false) }}
              className="flex items-center gap-3 px-4 py-4 w-full rounded-lg text-base font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut size={20} />
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Bottom tab bar — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex md:hidden">
        {bottomTabItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-primary' : 'text-gray-400'
              }`
            }
          >
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-gray-400 transition-colors"
        >
          <MoreHorizontal size={22} />
          <span>More</span>
        </button>
      </nav>

      {/* More slide-up drawer */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <p className="text-base font-semibold text-gray-900">More</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="flex items-center justify-center w-9 h-9 text-gray-400 hover:text-gray-600 transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-3 pb-8 space-y-1">
              {moreDrawerItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={() => { signOut(); setMoreOpen(false) }}
                className="flex items-center gap-3 px-4 py-3.5 w-full rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
