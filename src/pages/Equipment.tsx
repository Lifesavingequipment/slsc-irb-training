import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbEquipment } from '../types'

const STATUS_COLORS: Record<string, string> = {
  operational: 'bg-green-100 text-green-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
  retired: 'bg-gray-100 text-gray-500',
  damaged: 'bg-red-100 text-red-700',
}

export function Equipment() {
  const { member } = useAuth()
  const [equipment, setEquipment] = useState<IrbEquipment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!member) return
    loadEquipment(member.club_id)
  }, [member])

  async function loadEquipment(clubId: string) {
    const { data } = await supabase
      .from('irb_equipment')
      .select('*')
      .eq('club_id', clubId)
      .order('equipment_type', { ascending: true })
      .order('name', { ascending: true })
    setEquipment(data ?? [])
    setLoading(false)
  }

  const types = ['all', ...Array.from(new Set(equipment.map(e => e.equipment_type)))]
  const filtered = filter === 'all' ? equipment : equipment.filter(e => e.equipment_type === filter)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Equipment</h2>
        <p className="text-gray-500 text-sm mt-0.5">Track IRB equipment and status</p>
      </div>

      {/* Type filter */}
      {!loading && types.length > 1 && (
        <div className="flex gap-1 flex-wrap mb-6">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition ${
                filter === t
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

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
          {filtered.map(item => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Wrench size={16} className="text-gray-500" />
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900">{item.name}</h3>
              {item.identifier && (
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.identifier}</p>
              )}
              <p className="text-xs text-gray-500 mt-2 capitalize">{item.equipment_type}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
