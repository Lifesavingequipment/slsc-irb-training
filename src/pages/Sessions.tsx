import { useEffect, useState } from 'react'
import { Calendar, Plus, MapPin, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbSession } from '../types'

type FilterTab = 'upcoming' | 'past' | 'all' | 'cancelled'

const SESSION_TYPE_COLORS: Record<string, string> = {
  training: 'bg-blue-100 text-blue-700',
  assessment: 'bg-purple-100 text-purple-700',
  competition: 'bg-orange-100 text-orange-700',
  patrol_support: 'bg-green-100 text-green-700',
  maintenance: 'bg-gray-100 text-gray-600',
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  assessment: 'Assessment',
  competition: 'Competition',
  patrol_support: 'Patrol Support',
  maintenance: 'Maintenance',
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
}

interface RsvpCounts {
  attending: number
  not_attending: number
  pending: number
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
  { key: 'cancelled', label: 'Cancelled' },
]

const EMPTY_MESSAGES: Record<FilterTab, string> = {
  upcoming: 'No upcoming sessions scheduled.',
  past: 'No past sessions found.',
  all: 'No sessions found.',
  cancelled: 'No cancelled sessions.',
}

export function Sessions() {
  const { member } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<IrbSession[]>([])
  const [locations, setLocations] = useState<Map<string, string>>(new Map())
  const [members, setMembers] = useState<Map<string, string>>(new Map())
  const [rsvpCounts, setRsvpCounts] = useState<Map<string, RsvpCounts>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('upcoming')

  useEffect(() => {
    if (!member) return
    loadData(member.club_id)
  }, [member, filter])

  async function loadData(clubId: string) {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    let query = supabase
      .from('irb_sessions')
      .select('*')
      .eq('club_id', clubId)

    if (filter === 'upcoming') {
      query = query
        .gte('scheduled_date', today)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
    } else if (filter === 'past') {
      query = query
        .lt('scheduled_date', today)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: false })
    } else if (filter === 'cancelled') {
      query = query
        .eq('status', 'cancelled')
        .order('scheduled_date', { ascending: false })
    } else {
      query = query.order('scheduled_date', { ascending: false })
    }

    const [sessionsRes, locsRes, membersRes, rsvpsRes] = await Promise.all([
      query,
      supabase.from('irb_locations').select('id, name').eq('club_id', clubId),
      supabase.from('members').select('id, first_name, last_name, preferred_name').eq('club_id', clubId),
      supabase.from('irb_session_rsvps').select('session_id, rsvp_status').eq('club_id', clubId),
    ])

    setSessions(sessionsRes.data ?? [])

    const locMap = new Map<string, string>()
    for (const l of (locsRes.data ?? [])) locMap.set(l.id, l.name)
    setLocations(locMap)

    const memberMap = new Map<string, string>()
    for (const m of (membersRes.data ?? [])) {
      memberMap.set(m.id, m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`)
    }
    setMembers(memberMap)

    const counts = new Map<string, RsvpCounts>()
    for (const rsvp of (rsvpsRes.data ?? [])) {
      const c = counts.get(rsvp.session_id) ?? { attending: 0, not_attending: 0, pending: 0 }
      if (rsvp.rsvp_status === 'attending') c.attending++
      else if (rsvp.rsvp_status === 'not_attending') c.not_attending++
      else c.pending++
      counts.set(rsvp.session_id, c)
    }
    setRsvpCounts(counts)

    setLoading(false)
  }

  function formatCardDate(date: string, time: string | null) {
    const d = new Date(date + 'T00:00:00')
    const datePart = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    if (!time) return datePart
    const [h, m] = time.split(':')
    const t = new Date()
    t.setHours(Number(h), Number(m))
    const timePart = t.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${datePart} · ${timePart}`
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Sessions</h2>
        <button
          onClick={() => navigate('/sessions/new')}
          className="flex items-center gap-2 px-3 md:px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-red-700 transition min-h-[44px]"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Session</span>
        </button>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit min-w-full sm:min-w-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap min-h-[44px] sm:min-h-0 sm:py-1.5 ${
                filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{EMPTY_MESSAGES[filter]}</p>
          {filter === 'upcoming' && (
            <button
              onClick={() => navigate('/sessions/new')}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
            >
              Create first session
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const counts = rsvpCounts.get(session.id) ?? { attending: 0, not_attending: 0, pending: 0 }
            const locationName = session.location_id ? locations.get(session.location_id) : null
            const trainerName = session.lead_trainer_id ? members.get(session.lead_trainer_id) : null
            return (
              <div key={session.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-500 mb-1">
                      {formatCardDate(session.scheduled_date, session.start_time)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="font-semibold text-gray-900">{session.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SESSION_TYPE_COLORS[session.session_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {SESSION_TYPE_LABELS[session.session_type] ?? session.session_type}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {locationName && (
                        <span className="flex items-center gap-1.5 text-sm text-gray-500">
                          <MapPin size={13} />
                          {locationName}
                        </span>
                      )}
                      {trainerName && (
                        <span className="flex items-center gap-1.5 text-sm text-gray-500">
                          <User size={13} />
                          {trainerName}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="text-emerald-600 font-medium">{counts.attending} attending</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-red-500 font-medium">{counts.not_attending} declined</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{counts.pending} pending</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[session.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                    </span>
                    <Link
                      to={`/sessions/${session.id}`}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
