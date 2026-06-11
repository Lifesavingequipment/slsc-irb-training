import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, Anchor, Zap, Truck, Shield, Plus, AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbEquipment } from '../types'

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'boat', label: 'Boats' },
  { value: 'engine', label: 'Engines' },
  { value: 'trailer', label: 'Trailers' },
  { value: 'safety', label: 'Safety' },
  { value: 'other', label: 'Other' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'operational', label: 'Operational' },
  { value: 'under_repair', label: 'Under Repair' },
  { value: 'retired', label: 'Retired' },
]

const STATUS_COLORS: Record<string, string> = {
  operational: 'bg-green-100 text-green-700',
  under_repair: 'bg-orange-100 text-orange-700',
  retired: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  operational: 'Operational',
  under_repair: 'Under Repair',
  retired: 'Retired',
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'text-gray-500'
  const size = 16
  if (type === 'boat') return <Anchor size={size} className={cls} />
  if (type === 'engine') return <Zap size={size} className={cls} />
  if (type === 'trailer') return <Truck size={size} className={cls} />
  if (type === 'safety') return <Shield size={size} className={cls} />
  return <Wrench size={size} className={cls} />
}

function serviceDueState(dateStr: string | null): 'overdue' | 'soon' | null {
  if (!dateStr) return null
  const due = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((due.getTime() - now.getTime()) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 30) return 'soon'
  return null
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function Equipment() {
  const { member } = useAuth()
  const navigate = useNavigate()
  const [equipment, setEquipment] = useState<IrbEquipment[]>([])
  const [faultCounts, setFaultCounts] = useState<Record<string, number>>({})
  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    if (!member) return
    loadAll(member.id, member.club_id)
  }, [member])

  async function loadAll(memberId: string, clubId: string) {
    const [equipRes, faultsRes, rolesRes] = await Promise.all([
      supabase.from('irb_equipment').select('*').eq('club_id', clubId).eq('is_active', true)
        .order('equipment_type').order('name'),
      supabase.from('irb_equipment_faults').select('equipment_id').eq('club_id', clubId).eq('status', 'open'),
      supabase.from('member_roles').select('role_name').eq('member_id', memberId).eq('club_id', clubId).eq('is_active', true),
    ])

    setEquipment(equipRes.data ?? [])

    const counts: Record<string, number> = {}
    for (const f of (faultsRes.data ?? [])) {
      counts[f.equipment_id] = (counts[f.equipment_id] ?? 0) + 1
    }
    setFaultCounts(counts)

    const roleNames = (rolesRes.data ?? []).map((r: { role_name: string }) => r.role_name)
    setIsTrainer(roleNames.includes('irb_trainer') || roleNames.includes('club_admin'))

    setLoading(false)
  }

  const filtered = equipment.filter(e => {
    if (typeFilter !== 'all' && e.equipment_type !== typeFilter) return false
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    return true
  })

  const totalFaults = Object.values(faultCounts).reduce((a, b) => a + b, 0)
  const operationalCount = equipment.filter(e => e.status === 'operational').length
  const repairCount = equipment.filter(e => e.status === 'under_repair').length

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Equipment</h2>
          <p className="text-gray-500 text-sm mt-0.5">Track IRB equipment and service status</p>
        </div>
        {isTrainer && (
          <button
            onClick={() => navigate('/equipment/new')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
          >
            <Plus size={16} />
            Add Equipment
          </button>
        )}
      </div>

      {/* Summary bar */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: equipment.length, color: 'text-gray-900' },
            { label: 'Operational', value: operationalCount, color: 'text-green-700' },
            { label: 'Under Repair', value: repairCount, color: 'text-orange-600' },
            { label: 'Open Faults', value: totalFaults, color: totalFaults > 0 ? 'text-red-600' : 'text-gray-900' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Type tabs */}
      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 mb-3">
        <div className="flex gap-1 w-fit">
          {TYPE_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`px-3 py-2.5 md:py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap min-h-[44px] md:min-h-0 ${
                typeFilter === t.value
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter */}
      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 mb-6">
        <div className="flex gap-1 w-fit">
          {STATUS_FILTERS.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-2.5 md:py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap min-h-[44px] md:min-h-0 ${
                statusFilter === s.value
                  ? 'bg-gray-800 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Wrench size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No equipment found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const dueState = serviceDueState(item.next_service_date)
            const openFaults = faultCounts[item.id] ?? 0
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                    <TypeIcon type={item.equipment_type} />
                  </div>
                  <div className="flex items-center gap-2">
                    {openFaults > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                        {openFaults} fault{openFaults > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  {item.identifier && (
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.identifier}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 capitalize">{item.equipment_type}</p>
                </div>

                {item.next_service_date && (
                  <div className={`flex items-center gap-1.5 text-xs ${
                    dueState === 'overdue' ? 'text-red-600' : dueState === 'soon' ? 'text-orange-500' : 'text-gray-500'
                  }`}>
                    {dueState ? <AlertTriangle size={12} /> : <Clock size={12} />}
                    <span>
                      {dueState === 'overdue' ? 'Overdue — ' : dueState === 'soon' ? 'Due soon — ' : 'Service due '}
                      {formatDate(item.next_service_date)}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => navigate(`/equipment/${item.id}`)}
                  className="mt-auto w-full py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                >
                  View
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
