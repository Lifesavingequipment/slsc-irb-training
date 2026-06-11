import { useAuth } from '../context/AuthContext'
import { User, Building } from 'lucide-react'

export function Settings() {
  const { member, club } = useAuth()

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500 text-sm mt-0.5">Account and application settings</p>
      </div>

      {/* Profile section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center gap-3 mb-5">
          <User size={18} className="text-primary" />
          <h3 className="font-semibold text-gray-900">Your profile</h3>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">First name</p>
              <p className="text-sm text-gray-900">{member?.first_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Last name</p>
              <p className="text-sm text-gray-900">{member?.last_name ?? '—'}</p>
            </div>
          </div>
          {member?.preferred_name && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Preferred name</p>
              <p className="text-sm text-gray-900">{member.preferred_name}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email</p>
            <p className="text-sm text-gray-900">{member?.email ?? '—'}</p>
          </div>
          {member?.phone && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Phone</p>
              <p className="text-sm text-gray-900">{member.phone}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Membership status</p>
            <p className="text-sm text-gray-900 capitalize">{member?.membership_status ?? '—'}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          To update your profile details, contact your club administrator or use the membership app.
        </p>
      </div>

      {/* Club section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Building size={18} className="text-primary" />
          <h3 className="font-semibold text-gray-900">Club</h3>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Club name</p>
            <p className="text-sm text-gray-900">{club?.club_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Club code</p>
            <p className="text-sm text-gray-900 font-mono">{club?.club_code ?? '—'}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Country</p>
              <p className="text-sm text-gray-900">{club?.country ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">State / Region</p>
              <p className="text-sm text-gray-900">{club?.state_region ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
