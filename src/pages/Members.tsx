import { useEffect, useState } from 'react'
import { Users, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Member } from '../types'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  suspended: 'bg-red-100 text-red-700',
}

export function Members() {
  const { member: currentMember } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentMember) return
    loadMembers(currentMember.club_id)
  }, [currentMember])

  async function loadMembers(clubId: string) {
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('club_id', clubId)
      .order('last_name', { ascending: true })
    setMembers(data ?? [])
    setLoading(false)
  }

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    const name = `${m.first_name} ${m.last_name} ${m.preferred_name ?? ''}`.toLowerCase()
    return name.includes(q) || m.email.toLowerCase().includes(q)
  })

  function initials(m: Member) {
    return `${m.first_name[0] ?? ''}${m.last_name[0] ?? ''}`.toUpperCase()
  }

  function displayName(m: Member) {
    return m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Members</h2>
        <p className="text-gray-500 text-sm mt-0.5">View club members (read-only)</p>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search members…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No members found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {initials(m)}
                      </div>
                      <span className="font-medium text-gray-900">{displayName(m)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{m.email}</td>
                  <td className="px-6 py-4 text-gray-500">{m.phone ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[m.membership_status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {m.membership_status.charAt(0).toUpperCase() + m.membership_status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {filtered.length} member{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
