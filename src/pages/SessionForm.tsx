import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbLocation, Member, Qualification } from '../types'

interface FormData {
  title: string
  session_type: string
  scheduled_date: string
  start_time: string
  end_time: string
  location_id: string
  lead_trainer_id: string
  qualification_id: string
  max_participants: string
  min_drivers: string
  min_crew: string
  weather_conditions: string
  sea_conditions: string
  wind_speed: string
  tide_info: string
  notes: string
}

const EMPTY_FORM: FormData = {
  title: '',
  session_type: 'training',
  scheduled_date: '',
  start_time: '',
  end_time: '',
  location_id: '',
  lead_trainer_id: '',
  qualification_id: '',
  max_participants: '',
  min_drivers: '',
  min_crew: '',
  weather_conditions: '',
  sea_conditions: '',
  wind_speed: '',
  tide_info: '',
  notes: '',
}

const SESSION_TYPES = [
  { value: 'training', label: 'Training' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'competition', label: 'Competition' },
  { value: 'patrol_support', label: 'Patrol Support' },
  { value: 'maintenance', label: 'Maintenance' },
]

const SEA_CONDITIONS = [
  { value: '', label: 'Not specified' },
  { value: 'calm', label: 'Calm' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'rough', label: 'Rough' },
  { value: 'very_rough', label: 'Very Rough' },
]

