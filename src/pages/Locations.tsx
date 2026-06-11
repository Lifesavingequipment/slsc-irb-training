import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbLocation } from '../types'

export function Locations() {
  const { member } = useAuth()
  const [locations, setLocations] = useState<IrbLocation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!member) return
    supabase
      .from('irb_locations')
      .select('*')
      .eq('club_id', member.club_id)
      .order('name', { ascending: true })
      .then(({ data }) => {
        setLocations(data ?? [])
        setLoading(false)
      })
  }, [member])

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Locations</h2>
        <p className="text-gray-500 text-sm mt-0.5">Training locations and venues</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : locations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <MapPin size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No locations found</p>
          <p className="text-gray-400 text-sm mt-1">Add locations to assign them to training sessions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {locations.map(loc => (
            <div key={loc.id} className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <MapPin size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{loc.name}</h3>
                {loc.description && (
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{loc.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
