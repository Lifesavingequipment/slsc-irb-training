import { useEffect, useState, useRef } from 'react'
import { Plus, GripVertical, Edit2, Trash2, Clock, Search, X, BookOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface TrainingBlock {
  id: string
  drill_id: string | null
  block_order: number
  title: string
  description: string | null
  duration_minutes: number | null
  notes: string | null
  drill_category: string | null
  drill_difficulty: string | null
}

interface Drill {
  id: string
  name: string
  description: string | null
  category: string | null
  duration_minutes: number | null
  difficulty: string | null
}

interface Props {
  sessionId: string
  clubId: string
  currentMemberId: string
}

const CATEGORY_COLORS: Record<string, string> = {
  rescue: 'bg-red-100 text-red-700',
  navigation: 'bg-blue-100 text-blue-700',
  capsize: 'bg-orange-100 text-orange-700',
  fitness: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-600',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-emerald-100 text-emerald-700',
  intermediate: 'bg-amber-100 text-amber-700',
  advanced: 'bg-red-100 text-red-700',
}

interface ModalState {
  open: boolean
  editingBlock: TrainingBlock | null
  mode: 'drill' | 'custom'
  drillSearch: string
  selectedDrill: Drill | null
  title: string
  description: string
  duration: string
  notes: string
}

const EMPTY_MODAL: ModalState = {
  open: false,
  editingBlock: null,
  mode: 'custom',
  drillSearch: '',
  selectedDrill: null,
  title: '',
  description: '',
  duration: '',
  notes: '',
}

export function TrainingPlanTab({ sessionId, clubId, currentMemberId }: Props) {
  const [blocks, setBlocks] = useState<TrainingBlock[]>([])
  const [drills, setDrills] = useState<Drill[]>([])
  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<ModalState>(EMPTY_MODAL)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [drillDropdownOpen, setDrillDropdownOpen] = useState(false)

  const dragIndex = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)

  useEffect(() => {
    loadData()
  }, [sessionId, clubId, currentMemberId])

  async function loadData() {
    setLoading(true)
    const [blocksRes, drillsRes, rolesRes] = await Promise.all([
      supabase
        .from('irb_session_training_blocks')
        .select('*, irb_training_drills(category, difficulty)')
        .eq('session_id', sessionId)
        .eq('club_id', clubId)
        .order('block_order'),
      supabase
        .from('irb_training_drills')
        .select('*')
        .eq('club_id', clubId)
        .order('name'),
      supabase
        .from('member_roles')
        .select('role_name')
        .eq('member_id', currentMemberId)
        .eq('club_id', clubId)
        .eq('is_active', true),
    ])

    const roles = (rolesRes.data ?? []).map((r: { role_name: string }) => r.role_name)
    setIsTrainer(roles.includes('irb_trainer') || roles.includes('club_admin'))

    const rawBlocks = (blocksRes.data ?? []) as Array<TrainingBlock & { irb_training_drills?: { category: string | null; difficulty: string | null } | null }>
    setBlocks(rawBlocks.map(b => ({
      id: b.id,
      drill_id: b.drill_id,
      block_order: b.block_order,
      title: b.title,
      description: b.description,
      duration_minutes: b.duration_minutes,
      notes: b.notes,
      drill_category: b.irb_training_drills?.category ?? null,
      drill_difficulty: b.irb_training_drills?.difficulty ?? null,
    })))

    setDrills(drillsRes.data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setModal({ ...EMPTY_MODAL, open: true })
    setDrillDropdownOpen(false)
  }

  function openEdit(block: TrainingBlock) {
    const drill = block.drill_id ? drills.find(d => d.id === block.drill_id) ?? null : null
    setModal({
      open: true,
      editingBlock: block,
      mode: block.drill_id ? 'drill' : 'custom',
      drillSearch: drill?.name ?? '',
      selectedDrill: drill,
      title: block.title,
      description: block.description ?? '',
      duration: block.duration_minutes?.toString() ?? '',
      notes: block.notes ?? '',
    })
    setDrillDropdownOpen(false)
  }

  function closeModal() {
    setModal(EMPTY_MODAL)
    setDrillDropdownOpen(false)
  }

  function selectDrill(drill: Drill) {
    setModal(m => ({
      ...m,
      selectedDrill: drill,
      drillSearch: drill.name,
      title: drill.name,
      description: drill.description ?? '',
      duration: drill.duration_minutes?.toString() ?? m.duration,
    }))
    setDrillDropdownOpen(false)
  }

  async function saveBlock() {
    if (!modal.title.trim()) return
    setSaving(true)

    const payload = {
      club_id: clubId,
      session_id: sessionId,
      drill_id: modal.mode === 'drill' && modal.selectedDrill ? modal.selectedDrill.id : null,
      title: modal.title.trim(),
      description: modal.description.trim() || null,
      duration_minutes: modal.duration ? parseInt(modal.duration, 10) : null,
      notes: modal.notes.trim() || null,
    }

    if (modal.editingBlock) {
      await supabase
        .from('irb_session_training_blocks')
        .update(payload)
        .eq('id', modal.editingBlock.id)
    } else {
      const nextOrder = blocks.length > 0 ? Math.max(...blocks.map(b => b.block_order)) + 1 : 1
      await supabase
        .from('irb_session_training_blocks')
        .insert({ ...payload, block_order: nextOrder })
    }

    setSaving(false)
    closeModal()
    await loadData()
  }

  async function deleteBlock(id: string) {
    await supabase.from('irb_session_training_blocks').delete().eq('id', id)
    const remaining = blocks.filter(b => b.id !== id)
    // Resequence
    for (let i = 0; i < remaining.length; i++) {
      await supabase
        .from('irb_session_training_blocks')
        .update({ block_order: i + 1 })
        .eq('id', remaining[i].id)
    }
    setConfirmDeleteId(null)
    await loadData()
  }

  function onDragStart(index: number) {
    dragIndex.current = index
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    dragOverIndex.current = index
  }

  async function onDrop() {
    const from = dragIndex.current
    const to = dragOverIndex.current
    if (from === null || to === null || from === to) {
      dragIndex.current = null
      dragOverIndex.current = null
      return
    }

    const reordered = [...blocks]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    // Optimistic update
    setBlocks(reordered.map((b, i) => ({ ...b, block_order: i + 1 })))

    // Persist
    for (let i = 0; i < reordered.length; i++) {
      await supabase
        .from('irb_session_training_blocks')
        .update({ block_order: i + 1 })
        .eq('id', reordered[i].id)
    }

    dragIndex.current = null
    dragOverIndex.current = null
  }

  const totalMinutes = blocks.reduce((sum, b) => sum + (b.duration_minutes ?? 0), 0)
  const filteredDrills = drills.filter(d =>
    d.name.toLowerCase().includes(modal.drillSearch.toLowerCase())
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
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Clock size={15} className="text-gray-400" />
            <span>
              Total:{' '}
              <span className="font-semibold text-gray-900">
                {totalMinutes > 0 ? `${totalMinutes} min` : '—'}
              </span>
            </span>
          </div>
        </div>
        {isTrainer && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
          >
            <Plus size={15} />
            Add Block
          </button>
        )}
      </div>

      {/* Blocks */}
      {blocks.length === 0 ? (
        <div className="text-center py-14">
          <BookOpen size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No training plan yet. Add blocks to build your session plan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              draggable={isTrainer}
              onDragStart={() => onDragStart(index)}
              onDragOver={e => onDragOver(e, index)}
              onDrop={onDrop}
              className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 items-start group transition hover:border-gray-300"
            >
              {/* Drag handle */}
              {isTrainer && (
                <div className="mt-0.5 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 pt-0.5">
                  <GripVertical size={16} />
                </div>
              )}

              {/* Order number */}
              <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {index + 1}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{block.title}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {block.duration_minutes && (
                      <span className="text-xs text-gray-400 font-medium">{block.duration_minutes} min</span>
                    )}
                    {isTrainer && (
                      <>
                        <button
                          onClick={() => openEdit(block)}
                          className="p-1.5 text-gray-300 hover:text-primary transition rounded"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(block.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 transition rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {block.description && (
                  <p className="text-xs text-gray-500 mb-2 leading-relaxed">{block.description}</p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {block.drill_category && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CATEGORY_COLORS[block.drill_category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {block.drill_category}
                    </span>
                  )}
                  {block.drill_difficulty && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DIFFICULTY_COLORS[block.drill_difficulty] ?? 'bg-gray-100 text-gray-600'}`}>
                      {block.drill_difficulty}
                    </span>
                  )}
                </div>

                {block.notes && (
                  <p className="text-xs text-gray-400 mt-2 italic">{block.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                {modal.editingBlock ? 'Edit Block' : 'Add Block'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setModal(m => ({ ...m, mode: 'drill', title: '', description: '', duration: '', selectedDrill: null, drillSearch: '' }))}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition ${
                    modal.mode === 'drill'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  From drill library
                </button>
                <button
                  onClick={() => setModal(m => ({ ...m, mode: 'custom', selectedDrill: null, drillSearch: '' }))}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition ${
                    modal.mode === 'custom'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Custom block
                </button>
              </div>

              {/* Drill picker */}
              {modal.mode === 'drill' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                    Select drill
                  </label>
                  <div className="relative">
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-primary">
                      <Search size={14} className="text-gray-400 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Search drills..."
                        value={modal.drillSearch}
                        onChange={e => {
                          setModal(m => ({ ...m, drillSearch: e.target.value }))
                          setDrillDropdownOpen(true)
                        }}
                        onFocus={() => setDrillDropdownOpen(true)}
                        className="flex-1 text-sm outline-none min-w-0"
                      />
                      {modal.selectedDrill && (
                        <button
                          onClick={() => setModal(m => ({ ...m, selectedDrill: null, drillSearch: '' }))}
                          className="text-gray-300 hover:text-gray-500"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {drillDropdownOpen && filteredDrills.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                        {filteredDrills.map(d => (
                          <button
                            key={d.id}
                            onClick={() => selectDrill(d)}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-gray-900 font-medium">{d.name}</span>
                              <div className="flex gap-1 flex-shrink-0">
                                {d.category && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${CATEGORY_COLORS[d.category] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {d.category}
                                  </span>
                                )}
                                {d.duration_minutes && (
                                  <span className="text-xs text-gray-400">{d.duration_minutes}m</span>
                                )}
                              </div>
                            </div>
                            {d.description && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{d.description}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {modal.selectedDrill && (
                    <p className="text-xs text-emerald-600 mt-1 font-medium">
                      ✓ Fields auto-filled from drill — edit below as needed.
                    </p>
                  )}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modal.title}
                  onChange={e => setModal(m => ({ ...m, title: e.target.value }))}
                  placeholder="e.g. Capsize recovery drill"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-primary"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={modal.description}
                  onChange={e => setModal(m => ({ ...m, description: e.target.value }))}
                  placeholder="Describe the activity..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={modal.duration}
                  onChange={e => setModal(m => ({ ...m, duration: e.target.value }))}
                  placeholder="e.g. 15"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-primary"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={modal.notes}
                  onChange={e => setModal(m => ({ ...m, notes: e.target.value }))}
                  placeholder="Any additional notes for this block..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button
                onClick={saveBlock}
                disabled={saving || !modal.title.trim()}
                className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
              >
                {saving ? 'Saving…' : modal.editingBlock ? 'Save Changes' : 'Add Block'}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Delete block?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This will remove the block from the training plan and reorder the remaining blocks.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteBlock(confirmDeleteId)}
                className="flex-1 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
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
