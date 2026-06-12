import { useEffect, useState } from 'react'
import { Copy, Trash2, Users, Zap, Lock, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface MemberOption {
  id: string
  name: string
  firstName: string
}

interface Team {
  id: string
  driver_id: string
  crew_id: string
  wave_number: number | null
  lane_number: number | null
}

interface DrawConfig {
  id: string
  waves_count: number
  lanes_count: number
}

interface Props {
  sessionId: string
  clubId: string
  clubName: string
  sessionTitle: string
  sessionDate: string
  attendingMemberIds: Set<string> // kept for prop compat — draw uses irb_attendance directly
}

function formatDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function memberName(id: string, members: MemberOption[]) {
  return members.find(m => m.id === id)?.name ?? '—'
}

function memberFirst(id: string, members: MemberOption[]) {
  return members.find(m => m.id === id)?.firstName ?? '?'
}

export function WaveTeamDraw({ sessionId, clubId, clubName, sessionTitle, sessionDate }: Props) {
  const { member: currentMember } = useAuth()

  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading] = useState(true)

  const [allAttending, setAllAttending] = useState<MemberOption[]>([])
  const [allMembers, setAllMembers] = useState<MemberOption[]>([])
  const [driverIds, setDriverIds] = useState<Set<string>>(new Set())
  const [crewIds, setCrewIds] = useState<Set<string>>(new Set())

  const [teams, setTeams] = useState<Team[]>([])
  const [drawConfig, setDrawConfig] = useState<DrawConfig | null>(null)
  const [partners, setPartners] = useState<{ driver_id: string; crew_id: string }[]>([])

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [building, setBuilding] = useState(false)

  // Pair dialog state
  const [pairTarget, setPairTarget] = useState<string | null>(null)
  const [pairWith, setPairWith] = useState<string>('')
  const [pairRole, setPairRole] = useState<'driver' | 'crew'>('driver')

  useEffect(() => { loadAll() }, [sessionId, clubId])

  async function loadAll() {
    setLoading(true)

    const rolesQ = currentMember
      ? supabase.from('roles').select('role_name').eq('member_id', currentMember.id).eq('club_id', clubId).eq('is_active', true)
      : Promise.resolve({ data: [] as { role_name: string }[], error: null })

    const [membersRes, attendanceRes, qualsRes, teamsRes, configRes, partnersRes, rolesRes] =
      await Promise.all([
        supabase.from('members').select('id, first_name, last_name, preferred_name').eq('club_id', clubId),
        supabase.from('irb_attendance').select('member_id').eq('session_id', sessionId).eq('club_id', clubId).eq('attended', true),
        // Single query for both IRB-D and IRB-C — filter by code client-side to avoid
        // unreliable cross-table .eq() filter on embedded PostgREST resources
        supabase.from('member_qualifications')
          .select('member_id, qualifications!inner(code)')
          .eq('club_id', clubId)
          .eq('status', 'current'),
        supabase.from('irb_session_teams').select('id, driver_id, crew_id, wave_number, lane_number').eq('session_id', sessionId).eq('club_id', clubId),
        supabase.from('irb_session_draw_configs').select('id, waves_count, lanes_count').eq('session_id', sessionId).eq('club_id', clubId).maybeSingle(),
        supabase.from('irb_member_partners').select('driver_id, crew_id').eq('club_id', clubId),
        rolesQ,
      ])

    const memberList: MemberOption[] = (membersRes.data ?? []).map((m: any) => {
      const display = m.preferred_name
        ? `${m.preferred_name} ${m.last_name}`
        : `${m.first_name} ${m.last_name}`
      return { id: m.id, name: display, firstName: m.preferred_name || m.first_name || display.split(' ')[0] }
    })
    setAllMembers(memberList)

    const attendedIds = new Set((attendanceRes.data ?? []).map((a: any) => a.member_id as string))
    setAllAttending(memberList.filter(m => attendedIds.has(m.id)))

    const allQuals: { member_id: string; qualifications: { code: string } }[] = qualsRes.data ?? []
    const newDriverIds = new Set(allQuals.filter(r => r.qualifications?.code === 'IRB-D').map(r => r.member_id))
    const newCrewIds = new Set(allQuals.filter(r => r.qualifications?.code === 'IRB-C').map(r => r.member_id))
    console.log(`[WaveTeamDraw] quals loaded: ${allQuals.length} rows | drivers (IRB-D): ${newDriverIds.size} | crew (IRB-C): ${newCrewIds.size}`)
    setDriverIds(newDriverIds)
    setCrewIds(newCrewIds)

    setTeams(
      (teamsRes.data ?? []).map((t: any) => ({
        id: t.id,
        driver_id: t.driver_id ?? '',
        crew_id: t.crew_id ?? '',
        wave_number: t.wave_number ?? null,
        lane_number: t.lane_number ?? null,
      }))
    )

    const cfg = (configRes as any).data
    setDrawConfig(cfg ? { id: cfg.id, waves_count: cfg.waves_count, lanes_count: cfg.lanes_count } : null)

    setPartners(
      (partnersRes.data ?? []).map((p: any) => ({ driver_id: p.driver_id, crew_id: p.crew_id }))
    )

    const roles = ((rolesRes as any).data ?? []).map((r: any) => r.role_name as string)
    setIsTrainer(roles.includes('irb_trainer') || roles.includes('club_admin'))

    setLoading(false)
  }

  // ── Derived ──
  const benchTeams = teams.filter(t => t.wave_number == null)
  const gridTeams = teams.filter(t => t.wave_number != null)
  const teamCount = teams.length

  const membersInTeams = new Set(teams.flatMap(t => [t.driver_id, t.crew_id].filter(Boolean)))
  const unpartnered = allAttending.filter(m => !membersInTeams.has(m.id))

  const gridMap = new Map<string, Team>()
  for (const t of gridTeams) {
    gridMap.set(`${t.wave_number}-${t.lane_number}`, t)
  }

  // Wave × lane options: all combos from 1×1 to 10×10 where slots is between teamCount and teamCount+10
  const waveOptions: { waves: number; lanes: number; slots: number }[] = []
  for (let w = 1; w <= 10; w++) {
    for (let l = 1; l <= 10; l++) {
      const slots = w * l
      if (slots >= teamCount && slots <= teamCount + 10) {
        waveOptions.push({ waves: w, lanes: l, slots })
      }
    }
  }
  // Always include current config even if outside range
  if (drawConfig) {
    const exists = waveOptions.some(o => o.waves === drawConfig.waves_count && o.lanes === drawConfig.lanes_count)
    if (!exists) {
      waveOptions.unshift({ waves: drawConfig.waves_count, lanes: drawConfig.lanes_count, slots: drawConfig.waves_count * drawConfig.lanes_count })
    }
  }
  waveOptions.sort((a, b) => a.slots - b.slots || a.waves - b.waves)

  const selectedTeam = teams.find(t => t.id === selectedTeamId) ?? null

  // ── Actions ──

  async function clearAll() {
    if (!confirm('Remove all teams and the wave draw for this session? This cannot be undone.')) return
    setClearing(true)
    await supabase.from('irb_session_teams').delete().eq('session_id', sessionId).eq('club_id', clubId)
    if (drawConfig) {
      await supabase.from('irb_session_draw_configs').delete().eq('session_id', sessionId).eq('club_id', clubId)
    }
    setTeams([])
    setDrawConfig(null)
    setSelectedTeamId(null)
    setClearing(false)
  }

  async function buildConfirmedPairs() {
    setBuilding(true)
    // Clear existing teams and config
    await supabase.from('irb_session_teams').delete().eq('session_id', sessionId).eq('club_id', clubId)
    if (drawConfig) {
      await supabase.from('irb_session_draw_configs').delete().eq('session_id', sessionId).eq('club_id', clubId)
      setDrawConfig(null)
    }

    const attendedIds = new Set(allAttending.map(m => m.id))
    const validPairs = partners.filter(p => attendedIds.has(p.driver_id) && attendedIds.has(p.crew_id))
    if (validPairs.length === 0) { setTeams([]); setBuilding(false); return }

    const inserts = validPairs.map(p => ({
      club_id: clubId, session_id: sessionId,
      driver_id: p.driver_id || null, crew_id: p.crew_id || null,
      wave_number: null, lane_number: null,
      boat_id: null, patient_id: null, notes: null,
    }))
    const { data } = await supabase.from('irb_session_teams').insert(inserts).select('id, driver_id, crew_id, wave_number, lane_number')
    setTeams(
      (data ?? []).map((t: any) => ({ id: t.id, driver_id: t.driver_id ?? '', crew_id: t.crew_id ?? '', wave_number: null, lane_number: null }))
    )
    setSelectedTeamId(null)
    setBuilding(false)
  }

  async function buildAutoPair() {
    setBuilding(true)
    await supabase.from('irb_session_teams').delete().eq('session_id', sessionId).eq('club_id', clubId)
    if (drawConfig) {
      await supabase.from('irb_session_draw_configs').delete().eq('session_id', sessionId).eq('club_id', clubId)
      setDrawConfig(null)
    }

    const attendedIds = new Set(allAttending.map(m => m.id))

    // Step 1: confirmed pairs from saved partners where both attending
    const confirmedPairs: { driver_id: string; crew_id: string }[] = partners.filter(
      p => attendedIds.has(p.driver_id) && attendedIds.has(p.crew_id)
    )
    const usedIds = new Set(confirmedPairs.flatMap(p => [p.driver_id, p.crew_id]))

    // Step 2: pair remaining by qualification — drivers (IRB-D) with crew (IRB-C)
    const remainingDrivers = allAttending.filter(m => driverIds.has(m.id) && !usedIds.has(m.id))
    const remainingCrews = allAttending.filter(m => crewIds.has(m.id) && !usedIds.has(m.id))
    const usedCrewIds = new Set<string>()
    const autoPairs: { driver_id: string; crew_id: string }[] = []

    for (const d of remainingDrivers) {
      const c = remainingCrews.find(cr => !usedCrewIds.has(cr.id) && cr.id !== d.id)
      if (c) {
        autoPairs.push({ driver_id: d.id, crew_id: c.id })
        usedCrewIds.add(c.id)
        usedIds.add(d.id)
        usedIds.add(c.id)
      } else {
        autoPairs.push({ driver_id: d.id, crew_id: '' })
        usedIds.add(d.id)
      }
    }
    for (const c of remainingCrews) {
      if (!usedCrewIds.has(c.id)) {
        autoPairs.push({ driver_id: '', crew_id: c.id })
        usedIds.add(c.id)
      }
    }
    // Step 3: pair remaining unqualified members together by attendance order
    const others = allAttending.filter(m => !usedIds.has(m.id))
    for (let i = 0; i < others.length; i += 2) {
      if (i + 1 < others.length) {
        autoPairs.push({ driver_id: others[i].id, crew_id: others[i + 1].id })
      } else {
        autoPairs.push({ driver_id: others[i].id, crew_id: '' })
      }
    }

    const allPairs = [...confirmedPairs, ...autoPairs]
    if (allPairs.length === 0) { setTeams([]); setBuilding(false); return }

    const inserts = allPairs.map(p => ({
      club_id: clubId, session_id: sessionId,
      driver_id: p.driver_id || null, crew_id: p.crew_id || null,
      wave_number: null, lane_number: null,
      boat_id: null, patient_id: null, notes: null,
    }))
    const { data } = await supabase.from('irb_session_teams').insert(inserts).select('id, driver_id, crew_id, wave_number, lane_number')
    setTeams(
      (data ?? []).map((t: any) => ({ id: t.id, driver_id: t.driver_id ?? '', crew_id: t.crew_id ?? '', wave_number: null, lane_number: null }))
    )
    setSelectedTeamId(null)
    setBuilding(false)
  }

  async function selectConfig(waves: number, lanes: number) {
    if (!isTrainer) return
    let cfg: DrawConfig
    if (drawConfig) {
      const { data } = await supabase
        .from('irb_session_draw_configs')
        .update({ waves_count: waves, lanes_count: lanes })
        .eq('id', drawConfig.id)
        .select()
        .single()
      cfg = { id: data.id, waves_count: data.waves_count, lanes_count: data.lanes_count }
    } else {
      const { data } = await supabase
        .from('irb_session_draw_configs')
        .insert({ club_id: clubId, session_id: sessionId, waves_count: waves, lanes_count: lanes })
        .select()
        .single()
      cfg = { id: data.id, waves_count: data.waves_count, lanes_count: data.lanes_count }
    }
    setDrawConfig(cfg)

    // Move placed teams that are now outside the new grid back to bench
    const outOfBounds = teams.filter(
      t => t.wave_number != null && (t.wave_number > waves || t.lane_number! > lanes)
    )
    if (outOfBounds.length > 0) {
      await Promise.all(
        outOfBounds.map(t =>
          supabase.from('irb_session_teams').update({ wave_number: null, lane_number: null }).eq('id', t.id)
        )
      )
      setTeams(prev =>
        prev.map(t =>
          outOfBounds.find(o => o.id === t.id) ? { ...t, wave_number: null, lane_number: null } : t
        )
      )
    }
  }

  async function handleGridSlotClick(wave: number, lane: number) {
    if (!isTrainer || !selectedTeamId) return
    const occupied = gridMap.get(`${wave}-${lane}`)
    const sel = teams.find(t => t.id === selectedTeamId)
    if (!sel) return

    if (!occupied) {
      // Place selected team in empty slot
      await supabase.from('irb_session_teams').update({ wave_number: wave, lane_number: lane }).eq('id', selectedTeamId)
      setTeams(prev => prev.map(t => t.id === selectedTeamId ? { ...t, wave_number: wave, lane_number: lane } : t))
    } else if (occupied.id !== selectedTeamId) {
      // Swap: move selected to this slot, occupied to selected's old slot
      const oldWave = sel.wave_number
      const oldLane = sel.lane_number
      await Promise.all([
        supabase.from('irb_session_teams').update({ wave_number: wave, lane_number: lane }).eq('id', selectedTeamId),
        supabase.from('irb_session_teams').update({ wave_number: oldWave, lane_number: oldLane }).eq('id', occupied.id),
      ])
      setTeams(prev =>
        prev.map(t => {
          if (t.id === selectedTeamId) return { ...t, wave_number: wave, lane_number: lane }
          if (t.id === occupied.id) return { ...t, wave_number: oldWave, lane_number: oldLane }
          return t
        })
      )
    }
    setSelectedTeamId(null)
  }

  async function removeTeam(teamId: string) {
    await supabase.from('irb_session_teams').delete().eq('id', teamId)
    setTeams(prev => prev.filter(t => t.id !== teamId))
    if (selectedTeamId === teamId) setSelectedTeamId(null)
  }

  async function addSolo(memberId: string) {
    const isDriver = driverIds.has(memberId)
    const isCrew = crewIds.has(memberId)
    const payload = {
      club_id: clubId, session_id: sessionId,
      driver_id: isDriver ? memberId : (!isCrew ? memberId : null),
      crew_id: isCrew && !isDriver ? memberId : null,
      wave_number: null, lane_number: null,
      boat_id: null, patient_id: null, notes: null,
    }
    const { data } = await supabase.from('irb_session_teams').insert(payload).select('id, driver_id, crew_id, wave_number, lane_number').single()
    if (data) setTeams(prev => [...prev, { id: data.id, driver_id: data.driver_id ?? '', crew_id: data.crew_id ?? '', wave_number: null, lane_number: null }])
    setPairTarget(null)
  }

  async function pairMembers(targetId: string, withId: string, targetRole: 'driver' | 'crew') {
    const driver_id = targetRole === 'driver' ? targetId : withId
    const crew_id = targetRole === 'crew' ? targetId : withId
    const payload = {
      club_id: clubId, session_id: sessionId,
      driver_id: driver_id || null, crew_id: crew_id || null,
      wave_number: null, lane_number: null,
      boat_id: null, patient_id: null, notes: null,
    }
    const { data } = await supabase.from('irb_session_teams').insert(payload).select('id, driver_id, crew_id, wave_number, lane_number').single()
    if (data) setTeams(prev => [...prev, { id: data.id, driver_id: data.driver_id ?? '', crew_id: data.crew_id ?? '', wave_number: null, lane_number: null }])
    setPairTarget(null)
  }

  async function shareDraw() {
    if (!drawConfig) return
    const lines: string[] = [`${clubName} — ${sessionTitle}`, formatDate(sessionDate), '']
    for (let w = 1; w <= drawConfig.waves_count; w++) {
      lines.push(`Wave ${w}:`)
      for (let l = 1; l <= drawConfig.lanes_count; l++) {
        const t = gridMap.get(`${w}-${l}`)
        const dName = t?.driver_id ? memberName(t.driver_id, allMembers) : null
        const cName = t?.crew_id ? memberName(t.crew_id, allMembers) : null
        const parts = [dName, cName].filter(Boolean).join(' + ')
        lines.push(`  L${l}: ${parts || '—'}`)
      }
      lines.push('')
    }
    await navigator.clipboard.writeText(lines.join('\n'))
    setShareToast(true)
    setTimeout(() => setShareToast(false), 2500)
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading draw…</div>

  return (
    <>
      <div className="space-y-6">

        {/* ── Stats bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-500">
              <span className="text-2xl font-bold text-slate-900 leading-none">{allAttending.length}</span>
              <span className="ml-1">attending</span>
            </div>
            <div className="w-px h-5 bg-slate-200" />
            <div className="text-sm text-slate-500">
              <span className="text-2xl font-bold text-slate-900 leading-none">{teamCount}</span>
              <span className="ml-1">teams</span>
            </div>
            {unpartnered.length > 0 && (
              <>
                <div className="w-px h-5 bg-slate-200" />
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-700">
                  <AlertTriangle size={12} />
                  {unpartnered.length} unpartnered
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 relative">
            {drawConfig && (
              <button
                onClick={shareDraw}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
              >
                <Copy size={13} />
                Share
              </button>
            )}
            {shareToast && (
              <span className="absolute right-0 -bottom-9 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-sm z-10">
                Copied to clipboard!
              </span>
            )}
            {isTrainer && (
              <button
                onClick={clearAll}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 size={13} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Build Teams ── */}
        {isTrainer && (
          <div>
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Build Teams</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={buildConfirmedPairs}
                disabled={building || partners.length === 0}
                className="flex items-center gap-2 px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:border-slate-400 hover:bg-slate-50 transition disabled:opacity-50"
                title={partners.length === 0 ? 'No saved partner pairs — add pairs in Settings' : undefined}
              >
                <Users size={14} />
                Confirmed pairs
              </button>
              <button
                onClick={buildAutoPair}
                disabled={building || allAttending.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50"
              >
                <Zap size={14} />
                {building ? 'Building…' : 'Auto-pair'}
              </button>
            </div>
            {allAttending.length === 0 && (
              <p className="mt-2 text-xs text-slate-400">Mark attendance first — build teams uses irb_attendance records.</p>
            )}
          </div>
        )}

        {/* ── Unpartnered ── */}
        {unpartnered.length > 0 && isTrainer && (
          <div>
            <h3 className="text-[11px] font-semibold text-amber-600 uppercase tracking-widest mb-3">
              Unpartnered ({unpartnered.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {unpartnered.map(m => (
                <div key={m.id} className="flex items-center gap-1 pl-3 pr-1 py-1 bg-amber-50 border border-amber-200 rounded-full text-sm">
                  <span className="font-medium text-slate-800">{m.firstName}</span>
                  <button
                    onClick={() => {
                      setPairTarget(m.id)
                      setPairWith('')
                      setPairRole(driverIds.has(m.id) ? 'driver' : 'crew')
                    }}
                    className="px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 rounded-full transition"
                  >
                    Pair…
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Wave Configuration ── (only when teams exist) */}
        {isTrainer && teamCount > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Wave Configuration
            </h3>
            {waveOptions.length === 0 ? (
              <p className="text-xs text-slate-400">No valid configurations — add more teams first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {waveOptions.map(({ waves, lanes, slots }) => {
                  const empty = slots - teamCount
                  const isSelected = drawConfig?.waves_count === waves && drawConfig?.lanes_count === lanes
                  return (
                    <button
                      key={`${waves}-${lanes}`}
                      onClick={() => selectConfig(waves, lanes)}
                      className={`relative px-3 py-2 rounded-xl border-2 text-left transition ${
                        isSelected
                          ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-semibold whitespace-nowrap">
                        {waves} waves × {lanes} lanes
                      </div>
                      <div className={`text-[10px] mt-0.5 whitespace-nowrap ${
                        isSelected
                          ? 'text-blue-200'
                          : empty === 0
                          ? 'text-emerald-600 font-semibold'
                          : 'text-slate-400'
                      }`}>
                        {empty === 0 ? 'perfect fit' : `${slots} slots · ${empty} empty`}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Wave Grid ── (only when config selected) */}
        {drawConfig && (
          <div>
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Wave Draw
              {!isTrainer && (
                <span className="ml-2 inline-flex items-center gap-1 text-slate-400 normal-case tracking-normal font-normal text-xs">
                  <Lock size={10} />
                  view only
                </span>
              )}
            </h3>

            {/* Selected team hint bar */}
            {isTrainer && selectedTeam && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-[#E63329]/10 border border-[#E63329]/30 rounded-xl text-sm">
                <span className="font-semibold text-[#E63329]">
                  {[
                    selectedTeam.driver_id && memberFirst(selectedTeam.driver_id, allMembers),
                    selectedTeam.crew_id && memberFirst(selectedTeam.crew_id, allMembers),
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                </span>
                <span className="text-slate-500 text-xs">selected — tap a slot to place</span>
                <button
                  onClick={() => setSelectedTeamId(null)}
                  className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Deselect
                </button>
              </div>
            )}

            <div className="space-y-5">
              {Array.from({ length: drawConfig.waves_count }, (_, wi) => {
                const wave = wi + 1
                return (
                  <div key={wave}>
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">
                      Wave {wave}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: drawConfig.lanes_count }, (_, li) => {
                        const lane = li + 1
                        const team = gridMap.get(`${wave}-${lane}`)
                        const isSelectedHere = team != null && selectedTeamId === team.id
                        const hasSelection = selectedTeamId != null

                        return (
                          <button
                            key={lane}
                            onClick={() => {
                              if (!isTrainer) return
                              if (team && selectedTeamId === team.id) {
                                // Clicking the selected team's slot deselects it
                                setSelectedTeamId(null)
                              } else if (team && !hasSelection) {
                                // Click placed team with no selection → select it to move
                                setSelectedTeamId(team.id)
                              } else {
                                // Place or swap
                                handleGridSlotClick(wave, lane)
                              }
                            }}
                            className={`flex flex-col items-start min-w-[88px] px-3 py-2.5 rounded-xl border-2 transition text-left ${
                              isSelectedHere
                                ? 'bg-[#E63329] border-[#E63329] text-white'
                                : team
                                ? hasSelection
                                  ? 'bg-white border-slate-300 hover:border-[#E63329] text-slate-800 cursor-pointer'
                                  : 'bg-white border-slate-200 text-slate-800 cursor-pointer'
                                : hasSelection
                                ? 'bg-slate-50 border-dashed border-[#1e3a5f]/40 hover:border-[#1e3a5f] hover:bg-slate-100 cursor-pointer'
                                : 'bg-slate-50 border-dashed border-slate-200 cursor-default'
                            }`}
                          >
                            <div className="text-[10px] font-bold text-slate-400 mb-1">L{lane}</div>
                            {team ? (
                              <div className="text-xs font-semibold leading-snug">
                                {team.driver_id && (
                                  <div className={isSelectedHere ? 'text-white' : 'text-slate-900'}>
                                    {memberFirst(team.driver_id, allMembers)}
                                  </div>
                                )}
                                {team.crew_id && (
                                  <div className={isSelectedHere ? 'text-white/80' : 'text-slate-500'}>
                                    {memberFirst(team.crew_id, allMembers)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-300">—</div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Bench (unplaced teams) ── */}
        {benchTeams.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Bench ({benchTeams.length})
              {drawConfig && isTrainer && (
                <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">
                  — tap a team, then tap a grid slot to place it
                </span>
              )}
            </h3>
            <div className="flex flex-wrap gap-2">
              {benchTeams.map(t => {
                const isSelected = selectedTeamId === t.id
                const label = [
                  t.driver_id && memberFirst(t.driver_id, allMembers),
                  t.crew_id && memberFirst(t.crew_id, allMembers),
                ]
                  .filter(Boolean)
                  .join(' + ')
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-full border-2 transition ${
                      isTrainer ? 'cursor-pointer' : ''
                    } ${
                      isSelected
                        ? 'bg-[#E63329] border-[#E63329] text-white'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                    }`}
                    onClick={() => isTrainer && setSelectedTeamId(isSelected ? null : t.id)}
                  >
                    <span className="text-sm font-semibold">{label || '(empty)'}</span>
                    {isTrainer && (
                      <button
                        onClick={e => { e.stopPropagation(); removeTeam(t.id) }}
                        className={`ml-1 p-1 rounded-full transition ${
                          isSelected
                            ? 'hover:bg-white/20 text-white'
                            : 'text-slate-400 hover:text-red-400 hover:bg-slate-100'
                        }`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Empty states ── */}
        {teamCount === 0 && allAttending.length === 0 && (
          <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200">
            No members marked as attended yet. Mark attendance in the Attendance tab first.
          </p>
        )}
        {teamCount === 0 && allAttending.length > 0 && isTrainer && (
          <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200">
            Use "Confirmed pairs" or "Auto-pair" above to build teams from the {allAttending.length} attending members.
          </p>
        )}
        {teamCount === 0 && allAttending.length > 0 && !isTrainer && (
          <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200">
            No wave draw has been created for this session yet.
          </p>
        )}
      </div>

      {/* ── Pair dialog ── */}
      {pairTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40">
          <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900">
                  Pair {allMembers.find(m => m.id === pairTarget)?.firstName}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Choose a partner or add solo</div>
              </div>
              <button
                onClick={() => setPairTarget(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  This member's role
                </label>
                <div className="flex gap-2">
                  {(['driver', 'crew'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setPairRole(r)}
                      className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition ${
                        pairRole === r
                          ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {r === 'driver' ? 'Driver (IRB-D)' : 'Crew (IRB-C)'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Pair with
                </label>
                <select
                  value={pairWith}
                  onChange={e => setPairWith(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">— choose partner —</option>
                  <optgroup label="Unpartnered">
                    {allAttending
                      .filter(m => m.id !== pairTarget && !membersInTeams.has(m.id))
                      .map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </optgroup>
                  <optgroup label="Already in a team (going twice)">
                    {allAttending
                      .filter(m => m.id !== pairTarget && membersInTeams.has(m.id))
                      .map(m => (
                        <option key={m.id} value={m.id}>{m.name} ★</option>
                      ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => addSolo(pairTarget)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition"
              >
                Add solo
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setPairTarget(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => pairWith && pairMembers(pairTarget, pairWith, pairRole)}
                disabled={!pairWith}
                className="px-4 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                Pair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
