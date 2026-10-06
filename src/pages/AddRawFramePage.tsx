import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase/client' //[cite: 6]
import { 
  Upload, 
  Satellite, 
  Layers, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react'

export default function AddRawFramePage() {
  const supabase = createClient() //[cite: 6]

  // Data sources
  const [satellites, setSatellites] = useState<any[]>([])
  const [sensors, setSensors] = useState<any[]>([])

  // Form state
  const [selectedSatelliteId, setSelectedSatelliteId] = useState('')
  const [selectedSensorId, setSelectedSensorId] = useState('')
  const [cloudCover, setCloudCover] = useState('0')
  const [files, setFiles] = useState<File[]>([])

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Step 1: Load Satellites
  useEffect(() => {
    async function loadSatellites() {
      const { data } = await supabase.from('satellite').select('satellite_id, name')
      setSatellites(data || [])
    }
    loadSatellites()
  }, [])

  // Step 2: Load Sensors when Satellite changes
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!selectedSensorId) return setError('Please select a sensor.')
    if (files.length === 0) return setError('Please select at least one image file to upload.')

    setLoading(true)

    try {
      for (const file of files) {
        // 1. Upload image to Supabase Storage
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `raw-frames/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('satellite-images')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('satellite-images')
          .getPublicUrl(filePath)

        // 3. Insert record into raw_frame table
        const { error: dbError } = await supabase
          .from('raw_frame')
          .insert({
            sensor_id: selectedSensorId,
            capture_timestamp: new Date().toISOString(),
            cloud_cover_pct: parseFloat(cloudCover),
            status: 'USABLE',
            image_url: publicUrl // Store the URL for the Lineage Graph
          })

        if (dbError) throw dbError
      }

      setSuccess(true)
      // Reset form
      setFiles([])
      setCloudCover('0')
      ;(document.getElementById('file-upload') as HTMLInputElement).value = ''
      
    } catch (err: any) {
      setError(err.message || 'Failed to upload frames.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6 animate-fade-in">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-400" />
          Raw Frame Ingestion (Review Tool)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Directly upload raw satellite imagery and bind it to a sensor.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Frame uploaded and database record created successfully!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-5">
        
        {/* Step A: Satellite */}
        <div>
          <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
            <Satellite className="w-3.5 h-3.5" /> Select Satellite
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

        {/* Step B: Sensor */}
        {selectedSatelliteId && (
          <div className="animate-fade-in">
            <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Select Sensor
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

        {/* Step C: Metadata & File */}
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
                className="glass-input w-full text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Image File
              </label>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-950 file:text-indigo-300 hover:file:bg-indigo-900 cursor-pointer"
                required
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedSensorId || files.length === 0}
          className="btn-primary w-full py-2.5 mt-4"
        >
          {loading ? 'Uploading...' : `Upload & Save ${files.length || ''} Frame(s)`}
        </button>
      </form>
    </div>
  )
}