import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  User,
  Users,
  Calendar,
  Clock,
  Edit,
  Wind,
  Waves,
  FileText,
  CheckCircle,
  XCircle,
  Clock3,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbSession, IrbLocation, Member, Qualification, IrbSessionRsvp } from '../types'
import { WaveTeamDraw } from '../components/WaveTeamDraw'
import { AttendanceTab } from '../components/AttendanceTab'
import { TrainingPlanTab } from '../components/TrainingPlanTab'

const SESSION_TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  assessment: 'Assessment',
  competition: 'Competition',
  patrol_support: 'Patrol Support',
  maintenance: 'Maintenance',
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  training: 'bg-blue-100 text-blue-700',
  assessment: 'bg-purple-100 text-purple-700',
  competition: 'bg-orange-100 text-orange-700',
  patrol_support: 'bg-green-100 text-green-700',
  maintenance: 'bg-gray-100 text-gray-600',
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
}

const RSVP_ROLE_LABELS: Record<string, string> = {
  driver: 'Driver',
  crew: 'Crew',
  either: 'Either',
}

type BottomTab = 'attendance' | 'team_draw' | 'training_plan'

interface RsvpWithMember extends IrbSessionRsvp {
  memberName: string
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { member: currentMember, club } = useAuth()

  const [session, setSession] = useState<IrbSession | null>(null)
  const [location, setLocation] = useState<IrbLocation | null>(null)
  const [trainer, setTrainer] = useState<Member | null>(null)
  const [qualification, setQualification] = useState<Qualification | null>(null)
  const [rsvps, setRsvps] = useState<RsvpWithMember[]>([])
  const [myRsvp, setMyRsvp] = useState<IrbSessionRsvp | null>(null)
  const [loading, setLoading] = useState(true)
  const [bottomTab, setBottomTab] = useState<BottomTab>('attendance')

  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState<'driver' | 'crew' | 'either'>('either')

  useEffect(() => {
    if (!id || !currentMember) return
    loadData(id, currentMember.club_id, currentMember.id)
  }, [id, currentMember])

