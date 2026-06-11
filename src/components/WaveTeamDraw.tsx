import { useEffect, useState, useRef } from 'react'
import { Printer, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface MemberOption {
  id: string
  name: string
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

type CellKey = string // `${wave}-${lane}`

interface Props {
  sessionId: string
  clubId: string
  clubName: string
  sessionTitle: string
  sessionDate: string
  attendingMemberIds: Set<string>
}

export function WaveTeamDraw({
  sessionId,
  clubId,
  clubName,
  sessionTitle,
  sessionDate,
  attendingMemberIds,
}: Props) {
  const [numWaves, setNumWaves] = useState(2)
  const [numLanes, setNumLanes] = useState(2)
  const [generated, setGenerated] = useState(false)
  const [cells, setCells] = useState<Record<CellKey, CellData>>({})
  const [savedKeys, setSavedKeys] = useState<Set<CellKey>>(new Set())
  const [boats, setBoats] = useState<BoatOption[]>([])
  const [drivers, setDrivers] = useState<MemberOption[]>([])
  const [crews, setCrews] = useState<MemberOption[]>([])
  const [allMembers, setAllMembers] = useState<MemberOption[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [clearing, setClearing] = useState(false)

  const cellsRef = useRef(cells)
  cellsRef.current = cells
  const saveTimers = useRef<Record<CellKey, ReturnType<typeof setTimeout>>>({})
  const savedTimers = useRef<Record<CellKey, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    loadData()
  }, [sessionId, clubId])

  async function loadData() {
    setLoadingData(true)

    const [boatsRes, irbDRes, irbCRes, membersRes, teamsRes] = await Promise.all([
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
    ])

    setBoats(
      (boatsRes.data ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        identifier: b.identifier,
      }))
    )

    const driverIdSet = new Set((irbDRes.data ?? []).map((r: any) => r.member_id))
    const crewIdSet = new Set((irbCRes.data ?? []).map((r: any) => r.member_id))

    const memberList: MemberOption[] = (membersRes.data ?? []).map((m: any) => ({
      id: m.id,
      name: m.preferred_name
        ? `${m.preferred_name} ${m.last_name}`
        : `${m.first_name} ${m.last_name}`,
    }))

    setAllMembers(memberList)
    setDrivers(memberList.filter(m => driverIdSet.has(m.id)))
    setCrews(memberList.filter(m => crewIdSet.has(m.id)))

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
      setNumWaves(Math.max(maxWave, 1))
      setNumLanes(Math.max(maxLane, 1))
      setCells(cellMap)
      setGenerated(true)
    }

    setLoadingData(false)
  }

  function generateDraw() {
    const newCells: Record<CellKey, CellData> = {}
    for (let w = 1; w <= numWaves; w++) {
      for (let l = 1; l <= numLanes; l++) {
        const key = `${w}-${l}`
        newCells[key] = cellsRef.current[key] ?? {
          dbId: null,
          boat_id: '',
          driver_id: '',
          crew_id: '',
          patient_id: '',
          notes: '',
        }
      }
    }
    setCells(newCells)
    setGenerated(true)
  }

  function handleChange(
    wave: number,
    lane: number,
    field: keyof Omit<CellData, 'dbId'>,
    value: string
  ) {
    const key = `${wave}-${lane}`
    setCells(prev => {
      const updated = { ...prev, [key]: { ...prev[key], [field]: value } }
      scheduleAutoSave(key, wave, lane, updated[key])
      return updated
    })
  }

  function scheduleAutoSave(key: CellKey, wave: number, lane: number, data: CellData) {
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => performSave(key, wave, lane, data), 1000)
  }

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
        setCells(prev => ({
          ...prev,
          [key]: { ...prev[key], dbId: inserted.id },
        }))
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

  async function clearDraw() {
    if (!confirm('Remove all team assignments for this session? This cannot be undone.')) return
    setClearing(true)
    await supabase
      .from('irb_session_teams')
      .delete()
      .eq('session_id', sessionId)
      .eq('club_id', clubId)
    setCells({})
    setGenerated(false)
    setClearing(false)
  }

  function getWaveMemberSets(wave: number) {
    const driverIds = new Set<string>()
    const crewIds = new Set<string>()
    for (let l = 1; l <= numLanes; l++) {
      const c = cells[`${wave}-${l}`]
      if (c?.driver_id) driverIds.add(c.driver_id)
      if (c?.crew_id) crewIds.add(c.crew_id)
    }
    return { driverIds, crewIds }
  }

  function memberName(id: string) {
    return allMembers.find(m => m.id === id)?.name ?? id
  }

  function boatLabel(b: BoatOption) {
    return b.identifier ? `${b.name} (${b.identifier})` : b.name
  }

  function formatDateForPrint(date: string) {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  if (loadingData) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">Loading draw data…</div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .wave-print-view, .wave-print-view * { visibility: visible !important; }
          .wave-print-view {
            position: fixed !important;
            inset: 0 !important;
            background: white !important;
            padding: 24px !important;
            z-index: 9999 !important;
          }
          .wave-no-print { display: none !important; }
        }
        @media screen {
          .wave-print-view { display: none; }
        }
      `}</style>

      {/* ── Screen UI ── */}
      <div className="wave-no-print">
        {/* Config row */}
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Number of Waves
            </label>
            <input
              type="number"
              min={1}
              max={6}
              value={numWaves}
              onChange={e => setNumWaves(Math.min(6, Math.max(1, Number(e.target.value))))}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Lanes per Wave
            </label>
            <input
              type="number"
              min={1}
              max={4}
              value={numLanes}
              onChange={e => setNumLanes(Math.min(4, Math.max(1, Number(e.target.value))))}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            onClick={generateDraw}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            Generate Draw
          </button>

          {generated && (
            <>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                <Printer size={15} />
                Print Draw
              </button>
              <button
                onClick={clearDraw}
                disabled={clearing}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 size={15} />
                Clear Draw
              </button>
            </>
          )}
        </div>

        {/* Draw grid */}
        {generated && (
          <div className="overflow-x-auto">
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `64px repeat(${numLanes}, minmax(200px, 1fr))`,
              }}
            >
              {/* Header row */}
              <div />
              {Array.from({ length: numLanes }, (_, i) => (
                <div
                  key={i}
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center pb-1"
                >
                  Lane {i + 1}
                </div>
              ))}

              {/* Wave rows */}
              {Array.from({ length: numWaves }, (_, wi) => {
                const wave = wi + 1
                const { driverIds, crewIds } = getWaveMemberSets(wave)

                return [
                  /* Wave label */
                  <div
                    key={`lbl-${wave}`}
                    className="flex items-center justify-center"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide [writing-mode:vertical-lr] rotate-180">
                      Wave {wave}
                    </span>
                  </div>,

                  /* Lane cells */
                  ...Array.from({ length: numLanes }, (_, li) => {
                    const lane = li + 1
                    const key = `${wave}-${lane}`
                    const cell: CellData = cells[key] ?? {
                      dbId: null,
                      boat_id: '',
                      driver_id: '',
                      crew_id: '',
                      patient_id: '',
                      notes: '',
                    }
                    const isSaved = savedKeys.has(key)

                    // Build warnings
                    const warnings: string[] = []
                    if (cell.driver_id && cell.driver_id === cell.crew_id) {
                      warnings.push('Driver and crew cannot be the same person')
                    } else {
                      if (cell.driver_id && crewIds.has(cell.driver_id)) {
                        warnings.push(
                          `${memberName(cell.driver_id)} is also assigned as crew in Wave ${wave}`
                        )
                      }
                      if (cell.crew_id && driverIds.has(cell.crew_id)) {
                        warnings.push(
                          `${memberName(cell.crew_id)} is also assigned as driver in Wave ${wave}`
                        )
                      }
                    }
                    if (cell.driver_id && !attendingMemberIds.has(cell.driver_id)) {
                      warnings.push(`${memberName(cell.driver_id)} has not RSVP'd as attending`)
                    }
                    if (cell.crew_id && !attendingMemberIds.has(cell.crew_id)) {
                      warnings.push(`${memberName(cell.crew_id)} has not RSVP'd as attending`)
                    }

                    return (
                      <div
                        key={key}
                        className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2.5"
                      >
                        {/* Cell header */}
                        <div className="flex items-center justify-between min-h-[18px]">
                          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                            W{wave} · L{lane}
                          </span>
                          {isSaved && (
                            <span className="text-[10px] font-semibold text-emerald-500">
                              ✓ Saved
                            </span>
                          )}
                        </div>

                        {/* Boat */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5 font-medium">
                            Boat
                          </label>
                          <select
                            value={cell.boat_id}
                            onChange={e => handleChange(wave, lane, 'boat_id', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value="">— Select boat —</option>
                            {boats.map(b => (
                              <option key={b.id} value={b.id}>
                                {boatLabel(b)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Driver */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5 font-medium">
                            Driver (IRB-D)
                          </label>
                          <select
                            value={cell.driver_id}
                            onChange={e => handleChange(wave, lane, 'driver_id', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value="">— Select driver —</option>
                            {drivers.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Crew */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5 font-medium">
                            Crew (IRB-C)
                          </label>
                          <select
                            value={cell.crew_id}
                            onChange={e => handleChange(wave, lane, 'crew_id', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value="">— Select crew —</option>
                            {crews.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Patient */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5 font-medium">
                            Patient (optional)
                          </label>
                          <select
                            value={cell.patient_id}
                            onChange={e =>
                              handleChange(wave, lane, 'patient_id', e.target.value)
                            }
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value="">— Select patient —</option>
                            {allMembers.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5 font-medium">
                            Notes
                          </label>
                          <input
                            type="text"
                            value={cell.notes}
                            onChange={e => handleChange(wave, lane, 'notes', e.target.value)}
                            placeholder="Team notes…"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </div>

                        {/* Warnings */}
                        {warnings.length > 0 && (
                          <div className="space-y-1">
                            {warnings.map((w, i) => (
                              <p
                                key={i}
                                className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
                              >
                                ⚠ {w}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }),
                ]
              })}
            </div>
          </div>
        )}

        {!generated && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Set the number of waves and lanes, then click <strong>Generate Draw</strong> to begin.
          </div>
        )}
      </div>

      {/* ── Print view ── */}
      <div className="wave-print-view">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{clubName}</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {sessionTitle} &middot; {formatDateForPrint(sessionDate)}
          </div>
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  border: '1px solid #000',
                  padding: '6px 8px',
                  textAlign: 'left',
                  background: '#f3f4f6',
                }}
              >
                Wave
              </th>
              {Array.from({ length: numLanes }, (_, i) => (
                <th
                  key={i}
                  style={{
                    border: '1px solid #000',
                    padding: '6px 8px',
                    textAlign: 'left',
                    background: '#f3f4f6',
                  }}
                >
                  Lane {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numWaves }, (_, wi) => {
              const wave = wi + 1
              return (
                <tr key={wave}>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '6px 8px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      verticalAlign: 'top',
                    }}
                  >
                    Wave {wave}
                  </td>
                  {Array.from({ length: numLanes }, (_, li) => {
                    const lane = li + 1
                    const cell = cells[`${wave}-${lane}`]
                    const boatName = boats.find(b => b.id === cell?.boat_id)
                    const driverName = allMembers.find(m => m.id === cell?.driver_id)?.name
                    const crewName = allMembers.find(m => m.id === cell?.crew_id)?.name
                    const patientName = allMembers.find(m => m.id === cell?.patient_id)?.name
                    return (
                      <td
                        key={lane}
                        style={{
                          border: '1px solid #000',
                          padding: '6px 8px',
                          verticalAlign: 'top',
                          lineHeight: '1.6',
                        }}
                      >
                        {boatName && (
                          <div>
                            <strong>Boat:</strong> {boatLabel(boatName)}
                          </div>
                        )}
                        {driverName && (
                          <div>
                            <strong>Driver:</strong> {driverName}
                          </div>
                        )}
                        {crewName && (
                          <div>
                            <strong>Crew:</strong> {crewName}
                          </div>
                        )}
                        {patientName && (
                          <div>
                            <strong>Patient:</strong> {patientName}
                          </div>
                        )}
                        {cell?.notes && (
                          <div style={{ fontStyle: 'italic', color: '#555' }}>{cell.notes}</div>
                        )}
                        {!driverName && !crewName && !boatName && !patientName && (
                          <span style={{ color: '#aaa' }}>—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
