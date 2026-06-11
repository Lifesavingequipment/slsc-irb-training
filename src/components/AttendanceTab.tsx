import { useEffect, useState, useRef, useMemo } from 'react'
import { Trash2, Star, CheckCircle, Search, Users, UserCheck } from 'lucide-react'
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
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [confirmSignOff, setConfirmSignOff] = useState(false)
  const [signingOff, setSigningOff] = useState(false)

  // Quick mark state
  const [quickSearch, setQuickSearch] = useState('')
  const [quickMemberId, setQuickMemberId] = useState('')
  const [quickDropdownOpen, setQuickDropdownOpen] = useState(false)
  const [quickMarking, setQuickMarking] = useState(false)
  const quickRef = useRef<HTMLDivElement>(null)

  // Track which records haven't been explicitly marked yet
  // (initialised from DB: all attended=false records start as "not yet marked")
  const [unmarkedIds, setUnmarkedIds] = useState<Set<string>>(new Set())

  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const recordsRef = useRef<AttendanceRecord[]>([])

  const isActive = sessionStatus === 'active' || sessionStatus === 'completed'

  useEffect(() => {
    recordsRef.current = records
  }, [records])

  useEffect(() => {
    loadData()
  }, [sessionId, clubId, currentMemberId])

  // Close quick-search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setQuickDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

    // All attended=false records start as "not yet marked" until trainer acts
    setUnmarkedIds(new Set(recs.filter(r => !r.attended).map(r => r.id)))

    setLoading(false)
  }

  // RSVP lookup by member id
  const rsvpMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rsvps) map.set(r.member_id, r.rsvp_status)
    return map
  }, [rsvps])

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

  // Quick mark: add a member with an explicit present/absent value
  async function quickMark(attended: boolean) {
    if (!quickMemberId) return
    const member = allMembers.find(m => m.id === quickMemberId)
    if (!member) return

    setQuickMarking(true)
    const { data } = await supabase
      .from('irb_attendance')
      .insert({
        club_id: clubId,
        session_id: sessionId,
        member_id: quickMemberId,
        attended,
        signed_off: false,
      })
      .select()
      .single()

    if (data) {
      const newRec: AttendanceRecord = {
        ...data,
        memberName: member.name,
        initials: member.initials,
      }
      setRecords(prev => [...prev, newRec])
      // Explicitly marked — do NOT add to unmarkedIds
    }

    setQuickMemberId('')
    setQuickSearch('')
    setQuickDropdownOpen(false)
    setQuickMarking(false)
  }

  function markExplicit(id: string) {
    setUnmarkedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function updateRecord(id: string, field: string, value: unknown) {
    if (field === 'attended') markExplicit(id)
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

  async function removeRecord(id: string) {
    await supabase.from('irb_attendance').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
    setUnmarkedIds(prev => { const s = new Set(prev); s.delete(id); return s })
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
  const presentCount = records.filter(r => r.attended).length
  const absentCount = records.filter(r => !r.attended && !unmarkedIds.has(r.id)).length
  const unmarkedCount = records.filter(r => !r.attended && unmarkedIds.has(r.id)).length
  const signedOffCount = records.filter(r => r.signed_off).length

  const existingMemberIds = new Set(records.map(r => r.member_id))

  // Members available for quick mark (not already in list)
  const quickOptions = allMembers.filter(
    m => !existingMemberIds.has(m.id) &&
      (quickSearch === '' || m.name.toLowerCase().includes(quickSearch.toLowerCase()))
  )

  const selectedQuickMember = allMembers.find(m => m.id === quickMemberId)

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Quick mark section (trainer only) ── */}
      {isTrainer && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <UserCheck size={13} />
            Mark Attendance
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Searchable member picker */}
            <div ref={quickRef} className="relative flex-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl focus-within:border-gray-400 transition">
                <Search size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Find a member…"
                  value={quickSearch}
                  onChange={e => {
                    setQuickSearch(e.target.value)
                    setQuickMemberId('')
                    setQuickDropdownOpen(true)
                  }}
                  onFocus={() => setQuickDropdownOpen(true)}
                  className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400 min-w-0"
                />
                {(quickSearch || quickMemberId) && (
                  <button
                    onClick={() => { setQuickSearch(''); setQuickMemberId(''); setQuickDropdownOpen(false) }}
                    className="text-gray-300 hover:text-gray-500 transition text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>

              {quickDropdownOpen && quickSearch.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden max-h-56 overflow-y-auto">
                  {quickOptions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">
                      {existingMemberIds.size > 0 && allMembers.some(m => m.name.toLowerCase().includes(quickSearch.toLowerCase()) && existingMemberIds.has(m.id))
                        ? 'Already in attendance list'
                        : 'No members found'}
                    </div>
                  ) : (
                    quickOptions.map(m => (
                      <button
                        key={m.id}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setQuickMemberId(m.id)
                          setQuickSearch(m.name)
                          setQuickDropdownOpen(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition"
                      >
                        <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0">
                          {m.initials}
                        </span>
                        <span className="text-gray-800">{m.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Present / Absent buttons */}
            <div className="flex gap-2 sm:flex-shrink-0">
              <button
                onClick={() => quickMark(true)}
                disabled={!quickMemberId || quickMarking}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              >
                {quickMarking ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Present'
                )}
              </button>
              <button
                onClick={() => quickMark(false)}
                disabled={!quickMemberId || quickMarking}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              >
                Absent
              </button>
            </div>
          </div>

          {selectedQuickMember && (
            <p className="mt-2 text-xs text-gray-400">
              Ready to mark <span className="font-semibold text-gray-600">{selectedQuickMember.name}</span> — tap Present or Absent
            </p>
          )}
        </div>
      )}

      {/* ── Pre-load from RSVPs ── */}
      {isTrainer && (
        <div className="flex items-center gap-3 flex-wrap">
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
        </div>
      )}

      {/* ── Attendance list ── */}
      {visibleRecords.length === 0 ? (
        <div className="text-center py-10">
          <Users size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            No attendance records yet.{' '}
            {isTrainer ? 'Use "Mark Attendance" above to add members, or pre-load from RSVPs.' : ''}
          </p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          {isTrainer && (
            <div className="flex flex-wrap gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-sm font-bold text-gray-900">{records.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-sm text-gray-500">Present</span>
                <span className="text-sm font-bold text-emerald-600">{presentCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                <span className="text-sm text-gray-500">Absent</span>
                <span className="text-sm font-bold text-gray-600">{absentCount}</span>
              </div>
              {unmarkedCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-sm text-gray-500">Not yet marked</span>
                  <span className="text-sm font-bold text-amber-600">{unmarkedCount}</span>
                </div>
              )}
              {signedOffCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                  <span className="text-sm text-gray-500">Signed off</span>
                  <span className="text-sm font-bold text-blue-600">{signedOffCount}</span>
                </div>
              )}
            </div>
          )}

          {/* Attendance rows */}
          <div className="space-y-2.5">
            {visibleRecords.map(rec => {
              const canEdit = isTrainer || rec.member_id === currentMemberId
              const isSaving = savingIds.has(rec.id)
              const isSaved = savedIds.has(rec.id)
              const isUnmarked = unmarkedIds.has(rec.id)
              const rsvpStatus = rsvpMap.get(rec.member_id)

              // Row left-border style based on state
              let rowClass = 'border-gray-200 bg-white border-l-4 border-l-gray-200'
              if (rec.attended) {
                rowClass = 'border-gray-200 bg-emerald-50/50 border-l-4 border-l-emerald-400'
              } else if (!isUnmarked) {
                rowClass = 'border-gray-200 bg-white border-l-4 border-l-gray-400'
              }

              return (
                <div key={rec.id} className={`rounded-xl border p-4 transition ${rowClass}`}>
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {rec.initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name row */}
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-gray-900 text-sm">{rec.memberName}</span>

                          {/* RSVP badge */}
                          {rsvpStatus === 'attending' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Going</span>
                          )}
                          {rsvpStatus === 'not_attending' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Not Going</span>
                          )}
                          {!rsvpStatus && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full font-medium">No RSVP</span>
                          )}

                          {isSaving && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
                          {isSaved && !isSaving && <span className="text-xs text-emerald-500 font-medium">Saved</span>}
                          {rec.signed_off && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">Signed off</span>
                          )}
                        </div>
                        {isTrainer && (
                          <button
                            onClick={() => setConfirmRemoveId(rec.id)}
                            className="text-gray-300 hover:text-red-400 transition flex-shrink-0 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      {/* Attended toggle — prominent Present/Absent segmented control */}
                      {canEdit && (
                        <div className="mb-3">
                          <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit min-h-[44px]">
                            <button
                              onClick={() => updateRecord(rec.id, 'attended', true)}
                              disabled={!isActive && !isTrainer}
                              className={`px-5 py-2 text-sm font-semibold transition min-h-[44px] ${
                                rec.attended
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-white text-gray-400 hover:bg-gray-50'
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              Present
                            </button>
                            <div className="w-px bg-gray-200" />
                            <button
                              onClick={() => updateRecord(rec.id, 'attended', false)}
                              disabled={!isActive && !isTrainer}
                              className={`px-5 py-2 text-sm font-semibold transition min-h-[44px] ${
                                !rec.attended && !isUnmarked
                                  ? 'bg-gray-500 text-white'
                                  : 'bg-white text-gray-400 hover:bg-gray-50'
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              Absent
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Detail fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                        {/* Role on day */}
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Role on day</label>
                          {canEdit ? (
                            <select
                              value={rec.role_on_day ?? ''}
                              onChange={e => updateRecord(rec.id, 'role_on_day', e.target.value || null)}
                              className="w-full text-sm border border-gray-200 rounded-md px-2 py-3 sm:py-1.5 bg-white outline-none focus:border-primary min-h-[44px] sm:min-h-0"
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
                              className="w-full text-sm border border-gray-200 rounded-md px-2 py-3 sm:py-1.5 bg-white outline-none focus:border-primary min-h-[44px] sm:min-h-0"
                            />
                          ) : (
                            <span className="text-sm text-gray-700">{rec.arrived_at ?? '—'}</span>
                          )}
                        </div>

                        {/* Performance rating — trainer only */}
                        {isTrainer && (
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Performance</label>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button
                                  key={star}
                                  onClick={() => updateRecord(rec.id, 'performance_rating', rec.performance_rating === star ? null : star)}
                                  className={`flex items-center justify-center w-9 h-9 sm:w-7 sm:h-7 transition ${star <= (rec.performance_rating ?? 0) ? 'text-amber-400' : 'text-gray-200'} hover:text-amber-300`}
                                >
                                  <Star size={20} fill={star <= (rec.performance_rating ?? 0) ? 'currentColor' : 'none'} />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Signed off toggle — trainer only */}
                        {isTrainer && (
                          <div>
                            <label className="text-xs text-gray-400 mb-1.5 block">Signed off</label>
                            <div className="flex items-center min-h-[44px]">
                              <button
                                onClick={() => updateRecord(rec.id, 'signed_off', !rec.signed_off)}
                                className={`relative flex items-center w-14 h-8 rounded-full transition-colors ${rec.signed_off ? 'bg-blue-500' : 'bg-gray-200'}`}
                              >
                                <span className={`absolute w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${rec.signed_off ? 'translate-x-7' : 'translate-x-1'}`} />
                              </button>
                            </div>
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
            <div className="pt-5 border-t border-gray-100">
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-sm shadow-xl">
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-sm shadow-xl">
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
