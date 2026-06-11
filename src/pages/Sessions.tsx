import { useEffect, useState } from 'react'
import { Calendar, Plus, Clock, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbSession } from '../types'

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
}

export function Sessions() {
  const { member } = useAuth()
  const [sessions, setSessions] = useState<IrbSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming')

  useEffect(() => {
    if (!member) return
    loadSessions(member.club_id)
  }, [member, filter])

  async function loadSessions(clubId: string) {
    setLoading(true)
    let query = supabase
      .from('irb_sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('scheduled_date', { ascending: true })

    if (filter === 'upcoming') {
      const today = new Date().toISOString().split('T')[0]
      query = query.gte('scheduled_date', today).neq('status', 'cancelled')
    }

    const { data } = await query
    setSessions(data ?? [])
    setLoading(false)
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  function formatTime(t: string | null) {
    if (!t) return null
    const [h, m] = t.split(':')
    const d = new Date()
    d.setHours(Number(h), Number(m))
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sessions</h2>
          <p className="text-gray-500 text-sm mt-0.5">Manage IRB training sessions</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-red-700 transition">
          <Plus size={16} />
          New session
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {(['upcoming', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'upcoming' ? 'Upcoming' : 'All sessions'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No sessions found</p>
          <p className="text-gray-400 text-sm mt-1">Create your first session to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <div
              key={session.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[session.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{session.session_type}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900">{session.title}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                    <span className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Calendar size={14} />
                      {formatDate(session.scheduled_date)}
                    </span>
                    {(session.start_time || session.end_time) && (
                      <span className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Clock size={14} />
                        {formatTime(session.start_time)}
                        {session.end_time && ` – ${formatTime(session.end_time)}`}
                      </span>
                    )}
                    {session.max_participants && (
                      <span className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Users size={14} />
                        Max {session.max_participants}
                      </span>
                    )}
                  </div>
                  {session.notes && (
                    <p className="text-sm text-gray-400 mt-2 line-clamp-1">{session.notes}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