  async function loadData(sessionId: string, clubId: string, memberId: string) {
    setLoading(true)

    const [sessionRes, rsvpsRes, membersRes] = await Promise.all([
      supabase.from('irb_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('irb_session_rsvps').select('*').eq('session_id', sessionId).eq('club_id', clubId),
      supabase.from('members').select('id, first_name, last_name, preferred_name').eq('club_id', clubId),
    ])

    const s = sessionRes.data as IrbSession | null
    setSession(s)

    if (s) {
      const [locRes, trainerRes, qualRes] = await Promise.all([
        s.location_id
          ? supabase.from('irb_locations').select('*').eq('id', s.location_id).single()
          : Promise.resolve({ data: null }),
        s.lead_trainer_id
          ? supabase.from('members').select('*').eq('id', s.lead_trainer_id).single()
          : Promise.resolve({ data: null }),
        s.qualification_id
          ? supabase.from('qualifications').select('*').eq('id', s.qualification_id).single()
          : Promise.resolve({ data: null }),
      ])
      setLocation(locRes.data)
      setTrainer(trainerRes.data)
      setQualification(qualRes.data)
    }

    const memberMap = new Map<string, string>()
    for (const m of (membersRes.data ?? [])) {
      memberMap.set(m.id, m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`)
    }

    const rsvpList: RsvpWithMember[] = (rsvpsRes.data ?? []).map((r: IrbSessionRsvp) => ({
      ...r,
      memberName: memberMap.get(r.member_id) ?? 'Unknown member',
    }))
    setRsvps(rsvpList)

    const mine = rsvpList.find(r => r.member_id === memberId) ?? null
    setMyRsvp(mine)
    if (mine?.preferred_role) {
      setSelectedRole(mine.preferred_role as 'driver' | 'crew' | 'either')
    }

    setLoading(false)
  }

  async function submitRsvp(status: 'attending' | 'not_attending') {
    if (!currentMember || !session) return
    setRsvpLoading(true)

    if (myRsvp) {
      await supabase
        .from('irb_session_rsvps')
        .update({ rsvp_status: status, preferred_role: selectedRole })
        .eq('id', myRsvp.id)
    } else {
      await supabase.from('irb_session_rsvps').insert({
        club_id: currentMember.club_id,
        session_id: session.id,
        member_id: currentMember.id,
        rsvp_status: status,
        preferred_role: selectedRole,
      })
    }

    await loadData(session.id, currentMember.club_id, currentMember.id)
    setRsvpLoading(false)
  }

  function formatDate(date: string) {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
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

  function memberDisplayName(m: Member) {
    return m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Session not found.</p>
      </div>
    )
  }

  const attending = rsvps.filter(r => r.rsvp_status === 'attending')
  const declined = rsvps.filter(r => r.rsvp_status === 'not_attending')
  const pending = rsvps.filter(r => r.rsvp_status !== 'attending' && r.rsvp_status !== 'not_attending')

  const hasConditions = session.weather_conditions || session.sea_conditions || session.wind_speed || session.tide_info

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/sessions')}
            className="mt-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900">{session.title}</h2>
              <span className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[session.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              {formatDate(session.scheduled_date)}
              {session.start_time && (
                <> · {formatTime(session.start_time)}{session.end_time && ` – ${formatTime(session.end_time)}`}</>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/sessions/${session.id}/edit`)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex-shrink-0"
        >
          <Edit size={15} />
          Edit
        </button>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* Left column */}
        <div className="lg:col-span-3 space-y-4">
          {/* Session info card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Session Details</h3>
            <dl className="space-y-3">
              <div className="flex gap-3">
                <dt className="w-36 text-sm text-gray-500 flex-shrink-0">Type</dt>
                <dd>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SESSION_TYPE_COLORS[session.session_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {SESSION_TYPE_LABELS[session.session_type] ?? session.session_type}
                  </span>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-36 text-sm text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                  <Calendar size={14} /> Date
                </dt>
                <dd className="text-sm text-gray-900">{formatDate(session.scheduled_date)}</dd>
              </div>
              {(session.start_time || session.end_time) && (
                <div className="flex gap-3">
                  <dt className="w-36 text-sm text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                    <Clock size={14} /> Time
                  </dt>
                  <dd className="text-sm text-gray-900">
                    {formatTime(session.start_time)}
                    {session.end_time && ` – ${formatTime(session.end_time)}`}
                  </dd>
                </div>
              )}
              {location && (
                <div className="flex gap-3">
                  <dt className="w-36 text-sm text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                    <MapPin size={14} /> Location
                  </dt>
                  <dd className="text-sm text-gray-900">{location.name}</dd>
                </div>
              )}
              {trainer && (
                <div className="flex gap-3">
                  <dt className="w-36 text-sm text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                    <User size={14} /> Lead Trainer
                  </dt>
                  <dd className="text-sm text-gray-900">{memberDisplayName(trainer)}</dd>
                </div>
              )}
              {(session.max_participants || session.min_drivers || session.min_crew) && (
                <div className="flex gap-3">
                  <dt className="w-36 text-sm text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                    <Users size={14} /> Capacity
                  </dt>
                  <dd className="text-sm text-gray-900 space-y-0.5">
                    {session.max_participants && <div>Max {session.max_participants} participants</div>}
                    {session.min_drivers && <div>Min {session.min_drivers} drivers</div>}
                    {session.min_crew && <div>Min {session.min_crew} crew</div>}
                  </dd>
                </div>
              )}
              {qualification && (
                <div className="flex gap-3">
                  <dt className="w-36 text-sm text-gray-500 flex-shrink-0">Qualification</dt>
                  <dd className="text-sm text-gray-900">{qualification.name}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Conditions card */}
          {hasConditions && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Conditions</h3>
              <dl className="space-y-3">
                {session.weather_conditions && (
                  <div className="flex gap-3">
                    <dt className="w-36 text-sm text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                      <Wind size={14} /> Weather
                    </dt>
                    <dd className="text-sm text-gray-900">{session.weather_conditions}</dd>
                  </div>
                )}
                {session.sea_conditions && (
                  <div className="flex gap-3">
                    <dt className="w-36 text-sm text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                      <Waves size={14} /> Sea
                    </dt>
                    <dd className="text-sm text-gray-900 capitalize">{session.sea_conditions.replace('_', ' ')}</dd>
                  </div>
                )}
                {session.wind_speed && (
                  <div className="flex gap-3">
                    <dt className="w-36 text-sm text-gray-500 flex-shrink-0">Wind Speed</dt>
                    <dd className="text-sm text-gray-900">{session.wind_speed}</dd>
                  </div>
                )}
                {session.tide_info && (
                  <div className="flex gap-3">
                    <dt className="w-36 text-sm text-gray-500 flex-shrink-0">Tide</dt>
                    <dd className="text-sm text-gray-900">{session.tide_info}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Notes card */}
          {session.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <FileText size={14} /> Notes
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{session.notes}</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* RSVP summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">RSVPs</h3>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="text-center p-3 bg-emerald-50 rounded-lg">
                <div className="text-2xl font-bold text-emerald-600">{attending.length}</div>
                <div className="text-xs text-emerald-600 font-medium mt-0.5">Attending</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-500">{declined.length}</div>
                <div className="text-xs text-red-500 font-medium mt-0.5">Declined</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-400">{pending.length}</div>
                <div className="text-xs text-gray-400 font-medium mt-0.5">Pending</div>
              </div>
            </div>

            {/* My RSVP */}
            {currentMember && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your RSVP</p>
                {myRsvp ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {myRsvp.rsvp_status === 'attending' ? (
                        <CheckCircle size={16} className="text-emerald-500" />
                      ) : myRsvp.rsvp_status === 'not_attending' ? (
                        <XCircle size={16} className="text-red-400" />
                      ) : (
                        <Clock3 size={16} className="text-gray-400" />
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        {myRsvp.rsvp_status === 'attending' ? 'You are attending' : myRsvp.rsvp_status === 'not_attending' ? 'You declined' : 'Pending'}
                      </span>
                      {myRsvp.preferred_role && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {RSVP_ROLE_LABELS[myRsvp.preferred_role] ?? myRsvp.preferred_role}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Change preferred role</p>
                      <div className="flex gap-1.5 mb-3">
                        {(['driver', 'crew', 'either'] as const).map(role => (
                          <button
                            key={role}
                            onClick={() => setSelectedRole(role)}
                            className={`px-3 py-1 text-xs rounded-md font-medium transition border ${
                              selectedRole === role
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {RSVP_ROLE_LABELS[role]}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => submitRsvp('attending')}
                          disabled={rsvpLoading}
                          className="flex-1 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50"
                        >
                          Attending
                        </button>
                        <button
                          onClick={() => submitRsvp('not_attending')}
                          disabled={rsvpLoading}
                          className="flex-1 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          Not Attending
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Select your role and RSVP</p>
                    <div className="flex gap-1.5 mb-3">
                      {(['driver', 'crew', 'either'] as const).map(role => (
                        <button
                          key={role}
                          onClick={() => setSelectedRole(role)}
                          className={`px-3 py-1 text-xs rounded-md font-medium transition border ${
                            selectedRole === role
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {RSVP_ROLE_LABELS[role]}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitRsvp('attending')}
                        disabled={rsvpLoading}
                        className="flex-1 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50"
                      >
                        Attending
                      </button>
                      <button
                        onClick={() => submitRsvp('not_attending')}
                        disabled={rsvpLoading}
                        className="flex-1 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Not Attending
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RSVP list */}
            {rsvps.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">All RSVPs</p>
                <div className="space-y-2">
                  {rsvps.map(r => (
                    <div key={r.id} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{r.memberName}</span>
                      <div className="flex items-center gap-2">
                        {r.preferred_role && (
                          <span className="text-xs text-gray-400">{RSVP_ROLE_LABELS[r.preferred_role] ?? r.preferred_role}</span>
                        )}
                        {r.rsvp_status === 'attending' ? (
                          <CheckCircle size={15} className="text-emerald-500" />
                        ) : r.rsvp_status === 'not_attending' ? (
                          <XCircle size={15} className="text-red-400" />
                        ) : (
                          <Clock3 size={15} className="text-gray-300" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {([
            { key: 'attendance', label: 'Attendance' },
            { key: 'team_draw', label: 'Team Draw' },
            { key: 'training_plan', label: 'Training Plan' },
          ] as { key: BottomTab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setBottomTab(key)}
              className={`px-6 py-3.5 text-sm font-medium transition border-b-2 -mb-px ${
                bottomTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {bottomTab === 'attendance' && currentMember && (
          <AttendanceTab
            sessionId={session.id}
            clubId={session.club_id}
            sessionStatus={session.status}
            currentMemberId={currentMember.id}
            rsvps={rsvps}
          />
        )}
        {bottomTab === 'team_draw' && (
          <div className="p-6">
            <WaveTeamDraw
              sessionId={session.id}
              clubId={session.club_id}
              clubName={club?.club_name ?? ''}
              sessionTitle={session.title}
              sessionDate={session.scheduled_date}
              attendingMemberIds={new Set(attending.map(r => r.member_id))}
            />
          </div>
        )}
        {bottomTab === 'training_plan' && currentMember && (
          <TrainingPlanTab
            sessionId={session.id}
            clubId={session.club_id}
            currentMemberId={currentMember.id}
          />
        )}
      </div>
    </div>
  )
}
