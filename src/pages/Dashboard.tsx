import { useEffect, useState } from 'react'
import { Calendar, Users, Wrench, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbSession } from '../types'

interface Stats {
  upcomingSessions: number
  irbDCount: number
  irbCCount: number
  operationalEquipment: number
  nextSession: IrbSession | null
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export function Dashboard() {
  const { member } = useAuth()
  const [stats, setStats] = useState<Stats>({
    upcomingSessions: 0,
    irbDCount: 0,
    irbCCount: 0,
    operationalEquipment: 0,
    nextSession: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!member) return
    loadStats(member.club_id)
  }, [member])

  async function loadStats(clubId: string) {
    const today = new Date().toISOString().split('T')[0]

    const [sessionsRes, qualRes, equipRes, nextRes] = await Promise.all([
      supabase
        .from('irb_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .gte('scheduled_date', today)
        .neq('status', 'cancelled'),
      supabase
        .from('member_qualifications')
        .select('qualification_id, qualifications!inner(code)')
        .eq('club_id', clubId)
        .eq('status', 'current'),
      supabase
        .from('irb_equipment')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .eq('status', 'operational'),
      supabase
        .from('irb_sessions')
        .select('*')
        .eq('club_id', clubId)
        .gte('scheduled_date', today)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(1)
        .single(),
    ])

    const quals = (qualRes.data ?? []) as unknown as Array<{ qualifications: { code: string } }>
    const irbDCount = quals.filter(q => q.qualifications?.code === 'IRB-D').length
    const irbCCount = quals.filter(q => q.qualifications?.code === 'IRB-C').length

    setStats({
      upcomingSessions: sessionsRes.count ?? 0,
      irbDCount,
      irbCCount,
      operationalEquipment: equipRes.count ?? 0,
      nextSession: nextRes.data ?? null,
    })
    setLoading(false)
  }

  const displayName = member?.preferred_name || member?.first_name || 'there'

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  function formatTime(t: string | null) {
    if (!t) return ''
    const [h, m] = t.split(':')
    const d = new Date()
    d.setHours(Number(h), Number(m))
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Good day, {displayName}</h2>
        <p className="text-gray-500 mt-1">Here's what's happening with your IRB training program.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Upcoming sessions"
              value={stats.upcomingSessions}
              icon={Calendar}
              color="bg-primary"
            />
            <StatCard
              label="Current IRB-D"
              value={stats.irbDCount}
              icon={Users}
              color="bg-blue-500"
            />
            <StatCard
              label="Current IRB-C"
              value={stats.irbCCount}
              icon={Users}
              color="bg-indigo-500"
            />
            <StatCard
              label="Operational equipment"
              value={stats.operationalEquipment}
              icon={Wrench}
              color="bg-emerald-500"
            />
          </div>

          {/* Next session card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-primary" />
              Next scheduled session
            </h3>
            {stats.nextSession ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{stats.nextSession.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {formatDate(stats.nextSession.scheduled_date)}
                    {stats.nextSession.start_time && (
                      <> &bull; {formatTime(stats.nextSession.start_time)}
                        {stats.nextSession.end_time && ` – ${formatTime(stats.nextSession.end_time)}`}
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      stats.nextSession.status === 'scheduled'
                        ? 'bg-blue-100 text-blue-700'
                        : stats.nextSession.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {stats.nextSession.status.charAt(0).toUpperCase() + stats.nextSession.status.slice(1)}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{stats.nextSession.session_type}</span>
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-300" />
              </div>
            ) : (
              <p className="text-sm text-gray-400">No upcoming sessions scheduled.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
