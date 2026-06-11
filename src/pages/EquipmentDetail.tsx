import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Anchor, Zap, Truck, Shield, Wrench,
  AlertTriangle, Calendar, FileText, Edit, ChevronDown,
  Plus, X, CheckCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { IrbEquipment, IrbEquipmentFault } from '../types'

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
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  major: 'bg-orange-100 text-orange-700',
  minor: 'bg-yellow-100 text-yellow-700',
}
const FAULT_STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
}

function TypeIcon({ type }: { type: string }) {
  const size = 20
  const cls = 'text-gray-600'
  if (type === 'boat') return <Anchor size={size} className={cls} />
  if (type === 'engine') return <Zap size={size} className={cls} />
  if (type === 'trailer') return <Truck size={size} className={cls} />
  if (type === 'safety') return <Shield size={size} className={cls} />
  return <Wrench size={size} className={cls} />
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function serviceDueState(dateStr: string | null): 'overdue' | 'soon' | null {
  if (!dateStr) return null
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= 30) return 'soon'
  return null
}

// ---- MODALS ----------------------------------------------------------------

function ReportFaultModal({
  equipmentName,
  onClose,
  onSaved,
  clubId,
  memberId,
  equipmentId,
}: {
  equipmentName: string
  onClose: () => void
  onSaved: () => void
  clubId: string
  memberId: string
  equipmentId: string
}) {
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('minor')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setError('Fault description is required.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('irb_equipment_faults').insert({
      club_id: clubId,
      equipment_id: equipmentId,
      reported_by: memberId,
      fault_description: description.trim(),
      severity,
      status: 'open',
      reported_at: new Date().toISOString(),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell title="Report Fault" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">{equipmentName}</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fault Description <span className="text-red-500">*</span></label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Describe the fault..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Report Fault'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function ResolveFaultModal({
  fault,
  onClose,
  onSaved,
  memberId,
}: {
  fault: IrbEquipmentFault
  onClose: () => void
  onSaved: () => void
  memberId: string
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!notes.trim()) { setError('Resolution notes are required.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('irb_equipment_faults').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: memberId,
      resolution_notes: notes.trim(),
    }).eq('id', fault.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell title="Resolve Fault" onClose={onClose}>
      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-4">{fault.fault_description}</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Notes <span className="text-red-500">*</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Describe how the fault was resolved..."
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Mark Resolved'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function UpdateFaultStatusModal({
  fault,
  onClose,
  onSaved,
}: {
  fault: IrbEquipmentFault
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState(fault.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error: err } = await supabase.from('irb_equipment_faults').update({ status }).eq('id', fault.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell title="Update Fault Status" onClose={onClose}>
      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-4">{fault.fault_description}</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-60">
            {saving ? 'Saving…' : 'Update Status'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function EquipmentFormModal({
  equipment,
  clubId,
  onClose,
  onSaved,
}: {
  equipment: IrbEquipment | null
  clubId: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!equipment
  const [form, setForm] = useState({
    name: equipment?.name ?? '',
    equipment_type: equipment?.equipment_type ?? 'boat',
    identifier: equipment?.identifier ?? '',
    status: equipment?.status ?? 'operational',
    purchase_date: equipment?.purchase_date ?? '',
    last_service_date: equipment?.last_service_date ?? '',
    next_service_date: equipment?.next_service_date ?? '',
    notes: equipment?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    const payload = {
      club_id: clubId,
      name: form.name.trim(),
      equipment_type: form.equipment_type,
      identifier: form.identifier.trim() || null,
      status: form.status,
      purchase_date: form.purchase_date || null,
      last_service_date: form.last_service_date || null,
      next_service_date: form.next_service_date || null,
      notes: form.notes.trim() || null,
      is_active: true,
    }
    const { error: err } = isEdit
      ? await supabase.from('irb_equipment').update(payload).eq('id', equipment!.id)
      : await supabase.from('irb_equipment').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell title={isEdit ? 'Edit Equipment' : 'Add Equipment'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. IRB #1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={form.equipment_type} onChange={e => set('equipment_type', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="boat">Boat</option>
              <option value="engine">Engine</option>
              <option value="trailer">Trailer</option>
              <option value="safety">Safety</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="operational">Operational</option>
              <option value="under_repair">Under Repair</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Identifier (hull no., serial, rego)</label>
          <input value={form.identifier} onChange={e => set('identifier', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. AB-1234" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
            <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Service</label>
            <input type="date" value={form.last_service_date} onChange={e => set('last_service_date', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Service</label>
            <input type="date" value={form.next_service_date} onChange={e => set('next_service_date', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Equipment'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="flex items-center justify-center w-9 h-9 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- MAIN PAGE -------------------------------------------------------------

export function EquipmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { member } = useAuth()
  const [equipment, setEquipment] = useState<IrbEquipment | null>(null)
  const [faults, setFaults] = useState<IrbEquipmentFault[]>([])
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})
  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [faultTab, setFaultTab] = useState<'open' | 'resolved'>('open')
  const [showChangeStatus, setShowChangeStatus] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  // modals
  const [showReportFault, setShowReportFault] = useState(false)
  const [showEditEquip, setShowEditEquip] = useState(false)
  const [resolveFault, setResolveFault] = useState<IrbEquipmentFault | null>(null)
  const [updateStatusFault, setUpdateStatusFault] = useState<IrbEquipmentFault | null>(null)

  // new equipment form via navigate
  const isNew = id === 'new'

  useEffect(() => {
    if (!member) return
    if (isNew) { setLoading(false); setShowEditEquip(true); return }
    loadAll()
  }, [member, id])

  async function loadAll() {
    if (!member || !id) return
    setLoading(true)
    const [equipRes, faultsRes, membersRes, rolesRes] = await Promise.all([
      supabase.from('irb_equipment').select('*').eq('id', id).single(),
      supabase.from('irb_equipment_faults').select('*').eq('equipment_id', id).order('reported_at', { ascending: false }),
      supabase.from('members').select('id, first_name, last_name, preferred_name').eq('club_id', member.club_id),
      supabase.from('member_roles').select('role_name').eq('member_id', member.id).eq('club_id', member.club_id).eq('is_active', true),
    ])
    setEquipment(equipRes.data ?? null)
    setFaults(faultsRes.data ?? [])

    const names: Record<string, string> = {}
    for (const m of (membersRes.data ?? [])) {
      names[m.id] = m.preferred_name ? `${m.preferred_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`
    }
    setMemberNames(names)

    const roleNames = (rolesRes.data ?? []).map((r: { role_name: string }) => r.role_name)
    setIsTrainer(roleNames.includes('irb_trainer') || roleNames.includes('club_admin'))
    setLoading(false)
  }

  async function changeStatus(newStatus: string) {
    if (!equipment) return
    setChangingStatus(true)
    await supabase.from('irb_equipment').update({ status: newStatus }).eq('id', equipment.id)
    setEquipment(e => e ? { ...e, status: newStatus } : e)
    setShowChangeStatus(false)
    setChangingStatus(false)
  }

  if (isNew) {
    return (
      <>
        {showEditEquip && member && (
          <EquipmentFormModal
            equipment={null}
            clubId={member.club_id}
            onClose={() => navigate('/equipment')}
            onSaved={() => navigate('/equipment')}
          />
        )}
      </>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!equipment) {
    return (
      <div className="p-8">
        <button onClick={() => navigate('/equipment')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft size={16} /> Back to Equipment
        </button>
        <p className="text-gray-500">Equipment not found.</p>
      </div>
    )
  }

  const dueState = serviceDueState(equipment.next_service_date)
  const openFaults = faults.filter(f => f.status !== 'resolved')
  const resolvedFaults = faults.filter(f => f.status === 'resolved')
  const displayFaults = faultTab === 'open' ? openFaults : resolvedFaults

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      {/* Back */}
      <button onClick={() => navigate('/equipment')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition">
        <ArrowLeft size={16} /> Back to Equipment
      </button>

      {/* Heading */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 bg-gray-100 rounded-xl flex items-center justify-center">
          <TypeIcon type={equipment.equipment_type} />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{equipment.name}</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[equipment.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {STATUS_LABELS[equipment.status] ?? equipment.status}
            </span>
          </div>
          {equipment.identifier && <p className="text-sm text-gray-400 font-mono mt-0.5">{equipment.identifier}</p>}
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Left: info */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Equipment Info</h3>
          <dl className="space-y-3">
            <InfoRow label="Type" value={<span className="capitalize">{equipment.equipment_type}</span>} />
            <InfoRow label="Identifier" value={equipment.identifier ?? '—'} />
            <InfoRow label="Status" value={
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[equipment.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABELS[equipment.status] ?? equipment.status}
              </span>
            } />
            <InfoRow label="Purchase Date" value={formatDate(equipment.purchase_date)} />
            <InfoRow label="Last Service" value={formatDate(equipment.last_service_date)} />
            <InfoRow label="Next Service" value={
              <span className={
                dueState === 'overdue' ? 'text-red-600 font-medium' :
                dueState === 'soon' ? 'text-orange-500 font-medium' : ''
              }>
                {dueState === 'overdue' && <AlertTriangle size={13} className="inline mr-1 mb-0.5" />}
                {formatDate(equipment.next_service_date)}
                {dueState === 'overdue' && ' (overdue)'}
                {dueState === 'soon' && ' (due soon)'}
              </span>
            } />
            {equipment.notes && (
              <InfoRow label="Notes" value={<span className="whitespace-pre-wrap text-gray-600">{equipment.notes}</span>} />
            )}
          </dl>
        </div>

        {/* Right: actions */}
        {isTrainer && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-3 h-fit">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Actions</h3>
            <button
              onClick={() => setShowEditEquip(true)}
              className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <Edit size={15} /> Edit Equipment
            </button>

            {/* Change status */}
            <div className="relative">
              <button
                onClick={() => setShowChangeStatus(s => !s)}
                className="flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                <span className="flex items-center gap-2"><Calendar size={15} /> Change Status</span>
                <ChevronDown size={14} className={showChangeStatus ? 'rotate-180' : ''} />
              </button>
              {showChangeStatus && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  {['operational', 'under_repair', 'retired'].map(s => (
                    <button
                      key={s}
                      disabled={changingStatus || equipment.status === s}
                      onClick={() => changeStatus(s)}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition first:rounded-t-lg last:rounded-b-lg ${
                        equipment.status === s ? 'font-semibold text-primary' : 'text-gray-700'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowReportFault(true)}
              className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
            >
              <Plus size={15} /> Report Fault
            </button>
          </div>
        )}
      </div>

      {/* Faults section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Fault Reports</h3>
          {openFaults.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{openFaults.length} open</span>
          )}
        </div>

        {/* Fault tabs */}
        <div className="flex gap-1 mb-5">
          <button
            onClick={() => setFaultTab('open')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${faultTab === 'open' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Open Faults {openFaults.length > 0 && `(${openFaults.length})`}
          </button>
          <button
            onClick={() => setFaultTab('resolved')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${faultTab === 'resolved' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Resolved {resolvedFaults.length > 0 && `(${resolvedFaults.length})`}
          </button>
        </div>

        {displayFaults.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No {faultTab} faults</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayFaults.map(fault => (
              <div key={fault.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm text-gray-800 font-medium flex-1">{fault.fault_description}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[fault.severity] ?? 'bg-gray-100 text-gray-500'}`}>
                      {fault.severity.charAt(0).toUpperCase() + fault.severity.slice(1)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FAULT_STATUS_COLORS[fault.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {fault.status === 'in_progress' ? 'In Progress' : fault.status.charAt(0).toUpperCase() + fault.status.slice(1)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Reported by {memberNames[fault.reported_by] ?? 'Unknown'} · {formatDate(fault.reported_at)}
                </p>

                {fault.status === 'resolved' && (
                  <div className="mt-3 bg-green-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium mb-1">
                      <CheckCircle size={13} /> Resolved
                    </div>
                    <p className="text-xs text-gray-600">{fault.resolution_notes}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      By {memberNames[fault.resolved_by ?? ''] ?? 'Unknown'} · {formatDate(fault.resolved_at)}
                    </p>
                  </div>
                )}

                {isTrainer && fault.status !== 'resolved' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setUpdateStatusFault(fault)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                    >
                      Update Status
                    </button>
                    <button
                      onClick={() => setResolveFault(fault)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!isTrainer && (
          <button
            onClick={() => setShowReportFault(true)}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
          >
            <Plus size={15} /> Report Fault
          </button>
        )}
      </div>

      {/* Modals */}
      {showReportFault && member && (
        <ReportFaultModal
          equipmentName={equipment.name}
          clubId={member.club_id}
          memberId={member.id}
          equipmentId={equipment.id}
          onClose={() => setShowReportFault(false)}
          onSaved={() => { setShowReportFault(false); loadAll() }}
        />
      )}
      {showEditEquip && member && (
        <EquipmentFormModal
          equipment={equipment}
          clubId={member.club_id}
          onClose={() => setShowEditEquip(false)}
          onSaved={() => { setShowEditEquip(false); loadAll() }}
        />
      )}
      {resolveFault && member && (
        <ResolveFaultModal
          fault={resolveFault}
          memberId={member.id}
          onClose={() => setResolveFault(null)}
          onSaved={() => { setResolveFault(null); loadAll() }}
        />
      )}
      {updateStatusFault && (
        <UpdateFaultStatusModal
          fault={updateStatusFault}
          onClose={() => setUpdateStatusFault(null)}
          onSaved={() => { setUpdateStatusFault(null); loadAll() }}
        />
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="text-sm text-gray-500 w-32 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900 flex-1">{value}</dd>
    </div>
  )
}
