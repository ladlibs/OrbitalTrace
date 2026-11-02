import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase/client'
import { 
  Trash2, 
  Upload, 
  Satellite, 
  Layers, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Search,
  Sparkles,
  RefreshCw,
  X,
  CheckSquare,
  Square
} from 'lucide-react'
import { Tooltip } from '../components/Tooltip'

interface ManageFramesPageProps {
  initialTab?: 'library' | 'upload'
}

export default function ManageFramesPage({ initialTab = 'library' }: ManageFramesPageProps) {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>(initialTab)

  // Frames library state
  const [frames, setFrames] = useState<any[]>([])
  const [contributions, setContributions] = useState<any[]>([])
  const [loadingFrames, setLoadingFrames] = useState(true)
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RAW' | 'RECONSTRUCTED'>('ALL')
  
  // Deletion modal state
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [framesToDelete, setFramesToDelete] = useState<string[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Upload Form state
  const [satellites, setSatellites] = useState<any[]>([])
  const [sensors, setSensors] = useState<any[]>([])
  const [selectedSatelliteId, setSelectedSatelliteId] = useState('')
  const [selectedSensorId, setSelectedSensorId] = useState('')
  const [cloudCover, setCloudCover] = useState('0')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  // Fetch frames and contributions
  useEffect(() => {
    loadFramesData()
    loadSatellites()
  }, [])

  async function loadFramesData() {
    try {
      setLoadingFrames(true)
      setActionError(null)

      const { data: framesData, error: fErr } = await supabase
        .from('raw_frame')
        .select(`
          frame_id, capture_timestamp, cloud_cover_pct, status, sensor_id, image_url, source_dataset, scene_id,
          sensor (sensor_id, sensor_type, resolution, satellite (satellite_id, name, agency))
        `)
        .order('capture_timestamp', { ascending: false })

      if (fErr) throw fErr

      const { data: ctData, error: ctErr } = await supabase
        .from('contributes_to')
        .select('frame_id, job_id')

      if (ctErr) throw ctErr

      setFrames(framesData || [])
      setContributions(ctData || [])
    } catch (err: any) {
      console.error('Error fetching frames:', err)
      setActionError(err.message || 'Failed to load frames.')
    } finally {
      setLoadingFrames(false)
    }
  }

  async function loadSatellites() {
    const { data } = await supabase.from('satellite').select('satellite_id, name')
    setSatellites(data || [])
  }

  // Load Sensors when Satellite changes for upload
  useEffect(() => {
    if (!selectedSatelliteId) {
      setSensors([])
      setSelectedSensorId('')
      return
    }
    async function loadSensors() {
      const { data } = await supabase
        .from('sensor')
        .select('*')
        .eq('satellite_id', selectedSatelliteId)
      setSensors(data || [])
      setSelectedSensorId('')
    }
    loadSensors()
  }, [selectedSatelliteId])

  // Filter frames
  const filteredFrames = frames.filter((f) => {
    const isReconstructed = f.source_dataset === 'RECONSTRUCTED' || String(f.frame_id).startsWith('REC-')
    if (typeFilter === 'RAW' && isReconstructed) return false
    if (typeFilter === 'RECONSTRUCTED' && !isReconstructed) return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchId = String(f.frame_id).toLowerCase().includes(q)
      const matchScene = String(f.scene_id || '').toLowerCase().includes(q)
      const matchStatus = String(f.status || '').toLowerCase().includes(q)
      const satName = f.sensor?.satellite?.name?.toLowerCase() || ''
      if (!matchId && !matchScene && !matchStatus && !satName.includes(q)) return false
    }

    return true
  })

  // Selection handlers
  const toggleSelectFrame = (id: string) => {
    setSelectedFrameIds((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const selectAllVisible = () => {
    const visibleIds = filteredFrames.map((f) => String(f.frame_id))
    setSelectedFrameIds(visibleIds)
  }

  const deselectAll = () => {
    setSelectedFrameIds([])
  }

  // Calculate dependent jobs for a set of frame IDs
  const getDependentJobs = (targetFrameIds: string[]) => {
    const jobIds = new Set<string>()
    contributions.forEach((ct) => {
      if (targetFrameIds.includes(String(ct.frame_id))) {
        jobIds.add(String(ct.job_id))
      }
    })
    return Array.from(jobIds)
  }

  // Open single delete
  const handleRequestSingleDelete = (frameId: string) => {
    setFramesToDelete([String(frameId)])
    setShowConfirmModal(true)
  }

  // Open batch delete
  const handleRequestBatchDelete = () => {
    if (selectedFrameIds.length === 0) return
    setFramesToDelete([...selectedFrameIds])
    setShowConfirmModal(true)
  }

  // Execute deletion
  const executeDelete = async () => {
    if (framesToDelete.length === 0) return
    setIsDeleting(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/frames/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame_ids: framesToDelete })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete frames via backend pipeline')
      }

      const deletedCount = result.deleted_frames?.length || framesToDelete.length
      const deletedJobsCount = result.deleted_jobs?.length || 0

      setActionSuccess(
        `Successfully deleted ${deletedCount} frame(s) and cascade-removed ${deletedJobsCount} dependent reconstruction job(s) and child outputs.`
      )

      setSelectedFrameIds((prev) => prev.filter((id) => !framesToDelete.includes(id)))
      setShowConfirmModal(false)
      setFramesToDelete([])

      // Refresh list
      await loadFramesData()
    } catch (err: any) {
      console.error('Delete error:', err)
      setActionError(err.message || 'Failed to complete cascade deletion. Check table permissions.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Upload handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError(null)
    setUploadSuccess(false)

    if (!selectedSensorId) return setUploadError('Please select a sensor.')
    if (uploadFiles.length === 0) return setUploadError('Please select at least one image file.')

    setUploadLoading(true)

    try {
      for (const file of uploadFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `raw-frames/${fileName}`

        const { error: uploadErr } = await supabase.storage
          .from('satellite-images')
          .upload(filePath, file)

        if (uploadErr) throw uploadErr

        const { data: { publicUrl } } = supabase.storage
          .from('satellite-images')
          .getPublicUrl(filePath)

        const { error: dbError } = await supabase
          .from('raw_frame')
          .insert({
            sensor_id: selectedSensorId,
            capture_timestamp: new Date().toISOString(),
            cloud_cover_pct: parseFloat(cloudCover),
            status: 'USABLE',
            image_url: publicUrl
          })

        if (dbError) throw dbError
      }

      setUploadSuccess(true)
      setUploadFiles([])
      setCloudCover('0')
      const fileInput = document.getElementById('file-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''

      // Refresh frames list
      loadFramesData()
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload frames.')
    } finally {
      setUploadLoading(false)
    }
  }

  const affectedJobsInModal = getDependentJobs(framesToDelete)

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-12">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Satellite Frame & Ingestion Manager
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Browse and purge unwanted telemetry frames, or ingest fresh imagery into the reconstruction pipeline.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('library')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'library'
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Frames Library ({frames.length})
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            Upload New Frames
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* TAB 1: FRAMES LIBRARY & DELETION */}
      {activeTab === 'library' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Filters Bar */}
          <div className="glass-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by Frame ID, satellite..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="glass-input w-full pl-8 py-1.5 text-xs"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setTypeFilter('ALL')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                    typeFilter === 'ALL' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({frames.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('RAW')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                    typeFilter === 'RAW' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Raw Satellites
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('RECONSTRUCTED')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded flex items-center gap-1 ${
                    typeFilter === 'RECONSTRUCTED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  Reconstructed Products
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllVisible}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                Select All ({filteredFrames.length})
              </button>
              {selectedFrameIds.length > 0 && (
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5"
                >
                  Clear Selection
                </button>
              )}
              <button
                type="button"
                onClick={loadFramesData}
                className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* DYNAMIC BATCH ACTION BAR (Shown when items are selected) */}
          {selectedFrameIds.length > 0 && (
            <div className="glass-panel p-4 bg-rose-950/20 border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-950 border border-rose-800 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    <span>{selectedFrameIds.length} Frame(s) Selected for Deletion</span>
                  </div>
                  <div className="text-[11px] text-rose-300/80 mt-0.5">
                    Cascade Impact: <span className="font-mono font-bold text-rose-200">{getDependentJobs(selectedFrameIds).length}</span> reconstruction job(s) and their child image outputs will be permanently deleted.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={deselectAll}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRequestBatchDelete}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs flex items-center gap-1.5 shadow transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete {selectedFrameIds.length} Frame(s) & Lineage
                </button>
              </div>
            </div>
          )}

          {/* FRAMES TABLE */}
          {loadingFrames ? (
            <div className="p-12 text-center text-cyan-400 font-mono text-xs animate-pulse">
              Loading frames library...
            </div>
          ) : filteredFrames.length === 0 ? (
            <div className="glass-panel p-12 text-center text-slate-500 font-mono text-xs">
              No telemetry frames match your filter criteria.
            </div>
          ) : (
            <div className="glass-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedFrameIds.length === filteredFrames.length && filteredFrames.length > 0}
                          onChange={(e) => e.target.checked ? selectAllVisible() : deselectAll()}
                          className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                        />
                      </th>
                      <th className="p-3">Source Type</th>
                      <th className="p-3">Frame ID</th>
                      <th className="p-3">Platform / Sensor</th>
                      <th className="p-3">Capture Date</th>
                      <th className="p-3">Cloud Cover</th>
                      <th className="p-3">Dependent Lineage</th>
                      <th className="p-3">Preview</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredFrames.map((rf) => {
                      const frameIdStr = String(rf.frame_id)
                      const isSelected = selectedFrameIds.includes(frameIdStr)
                      const isRecon = rf.source_dataset === 'RECONSTRUCTED' || frameIdStr.startsWith('REC-')
                      const dependentJobs = getDependentJobs([frameIdStr])

                      return (
                        <tr 
                          key={rf.frame_id}
                          className={`transition-colors ${
                            isSelected ? 'bg-rose-950/20' : 'hover:bg-slate-900/40'
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectFrame(frameIdStr)}
                              className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-sans">
                            {isRecon ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                                <Sparkles className="w-2.5 h-2.5" /> RECONSTRUCTED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1 w-fit">
                                <Satellite className="w-2.5 h-2.5" /> RAW SATELLITE
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-bold">
                            {isRecon ? (
                              <span className="text-emerald-400">
                                Product #{rf.scene_id || frameIdStr.replace('REC-', '')}
                                <span className="text-[10px] text-slate-500 font-normal block font-sans">
                                  Ref: #{rf.frame_id}
                                </span>
                              </span>
                            ) : (
                              <span className="text-cyan-400">#{rf.frame_id}</span>
                            )}
                          </td>
                          <td className="p-3 font-sans text-slate-300 text-[11px] font-medium">
                            {rf.sensor?.satellite?.name || 'Sentinel-2A'}, {rf.sensor?.resolution ? `${Math.round(rf.sensor.resolution)} m` : '10 m'}
                          </td>
                          <td className="p-3 font-sans text-slate-400 text-[11px]">
                            {new Date(rf.capture_timestamp).toLocaleString()}
                          </td>
                          <td className="p-3 font-mono">
                            {isRecon ? (
                              <span className="text-emerald-400">0.00%</span>
                            ) : (
                              <span className={rf.cloud_cover_pct > 50 ? 'text-rose-400 font-semibold' : 'text-slate-300 font-semibold'}>
                                {Number(rf.cloud_cover_pct || 0).toFixed(2)}%
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-sans">
                            {dependentJobs.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-amber-300 font-mono">
                                Used in {dependentJobs.length} job(s)
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">None (Unused)</span>
                            )}
                          </td>
                          <td className="p-3">
                            {rf.image_url ? (
                              <img 
                                src={rf.image_url} 
                                alt="" 
                                className="w-8 h-8 rounded object-cover border border-slate-700 bg-slate-950" 
                              />
                            ) : (
                              <span className="text-slate-600 text-[10px] font-sans">No Image</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRequestSingleDelete(frameIdStr)}
                              className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                              title="Delete Frame & Children"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: INGEST NEW RAW FRAMES */}
      {activeTab === 'upload' && (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
          
          {uploadError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Frame uploaded and database record created successfully!</span>
            </div>
          )}

          <form onSubmit={handleUploadSubmit} className="glass-panel p-6 space-y-5">
            <div>
              <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                <Satellite className="w-3.5 h-3.5 text-cyan-400" /> Select Satellite
              </label>
              <select
                value={selectedSatelliteId}
                onChange={(e) => setSelectedSatelliteId(e.target.value)}
                className="glass-input w-full text-sm"
                required
              >
                <option value="">-- Choose a Satellite --</option>
                {satellites.map((sat) => (
                  <option key={sat.satellite_id} value={sat.satellite_id}>{sat.name}</option>
                ))}
              </select>
            </div>

            {selectedSatelliteId && (
              <div className="animate-fade-in">
                <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" /> Select Sensor
                </label>
                <select
                  value={selectedSensorId}
                  onChange={(e) => setSelectedSensorId(e.target.value)}
                  className="glass-input w-full text-sm"
                  required
                >
                  <option value="">-- Choose a Sensor --</option>
                  {sensors.map((s) => (
                    <option key={s.sensor_id} value={s.sensor_id}>
                      Sensor #{s.sensor_id} ({s.sensor_type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedSensorId && (
              <div className="space-y-4 animate-fade-in pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cloud Cover (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={cloudCover}
                    onChange={(e) => setCloudCover(e.target.value)}
                    className="glass-input w-full text-sm font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" /> Image File(s)
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                    className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-950 file:text-indigo-300 hover:file:bg-indigo-900 cursor-pointer"
                    required
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={uploadLoading || !selectedSensorId || uploadFiles.length === 0}
              className="btn-primary w-full py-2.5 mt-4"
            >
              {uploadLoading ? 'Uploading & Saving...' : `Upload & Save ${uploadFiles.length || ''} Frame(s)`}
            </button>
          </form>
        </div>
      )}

      {/* CONFIRMATION DELETION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel max-w-lg w-full p-6 border-rose-900/60 space-y-5 bg-slate-950 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-rose-950 border border-rose-800 text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-100">
                  Confirm Permanent Deletion
                </h3>
                <p className="text-xs text-slate-400">
                  This is a permanent operation. All telemetry frames listed below along with their entire downstream reconstruction lineage will be destroyed.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between font-mono">
                <span className="text-slate-400">Frames to Delete:</span>
                <span className="text-rose-400 font-bold">{framesToDelete.length} frame(s)</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-400">Dependent Jobs to Cascade:</span>
                <span className="text-amber-400 font-bold">{affectedJobsInModal.length} job(s)</span>
              </div>
              {affectedJobsInModal.length > 0 && (
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                  Affected Job IDs: <span className="font-mono text-slate-300">#{affectedJobsInModal.join(', #')}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowConfirmModal(false)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeDelete}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting Lineage...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Permanently Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
