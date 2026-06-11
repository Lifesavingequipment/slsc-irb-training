import { useEffect, useState } from 'react'
import { Calendar, Users, Wrench, AlertTriangle, ChevronRight, CheckCircle, XCircle, Clock3, Award, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

interface UpcomingSession {
  id: string
  title: string
  session_type: string
  scheduled_date: string
  start_time: string | null
  location_name: string | null
  trainer_name: string | null
  my_rsvp: string | null
  my_rsvp_id: string | null
}

interface MyQual {
  code: string
  name: string
  expiry_date: string | null
  status: string
}

interface MyStats {
  sessionsAttended: number
  asDriver: number
  asCrew: number
  lastAttended: string | null
  qualifications: MyQual[]
}

interface Alert {
  type: 'qual_expired' | 'qual_expiring' | 'equipment_overdue' | 'fault_critical'
  label: string
  detail: string
  link: string
}

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

const QUAL_STATUS_COLORS: Record<string, string> = {
  current: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-red-100 text-red-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  pending: 'bg-gray-100 text-gray-500',
}

function seasonStart(): string {
  const now = new Date()
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-09-01`
}

export function Dashboard() {
  const { member } = useAuth()
  const navigate = useNavigate()

  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingUpcoming, setLoadingUpcoming] = useState(true)
  const [loadingMyStats, setLoadingMyStats] = useState(true)
  const [loadingAlerts, setLoadingAlerts] = useState(true)

  const [upcomingThisMonth, setUpcomingThisMonth] = useState(0)
  const [irbDCount, setIrbDCount] = useState(0)
  const [irbCCount, setIrbCCount] = useState(0)
  const [openFaults, setOpenFaults] = useState(0)

  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([])
  const [myStats, setMyStats] = useState<MyStats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [isTrainer, setIsTrainer] = useState(false)
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    loadStatCards(member.club_id)
    loadUpcomingSessions(member.club_id, member.id)
    loadMyStats(member.club_id, member.id)
    checkTrainerAndAlerts(member.club_id, member.id)
  }, [member])

  async function loadStatCards(clubId: string) {
    const now = new Date()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const monthEndStr = monthEnd.toISOString().split('T')[0]
    const today = now.toISOString().split('T')[0]

    const [sessRes, qualRes, faultsRes] = await Promise.all([
      supabase
        .from('irb_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .gte('scheduled_date', today)
        .lte('scheduled_date', monthEndStr)
        .neq('status', 'cancelled'),
      supabase
        .from('member_qualifications')
        .select('qualification_id, qualifications!inner(code)')
        .eq('club_id', clubId)
        .eq('status', 'current'),
      supabase
        .from('irb_equipment_faults')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .neq('status', 'resolved'),
    ])

    const quals = (qualRes.data ?? []) as unknown as Array<{ qualifications: { code: string } }>
    setUpcomingThisMonth(sessRes.count ?? 0)
    setIrbDCount(quals.filter(q => q.qualifications?.code === 'IRB-D').length)
    setIrbCCount(quals.filter(q => q.qualifications?.code === 'IRB-C').length)
    setOpenFaults(faultsRes.count ?? 0)
    setLoadingStats(false)
  }

  async function loadUpcomingSessions(clubId: string, memberId: string) {
    const today = new Date().toISOString().split('T')[0]

    const [sessRes, membersRes] = await Promise.all([
      supabase
        .from('irb_sessions')
        .select('id, title, session_type, scheduled_date, start_time, location_id, lead_trainer_id')
        .eq('club_id', clubId)
        .gte('scheduled_date', today)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(3),
      supabase.from('members').select('id, first_name, last_name, preferred_name').eq('club_id', clubId),
    ])

    const sessions = sessRes.data ?? []
    if (sessions.length === 0) {
      setUpcomingSessions([])
      setLoadingUpcoming(false)
      return
    }

    const memberMap = new Map<string, string>()
    for (const m of (membersRes.data ?? [])) {
      memberMap.set(m.id, m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`)
    }

    const sessionIds = sessions.map((s: { id: string }) => s.id)
    const locationIds = sessions.map((s: { location_id: string | null }) => s.location_id).filter(Boolean) as string[]

    const [locRes, rsvpRes] = await Promise.all([
      locationIds.length > 0
        ? supabase.from('irb_locations').select('id, name').in('id', locationIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from('irb_session_rsvps')
        .select('id, session_id, rsvp_status')
        .in('session_id', sessionIds)
        .eq('member_id', memberId),
    ])

    const locationMap = new Map<string, string>()
    for (const l of (locRes.data ?? [])) locationMap.set(l.id, l.name)

    const rsvpMap = new Map<string, { id: string; status: string }>()
    for (const r of (rsvpRes.data ?? [])) rsvpMap.set(r.session_id, { id: r.id, status: r.rsvp_status })

    const upcoming: UpcomingSession[] = sessions.map((s: {
      id: string; title: string; session_type: string; scheduled_date: string;
      start_time: string | null; location_id: string | null; lead_trainer_id: string | null
    }) => ({
      id: s.id,
      title: s.title,
      session_type: s.session_type,
      scheduled_date: s.scheduled_date,
      start_time: s.start_time,
      location_name: s.location_id ? (locationMap.get(s.location_id) ?? null) : null,
      trainer_name: s.lead_trainer_id ? (memberMap.get(s.lead_trainer_id) ?? null) : null,
      my_rsvp: rsvpMap.get(s.id)?.status ?? null,
      my_rsvp_id: rsvpMap.get(s.id)?.id ?? null,
    }))

    setUpcomingSessions(upcoming)
    setLoadingUpcoming(false)
  }

  async function loadMyStats(clubId: string, memberId: string) {
    const season = seasonStart()

    const [attendRes, qualRes] = await Promise.all([
      supabase
        .from('irb_attendance')
        .select('role_on_day, attended, irb_sessions!inner(scheduled_date, club_id)')
        .eq('member_id', memberId)
        .eq('attended', true)
        .gte('irb_sessions.scheduled_date', season)
        .eq('irb_sessions.club_id', clubId),
      supabase
        .from('member_qualifications')
        .select('expiry_date, status, qualifications!inner(code, name)')
        .eq('club_id', clubId)
        .eq('member_id', memberId),
    ])

    const attendRows = (attendRes.data ?? []) as unknown as Array<{
      role_on_day: string | null
      attended: boolean
      irb_sessions: { scheduled_date: string; club_id: string }
    }>

    const asDriver = attendRows.filter(r => r.role_on_day === 'driver').length
    const asCrew = attendRows.filter(r => r.role_on_day === 'crew').length

    const dates = attendRows.map(r => r.irb_sessions?.scheduled_date).filter(Boolean) as string[]
    const lastAttended = dates.length > 0 ? dates.sort().reverse()[0] : null

    const TARGET_QUALS = ['IRB-D', 'IRB-C', 'CPR']
    const qualRows = (qualRes.data ?? []) as unknown as Array<{
      expiry_date: string | null
      status: string
      qualifications: { code: string; name: string }
    }>

    const qualifications: MyQual[] = TARGET_QUALS.map(code => {
      const row = qualRows.find(q => q.qualifications?.code === code)
      return row
        ? { code, name: row.qualifications.name, expiry_date: row.expiry_date, status: row.status }
        : { code, name: code, expiry_date: null, status: 'not_held' }
    })

    setMyStats({
      sessionsAttended: attendRows.length,
      asDriver,
      asCrew,
      lastAttended,
      qualifications,
    })
    setLoadingMyStats(false)
  }

  async function checkTrainerAndAlerts(clubId: string, memberId: string) {
    const rolesRes = await supabase
      .from('member_roles')
      .select('role_name')
      .eq('member_id', memberId)
      .eq('club_id', clubId)
      .eq('is_active', true)

    const roles = (rolesRes.data ?? []).map((r: { role_name: string }) => r.role_name)
    const trainer = roles.includes('irb_trainer') || roles.includes('club_admin')
    setIsTrainer(trainer)

    if (!trainer) {
      setLoadingAlerts(false)
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const in90 = new Date()
    in90.setDate(in90.getDate() + 90)
    const in90Str = in90.toISOString().split('T')[0]

    const [expiredRes, expiringRes, overdueRes, criticalRes, membersRes] = await Promise.all([
      supabase
        .from('member_qualifications')
        .select('member_id, qualifications!inner(code, name)')
        .eq('club_id', clubId)
        .eq('status', 'expired')
        .in('qualifications.code', ['IRB-D', 'IRB-C']),
      supabase
        .from('member_qualifications')
        .select('member_id, expiry_date, qualifications!inner(code, name)')
        .eq('club_id', clubId)
        .eq('status', 'current')
        .lte('expiry_date', in90Str)
        .gte('expiry_date', today)
        .in('qualifications.code', ['IRB-D', 'IRB-C']),
      supabase
        .from('irb_equipment')
        .select('id, name')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .lt('next_service_date', today)
        .not('next_service_date', 'is', null),
      supabase
        .from('irb_equipment_faults')
        .select('id, equipment_id, fault_description')
        .eq('club_id', clubId)
        .eq('severity', 'critical')
        .neq('status', 'resolved'),
      supabase
        .from('members')
        .select('id, first_name, last_name, preferred_name')
        .eq('club_id', clubId),
    ])

    const memberNameMap = new Map<string, string>()
    for (const m of (membersRes.data ?? [])) {
      memberNameMap.set(m.id, m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`)
    }

    const newAlerts: Alert[] = []

    for (const r of ((expiredRes.data ?? []) as unknown as Array<{ member_id: string; qualifications: { code: string; name: string } }>)) {
      const name = memberNameMap.get(r.member_id) ?? 'Unknown member'
      newAlerts.push({
        type: 'qual_expired',
        label: `${name} — ${r.qualifications.name} expired`,
        detail: 'Qualification has expired',
        link: '/members',
      })
    }

    for (const r of ((expiringRes.data ?? []) as unknown as Array<{ member_id: string; expiry_date: string; qualifications: { code: string; name: string } }>)) {
      const name = memberNameMap.get(r.member_id) ?? 'Unknown member'
      const expDate = new Date(r.expiry_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      newAlerts.push({
        type: 'qual_expiring',
        label: `${name} — ${r.qualifications.name} expiring soon`,
        detail: `Expires ${expDate}`,
        link: '/members',
      })
    }

    for (const eq of ((overdueRes.data ?? []) as Array<{ id: string; name: string }>)) {
      newAlerts.push({
        type: 'equipment_overdue',
        label: `${eq.name} — service overdue`,
        detail: 'Next service date has passed',
        link: `/equipment/${eq.id}`,
      })
    }

    for (const f of ((criticalRes.data ?? []) as Array<{ id: string; equipment_id: string; fault_description: string }>)) {
      newAlerts.push({
        type: 'fault_critical',
        label: `Critical fault: ${f.fault_description}`,
        detail: 'Open critical equipment fault',
        link: `/equipment/${f.equipment_id}`,
      })
    }

    setAlerts(newAlerts)
    setLoadingAlerts(false)
  }

  async function quickRsvp(session: UpcomingSession, status: 'attending' | 'not_attending') {
    if (!member) return
    setRsvpLoading(session.id)

    if (session.my_rsvp_id) {
      await supabase
        .from('irb_session_rsvps')
        .update({ rsvp_status: status })
        .eq('id', session.my_rsvp_id)
    } else {
      await supabase.from('irb_session_rsvps').insert({
        club_id: member.club_id,
        session_id: session.id,
        member_id: member.id,
        rsvp_status: status,
        preferred_role: 'either',
      })
    }

    setRsvpLoading(null)
    if (member) loadUpcomingSessions(member.club_id, member.id)
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  function formatTime(t: string | null) {
    if (!t) return null
    const [h, m] = t.split(':')
    const d = new Date()
    d.setHours(Number(h), Number(m))
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const displayName = member?.preferred_name || member?.first_name || 'there'

  return (
    <div className="p-4 md:p-8 max-w-5xl space-y-6 md:space-y-8">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Good day, {displayName}</h2>
        <p className="text-gray-500 mt-1">Here's your IRB training overview.</p>
      </div>

      {/* Stat cards */}
      {loadingStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sessions this month" value={upcomingThisMonth} icon={Calendar} color="bg-primary" />
          <StatCard
            label="Current IRB-D"
            value={irbDCount}
            icon={Users}
            color={irbDCount > 0 ? 'bg-emerald-500' : 'bg-red-500'}
          />
          <StatCard
            label="Current IRB-C"
            value={irbCCount}
            icon={Users}
            color={irbCCount > 0 ? 'bg-emerald-500' : 'bg-red-500'}
          />
          <StatCard
            label="Open equipment faults"
            value={openFaults}
            icon={Wrench}
            color={openFaults > 0 ? 'bg-red-500' : 'bg-emerald-500'}
          />
        </div>
      )}

      {/* Upcoming sessions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={17} className="text-primary" />
            Upcoming sessions
          </h3>
          <button
            onClick={() => navigate('/sessions')}
            className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
          >
            View all <ChevronRight size={14} />
          </button>
        </div>

        {loadingUpcoming ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : upcomingSessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">No upcoming sessions scheduled.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingSessions.map(s => {
              const isRsvpLoading = rsvpLoading === s.id
              return (
                <div
                  key={s.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4 hover:border-gray-300 transition"
                >
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/sessions/${s.id}`)}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-gray-900 text-sm">{s.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SESSION_TYPE_COLORS[s.session_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {SESSION_TYPE_LABELS[s.session_type] ?? s.session_type}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{formatDate(s.scheduled_date)}{s.start_time && ` · ${formatTime(s.start_time)}`}</span>
                      {s.location_name && <span>{s.location_name}</span>}
                      {s.trainer_name && <span>Trainer: {s.trainer_name}</span>}
                    </div>
                  </div>

                  {/* RSVP */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.my_rsvp === 'attending' ? (
                      <>
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircle size={13} /> Attending
                        </span>
                        <button
                          disabled={isRsvpLoading}
                          onClick={() => quickRsvp(s, 'not_attending')}
                          className="text-xs px-2.5 py-1 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : s.my_rsvp === 'not_attending' ? (
                      <>
                        <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                          <XCircle size={13} /> Declined
                        </span>
                        <button
                          disabled={isRsvpLoading}
                          onClick={() => quickRsvp(s, 'attending')}
                          className="text-xs px-2.5 py-1 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition disabled:opacity-50"
                        >
                          Attend
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock3 size={13} /> Pending
                        </span>
                        <div className="flex gap-1">
                          <button
                            disabled={isRsvpLoading}
                            onClick={() => quickRsvp(s, 'attending')}
                            className="text-xs px-2.5 py-1 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition disabled:opacity-50"
                          >
                            Attend
                          </button>
                          <button
                            disabled={isRsvpLoading}
                            onClick={() => quickRsvp(s, 'not_attending')}
                            className="text-xs px-2.5 py-1 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* My stats + Alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Stats */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp size={17} className="text-primary" />
            My stats this season
          </h3>
          {loadingMyStats ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : myStats ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Sessions attended</span>
                <span className="font-bold text-gray-900">{myStats.sessionsAttended}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">As driver / crew</span>
                <span className="font-semibold text-gray-700">{myStats.asDriver} / {myStats.asCrew}</span>
              </div>
              {myStats.lastAttended && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Last attended</span>
                  <span className="font-semibold text-gray-700">{formatDate(myStats.lastAttended)}</span>
                </div>
              )}

              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Award size={13} /> Qualifications
                </p>
                <div className="space-y-2">
                  {myStats.qualifications.map(q => (
                    <div key={q.code} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 font-medium">{q.code}</span>
                      <div className="flex items-center gap-2">
                        {q.expiry_date && q.status !== 'not_held' && (
                          <span className="text-xs text-gray-400">
                            exp. {new Date(q.expiry_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          q.status === 'not_held' ? 'bg-gray-100 text-gray-400' :
                          (QUAL_STATUS_COLORS[q.status] ?? 'bg-gray-100 text-gray-500')
                        }`}>
                          {q.status === 'not_held' ? 'Not held' : q.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Alerts */}
        {isTrainer && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <AlertTriangle size={17} className="text-amber-500" />
              Alerts
            </h3>
            {loadingAlerts ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg p-3">
                <CheckCircle size={15} />
                All clear — no alerts at this time.
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(a.link)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition flex items-start gap-2.5 hover:opacity-90 ${
                      a.type === 'qual_expired' || a.type === 'fault_critical'
                        ? 'bg-red-50 border-red-100 text-red-700'
                        : a.type === 'qual_expiring'
                        ? 'bg-amber-50 border-amber-100 text-amber-700'
                        : 'bg-orange-50 border-orange-100 text-orange-700'
                    }`}
                  >
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-snug">{a.label}</p>
                      <p className="text-xs opacity-75 mt-0.5">{a.detail}</p>
                    </div>
                    <ChevronRight size={14} className="flex-shrink-0 ml-auto mt-0.5 opacity-50" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
