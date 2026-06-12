import { useEffect, useState, useRef } from 'react'
import { Printer, Trash2, Copy, Zap, Users, X, Settings2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface MemberOption {
  id: string
  name: string       // full name for dropdowns / print
  firstName: string  // first name for availability chips
}

interface BoatOption {
  id: string
  name: string
  identifier: string | null
}

interface CellData {
  dbId: string | null
  boat_id: string
  driver_id: string
  crew_id: string
  patient_id: string
  notes: string
}

type CellKey = string

interface Props {
  sessionId: string
  clubId: string
  clubName: string
  sessionTitle: string
  sessionDate: string
  attendingMemberIds: Set<string> // kept for prop compat — draw uses irb_attendance directly
}

const EMPTY_CELL: CellData = {
  dbId: null, boat_id: '', driver_id: '', crew_id: '', patient_id: '', notes: '',
}

const MAX_W = 10
const MAX_L = 10

// Presets: common wave×lane combos up to 10×10
const PRESETS: [number, number][] = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 2], [2, 3], [2, 4], [2, 5],
  [3, 3], [3, 4], [3, 5],
  [4, 4], [4, 5],
  [5, 5], [5, 6],
  [6, 6], [6, 8],
  [8, 8], [10, 5], [10, 10],
]

function memberFirstName(m: MemberOption) {
  return m.firstName || m.name.split(' ')[0] || m.name
}

function boatLabel(b: BoatOption) {
  return b.identifier ? `${b.name} (${b.identifier})` : b.name
}

