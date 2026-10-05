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
  CheckCircle2
} from 'lucide-react'
import { Tooltip } from '../components/Tooltip'

interface SelectedFrame {
  frame_id: string | number
  weight: number
  capture_timestamp: string
  cloud_cover_pct: number
}

export default function LogNewJobPage() {
  const navigate = useNavigate()
  const supabase = createClient()

  // Data sources
  const [satellites, setSatellites] = useState<any[]>([])
  const [sensors, setSensors] = useState<any[]>([])
  const [rawFrames, setRawFrames] = useState<any[]>([])
  const [currentAnalyst, setCurrentAnalyst] = useState<any>(null)

  // Selection states
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string>('')
  const [selectedSensorId, setSelectedSensorId] = useState<string>('')
  const [selectedFramesMap, setSelectedFramesMap] = useState<Record<string, SelectedFrame>>({})

  // Form fields
  const [algorithmUsed, setAlgorithmUsed] = useState<string>('POCS')
  const [customAlgorithm, setCustomAlgorithm] = useState<string>('')
  const [paramPairs, setParamPairs] = useState<Array<{ key: string; value: string }>>([
    { key: 'iterations', value: '500' },
    { key: 'learning_rate', value: '0.001' },
  ])

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Load initial analyst & satellite list
  useEffect(() => {
    async function initData() {
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
    }
    initData()
  }, [])

  // Cascading Step B: When Satellite changes, fetch sensors
  useEffect(() => {
    if (!selectedSatelliteId) {
      setSensors([])
      setSelectedSensorId('')
      setRawFrames([])
      return
    }

    async function loadSensors() {
      const { data } = await supabase
        .from('sensor')
        .select('*')
        .eq('satellite_id', selectedSatelliteId)
      setSensors(data || [])
      setSelectedSensorId('')
      setRawFrames([])
    }
    loadSensors()
  }, [selectedSatelliteId])

  // Cascading Step C: When Sensor changes, fetch available raw frames
  useEffect(() => {
    if (!selectedSensorId) {
      setRawFrames([])
      return
    }

    async function loadFrames() {
      const { data } = await supabase
        .from('raw_frame')
        .select('*')
        .eq('sensor_id', selectedSensorId)
        .order('capture_timestamp', { ascending: false })
      setRawFrames(data || [])
    }
    loadFrames()
  }, [selectedSensorId])

  // Frame selection handler
  const toggleFrameSelection = (frame: any) => {
    const frameIdStr = String(frame.frame_id)
    setSelectedFramesMap((prev) => {
      const updated = { ...prev }
      if (updated[frameIdStr]) {
        delete updated[frameIdStr]
      } else {
        updated[frameIdStr] = {
          frame_id: frame.frame_id,
          weight: 0.5, // Default weight 0.5
          capture_timestamp: frame.capture_timestamp,
          cloud_cover_pct: frame.cloud_cover_pct,
        }
      }
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

  // Submit Job Creation Form
  const handleSubmitJob = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const selectedFramesList = Object.values(selectedFramesMap)
    if (selectedFramesList.length === 0) {
      setError('Please select at least one raw satellite frame for this job.')
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

    const finalAlgorithm = algorithmUsed === 'OTHER' ? customAlgorithm : algorithmUsed

    try {
      // 1. Insert into RECONSTRUCTION_JOB
      const { data: jobRes, error: jobErr } = await supabase
        .from('reconstruction_job')
        .insert({
          algorithm_used: finalAlgorithm || 'POCS',
          parameters: paramsJson,
          start_time: new Date().toISOString(),
          status: 'RUNNING',
          analyst_id: currentAnalyst.analyst_id,
        })
        .select('job_id')
        .single()

      if (jobErr) throw jobErr

      const newJobId = jobRes.job_id

      // 2. Insert into CONTRIBUTES_TO bridge table per frame
      const contributesRows = selectedFramesList.map((f) => ({
        job_id: newJobId,
        frame_id: f.frame_id,
        contribution_weight: f.weight,
      }))

      const { error: ctErr } = await supabase
        .from('contributes_to')
        .insert(contributesRows)

      if (ctErr) throw ctErr

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
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-cyan-400" />
            Log Reconstruction Job
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Record a new external satellite reconstruction pipeline execution metadata and frame weights.
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
        
        {/* Step A: Select Satellite */}
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">
            <Satellite className="w-4 h-4 text-cyan-400" />
            Step 1: Select Target Satellite
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
              Satellite Entity
              <Tooltip title="Satellite Entity" content="The actual physical spacecraft orbiting Earth. A single satellite usually carries several different cameras or scanners to take pictures." />
            </label>
            <select
              required
              value={selectedSatelliteId}
              onChange={(e) => setSelectedSatelliteId(e.target.value)}
              className="glass-input w-full"
            >
              <option value="">-- Choose a Satellite --</option>
              {satellites.map((sat) => (
                <option key={sat.satellite_id} value={sat.satellite_id}>
                  {sat.name} (Agency: {sat.agency}) — ID: {sat.satellite_id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step B: Cascading Sensor Selection */}
        {selectedSatelliteId && (
          <div className="glass-panel p-6 space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Step 2: Select Sensor (Filtered for selected Satellite)
            </div>

            {sensors.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">No sensors registered under this satellite.</div>
            ) : (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                  Satellite Sensor
                  <Tooltip title="Sensor Modality" content="The specific camera or scanner used. Some take normal photos (Optical), some see heat (Infrared), and some use radar to see through clouds. Each type needs a different computer program to process the image." />
                </label>
                <select
                  required
                  value={selectedSensorId}
                  onChange={(e) => setSelectedSensorId(e.target.value)}
                  className="glass-input w-full"
                >
                  <option value="">-- Choose a Sensor --</option>
                  {sensors.map((s) => (
                    <option key={s.sensor_id} value={s.sensor_id}>
                      Sensor #{s.sensor_id} — Type: {s.sensor_type} (Resolution: {s.resolution})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Step C: Frame Multi-Select & Contribution Weights */}
        {selectedSensorId && (
          <div className="glass-panel p-6 space-y-4 animate-fade-in">
            <div className="flex flex-col gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <CheckSquare className="w-4 h-4 text-emerald-400" />
                Step 3: Select Contributing Raw Frames & Set Weights (0.0 to 1.0)
                <Tooltip title="Contribution Weights" content="To get one clear picture, we often combine several blurry ones. If one picture has less cloud cover or is sharper, we give it a higher 'weight' so it has more influence on the final result." />
              </div>
              <div className="text-xs text-cyan-400 font-mono">
                {Object.keys(selectedFramesMap).length} frame(s) selected
              </div>
            </div>

            {rawFrames.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">No raw frames recorded for this sensor.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3 w-10 text-center">Select</th>
                      <th className="p-3">Frame ID</th>
                      <th className="p-3">Capture Timestamp</th>
                      <th className="p-3">Cloud Cover %</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 w-40">Contribution Weight (0-1)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {rawFrames.map((rf) => {
                      const frameIdStr = String(rf.frame_id)
                      const isSelected = Boolean(selectedFramesMap[frameIdStr])
                      const selectedObj = selectedFramesMap[frameIdStr]

                      return (
                        <tr key={rf.frame_id} className={`transition-colors ${isSelected ? 'bg-cyan-950/30' : 'hover:bg-slate-900/40'}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleFrameSelection(rf)}
                              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-semibold text-cyan-400">#{rf.frame_id}</td>
                          <td className="p-3 text-slate-300 font-sans">{new Date(rf.capture_timestamp).toLocaleString()}</td>
                          <td className="p-3 text-slate-300 font-sans">{rf.cloud_cover_pct}%</td>
                          <td className="p-3 text-slate-400 font-sans">{rf.status}</td>
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
        )}

        {/* Step D: Algorithm & JSONB Parameters */}
        <div className="glass-panel p-6 space-y-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            Step 4: Algorithm & Execution Parameters (JSONB)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                Algorithm Used
                <Tooltip title="Reconstruction Algorithms" content="The computer program used to clean up the image. Traditional math programs are very accurate but can look blurry. Modern AI programs (like ESRGAN) make images look incredibly sharp, but sometimes they 'guess' details that aren't really there." />
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
