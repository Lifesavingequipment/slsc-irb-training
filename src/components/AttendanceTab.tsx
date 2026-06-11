import { useEffect, useState, useRef } from 'react'
import { Plus, Trash2, Star, CheckCircle, Search, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { IrbSessionRsvp } from '../types'

interface AttendanceRecord {
  id: string
  member_id: string
  role_on_day: string | null
  attended: boolean
  arrived_at: string | null
  performance_rating: number | null
  trainer_notes: string | null
  signed_off: boolean
  signed_off_by: string | null
  memberName: string
  initials: string
}

interface MemberOption {
  id: string
  name: string
  initials: string
}

interface Props {
  sessionId: string
  clubId: string
  sessionStatus: string
  currentMemberId: string
  rsvps: IrbSessionRsvp[]
}

const ROLE_OPTIONS = ['driver', 'crew', 'trainer', 'observer', 'patient'] as const

export function AttendanceTab({ sessionId, clubId, sessionStatus, currentMemberId, rsvps }: Props) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [allMembers, setAllMembers] = useState<MemberOption[]>([])
  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [preloading, setPreloading] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [showAddSearch, setShowAddSearch] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [confirmSignOff, setConfirmSignOff] = useState(false)
  const [signingOff, setSigningOff] = useState(false)

  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const recordsRef = useRef<AttendanceRecord[]>([])

  const isActive = sessionStatus === 'active' || sessionStatus === 'completed'

  useEffect(() => {
    recordsRef.current = records
  }, [records])

  useEffect(() => {
    loadData()
  }, [sessionId, clubId, currentMemberId])

  async function loadData() {
    setLoading(true)
    const [attendanceRes, membersRes, rolesRes] = await Promise.all([
      supabase.from('irb_attendance').select('*').eq('session_id', sessionId).eq('club_id', clubId),
      supabase.from('members').select('id, first_name, last_name, preferred_name').eq('club_id', clubId).order('last_name'),
      supabase.from('member_roles').select('role_name').eq('member_id', currentMemberId).eq('club_id', clubId).eq('is_active', true),
    ])

    const roleNames = (rolesRes.data ?? []).map((r: { role_name: string }) => r.role_name)
    setIsTrainer(roleNames.includes('irb_trainer') || roleNames.includes('club_admin'))

    const memberMap = new Map<string, MemberOption>()
    for (const m of (membersRes.data ?? [])) {
      const name = m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`
      const initials = `${(m.first_name[0] ?? '')}${(m.last_name[0] ?? '')}`.toUpperCase()
      memberMap.set(m.id, { id: m.id, name, initials })
    }

    setAllMembers(Array.from(memberMap.values()))

    const recs: AttendanceRecord[] = (attendanceRes.data ?? []).map((a: AttendanceRecord) => ({
      ...a,
      memberName: memberMap.get(a.member_id)?.name ?? 'Unknown',
      initials: memberMap.get(a.member_id)?.initials ?? '?',
    }))
    setRecords(recs)
    setLoading(false)
  }

  async function preloadFromRsvps() {
    setPreloading(true)
    const attendingRsvps = rsvps.filter(r => r.rsvp_status === 'attending')
    const existingIds = new Set(recordsRef.current.map(r => r.member_id))
    const toInsert = attendingRsvps
      .filter(r => !existingIds.has(r.member_id))
      .map(r => ({
        club_id: clubId,
        session_id: sessionId,
        member_id: r.member_id,
        role_on_day: r.preferred_role && r.preferred_role !== 'either' ? r.preferred_role : null,
        attended: false,
        signed_off: false,
      }))

    if (toInsert.length > 0) {
      await supabase.from('irb_attendance').insert(toInsert)
    }
    await loadData()
    setPreloading(false)
  }

  function updateRecord(id: string, field: string, value: unknown) {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

    const existing = debounceTimers.current.get(id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      const rec = recordsRef.current.find(r => r.id === id)
      if (rec) saveRecord(rec)
    }, 1000)
    debounceTimers.current.set(id, timer)
  }

  async function saveRecord(rec: AttendanceRecord) {
    setSavingIds(prev => new Set(prev).add(rec.id))
    await supabase.from('irb_attendance').update({
      role_on_day: rec.role_on_day,
      attended: rec.attended,
      arrived_at: rec.arrived_at,
      performance_rating: rec.performance_rating,
      trainer_notes: rec.trainer_notes,
      signed_off: rec.signed_off,
      signed_off_by: rec.signed_off_by,
    }).eq('id', rec.id)
    setSavingIds(prev => { const s = new Set(prev); s.delete(rec.id); return s })
    setSavedIds(prev => new Set(prev).add(rec.id))
    setTimeout(() => setSavedIds(prev => { const s = new Set(prev); s.delete(rec.id); return s }), 2000)
  }

  async function addMember(memberId: string) {
    const member = allMembers.find(m => m.id === memberId)
    if (!member) return
    setShowAddSearch(false)
    setAddSearch('')

    const { data } = await supabase.from('irb_attendance').insert({
      club_id: clubId,
      session_id: sessionId,
      member_id: memberId,
      attended: false,
      signed_off: false,
    }).select().single()

    if (data) {
      setRecords(prev => [...prev, { ...data, memberName: member.name, initials: member.initials }])
    }
  }

  async function removeRecord(id: string) {
    await supabase.from('irb_attendance').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
    setConfirmRemoveId(null)
  }

  async function signOffAll() {
    setSigningOff(true)
    const toSignOff = recordsRef.current.filter(r => r.attended && !r.signed_off)
    for (const rec of toSignOff) {
      await supabase.from('irb_attendance').update({ signed_off: true, signed_off_by: currentMemberId }).eq('id', rec.id)
    }
    await loadData()
    setSigningOff(false)
    setConfirmSignOff(false)
  }

  const visibleRecords = isTrainer ? records : records.filter(r => r.member_id === currentMemberId)
  const attendedCount = records.filter(r => r.attended).length
  const absentCount = records.filter(r => !r.attended).length
  const signedOffCount = records.filter(r => r.signed_off).length

  const existingMemberIds = new Set(records.map(r => r.member_id))
  const availableToAdd = allMembers.filter(
    m => !existingMemberIds.has(m.id) && m.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Status banner */}
      {!isActive && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          Attendance can be marked once the session is active or complete. You can pre-load the expected attendees below.
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={preloadFromRsvps}
          disabled={preloading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {preloading
            ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            : <Users size={15} />
          }
          Pre-load from RSVPs
        </button>

        {(isTrainer || isActive) && (
          <div className="relative">
            <button
              onClick={() => setShowAddSearch(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition"
            >
              <Plus size={15} /> Add Member
            </button>

            {showAddSearch && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="p-2 border-b border-gray-100">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-md">
                    <Search size={14} className="text-gray-400 flex-shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search members..."
                      value={addSearch}
                      onChange={e => setAddSearch(e.target.value)}
                      className="bg-transparent text-sm outline-none flex-1 min-w-0"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {availableToAdd.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400 text-center">No members found</div>
                  ) : availableToAdd.map(m => (
                    <button
                      key={m.id}
                      onClick={() => addMember(m.id)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0">
                        {m.initials}
                      </span>
                      {m.name}
                    </button>
                  ))}
                </div>
                <div className="p-2 border-t border-gray-100">
                  <button
                    onClick={() => { setShowAddSearch(false); setAddSearch('') }}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {visibleRecords.length === 0 ? (
        <div className="text-center py-10">
          <Users size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No attendance records yet. Pre-load from RSVPs or add members manually.</p>
        </div>
      ) : (
        <>
          {/* Summary bar — trainer view only */}
          {isTrainer && (
            <div className="flex flex-wrap gap-5 mb-5 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-sm font-bold text-gray-900">{records.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm text-gray-500">Attended</span>
                <span className="text-sm font-bold text-emerald-600">{attendedCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-500">Absent</span>
                <span className="text-sm font-bold text-gray-500">{absentCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-sm text-gray-500">Signed off</span>
                <span className="text-sm font-bold text-blue-600">{signedOffCount}</span>
              </div>
            </div>
          )}

          {/* Attendance rows */}
          <div className="space-y-3">
            {visibleRecords.map(rec => {
              const canEdit = isTrainer || rec.member_id === currentMemberId
              const isSaving = savingIds.has(rec.id)
              const isSaved = savedIds.has(rec.id)

              return (
                <div
                  key={rec.id}
                  className={`border rounded-xl p-4 transition ${rec.attended ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {rec.initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name row */}
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-medium text-gray-900 text-sm">{rec.memberName}</span>
                          {isSaving && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
                          {isSaved && !isSaving && <span className="text-xs text-emerald-500 font-medium">Saved</span>}
                          {rec.signed_off && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">Signed off</span>
                          )}
                        </div>
                        {isTrainer && (
                          <button
                            onClick={() => setConfirmRemoveId(rec.id)}
                            className="text-gray-300 hover:text-red-400 transition flex-shrink-0"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      {/* Fields */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end">
                        {/* Attended toggle */}
                        <div>
                          <label className="text-xs text-gray-400 mb-1.5 block">Attended</label>
                          <button
                            disabled={!canEdit || (!isActive && !isTrainer)}
                            onClick={() => canEdit && updateRecord(rec.id, 'attended', !rec.attended)}
                            className={`relative flex items-center w-14 h-7 rounded-full transition-colors ${rec.attended ? 'bg-emerald-500' : 'bg-gray-200'} ${!canEdit ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span className={`absolute w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${rec.attended ? 'translate-x-8' : 'translate-x-1'}`} />
                          </button>
                        </div>

                        {/* Role on day */}
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Role on day</label>
                          {canEdit ? (
                            <select
                              value={rec.role_on_day ?? ''}
                              onChange={e => updateRecord(rec.id, 'role_on_day', e.target.value || null)}
                              className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white outline-none focus:border-primary"
                            >
                              <option value="">—</option>
                              {ROLE_OPTIONS.map(r => (
                                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-gray-700 capitalize">{rec.role_on_day ?? '—'}</span>
                          )}
                        </div>

                        {/* Arrived at */}
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Arrived at</label>
                          {canEdit ? (
                            <input
                              type="time"
                              value={rec.arrived_at ?? ''}
                              onChange={e => updateRecord(rec.id, 'arrived_at', e.target.value || null)}
                              className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white outline-none focus:border-primary"
                            />
                          ) : (
                            <span className="text-sm text-gray-700">{rec.arrived_at ?? '—'}</span>
                          )}
                        </div>

                        {/* Performance rating — trainer only */}
                        {isTrainer && (
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Performance</label>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button
                                  key={star}
                                  onClick={() => updateRecord(rec.id, 'performance_rating', rec.performance_rating === star ? null : star)}
                                  className={`transition ${star <= (rec.performance_rating ?? 0) ? 'text-amber-400' : 'text-gray-200'} hover:text-amber-300`}
                                >
                                  <Star size={16} fill={star <= (rec.performance_rating ?? 0) ? 'currentColor' : 'none'} />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Signed off toggle — trainer only */}
                        {isTrainer && (
                          <div>
                            <label className="text-xs text-gray-400 mb-1.5 block">Signed off</label>
                            <button
                              onClick={() => updateRecord(rec.id, 'signed_off', !rec.signed_off)}
                              className={`relative flex items-center w-14 h-7 rounded-full transition-colors ${rec.signed_off ? 'bg-blue-500' : 'bg-gray-200'}`}
                            >
                              <span className={`absolute w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${rec.signed_off ? 'translate-x-8' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Trainer notes — trainer only */}
                      {isTrainer && (
                        <div className="mt-3">
                          <label className="text-xs text-gray-400 mb-1 block">Trainer notes</label>
                          <textarea
                            rows={2}
                            value={rec.trainer_notes ?? ''}
                            onChange={e => updateRecord(rec.id, 'trainer_notes', e.target.value || null)}
                            placeholder="Add notes…"
                            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white outline-none focus:border-primary resize-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sign off all */}
          {isTrainer && isActive && records.some(r => r.attended && !r.signed_off) && (
            <div className="mt-6 pt-5 border-t border-gray-100">
              <button
                onClick={() => setConfirmSignOff(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                <CheckCircle size={16} />
                Sign Off All Attended
              </button>
            </div>
          )}
        </>
      )}

      {/* Confirm remove dialog */}
      {confirmRemoveId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Remove attendee?</h3>
            <p className="text-sm text-gray-500 mb-5">This will delete their attendance record for this session.</p>
            <div className="flex gap-3">
              <button
                onClick={() => removeRecord(confirmRemoveId)}
                className="flex-1 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm sign-off dialog */}
      {confirmSignOff && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Sign off all attended?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This will sign off {records.filter(r => r.attended && !r.signed_off).length} member(s) who attended this session.
            </p>
            <div className="flex gap-3">
              <button
                onClick={signOffAll}
                disabled={signingOff}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {signingOff ? 'Signing off…' : 'Sign Off All'}
              </button>
              <button
                onClick={() => setConfirmSignOff(false)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