function formatDateForPrint(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function findBestPreset(count: number): [number, number] {
  let best: [number, number] = [1, 2]
  let bestEmpty = Infinity
  for (const [w, l] of PRESETS) {
    const slots = w * l
    const empty = slots - count
    if (empty >= 0 && empty < bestEmpty) {
      bestEmpty = empty
      best = [w, l]
    }
  }
  return best
}

export function WaveTeamDraw({
  sessionId,
  clubId,
  clubName,
  sessionTitle,
  sessionDate,
}: Props) {
  const { member: currentMember } = useAuth()

  // ── Capacity inputs ──
  const [numWaves, setNumWaves] = useState(1)
  const [numLanes, setNumLanes] = useState(2)
  const [waveInput, setWaveInput] = useState('1')
  const [laneInput, setLaneInput] = useState('2')

  // ── Data ──
  const [cells, setCells] = useState<Record<CellKey, CellData>>({})
  const [savedKeys, setSavedKeys] = useState<Set<CellKey>>(new Set())
  const [boats, setBoats] = useState<BoatOption[]>([])
  const [drivers, setDrivers] = useState<MemberOption[]>([])
  const [crews, setCrews] = useState<MemberOption[]>([])
  const [allAttending, setAllAttending] = useState<MemberOption[]>([])
  const [allMembers, setAllMembers] = useState<MemberOption[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [isTrainer, setIsTrainer] = useState(false)
  const [autopairing, setAutopairing] = useState(false)
  const [shareToast, setShareToast] = useState(false)

  // ── Modals ──
  const [editModal, setEditModal] = useState<{ wave: number; lane: number } | null>(null)
  const [editData, setEditData] = useState<CellData | null>(null)

  const [pairsModal, setPairsModal] = useState(false)
  const [pendingPairs, setPendingPairs] = useState<{ driver_id: string; crew_id: string }[]>([
    { driver_id: '', crew_id: '' },
  ])
  const [creatingPairs, setCreatingPairs] = useState(false)

  const savedTimers = useRef<Record<CellKey, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    loadData()
  }, [sessionId, clubId])

  // Keep numeric state in sync with text inputs
  function applyCapacity() {
    const w = Math.max(1, Math.min(MAX_W, parseInt(waveInput) || 1))
    const l = Math.max(1, Math.min(MAX_L, parseInt(laneInput) || 1))
    setNumWaves(w)
    setNumLanes(l)
    setWaveInput(String(w))
    setLaneInput(String(l))
  }

  async function loadData() {
    setLoadingData(true)

    const rolesQuery = currentMember
      ? supabase
          .from('member_roles')
          .select('role_name')
          .eq('member_id', currentMember.id)
          .eq('club_id', clubId)
          .eq('is_active', true)
      : Promise.resolve({ data: [] as { role_name: string }[], error: null })

    const [boatsRes, irbDRes, irbCRes, membersRes, teamsRes, rolesRes, attendanceRes] =
      await Promise.all([
        supabase
          .from('irb_equipment')
          .select('id, name, identifier')
          .eq('club_id', clubId)
          .eq('equipment_type', 'boat')
          .eq('status', 'operational'),
        supabase
          .from('member_qualifications')
          .select('member_id, qualifications!inner(code)')
          .eq('club_id', clubId)
          .eq('status', 'current')
          .eq('qualifications.code', 'IRB-D'),
        supabase
          .from('member_qualifications')
          .select('member_id, qualifications!inner(code)')
          .eq('club_id', clubId)
          .eq('status', 'current')
          .eq('qualifications.code', 'IRB-C'),
        supabase
          .from('members')
          .select('id, first_name, last_name, preferred_name')
          .eq('club_id', clubId),
        supabase
          .from('irb_session_teams')
          .select('*')
          .eq('session_id', sessionId)
          .eq('club_id', clubId),
        rolesQuery,
        // ── KEY FIX: use irb_attendance instead of RSVPs ──
        supabase
          .from('irb_attendance')
          .select('member_id')
          .eq('session_id', sessionId)
          .eq('club_id', clubId)
          .eq('attended', true),
      ])

    setBoats(
      (boatsRes.data ?? []).map((b: any) => ({
        id: b.id, name: b.name, identifier: b.identifier,
      }))
    )

    const roles = ((rolesRes as any).data ?? []).map((r: any) => r.role_name as string)
    setIsTrainer(roles.includes('irb_trainer') || roles.includes('club_admin'))

    const driverIdSet = new Set(
      (irbDRes.data ?? []).map((r: any) => r.member_id as string)
    )
    const crewIdSet = new Set(
      (irbCRes.data ?? []).map((r: any) => r.member_id as string)
    )

    // Build member options with first-name extraction
    const memberList: MemberOption[] = (membersRes.data ?? []).map((m: any) => {
      const displayName = m.preferred_name
        ? `${m.preferred_name} ${m.last_name}`
        : `${m.first_name} ${m.last_name}`
      const firstName = m.preferred_name || m.first_name || displayName.split(' ')[0]
      return { id: m.id, name: displayName, firstName }
    })
    setAllMembers(memberList)

    // Members who attended this session (irb_attendance.attended = true)
    const attendedIds = new Set(
      (attendanceRes.data ?? []).map((a: any) => a.member_id as string)
    )
    const attendingList = memberList.filter(m => attendedIds.has(m.id))
    setAllAttending(attendingList)
    setDrivers(attendingList.filter(m => driverIdSet.has(m.id)))
    setCrews(attendingList.filter(m => crewIdSet.has(m.id)))

    // Restore existing draw
    const teams: any[] = teamsRes.data ?? []
    if (teams.length > 0) {
      const cellMap: Record<CellKey, CellData> = {}
      let maxWave = 0
      let maxLane = 0
      for (const t of teams) {
        const w = t.wave_number ?? 1
        const l = t.lane_number ?? 1
        maxWave = Math.max(maxWave, w)
        maxLane = Math.max(maxLane, l)
        cellMap[`${w}-${l}`] = {
          dbId: t.id,
          boat_id: t.boat_id ?? '',
          driver_id: t.driver_id ?? '',
          crew_id: t.crew_id ?? '',
          patient_id: t.patient_id ?? '',
          notes: t.notes ?? '',
        }
      }
      const w = Math.max(maxWave, 1)
      const l = Math.max(maxLane, 1)
      setNumWaves(w)
      setNumLanes(l)
      setWaveInput(String(w))
      setLaneInput(String(l))
      setCells(cellMap)
    }

    setLoadingData(false)
  }

  // ── Save helpers ──
  async function performSave(key: CellKey, wave: number, lane: number, data: CellData) {
    const payload = {
      club_id: clubId,
      session_id: sessionId,
      wave_number: wave,
      lane_number: lane,
      boat_id: data.boat_id || null,
      driver_id: data.driver_id || null,
      crew_id: data.crew_id || null,
      patient_id: data.patient_id || null,
      notes: data.notes || null,
    }
    if (data.dbId) {
      await supabase.from('irb_session_teams').update(payload).eq('id', data.dbId)
    } else {
      const { data: inserted } = await supabase
        .from('irb_session_teams')
        .insert(payload)
        .select()
        .single()
      if (inserted) {
        setCells(prev => ({ ...prev, [key]: { ...prev[key], dbId: inserted.id } }))
      }
    }
    setSavedKeys(prev => new Set([...prev, key]))
    if (savedTimers.current[key]) clearTimeout(savedTimers.current[key])
    savedTimers.current[key] = setTimeout(() => {
      setSavedKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 2000)
  }

  // Inline slot assignment — auto-saves immediately
  async function assignSlotField(
    wave: number,
    lane: number,
    field: 'driver_id' | 'crew_id',
    value: string,
  ) {
    const key: CellKey = `${wave}-${lane}`
    const existing = cells[key] ?? { ...EMPTY_CELL }
    const updated = { ...existing, [field]: value }
    setCells(prev => ({ ...prev, [key]: updated }))
    await performSave(key, wave, lane, updated)
  }

  // ── Clear ──
  async function clearDraw() {
    if (!confirm('Remove all team assignments for this session? This cannot be undone.')) return
    setClearing(true)
    await supabase
      .from('irb_session_teams')
      .delete()
      .eq('session_id', sessionId)
      .eq('club_id', clubId)
    setCells({})
    setClearing(false)
  }

  // ── Auto-pair ──
  async function autoPair() {
    setAutopairing(true)
    await supabase
      .from('irb_session_teams')
      .delete()
      .eq('session_id', sessionId)
      .eq('club_id', clubId)

    const pairs: { driver_id: string; crew_id: string }[] = []
    const usedCrews = new Set<string>()
    for (const d of drivers) {
      const c = crews.find(cr => !usedCrews.has(cr.id) && cr.id !== d.id)
      if (c) {
        pairs.push({ driver_id: d.id, crew_id: c.id })
        usedCrews.add(c.id)
      } else {
        pairs.push({ driver_id: d.id, crew_id: '' })
      }
    }
    // Any crew left over without a driver
    const usedDriverIds = new Set(pairs.map(p => p.driver_id))
    for (const c of crews) {
      if (!usedCrews.has(c.id) && !usedDriverIds.has(c.id)) {
        pairs.push({ driver_id: '', crew_id: c.id })
      }
    }

    const [bestW, bestL] = findBestPreset(pairs.length)
    setNumWaves(bestW)
    setNumLanes(bestL)
    setWaveInput(String(bestW))
    setLaneInput(String(bestL))

    const newCells: Record<CellKey, CellData> = {}
    for (let i = 0; i < pairs.length; i++) {
      const wave = Math.floor(i / bestL) + 1
      const lane = (i % bestL) + 1
      const key = `${wave}-${lane}`
      const payload = {
        club_id: clubId,
        session_id: sessionId,
        wave_number: wave,
        lane_number: lane,
        driver_id: pairs[i].driver_id || null,
        crew_id: pairs[i].crew_id || null,
        boat_id: null,
        patient_id: null,
        notes: null,
      }
      const { data: inserted } = await supabase
        .from('irb_session_teams')
        .insert(payload)
        .select()
        .single()
      newCells[key] = {
        dbId: inserted?.id ?? null,
        boat_id: '',
        driver_id: pairs[i].driver_id,
        crew_id: pairs[i].crew_id,
        patient_id: '',
        notes: '',
      }
    }
    setCells(newCells)
    setAutopairing(false)
  }

  // ── Confirmed pairs modal ──
  async function createConfirmedPairs() {
    const validPairs = pendingPairs.filter(p => p.driver_id || p.crew_id)
    if (validPairs.length === 0) return
    setCreatingPairs(true)

    const teamCount = Object.values(cells).filter(c => c.driver_id || c.crew_id).length
    const totalNeeded = teamCount + validPairs.length
    const [bestW, bestL] = findBestPreset(totalNeeded)
    setNumWaves(bestW)
    setNumLanes(bestL)
    setWaveInput(String(bestW))
    setLaneInput(String(bestL))

    const newCells = { ...cells }
    let slotIndex = 0
    for (const pair of validPairs) {
      while (slotIndex < bestW * bestL) {
        const wave = Math.floor(slotIndex / bestL) + 1
        const lane = (slotIndex % bestL) + 1
        const key = `${wave}-${lane}`
        if (!newCells[key]?.driver_id && !newCells[key]?.crew_id) {
          const payload = {
            club_id: clubId,
            session_id: sessionId,
            wave_number: wave,
            lane_number: lane,
            driver_id: pair.driver_id || null,
            crew_id: pair.crew_id || null,
            boat_id: null,
            patient_id: null,
            notes: null,
          }
          const { data: inserted } = await supabase
            .from('irb_session_teams')
            .insert(payload)
            .select()
            .single()
          newCells[key] = {
            dbId: inserted?.id ?? null,
            boat_id: '',
            driver_id: pair.driver_id,
            crew_id: pair.crew_id,
            patient_id: '',
            notes: '',
          }
          slotIndex++
          break
        }
        slotIndex++
      }
    }
    setCells(newCells)
    setPairsModal(false)
    setPendingPairs([{ driver_id: '', crew_id: '' }])
    setCreatingPairs(false)
  }

  // ── Edit modal (boat / patient / notes) ──
  function openEdit(wave: number, lane: number) {
    if (!isTrainer) return
    const key = `${wave}-${lane}`
    setEditData({ ...(cells[key] ?? EMPTY_CELL) })
    setEditModal({ wave, lane })
  }

  async function saveEditModal() {
    if (!editModal || !editData) return
    const { wave, lane } = editModal
    const key = `${wave}-${lane}`
    setCells(prev => ({ ...prev, [key]: { ...editData } }))
    await performSave(key, wave, lane, editData)
    setEditModal(null)
    setEditData(null)
  }

  async function deleteEditModal() {
    if (!editModal || !editData) return
    const { wave, lane } = editModal
    const key = `${wave}-${lane}`
    if (editData.dbId) {
      await supabase.from('irb_session_teams').delete().eq('id', editData.dbId)
    }
    setCells(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setEditModal(null)
    setEditData(null)
  }

  // ── Share ──
  async function shareDraw() {
    const lines: string[] = [`${clubName} — ${sessionTitle}`, formatDateForPrint(sessionDate), '']
    for (let w = 1; w <= numWaves; w++) {
      lines.push(`Wave ${w}:`)
      for (let l = 1; l <= numLanes; l++) {
        const cell = cells[`${w}-${l}`]
        const dName = cell?.driver_id ? (allMembers.find(m => m.id === cell.driver_id)?.name ?? '—') : null
        const cName = cell?.crew_id ? (allMembers.find(m => m.id === cell.crew_id)?.name ?? '—') : null
        const parts = [dName, cName].filter(Boolean).join(' + ')
        lines.push(`  L${l}: ${parts || '—'}`)
      }
      lines.push('')
    }
    await navigator.clipboard.writeText(lines.join('\n'))
    setShareToast(true)
    setTimeout(() => setShareToast(false), 2500)
  }

  if (loadingData) {
    return <div className="p-8 text-center text-gray-400 text-sm">Loading draw data…</div>
  }

  const teamCount = Object.values(cells).filter(c => c.driver_id || c.crew_id).length
  const [autoW, autoL] = findBestPreset(teamCount)

  // Which member IDs are already assigned as driver or crew
  const assignedDriverIds = new Set(Object.values(cells).map(c => c.driver_id).filter(Boolean))
  const assignedCrewIds = new Set(Object.values(cells).map(c => c.crew_id).filter(Boolean))

  return (
    <>
      {/* ── Screen UI ── */}
      <div className="print:hidden space-y-7">

        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <div className="text-sm text-gray-500">
              <span className="text-2xl font-bold text-gray-900 leading-none">{allAttending.length}</span>
              <span className="ml-1.5">attending</span>
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div className="text-sm text-gray-500">
              <span className="text-2xl font-bold text-gray-900 leading-none">{teamCount}</span>
              <span className="ml-1.5">teams</span>
            </div>
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              onClick={shareDraw}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              <Copy size={14} />
              Share
            </button>
            {shareToast && (
              <span className="absolute right-0 -bottom-9 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-sm">
                Copied to clipboard!
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              <Printer size={14} />
              Print
            </button>
            {isTrainer && (
              <button
                onClick={clearDraw}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 size={14} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── STEP 1: Set Capacity ── */}
        {isTrainer && (
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Step 1 — Set Capacity
            </h3>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Waves (1–{MAX_W})</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_W}
                  value={waveInput}
                  onChange={e => setWaveInput(e.target.value)}
                  onBlur={() => {
                    const v = Math.max(1, Math.min(MAX_W, parseInt(waveInput) || 1))
                    setWaveInput(String(v))
                  }}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Lanes per wave (1–{MAX_L})</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_L}
                  value={laneInput}
                  onChange={e => setLaneInput(e.target.value)}
                  onBlur={() => {
                    const v = Math.max(1, Math.min(MAX_L, parseInt(laneInput) || 1))
                    setLaneInput(String(v))
                  }}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                onClick={applyCapacity}
                className="flex items-center gap-2 px-5 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition"
              >
                Set Capacity
              </button>
            </div>

            {/* Wave configuration presets */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(([w, l]) => {
                const slots = w * l
                const empty = slots - teamCount
                const isSelected = numWaves === w && numLanes === l
                const isBestFit = autoW === w && autoL === l && !isSelected

                let subLabel: string
                let subColor: string
                if (empty === 0) {
                  subLabel = 'perfect fit'
                  subColor = isSelected ? 'text-blue-200' : 'text-emerald-600 font-semibold'
                } else if (empty > 0) {
                  subLabel = `${slots} slots · ${empty} empty`
                  subColor = isSelected ? 'text-blue-200' : 'text-gray-400'
                } else {
                  subLabel = `${slots} slots · ${-empty} over`
                  subColor = isSelected ? 'text-red-200' : 'text-red-400'
                }

                return (
                  <button
                    key={`${w}-${l}`}
                    onClick={() => {
                      setNumWaves(w)
                      setNumLanes(l)
                      setWaveInput(String(w))
                      setLaneInput(String(l))
                    }}
                    className={`relative px-3 py-2 rounded-xl border-2 text-left transition ${
                      isSelected
                        ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-snug whitespace-nowrap">
                      {w}×{l}
                    </div>
                    <div className={`text-[10px] mt-0.5 whitespace-nowrap ${subColor}`}>
                      {subLabel}
                    </div>
                    {isBestFit && (
                      <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold text-emerald-700 bg-emerald-100 rounded px-1 py-0.5 leading-none border border-emerald-200">
                        best
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── STEP 2: Available Members ── */}
        <div>
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Step 2 — Available Members
          </h3>
          {allAttending.length === 0 ? (
            <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200">
              No members marked as attended yet. Mark attendance in the Attendance tab first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Drivers column */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="text-xs font-semibold text-gray-500 mb-2">
                  Drivers (IRB-D) — {drivers.length}
                </div>
                {drivers.length === 0 ? (
                  <p className="text-xs text-gray-400">None present with IRB-D</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {drivers.map(m => {
                      const assigned = assignedDriverIds.has(m.id)
                      return (
                        <span
                          key={m.id}
                          title={m.name}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                            assigned
                              ? 'bg-gray-100 text-gray-300 border-gray-200 line-through'
                              : 'bg-white text-blue-700 border-blue-200 shadow-sm'
                          }`}
                        >
                          {memberFirstName(m)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Crew column */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="text-xs font-semibold text-gray-500 mb-2">
                  Crew (IRB-C) — {crews.length}
                </div>
                {crews.length === 0 ? (
                  <p className="text-xs text-gray-400">None present with IRB-C</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {crews.map(m => {
                      const assigned = assignedCrewIds.has(m.id)
                      return (
                        <span
                          key={m.id}
                          title={m.name}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                            assigned
                              ? 'bg-gray-100 text-gray-300 border-gray-200 line-through'
                              : 'bg-white text-emerald-700 border-emerald-200 shadow-sm'
                          }`}
                        >
                          {memberFirstName(m)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Build teams ── */}
        {isTrainer && (
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Build Teams
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPendingPairs([{ driver_id: '', crew_id: '' }])
                  setPairsModal(true)
                }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:border-gray-400 hover:bg-gray-50 transition"
              >
                <Users size={15} />
                Confirmed pairs
              </button>
              <button
                onClick={autoPair}
                disabled={autopairing || allAttending.length === 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-60"
              >
                <Zap size={15} />
                {autopairing ? 'Pairing…' : 'Auto-pair'}
              </button>
            </div>
            {allAttending.length === 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Mark attendance first — auto-pair uses irb_attendance records.
              </p>
            )}
          </div>
        )}

        {/* ── STEP 3: Wave Grid ── */}
        <div>
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Step 3 — Wave Grid
          </h3>
          <div className="space-y-6">
            {Array.from({ length: numWaves }, (_, wi) => {
              const wave = wi + 1
              return (
                <div key={wave}>
                  <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">
                    Wave {wave}
                  </div>
                  <div className="space-y-2">
                    {Array.from({ length: numLanes }, (_, li) => {
                      const lane = li + 1
                      const key = `${wave}-${lane}`
                      const cell = cells[key]
                      const isSaved = savedKeys.has(key)

                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-white"
                        >
                          <span className="text-xs font-bold text-gray-400 w-6 flex-shrink-0 tabular-nums">
                            L{lane}
                          </span>

                          {/* Driver select */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] font-semibold text-gray-400 uppercase mb-0.5">Driver</div>
                            {isTrainer ? (
                              <select
                                value={cell?.driver_id ?? ''}
                                onChange={e => assignSlotField(wave, lane, 'driver_id', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900"
                              >
                                <option value="">+ Driver</option>
                                {drivers.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={`text-sm ${cell?.driver_id ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                                {cell?.driver_id
                                  ? (allMembers.find(m => m.id === cell.driver_id)?.name ?? '—')
                                  : '—'}
                              </span>
                            )}
                          </div>

                          <div className="w-px h-8 bg-gray-100 flex-shrink-0" />

                          {/* Crew select */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] font-semibold text-gray-400 uppercase mb-0.5">Crew</div>
                            {isTrainer ? (
                              <select
                                value={cell?.crew_id ?? ''}
                                onChange={e => assignSlotField(wave, lane, 'crew_id', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900"
                              >
                                <option value="">+ Crew</option>
                                {crews.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={`text-sm ${cell?.crew_id ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                                {cell?.crew_id
                                  ? (allMembers.find(m => m.id === cell.crew_id)?.name ?? '—')
                                  : '—'}
                              </span>
                            )}
                          </div>

                          {/* Saved indicator + details button */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isSaved && (
                              <span className="text-[10px] font-semibold text-emerald-500">✓</span>
                            )}
                            {isTrainer && (
                              <button
                                onClick={() => openEdit(wave, lane)}
                                title="Edit boat / patient / notes"
                                className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-100 transition"
                              >
                                <Settings2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mobile print button */}
        <div className="sm:hidden pt-1">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            <Printer size={14} />
            Print Draw
          </button>
        </div>
      </div>

      {/* ── Edit modal (boat / patient / notes) ── */}
      {editModal && editData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                  Edit Team — Extra Details
                </div>
                <div className="text-base font-bold text-gray-900 mt-0.5">
                  Wave {editModal.wave} · Lane {editModal.lane}
                </div>
              </div>
              <button
                onClick={() => { setEditModal(null); setEditData(null) }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh]">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Driver (IRB-D)
                </label>
                <select
                  value={editData.driver_id}
                  onChange={e => setEditData(d => d ? { ...d, driver_id: e.target.value } : d)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">— Select driver —</option>
                  {drivers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Crew (IRB-C)
                </label>
                <select
                  value={editData.crew_id}
                  onChange={e => setEditData(d => d ? { ...d, crew_id: e.target.value } : d)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">— Select crew —</option>
                  {crews.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Patient (optional)
                </label>
                <select
                  value={editData.patient_id}
                  onChange={e => setEditData(d => d ? { ...d, patient_id: e.target.value } : d)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">— None —</option>
                  {allAttending.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Boat</label>
                <select
                  value={editData.boat_id}
                  onChange={e => setEditData(d => d ? { ...d, boat_id: e.target.value } : d)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">— No boat assigned —</option>
                  {boats.map(b => (
                    <option key={b.id} value={b.id}>{boatLabel(b)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Notes</label>
                <input
                  type="text"
                  value={editData.notes}
                  onChange={e => setEditData(d => d ? { ...d, notes: e.target.value } : d)}
                  placeholder="Team notes…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
              <button
                onClick={deleteEditModal}
                className="px-4 py-2.5 border border-red-200 text-red-500 rounded-xl text-sm font-semibold hover:bg-red-50 transition"
              >
                Delete
              </button>
              <div className="flex-1" />
              <button
                onClick={() => { setEditModal(null); setEditData(null) }}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveEditModal}
                className="px-4 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmed pairs modal ── */}
      {pairsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-base font-bold text-gray-900">Confirmed Pairs</div>
                <div className="text-xs text-gray-400 mt-0.5">Select driver + crew pairs to create teams</div>
              </div>
              <button
                onClick={() => setPairsModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto max-h-[55vh]">
              {pendingPairs.map((pair, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <select
                      value={pair.driver_id}
                      onChange={e => {
                        const next = [...pendingPairs]
                        next[idx] = { ...next[idx], driver_id: e.target.value }
                        setPendingPairs(next)
                      }}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Driver (IRB-D) — select</option>
                      {drivers.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <select
                      value={pair.crew_id}
                      onChange={e => {
                        const next = [...pendingPairs]
                        next[idx] = { ...next[idx], crew_id: e.target.value }
                        setPendingPairs(next)
                      }}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Crew (IRB-C) — select</option>
                      {crews.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  {pendingPairs.length > 1 && (
                    <button
                      onClick={() => setPendingPairs(prev => prev.filter((_, i) => i !== idx))}
                      className="mt-1 p-2 text-gray-300 hover:text-red-400 rounded-lg transition"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={() => setPendingPairs(prev => [...prev, { driver_id: '', crew_id: '' }])}
                className="w-full py-2.5 border-2 border-dashed border-gray-200 text-gray-400 rounded-xl text-sm font-medium hover:border-gray-300 hover:text-gray-500 transition"
              >
                + Add another pair
              </button>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setPairsModal(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={createConfirmedPairs}
                disabled={creatingPairs || pendingPairs.every(p => !p.driver_id && !p.crew_id)}
                className="px-4 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {creatingPairs ? 'Creating…' : 'Create Teams'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print view ── */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-6 print:z-[9999]">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{clubName}</div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            {sessionTitle} &middot; {formatDateForPrint(sessionDate)}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {(['Wave', 'Lane', 'Driver', 'Crew', 'Patient', 'Notes'] as const).map(h => (
                <th
                  key={h}
                  style={{
                    border: '1px solid #000',
                    padding: '6px 8px',
                    textAlign: 'left',
                    background: '#f3f4f6',
                    fontWeight: 700,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numWaves }, (_, wi) =>
              Array.from({ length: numLanes }, (_, li) => {
                const wave = wi + 1
                const lane = li + 1
                const cell = cells[`${wave}-${lane}`]
                return (
                  <tr key={`${wave}-${lane}`}>
                    <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: li === 0 ? 700 : 400, color: li === 0 ? '#000' : '#999' }}>
                      {li === 0 ? `Wave ${wave}` : ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 8px' }}>L{lane}</td>
                    <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                      {cell?.driver_id ? (allMembers.find(m => m.id === cell.driver_id)?.name ?? '—') : '—'}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                      {cell?.crew_id ? (allMembers.find(m => m.id === cell.crew_id)?.name ?? '—') : '—'}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                      {cell?.patient_id ? (allMembers.find(m => m.id === cell.patient_id)?.name ?? '') : ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 8px', fontStyle: 'italic', color: '#555' }}>
                      {cell?.notes ?? ''}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
