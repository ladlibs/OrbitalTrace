import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../lib/supabase/client'
import { 
  PlusCircle, 
  Satellite, 
  Layers, 
  CheckSquare, 
  Cpu, 
  Sliders, 
  Plus, 
  Trash2, 
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Search,
  Image as ImageIcon,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { Tooltip } from '../components/Tooltip'

interface SelectedFrame {
  frame_id: string | number
  weight: number
  capture_timestamp: string
  cloud_cover_pct: number
  status?: string
  image_url?: string
  source_dataset?: string
  scene_id?: string
}

export default function LogNewJobPage() {
  const navigate = useNavigate()
  const supabase = createClient()

  // Data sources
  const [satellites, setSatellites] = useState<any[]>([])
  const [sensors, setSensors] = useState<any[]>([])
  const [allFrames, setAllFrames] = useState<any[]>([])
  const [currentAnalyst, setCurrentAnalyst] = useState<any>(null)

  // Mix & Match Filter states
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RAW' | 'RECONSTRUCTED'>('ALL')
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string>('')
  const [selectedSensorId, setSelectedSensorId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedFramesMap, setSelectedFramesMap] = useState<Record<string, SelectedFrame>>({})

  // Form fields
  const [algorithmUsed, setAlgorithmUsed] = useState<string>('POCS')
  const [customAlgorithm, setCustomAlgorithm] = useState<string>('')
  const [paramPairs, setParamPairs] = useState<Array<{ key: string; value: string }>>([
    { key: 'iterations', value: '500' },
    { key: 'learning_rate', value: '0.001' },
  ])
  const [groundTruthFile, setGroundTruthFile] = useState<File | null>(null)

  // UI state
  const [loading, setLoading] = useState(false)
  const [loadingFrames, setLoadingFrames] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Load initial analyst, satellites, and all available frames
  useEffect(() => {
    async function initData() {
      try {
        setLoadingFrames(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: analyst } = await supabase
            .from('analyst')
            .select('*')
            .eq('auth_uid', user.id)
            .single()
          setCurrentAnalyst(analyst)
        }

        const { data: sats } = await supabase.from('satellite').select('satellite_id, name, agency')
        setSatellites(sats || [])

        // Fetch all frames (including previously reconstructed images synced into raw_frame)
        const { data: frames, error: framesErr } = await supabase
          .from('raw_frame')
          .select('frame_id, capture_timestamp, latitude, longitude, cloud_cover_pct, status, sensor_id, image_url, source_dataset, scene_id')
          .order('capture_timestamp', { ascending: false })

        if (framesErr) throw framesErr
        setAllFrames(frames || [])
      } catch (err: any) {
        console.error('Error loading initial data:', err)
        setError('Failed to load frames library: ' + (err.message || 'Unknown error'))
      } finally {
        setLoadingFrames(false)
      }
    }
    initData()
  }, [])

  // When Satellite changes, fetch related sensors
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

  // Frame selection handler — auto-distributes weights evenly on every add/remove
  const toggleFrameSelection = (frame: any) => {
    const frameIdStr = String(frame.frame_id)
    setSelectedFramesMap((prev) => {
      const updated = { ...prev }
      if (updated[frameIdStr]) {
        delete updated[frameIdStr]
      } else {
        updated[frameIdStr] = {
          frame_id: frame.frame_id,
          weight: 0, // will be recalculated below
          capture_timestamp: frame.capture_timestamp,
          cloud_cover_pct: frame.cloud_cover_pct,
          status: frame.status,
          image_url: frame.image_url,
          source_dataset: frame.source_dataset,
          scene_id: frame.scene_id,
        }
      }
      // Redistribute 1/N evenly across all selected frames
      const keys = Object.keys(updated)
      const evenWeight = keys.length > 0 ? parseFloat((1 / keys.length).toFixed(4)) : 0
      keys.forEach((k) => { updated[k] = { ...updated[k], weight: evenWeight } })
      return updated
    })
  }

  const updateFrameWeight = (frameIdStr: string, weightVal: number) => {
    setSelectedFramesMap((prev) => ({
      ...prev,
      [frameIdStr]: {
        ...prev[frameIdStr],
        weight: Math.min(1, Math.max(0, weightVal)),
      },
    }))
  }

  const removeSelectedFrame = (frameIdStr: string) => {
    setSelectedFramesMap((prev) => {
      const updated = { ...prev }
      delete updated[frameIdStr]
      const keys = Object.keys(updated)
      const evenWeight = keys.length > 0 ? parseFloat((1 / keys.length).toFixed(4)) : 0
      keys.forEach((k) => { updated[k] = { ...updated[k], weight: evenWeight } })
      return updated
    })
  }

  const distributeWeightsEvenly = () => {
    const keys = Object.keys(selectedFramesMap)
    if (keys.length === 0) return
    const evenWeight = parseFloat((1 / keys.length).toFixed(4))
    setSelectedFramesMap((prev) => {
      const updated = { ...prev }
      keys.forEach((k) => {
        updated[k] = { ...updated[k], weight: evenWeight }
      })
      return updated
    })
  }

  // Key-value parameter manager
  const addParamPair = () => {
    setParamPairs((prev) => [...prev, { key: '', value: '' }])
  }

  const removeParamPair = (index: number) => {
    setParamPairs((prev) => prev.filter((_, i) => i !== index))
  }

  const updateParamPair = (index: number, field: 'key' | 'value', val: string) => {
    setParamPairs((prev) => {
      const copy = [...prev]
      copy[index][field] = val
      return copy
    })
  }

  // Filtered frames computation
  const filteredFrames = allFrames.filter((f) => {
    const isReconstructed = f.source_dataset === 'RECONSTRUCTED' || String(f.frame_id).startsWith('REC-')
    
    // Type Filter
    if (typeFilter === 'RAW' && isReconstructed) return false
    if (typeFilter === 'RECONSTRUCTED' && !isReconstructed) return false

    // Sensor Filter
    if (selectedSensorId && String(f.sensor_id) !== String(selectedSensorId)) return false

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchId = String(f.frame_id).toLowerCase().includes(q)
      const matchScene = String(f.scene_id || '').toLowerCase().includes(q)
      const matchStatus = String(f.status || '').toLowerCase().includes(q)
      if (!matchId && !matchScene && !matchStatus) return false
    }

    return true
  })

  // Breakdown of selected mix
  const selectedList = Object.values(selectedFramesMap)
  const rawCount = selectedList.filter(f => f.source_dataset !== 'RECONSTRUCTED' && !String(f.frame_id).startsWith('REC-')).length
  const reconCount = selectedList.filter(f => f.source_dataset === 'RECONSTRUCTED' || String(f.frame_id).startsWith('REC-')).length

  // Submit Job Creation Form
  const handleSubmitJob = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (selectedList.length === 0) {
      setError('Please select at least one input frame or reconstructed product for this job.')
      return
    }

    if (!currentAnalyst) {
      setError('Your user account is not linked to an Analyst record. Please contact system admin.')
      return
    }

    setLoading(true)

    // Build JSONB parameters object
    const paramsJson: Record<string, any> = {}
    paramPairs.forEach(({ key, value }) => {
      if (key.trim()) {
        paramsJson[key.trim()] = isNaN(Number(value)) ? value : Number(value)
      }
    })

    // Detect if parent images were selected in the mix
    const parentImageIds = selectedList
      .filter((f) => f.source_dataset === 'RECONSTRUCTED' || String(f.frame_id).startsWith('REC-'))
      .map((f) => String(f.scene_id || f.frame_id).replace('REC-', '').replace('IMG-', ''))

    if (parentImageIds.length > 0) {
      paramsJson['parent_image_ids'] = parentImageIds
      paramsJson['primary_parent_image_id'] = parentImageIds[0]
    }

    const finalAlgorithm = algorithmUsed === 'OTHER' ? customAlgorithm : algorithmUsed

    try {
      let groundTruthUrl = null
      
      // Upload ground truth image if provided
      if (groundTruthFile) {
        const fileExt = groundTruthFile.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `ground-truths/${fileName}`
        
        const { error: uploadError } = await supabase.storage
          .from('satellite-images')
          .upload(filePath, groundTruthFile)
          
        if (uploadError) throw uploadError
        
        const { data: { publicUrl } } = supabase.storage
          .from('satellite-images')
          .getPublicUrl(filePath)
          
        groundTruthUrl = publicUrl
      }

      // 1. Insert into RECONSTRUCTION_JOB
      const { data: jobRes, error: jobErr } = await supabase
        .from('reconstruction_job')
        .insert({
          algorithm_used: finalAlgorithm || 'POCS',
          parameters: paramsJson,
          start_time: new Date().toISOString(),
          status: 'RUNNING',
          analyst_id: currentAnalyst.analyst_id,
          ground_truth_url: groundTruthUrl
        })
        .select('job_id')
        .single()

      if (jobErr) throw jobErr

      const newJobId = jobRes.job_id

      // 2. Insert into CONTRIBUTES_TO bridge table per frame (normalized so sum = 1.0)
      const totalWeight = selectedList.reduce((acc, f) => acc + (Number(f.weight) || 0), 0) || 1
      const contributesRows = selectedList.map((f) => ({
        job_id: newJobId,
        frame_id: f.frame_id,
        contribution_weight: parseFloat(((Number(f.weight) || 0) / totalWeight).toFixed(4)),
      }))

      const { error: ctErr } = await supabase
        .from('contributes_to')
        .insert(contributesRows)

      if (ctErr) throw ctErr

      // Trigger the backend API to process the job
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        await fetch(`${apiUrl}/jobs/${newJobId}/run`, { method: 'POST' })
      } catch (err) {
        console.warn('Backend API trigger failed, job is logged but may not process automatically', err)
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to submit reconstruction job.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-cyan-400" />
            Log Reconstruction Job
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Mix and match raw telemetry frames and previously reconstructed parent images to produce high-fidelity imagery.
          </p>
        </div>

        {currentAnalyst && (
          <div className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            Attributed Analyst: <span className="text-cyan-400 font-semibold">{currentAnalyst.name}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>Reconstruction Job successfully logged with status 'RUNNING'! Redirecting to Dashboard...</span>
        </div>
      )}

      <form onSubmit={handleSubmitJob} className="space-y-8">
        
        {/* Step 1: Mix & Match Input Frames Gallery */}
        <div className="glass-panel p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <CheckSquare className="w-4 h-4 text-cyan-400" />
                Step 1: Mix & Match Input Sources
                <Tooltip 
                  title="Mix & Match Input Sources" 
                  content="Select any combination of raw satellite frames and previously reconstructed parent images. Assign individual contribution weights to balance how much each image influences the final reconstructed output." 
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                You can combine fresh raw captures with prior reconstructed outputs to refine detail.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  typeFilter === 'ALL' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Inputs ({allFrames.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('RAW')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  typeFilter === 'RAW' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Raw Satellites
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('RECONSTRUCTED')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                  typeFilter === 'RECONSTRUCTED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Reconstructed Products
              </button>
            </div>
          </div>

          {/* Quick Search & Optional Sensor Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by Frame ID, Image ID, or status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full pl-9 text-xs"
              />
            </div>
            <div>
              <select
                value={selectedSatelliteId}
                onChange={(e) => setSelectedSatelliteId(e.target.value)}
                className="glass-input w-full text-xs"
              >
                <option value="">Filter by Satellite (Optional)</option>
                {satellites.map((sat) => (
                  <option key={sat.satellite_id} value={sat.satellite_id}>
                    {sat.name} ({sat.agency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SELECTED MIX TRAY (Active Basket) */}
          {selectedList.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-900/50 space-y-3 animate-fade-in shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                  Selected Mix Composition:
                  <span className="text-cyan-400 font-mono font-bold">
                    {rawCount} Raw Frame{rawCount !== 1 ? 's' : ''} + {reconCount} Reconstructed Product{reconCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={distributeWeightsEvenly}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium underline self-start sm:self-auto"
                >
                  Distribute Weights Evenly
                </button>
              </div>

              {/* Chips Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                {selectedList.map((item) => {
                  const isRecon = item.source_dataset === 'RECONSTRUCTED' || String(item.frame_id).startsWith('REC-')
                  const label = isRecon 
                    ? `Product #${item.scene_id || String(item.frame_id).replace('REC-', '')}` 
                    : `Frame #${item.frame_id}`

                  return (
                    <div 
                      key={item.frame_id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                        isRecon 
                          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200' 
                          : 'bg-slate-950/60 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover border border-slate-700 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                            {isRecon ? <Sparkles className="w-4 h-4 text-emerald-400" /> : <Satellite className="w-4 h-4 text-cyan-400" />}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-mono font-bold truncate text-[11px]">{label}</div>
                          <div className="text-[10px] text-slate-400">
                            {isRecon ? 'Parent Reconstructed' : `${item.cloud_cover_pct}% cloud`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400 font-mono">Wt:</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={item.weight}
                          onChange={(e) => updateFrameWeight(String(item.frame_id), parseFloat(e.target.value) || 0)}
                          className="glass-input w-16 py-0.5 px-1 text-center font-mono text-cyan-300 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeSelectedFrame(String(item.frame_id))}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* FRAMES TABLE */}
          {loadingFrames ? (
            <div className="p-8 text-center text-cyan-400 font-mono text-xs animate-pulse">
              Loading frames library...
            </div>
          ) : filteredFrames.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-lg">
              No matching frames or reconstructed products found for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-slate-800/80 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800 sticky top-0 backdrop-blur-sm z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">Select</th>
                    <th className="p-3">Source Type</th>
                    <th className="p-3">Identifier</th>
                    <th className="p-3">Capture / Logged Date</th>
                    <th className="p-3">Observation Quality</th>
                    <th className="p-3">Preview</th>
                    <th className="p-3 w-36">Contribution Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredFrames.map((rf) => {
                    const frameIdStr = String(rf.frame_id)
                    const isSelected = Boolean(selectedFramesMap[frameIdStr])
                    const selectedObj = selectedFramesMap[frameIdStr]
                    const isRecon = rf.source_dataset === 'RECONSTRUCTED' || String(rf.frame_id).startsWith('REC-')

                    return (
                      <tr 
                        key={rf.frame_id} 
                        className={`transition-colors ${
                          isSelected 
                            ? isRecon ? 'bg-emerald-950/20' : 'bg-cyan-950/25'
                            : 'hover:bg-slate-900/40'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFrameSelection(rf)}
                            className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
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
                        <td className="p-3 font-semibold">
                          {isRecon ? (
                            <span className="text-emerald-400">
                              Image #{rf.scene_id || frameIdStr.replace('REC-', '')}
                              <span className="text-[10px] text-slate-500 font-normal block font-sans">
                                (Frame Ref: #{rf.frame_id})
                              </span>
                            </span>
                          ) : (
                            <span className="text-cyan-400">Frame #{rf.frame_id}</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-300 font-sans text-[11px]">
                          {new Date(rf.capture_timestamp).toLocaleString()}
                        </td>
                        <td className="p-3 text-slate-300 font-sans text-[11px]">
                          {isRecon ? (
                            <span className="text-emerald-400 font-mono">0.0% Cloud (Clean Product)</span>
                          ) : (
                            <span className="font-mono">{rf.cloud_cover_pct}% Cloud</span>
                          )}
                        </td>
                        <td className="p-3">
                          {rf.image_url ? (
                            <img 
                              src={rf.image_url} 
                              alt="" 
                              className="w-9 h-9 rounded object-cover border border-slate-700 bg-slate-950" 
                            />
                          ) : (
                            <span className="text-slate-600 text-[10px] font-sans">No Preview</span>
                          )}
                        </td>
                        <td className="p-3">
                          {isSelected ? (
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="1"
                              value={selectedObj.weight}
                              onChange={(e) => updateFrameWeight(frameIdStr, parseFloat(e.target.value) || 0)}
                              className="glass-input w-24 py-1 text-center font-mono text-cyan-300"
                            />
                          ) : (
                            <span className="text-slate-600 text-[11px] font-sans">Unselected</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Step 2: Algorithm & JSONB Parameters */}
        <div className="glass-panel p-6 space-y-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            Step 2: Algorithm & Execution Parameters (JSONB)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                Reconstruction Algorithm
                <Tooltip title="Algorithm Logic" content="The computer mathematical method used to rebuild the picture. Traditional methods (like POCS) stick strictly to what the sensors saw. Generative AI methods (like ESRGAN) make images look sharp, and refine previously reconstructed base products." />
              </label>
              <select
                value={algorithmUsed}
                onChange={(e) => setAlgorithmUsed(e.target.value)}
                className="glass-input w-full"
              >
                <option value="POCS">POCS (Projection Onto Convex Sets)</option>
                <option value="ESRGAN">ESRGAN (Super-Resolution GAN)</option>
                <option value="Bicubic Interpolation">Bicubic Interpolation</option>
                <option value="Deep Iterative Reconstruction">Deep Iterative Reconstruction</option>
                <option value="OTHER">Custom Free-Text Algorithm...</option>
              </select>
            </div>

            {algorithmUsed === 'OTHER' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Specify Custom Algorithm Name</label>
                <input
                  type="text"
                  required
                  value={customAlgorithm}
                  onChange={(e) => setCustomAlgorithm(e.target.value)}
                  placeholder="e.g. Multi-Frame Optical Wavelet"
                  className="glass-input w-full"
                />
              </div>
            )}
          </div>
          
          <div className="pt-2">
            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
              Ground Truth Image (Optional)
              <Tooltip title="Ground Truth" content="Upload a high-quality reference image for this area. If provided, the system will automatically calculate PSNR and SSIM quality metrics against the final reconstructed image." />
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setGroundTruthFile(e.target.files?.[0] || null)}
              className="glass-input w-full text-xs"
            />
          </div>

          {/* Key-Value JSONB Editor */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Algorithm Parameters (Stored as JSONB)
                <Tooltip title="JSONB Parameters" content="The specific settings given to the computer program (like how many times it should run, or how much noise to filter out). We store these as flexible text so we can easily add new settings later without breaking the database." />
              </label>
              <button
                type="button"
                onClick={addParamPair}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Add Parameter
              </button>
            </div>

            <div className="space-y-2">
              {paramPairs.map((pair, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Parameter Key (e.g. iterations)"
                    value={pair.key}
                    onChange={(e) => updateParamPair(idx, 'key', e.target.value)}
                    className="glass-input flex-1 font-mono text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. 500 or 0.001)"
                    value={pair.value}
                    onChange={(e) => updateParamPair(idx, 'value', e.target.value)}
                    className="glass-input flex-1 font-mono text-xs text-cyan-300"
                  />
                  <button
                    type="button"
                    onClick={() => removeParamPair(idx)}
                    className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || success}
            className="btn-primary text-sm px-6 py-2.5"
          >
            {loading ? 'Submitting Job...' : 'Submit & Start Reconstruction Job'}
          </button>
        </div>

      </form>

    </div>
  )
}