export function SessionForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { member: currentMember } = useAuth()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  const [locations, setLocations] = useState<IrbLocation[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [qualifications, setQualifications] = useState<Qualification[]>([])

  const [showNewLocation, setShowNewLocation] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationDesc, setNewLocationDesc] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)

  useEffect(() => {
    if (!currentMember) return
    loadLookups(currentMember.club_id)
    if (isEdit && id) loadSession(id)
  }, [currentMember, id])

  async function loadLookups(clubId: string) {
    const [locsRes, membersRes, qualsRes] = await Promise.all([
      supabase.from('irb_locations').select('*').eq('club_id', clubId).order('name'),
      supabase.from('members').select('*').eq('club_id', clubId).order('last_name'),
      supabase.from('qualifications').select('*').eq('category', 'irb').order('name'),
    ])
    setLocations(locsRes.data ?? [])
    setMembers(membersRes.data ?? [])
    setQualifications(qualsRes.data ?? [])
  }

  async function loadSession(sessionId: string) {
    const { data } = await supabase.from('irb_sessions').select('*').eq('id', sessionId).single()
    if (data) {
      setForm({
        title: data.title ?? '',
        session_type: data.session_type ?? 'training',
        scheduled_date: data.scheduled_date ?? '',
        start_time: data.start_time ?? '',
        end_time: data.end_time ?? '',
        location_id: data.location_id ?? '',
        lead_trainer_id: data.lead_trainer_id ?? '',
        qualification_id: data.qualification_id ?? '',
        max_participants: data.max_participants?.toString() ?? '',
        min_drivers: data.min_drivers?.toString() ?? '',
        min_crew: data.min_crew?.toString() ?? '',
        weather_conditions: data.weather_conditions ?? '',
        sea_conditions: data.sea_conditions ?? '',
        wind_speed: data.wind_speed ?? '',
        tide_info: data.tide_info ?? '',
        notes: data.notes ?? '',
      })
    }
    setLoading(false)
  }

  function set(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (!form.title.trim()) e.title = 'Title is required'
    if (!form.scheduled_date) e.scheduled_date = 'Date is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate() || !currentMember) return
    setSaving(true)

    const payload = {
      club_id: currentMember.club_id,
      title: form.title.trim(),
      session_type: form.session_type,
      scheduled_date: form.scheduled_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location_id: form.location_id || null,
      lead_trainer_id: form.lead_trainer_id || null,
      qualification_id: form.qualification_id || null,
      max_participants: form.max_participants ? Number(form.max_participants) : null,
      min_drivers: form.min_drivers ? Number(form.min_drivers) : null,
      min_crew: form.min_crew ? Number(form.min_crew) : null,
      weather_conditions: form.weather_conditions || null,
      sea_conditions: form.sea_conditions || null,
      wind_speed: form.wind_speed || null,
      tide_info: form.tide_info || null,
      notes: form.notes || null,
      ...(!isEdit && { created_by: currentMember.id, status: 'scheduled' }),
    }

    if (isEdit && id) {
      await supabase.from('irb_sessions').update(payload).eq('id', id)
      navigate(`/sessions/${id}`)
    } else {
      const { data } = await supabase.from('irb_sessions').insert(payload).select('id').single()
      navigate(data ? `/sessions/${data.id}` : '/sessions')
    }
  }

  async function handleAddLocation() {
    if (!newLocationName.trim() || !currentMember) return
    setSavingLocation(true)
    const { data } = await supabase
      .from('irb_locations')
      .insert({ club_id: currentMember.club_id, name: newLocationName.trim(), description: newLocationDesc || null })
      .select('*')
      .single()
    if (data) {
      setLocations(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(prev => ({ ...prev, location_id: data.id }))
    }
    setNewLocationName('')
    setNewLocationDesc('')
    setShowNewLocation(false)
    setSavingLocation(false)
  }

  function memberName(m: Member) {
    return m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(isEdit && id ? `/sessions/${id}` : '/sessions')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Session' : 'New Session'}</h2>
      </div>

      <div className="space-y-6">
        {/* Session Details */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">Session Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Sunday Morning Training"
                className={`w-full px-3 py-3 md:py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${errors.title ? 'border-red-300' : 'border-gray-300'}`}
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Session Type</label>
              <select
                value={form.session_type}
                onChange={e => set('session_type', e.target.value)}
                className="w-full px-3 py-3 md:py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                {SESSION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={e => set('scheduled_date', e.target.value)}
                  className={`w-full px-3 py-3 md:py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${errors.scheduled_date ? 'border-red-300' : 'border-gray-300'}`}
                />
                {errors.scheduled_date && <p className="text-red-500 text-xs mt-1">{errors.scheduled_date}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => set('start_time', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">End Time</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => set('end_time', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
              <select
                value={showNewLocation ? '__new__' : form.location_id}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setShowNewLocation(true)
                  } else {
                    setShowNewLocation(false)
                    set('location_id', e.target.value)
                  }
                }}
                className="w-full px-3 py-3 md:py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Not specified</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
                <option value="__new__">+ Add new location…</option>
              </select>

              {showNewLocation && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">New Location</p>
                    <button onClick={() => setShowNewLocation(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={e => setNewLocationName(e.target.value)}
                    placeholder="Location name *"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={newLocationDesc}
                    onChange={e => setNewLocationDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <button
                    onClick={handleAddLocation}
                    disabled={!newLocationName.trim() || savingLocation}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
                  >
                    <Plus size={14} />
                    Add Location
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Lead Trainer</label>
              <select
                value={form.lead_trainer_id}
                onChange={e => set('lead_trainer_id', e.target.value)}
                className="w-full px-3 py-3 md:py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Not assigned</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{memberName(m)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Qualification Working Toward</label>
              <select
                value={form.qualification_id}
                onChange={e => set('qualification_id', e.target.value)}
                className="w-full px-3 py-3 md:py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Not specified</option>
                {qualifications.map(q => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Capacity */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">Capacity</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Participants</label>
              <input
                type="number"
                min="1"
                value={form.max_participants}
                onChange={e => set('max_participants', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Min Drivers Required</label>
              <input
                type="number"
                min="0"
                value={form.min_drivers}
                onChange={e => set('min_drivers', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Min Crew Required</label>
              <input
                type="number"
                min="0"
                value={form.min_crew}
                onChange={e => set('min_crew', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
        </section>

        {/* Conditions */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Conditions</h3>
          <p className="text-xs text-gray-400 mb-5">Optional — can be filled in on the day</p>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Weather Conditions</label>
                <input
                  type="text"
                  value={form.weather_conditions}
                  onChange={e => set('weather_conditions', e.target.value)}
                  placeholder="e.g. Partly cloudy, 22°C"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sea Conditions</label>
                <select
                  value={form.sea_conditions}
                  onChange={e => set('sea_conditions', e.target.value)}
                  className="w-full px-3 py-3 md:py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                >
                  {SEA_CONDITIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Wind Speed</label>
                <input
                  type="text"
                  value={form.wind_speed}
                  onChange={e => set('wind_speed', e.target.value)}
                  placeholder="e.g. 15 knots NE"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tide Info</label>
                <input
                  type="text"
                  value={form.tide_info}
                  onChange={e => set('tide_info', e.target.value)}
                  placeholder="e.g. High tide 8:30 AM"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">Notes</h3>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={4}
            placeholder="Any additional notes for this session…"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          />
        </section>

        {/* Actions */}
        <div className="flex items-center gap-3 pb-8">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-3 md:py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Session'}
          </button>
          <button
            onClick={() => navigate(isEdit && id ? `/sessions/${id}` : '/sessions')}
            className="px-6 py-3 md:py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
