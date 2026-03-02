// src/components/Campaign.jsx
// Drop this into: client/src/components/Campaign.jsx
// Import ExcelImporter from: ../utils/ExcelImporter  (or adjust path to match your utils folder)

import { useState, useRef, useCallback, useEffect } from 'react'
//import { useExcelImporter } from '../utils/ExcelImporter'

// ── Constants ─────────────────────────────────────────────────────────────────
const VOICE_OPTIONS    = ['Nova', 'Aria', 'Orion', 'Echo', 'Sage', 'Blaze']
const CAMPAIGN_TYPES   = ['Outbound', 'Inbound', 'Follow-up', 'Survey', 'Reminder']
const DURATION_OPTIONS = ['1 min', '2 min', '3 min', '5 min', '10 min', 'No limit']

const STATUS_STYLES = {
  active: { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  paused: { badge: 'bg-amber-50  text-amber-700  ring-1 ring-amber-200',  dot: 'bg-amber-400'  },
  draft:  { badge: 'bg-blue-50   text-blue-700   ring-1 ring-blue-200',   dot: 'bg-blue-400'   },
  ended:  { badge: 'bg-slate-100 text-slate-500  ring-1 ring-slate-200',  dot: 'bg-slate-400'  },
}

const SEED = [
  { id: 'c1', name: 'Q1 Re-Engagement',        type: 'Outbound', voice: 'Nova',  duration: '2 min', schedule: 'Weekdays 9 AM – 5 PM', contacts: 240, done: 182, status: 'active', created: '2025-01-12' },
  { id: 'c2', name: 'Product Launch Blitz',     type: 'Inbound',  voice: 'Aria',  duration: '3 min', schedule: 'Daily 10 AM – 6 PM',    contacts: 85,  done: 85,  status: 'paused', created: '2025-02-03' },
  { id: 'c3', name: 'Customer Feedback Survey', type: 'Survey',   voice: 'Orion', duration: '5 min', schedule: 'Mon & Wed 11 AM – 4 PM', contacts: 512, done: 0,   status: 'draft',  created: '2025-02-18' },
  { id: 'c4', name: 'Renewal Reminders',        type: 'Reminder', voice: 'Sage',  duration: '1 min', schedule: 'Weekdays 10 AM – 12 PM', contacts: 128, done: 128, status: 'ended',  created: '2025-01-28' },
]

// ── Tiny SVG icons (no extra dep) ─────────────────────────────────────────────
const Icon = ({ d, size = 16, fill = false, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={className}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
)

const ICONS = {
  plus:    <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  search:  <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  users:   <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
  clock:   <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  mic:     <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>,
  play:    <polygon points="5 3 19 12 5 21 5 3"/>,
  pause:   <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
  trash:   <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></>,
  upload:  <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></>,
  sheet:   <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></>,
  check:   <><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
  x:       <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  info:    <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  warn:    <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  zap:     <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  cal:     <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-white border border-blue-100 rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon d={ICONS[icon]} size={18} className="text-current" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800 tracking-tight leading-none">{value}</div>
        <div className="text-xs text-slate-400 mt-1">{label}</div>
        {sub && <div className="text-xs text-slate-300 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-blue-50 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-blue-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

function CampaignCard({ c, onDelete, onToggle }) {
  const date = new Date(c.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <article className="bg-white border border-blue-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-800 truncate text-[15px] leading-snug mb-2">{c.name}</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="bg-blue-50 text-blue-600 text-xs font-medium px-2.5 py-0.5 rounded-full">{c.type}</span>
            <span className="bg-slate-50 text-slate-500 text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Icon d={ICONS.mic} size={10} className="opacity-60" /> {c.voice}
            </span>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Icon d={ICONS.users} size={13} className="text-blue-300 flex-shrink-0" />
          <span>{c.contacts.toLocaleString()} contacts</span>
          <span className="mx-1 text-slate-200">·</span>
          <Icon d={ICONS.clock} size={13} className="text-blue-300 flex-shrink-0" />
          <span>{c.duration}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Icon d={ICONS.cal} size={13} className="text-blue-300 flex-shrink-0" />
          <span>{c.schedule}</span>
        </div>
      </div>

      {/* Progress */}
      {c.status !== 'draft' && c.contacts > 0 && (
        <div>
          <span className="text-xs text-slate-400">{c.done.toLocaleString()} / {c.contacts.toLocaleString()} calls completed</span>
          <ProgressBar done={c.done} total={c.contacts} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-blue-50">
        <span className="text-xs text-slate-300">Created {date}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onToggle(c.id)}
            title={c.status === 'active' ? 'Pause' : 'Activate'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105 ${
              c.status === 'active'
                ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
            }`}
          >
            <Icon d={c.status === 'active' ? ICONS.pause : ICONS.play} size={13} fill={true} />
          </button>
          <button
            onClick={() => onDelete(c.id)}
            title="Delete"
            className="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-all hover:scale-105"
          >
            <Icon d={ICONS.trash} size={13} />
          </button>
        </div>
      </div>
    </article>
  )
}

// ── Excel Drop Zone ───────────────────────────────────────────────────────────
function ExcelDropZone({ onImport }) {
  const inputRef = useRef()
  const { status, result, isDragging, setIsDragging, processFile, reset } = useExcelImporter(onImport)

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  const zoneBase = 'border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 cursor-pointer flex flex-col items-center gap-3'
  const zoneVariant =
    isDragging        ? 'border-blue-400 bg-blue-50 shadow-inner'
    : status === 'done'  ? 'border-emerald-400 bg-emerald-50 cursor-default'
    : status === 'error' ? 'border-red-400 bg-red-50 cursor-default'
    : 'border-blue-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50'

  return (
    <div className="space-y-3">
      <div
        className={`${zoneBase} ${zoneVariant}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => (status === 'idle' || isDragging) && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={(e) => processFile(e.target.files[0])} />

        {/* Idle */}
        {status === 'idle' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-400">
              <Icon d={ICONS.sheet} size={28} />
            </div>
            <div>
              <p className="font-semibold text-slate-700 text-sm">Drop your file here</p>
              <p className="text-xs text-slate-400 mt-0.5">Supports .csv, .xlsx, .xls · Max 10 MB</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-all"
            >
              <Icon d={ICONS.upload} size={14} /> Browse Files
            </button>
            <p className="text-xs text-slate-300">
              Required columns: <code className="bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-mono text-[11px]">name</code>
              {' '}&amp;{' '}
              <code className="bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-mono text-[11px]">contacts</code>
            </p>
          </>
        )}

        {/* Parsing */}
        {status === 'parsing' && (
          <>
            <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-blue-600 font-medium text-sm">Parsing your file…</p>
          </>
        )}

        {/* Done */}
        {status === 'done' && result && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500">
              <Icon d={ICONS.check} size={28} />
            </div>
            <p className="font-semibold text-emerald-700 text-sm">Import Successful!</p>
            <p className="text-xs text-slate-500">
              <span className="font-bold text-emerald-600">{result.validRows}</span> of{' '}
              <span className="font-bold">{result.totalRows}</span> contacts ready
            </p>
          </>
        )}

        {/* Error */}
        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-red-400">
              <Icon d={ICONS.xCircle} size={28} />
            </div>
            <p className="font-semibold text-red-600 text-sm">Import Failed</p>
            <p className="text-xs text-slate-400">Fix the errors below, then try again</p>
          </>
        )}
      </div>

      {/* Errors */}
      {result?.errors?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 space-y-1.5">
          {result.errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-red-700">
              <Icon d={ICONS.x} size={12} className="flex-shrink-0 mt-0.5" />
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {result?.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
              <Icon d={ICONS.warn} size={12} className="flex-shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Preview table */}
      {status === 'done' && result?.data?.length > 0 && (
        <div className="border border-blue-100 rounded-xl overflow-hidden bg-white">
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
            <span className="text-xs font-bold text-blue-700">Preview — {result.data.length} contacts</span>
            <span className="text-xs text-slate-400">First 5 shown</span>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider text-[10px] w-8">#</th>
                <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Name</th>
                <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {result.data.slice(0, 5).map((r, i) => (
                <tr key={i} className="hover:bg-blue-50/40">
                  <td className="px-4 py-2 text-slate-300 font-mono">{i + 1}</td>
                  <td className="px-4 py-2 text-slate-700 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-blue-500 font-mono">{r.contacts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.data.length > 5 && (
            <p className="text-xs text-slate-400 px-4 py-2 bg-slate-50/50">+{result.data.length - 5} more rows…</p>
          )}
        </div>
      )}

      {status !== 'idle' && (
        <button type="button" onClick={reset}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors">
          Clear and upload a different file
        </button>
      )}
    </div>
  )
}

// ── New Campaign Modal ────────────────────────────────────────────────────────
const EMPTY_FORM = { name: '', type: 'Outbound', voice: 'Nova', duration: '2 min', schedule: '', description: '' }

function NewCampaignModal({ onClose, onSave }) {
  const [form, setForm]         = useState(EMPTY_FORM)
  const [contacts, setContacts] = useState([])
  const [tab, setTab]           = useState('excel')
  const [errors, setErrors]     = useState({})
  const [saving, setSaving]     = useState(false)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  const validate = () => {
    const e = {}
    if (!form.name.trim())     e.name     = 'Campaign name is required'
    if (!form.schedule.trim()) e.schedule = 'Schedule is required'
    setErrors(e)
    return !Object.keys(e).length
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 400)) // simulate save
    onSave({ ...form, contacts: contacts.length || 0, done: 0, status: 'draft', id: 'c_' + Date.now(), created: new Date().toISOString().split('T')[0] })
    setSaving(false)
    onClose()
  }

  // Field classes
  const fieldBase = 'w-full px-3.5 py-2.5 border rounded-xl text-sm text-slate-700 bg-slate-50/60 outline-none transition-all focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
  const fieldErr  = 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100'
  const fieldOk   = 'border-blue-100 hover:border-blue-200'
  const fc = (k) => `${fieldBase} ${errors[k] ? fieldErr : fieldOk}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl shadow-blue-900/10 border border-blue-100 w-full max-w-[600px] max-h-[92vh] flex flex-col animate-[fadeIn_0.2s_ease]"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.25s ease' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-blue-50">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <Icon d={ICONS.mic} size={15} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-blue-900 tracking-tight">New Campaign</h2>
            </div>
            <p className="text-sm text-slate-400">Configure your AI voice campaign</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all">
            <Icon d={ICONS.x} size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 py-6 space-y-7">

          {/* Section 1: Basic Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Basic Info</span>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Campaign Name <span className="text-red-400">*</span></label>
              <input className={fc('name')} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Summer Outreach 2025" />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            {/* Row: Type + Voice */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Campaign Type</label>
                <select className={fc()} value={form.type} onChange={e => set('type', e.target.value)}>
                  {CAMPAIGN_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">AI Voice</label>
                <select className={fc()} value={form.voice} onChange={e => set('voice', e.target.value)}>
                  {VOICE_OPTIONS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Row: Duration + Schedule */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Duration</label>
                <select className={fc()} value={form.duration} onChange={e => set('duration', e.target.value)}>
                  {DURATION_OPTIONS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Schedule <span className="text-red-400">*</span></label>
                <input className={fc('schedule')} value={form.schedule} onChange={e => set('schedule', e.target.value)} placeholder="Weekdays 9 AM – 5 PM" />
                {errors.schedule && <p className="text-xs text-red-500 mt-1">{errors.schedule}</p>}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Description <span className="text-slate-300 font-normal">(optional)</span>
              </label>
              <textarea
                className={`${fc()} resize-none`} rows={2}
                value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Brief goal of this campaign…"
              />
            </div>
          </div>

          {/* Section 2: Contacts */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contact List</span>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              {[
                { key: 'excel',  label: 'Import Excel / CSV', icon: 'sheet'  },
                { key: 'manual', label: 'Add Manually Later', icon: 'info'   },
              ].map(t => (
                <button
                  key={t.key} type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    tab === t.key
                      ? 'bg-white text-blue-700 shadow-sm shadow-blue-100 border border-blue-100'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon d={ICONS[t.icon]} size={14} />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'excel' && <ExcelDropZone onImport={data => setContacts(data)} />}

            {tab === 'manual' && (
              <div className="flex gap-3 items-start bg-blue-50 border border-dashed border-blue-200 rounded-xl p-4">
                <Icon d={ICONS.info} size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 leading-relaxed">
                  Contacts can be added from the <strong>Contacts</strong> tab after creating the campaign.
                  The campaign will stay in <em>Draft</em> status until contacts are assigned.
                </p>
              </div>
            )}

            {contacts.length > 0 && (
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3.5 py-2 rounded-full text-sm font-semibold">
                <Icon d={ICONS.users} size={14} />
                {contacts.length} contacts ready to import
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-blue-50">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-blue-100 text-slate-500 text-sm font-medium hover:border-blue-300 hover:text-slate-700 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:translate-y-0">
            {saving
              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
              : <><Icon d={ICONS.plus} size={15} />Create Campaign</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Campaign Component ───────────────────────────────────────────────────
const FILTERS = ['all', 'active', 'paused', 'draft', 'ended']

export default function Campaign() {
  const [campaigns, setCampaigns] = useState(SEED)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')

  // Listen for global event from parent layout if needed
  useEffect(() => {
    const fn = () => setShowModal(true)
    window.addEventListener('open-new-campaign', fn)
    return () => window.removeEventListener('open-new-campaign', fn)
  }, [])

  const filtered = campaigns
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))

  const countOf = (f) => f === 'all' ? campaigns.length : campaigns.filter(c => c.status === f).length

  const stats = {
    total:   campaigns.length,
    active:  campaigns.filter(c => c.status === 'active').length,
    contacts:campaigns.reduce((s, c) => s + c.contacts, 0),
  }

  const handleCreate = (c) => setCampaigns(prev => [c, ...prev])
  const handleDelete = (id) => setCampaigns(prev => prev.filter(c => c.id !== id))
  const handleToggle = (id) => setCampaigns(prev => prev.map(c =>
    c.id === id ? { ...c, status: c.status === 'active' ? 'paused' : 'active' } : c
  ))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/60 via-white to-slate-50 p-6 md:p-8">
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(16px) scale(.98) } to { opacity:1; transform:none } }
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        .animate-fade-in { animation: fadeIn .3s ease both }
      `}</style>

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Icon d={ICONS.zap} size={15} className="text-white" fill />
            </div>
            <h1 className="text-2xl font-bold text-blue-900 tracking-tight">Campaigns</h1>
          </div>
          <p className="text-sm text-slate-400 ml-[42px]">Manage and monitor your AI voice campaigns</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-blue-500 to-blue-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all self-start sm:self-auto"
        >
          <Icon d={ICONS.plus} size={16} /> New Campaign
        </button>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <StatCard icon="zap"   label="Total Campaigns" value={stats.total}                        color="bg-blue-50 text-blue-500"    />
        <StatCard icon="mic"   label="Active Now"       value={stats.active}                       color="bg-emerald-50 text-emerald-500" />
        <StatCard icon="users" label="Total Contacts"   value={stats.contacts.toLocaleString()}    color="bg-violet-50 text-violet-500"  />
        <StatCard icon="clock" label="Avg. Duration"    value="2.8 min" sub="across campaigns"     color="bg-amber-50 text-amber-500"    />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-blue-100 text-slate-500 hover:border-blue-200 hover:text-slate-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                filter === f ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
              }`}>
                {countOf(f)}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-blue-100 rounded-xl px-3.5 py-2 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50 transition-all">
          <Icon d={ICONS.search} size={14} className="text-slate-300 flex-shrink-0" />
          <input
            className="text-sm text-slate-700 placeholder:text-slate-300 outline-none bg-transparent w-44"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Campaign Grid ────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-200 mb-4">
            <Icon d={ICONS.mic} size={32} />
          </div>
          <p className="font-semibold text-slate-500 text-lg">No campaigns found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? `No results for "${search}"` : 'Create your first campaign to get started'}
          </p>
          {!search && (
            <button onClick={() => setShowModal(true)}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
              <Icon d={ICONS.plus} size={15} /> Create Campaign
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in">
          {filtered.map(c => (
            <CampaignCard key={c.id} c={c} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {/* ── Modal ───────────────────────────────────────────────── */}
      {showModal && <NewCampaignModal onClose={() => setShowModal(false)} onSave={handleCreate} />}
    </div>
  )
}
