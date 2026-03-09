// src/components/Campaign.jsx
import { useState, useRef, useCallback, useEffect } from 'react'
import api from '../utils/api'

// ── Tiny SVG icons ────────────────────────────────────────────────────────────
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
  phone:   <><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></>,
  signal:  <><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/></>,
}

const STATUS_STYLES = {
  draft:     { badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',     dot: 'bg-blue-400'    },
  running:   { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  paused:    { badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',  dot: 'bg-amber-400'   },
  completed: { badge: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200', dot: 'bg-slate-400'   },
  failed:    { badge: 'bg-red-50 text-red-600 ring-1 ring-red-200',        dot: 'bg-red-400'     },
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

function CampaignCard({ c, onDelete, onStart }) {
  const date = new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const done = (c.progress?.completed || 0) + (c.progress?.failed || 0)
  return (
    <article className="bg-white border border-blue-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-800 truncate text-[15px] leading-snug mb-2">{c.name}</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="bg-blue-50 text-blue-600 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Icon d={ICONS.mic} size={10} className="opacity-60" /> {c.agentName}
            </span>
            <span className="bg-slate-50 text-slate-500 text-xs px-2.5 py-0.5 rounded-full">
              {c.totalContacts} contacts
            </span>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {/* Progress */}
      {c.status !== 'draft' && c.totalContacts > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{done} / {c.totalContacts} calls processed</span>
            {c.progress?.failed > 0 && (
              <span className="text-red-400">{c.progress.failed} failed</span>
            )}
          </div>
          <ProgressBar done={c.progress?.completed || 0} total={c.totalContacts} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-blue-50">
        <span className="text-xs text-slate-300">Created {date}</span>
        <div className="flex gap-2">
          {c.status === 'draft' && (
            <button
              onClick={() => onStart(c._id)}
              title="Start Campaign"
              className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-all hover:scale-105"
            >
              <Icon d={ICONS.play} size={13} fill={true} />
            </button>
          )}
          {c.status !== 'running' && (
            <button
              onClick={() => onDelete(c._id)}
              title="Delete"
              className="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-all hover:scale-105"
            >
              <Icon d={ICONS.trash} size={13} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

// ── File Drop Zone (real upload) ──────────────────────────────────────────────
function FileDropZone({ onFileSelect, selectedFile, uploading }) {
  const inputRef = useRef()
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileSelect(file)
  }

  const zoneBase = 'border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 cursor-pointer flex flex-col items-center gap-3'
  const zoneVariant =
    isDragging       ? 'border-blue-400 bg-blue-50 shadow-inner'
    : uploading      ? 'border-blue-300 bg-blue-50/50 cursor-wait'
    : selectedFile   ? 'border-emerald-400 bg-emerald-50 cursor-default'
    : 'border-blue-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50'

  return (
    <div
      className={`${zoneBase} ${zoneVariant}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => !selectedFile && !uploading && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFileSelect(e.target.files[0]) }} />

      {uploading ? (
        <>
          <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-blue-600 font-medium text-sm">Uploading & parsing…</p>
        </>
      ) : selectedFile ? (
        <>
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500">
            <Icon d={ICONS.check} size={28} />
          </div>
          <p className="font-semibold text-emerald-700 text-sm">{selectedFile.name}</p>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-400">
            <Icon d={ICONS.sheet} size={28} />
          </div>
          <div>
            <p className="font-semibold text-slate-700 text-sm">Drop your CSV or Excel file here</p>
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
            <code className="bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-mono text-[11px]">phone / mobile</code>
          </p>
        </>
      )}
    </div>
  )
}

// ── New Campaign Modal ────────────────────────────────────────────────────────
function NewCampaignModal({ onClose, onSave, agents, availableChannels }) {
  const [name, setName]             = useState('')
  const [agentId, setAgentId]       = useState(agents[0]?._id || '')
  const [file, setFile]             = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [preview, setPreview]       = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const [error, setError]           = useState('')
  const [channelCount, setChannelCount] = useState(Math.min(availableChannels, 5))

  const handleUpload = async () => {
    if (!name.trim()) { setError('Campaign name is required'); return }
    if (!agentId) { setError('Select an agent'); return }
    if (!file) { setError('Upload a contact file'); return }

    setError('')
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      formData.append('agentId', agentId)

      const { data } = await api.post('/api/campaigns/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      if (data.success) {
        setPreview(data)
        onSave(data.campaign)
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed')
      if (err.response?.data?.errors) {
        setParseErrors(err.response.data.errors)
      }
    } finally {
      setUploading(false)
    }
  }

  const fieldBase = 'w-full px-3.5 py-2.5 border rounded-xl text-sm text-slate-700 bg-slate-50/60 outline-none transition-all focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 border-blue-100 hover:border-blue-200'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl shadow-blue-900/10 border border-blue-100 w-full max-w-[600px] max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.25s ease' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-blue-50">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <Icon d={ICONS.phone} size={15} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-blue-900 tracking-tight">New Campaign</h2>
            </div>
            <p className="text-sm text-slate-400">Upload contacts and launch outbound calls</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all">
            <Icon d={ICONS.x} size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 py-6 space-y-6">

          {/* Available Channels Info */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
              <Icon d={ICONS.signal} size={18} className="text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-blue-900">{availableChannels} channels available</div>
              <div className="text-xs text-slate-400">Max simultaneous calls you can make</div>
            </div>
          </div>

          {/* Campaign Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Campaign Name <span className="text-red-400">*</span></label>
            <input className={fieldBase} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. March Sales Outreach" />
          </div>

          {/* Agent Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">AI Agent <span className="text-red-400">*</span></label>
            <select className={fieldBase} value={agentId} onChange={e => setAgentId(e.target.value)}>
              {agents.length === 0 && <option value="">No agents found</option>}
              {agents.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>

          {/* Channels to use */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Simultaneous Channels
              <span className="text-slate-300 font-normal ml-1">(max {availableChannels})</span>
            </label>
            <input
              type="number"
              min={1}
              max={availableChannels || 1}
              className={fieldBase}
              value={channelCount}
              onChange={e => setChannelCount(Math.max(1, Math.min(availableChannels || 1, parseInt(e.target.value) || 1)))}
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact File <span className="text-red-400">*</span></label>
            <FileDropZone
              onFileSelect={setFile}
              selectedFile={file}
              uploading={uploading}
            />
            {file && !preview && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors mt-2"
              >
                Clear and choose a different file
              </button>
            )}
          </div>

          {/* Preview */}
          {preview && (
            <div className="border border-blue-100 rounded-xl overflow-hidden bg-white">
              <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                <span className="text-xs font-bold text-emerald-700">
                  ✅ {preview.validContacts} contacts parsed from {preview.totalRows} rows
                </span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider text-[10px] w-8">#</th>
                    <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Name</th>
                    <th className="px-4 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {preview.preview.slice(0, 5).map((r, i) => (
                    <tr key={i} className="hover:bg-blue-50/40">
                      <td className="px-4 py-2 text-slate-300 font-mono">{i + 1}</td>
                      <td className="px-4 py-2 text-slate-700 font-medium">{r.name || '—'}</td>
                      <td className="px-4 py-2 text-blue-500 font-mono">{r.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.preview.length > 5 && (
                <p className="text-xs text-slate-400 px-4 py-2 bg-slate-50/50">+{preview.preview.length - 5} more shown…</p>
              )}
            </div>
          )}

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
              {parseErrors.slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
                  <Icon d={ICONS.warn} size={12} className="flex-shrink-0 mt-0.5" />
                  <span>{e}</span>
                </div>
              ))}
              {parseErrors.length > 5 && (
                <div className="text-xs text-amber-500">+{parseErrors.length - 5} more warnings…</div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2 text-sm text-red-700">
              <Icon d={ICONS.xCircle} size={16} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-blue-50">
          <button type="button" onClick={onClose} disabled={uploading}
            className="px-5 py-2.5 rounded-xl border border-blue-100 text-slate-500 text-sm font-medium hover:border-blue-300 hover:text-slate-700 transition-all disabled:opacity-50">
            Cancel
          </button>
          {!preview ? (
            <button type="button" onClick={handleUpload} disabled={uploading || !file || !name.trim() || !agentId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:translate-y-0">
              {uploading
                ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading…</>
                : <><Icon d={ICONS.upload} size={15} />Upload & Parse</>
              }
            </button>
          ) : (
            <button type="button" onClick={onClose}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-sm font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-xl transition-all">
              <Icon d={ICONS.check} size={15} />Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Start Campaign Modal ──────────────────────────────────────────────────────
function StartCampaignModal({ campaign, availableChannels, onClose, onConfirm }) {
  const [channelCount, setChannelCount] = useState(Math.min(availableChannels, 5))
  const [starting, setStarting] = useState(false)

  const handleStart = async () => {
    setStarting(true)
    await onConfirm(campaign._id, channelCount)
    setStarting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 w-full max-w-md p-7 space-y-5" onClick={e => e.stopPropagation()} style={{ animation: 'slideUp 0.25s ease' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Icon d={ICONS.play} size={18} className="text-white" fill />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Start Campaign</h3>
            <p className="text-sm text-slate-400">{campaign.name}</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Total contacts</span>
            <span className="font-bold text-slate-700">{campaign.totalContacts}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Available channels</span>
            <span className="font-bold text-blue-600">{availableChannels}</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Channels to use <span className="text-slate-300 font-normal">(1-{availableChannels})</span>
            </label>
            <input
              type="number" min={1} max={availableChannels || 1}
              className="w-full px-3.5 py-2.5 border border-blue-100 rounded-xl text-sm text-slate-700 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              value={channelCount}
              onChange={e => setChannelCount(Math.max(1, Math.min(availableChannels || 1, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <button onClick={onClose} disabled={starting} className="px-4 py-2 rounded-xl border border-blue-100 text-slate-500 text-sm font-medium hover:border-blue-300 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleStart} disabled={starting || availableChannels === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-sm font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-xl transition-all disabled:opacity-60">
            {starting
              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Starting…</>
              : <><Icon d={ICONS.play} size={14} fill />Start Calling</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Campaign Component ───────────────────────────────────────────────────
const FILTERS = ['all', 'draft', 'running', 'completed', 'failed']

export default function Campaign() {
  const [campaigns, setCampaigns]   = useState([])
  const [showModal, setShowModal]   = useState(false)
  const [startModal, setStartModal] = useState(null) // campaign to start
  const [filter, setFilter]         = useState('all')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)

  // Channel info
  const [channelInfo, setChannelInfo] = useState({
    availableChannels: 0,
    totalOwned: 0,
    linkedToAgents: 0,
  })

  // Agents list
  const [agents, setAgents] = useState([])

  // Fetch data on mount
  useEffect(() => {
    fetchCampaigns()
    fetchChannels()
    fetchAgents()
  }, [])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/api/campaigns')
      if (data.success) setCampaigns(data.campaigns)
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchChannels = async () => {
    try {
      const { data } = await api.get('/api/campaigns/available-channels')
      if (data.success) setChannelInfo(data)
    } catch (err) {
      console.error('Failed to fetch channels:', err)
    }
  }

  const fetchAgents = async () => {
    try {
      const { data } = await api.get('/api/agents')
      // Agent endpoint returns a bare array
      if (Array.isArray(data)) setAgents(data)
      else if (data.success) setAgents(data.agents || [])
    } catch (err) {
      console.error('Failed to fetch agents:', err)
    }
  }

  const filtered = campaigns
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))

  const countOf = (f) => f === 'all' ? campaigns.length : campaigns.filter(c => c.status === f).length

  const handleCreate = (campaign) => {
    setCampaigns(prev => [campaign, ...prev])
    fetchChannels() // refresh channels
  }

  const handleDelete = async (id) => {
    try {
      const { data } = await api.delete(`/api/campaigns/${id}`)
      if (data.success) {
        setCampaigns(prev => prev.filter(c => c._id !== id))
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handleStartCampaign = async (id, channelCount) => {
    try {
      const { data } = await api.post(`/api/campaigns/${id}/start`, { channelCount })
      if (data.success) {
        setCampaigns(prev => prev.map(c =>
          c._id === id ? { ...c, status: 'running', channelsUsed: data.channelsUsed } : c
        ))
        setStartModal(null)
        fetchChannels() // refresh
      }
    } catch (err) {
      console.error('Start failed:', err)
      alert(err.response?.data?.error || 'Failed to start campaign')
    }
  }

  const stats = {
    total:    campaigns.length,
    running:  campaigns.filter(c => c.status === 'running').length,
    contacts: campaigns.reduce((s, c) => s + (c.totalContacts || 0), 0),
  }

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
          <p className="text-sm text-slate-400 ml-[42px]">Upload contacts & run batch outbound campaigns</p>
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
        <StatCard icon="zap"    label="Total Campaigns" value={stats.total}                         color="bg-blue-50 text-blue-500"       />
        <StatCard icon="mic"    label="Running Now"     value={stats.running}                       color="bg-emerald-50 text-emerald-500" />
        <StatCard icon="users"  label="Total Contacts"  value={stats.contacts.toLocaleString()}     color="bg-violet-50 text-violet-500"   />
        <StatCard
          icon="signal"
          label="Available Channels"
          value={channelInfo.availableChannels}
          sub={`${channelInfo.linkedToAgents} linked · ${channelInfo.totalOwned} total`}
          color="bg-amber-50 text-amber-500"
        />
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
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-200 mb-4">
            <Icon d={ICONS.phone} size={32} />
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
            <CampaignCard
              key={c._id}
              c={c}
              onDelete={handleDelete}
              onStart={(id) => setStartModal(campaigns.find(x => x._id === id))}
            />
          ))}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {showModal && (
        <NewCampaignModal
          onClose={() => setShowModal(false)}
          onSave={handleCreate}
          agents={agents}
          availableChannels={channelInfo.availableChannels}
        />
      )}

      {startModal && (
        <StartCampaignModal
          campaign={startModal}
          availableChannels={channelInfo.availableChannels}
          onClose={() => setStartModal(null)}
          onConfirm={handleStartCampaign}
        />
      )}
    </div>
  )
}
