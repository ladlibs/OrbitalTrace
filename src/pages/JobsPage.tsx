import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { 
  Briefcase, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Cpu, 
  Image as ImageIcon,
  Save,
  AlertCircle,
  ExternalLink
} from 'lucide-react'
import { Tooltip } from '../components/Tooltip'

export default function JobsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [currentAnalyst, setCurrentAnalyst] = useState<any>(null)
  
  // State for the "Mark Completed" modal/inline form
  const [activeJobForCompletion, setActiveJobForCompletion] = useState<number | null>(null)
  const [completionForm, setCompletionForm] = useState({
    status: 'COMPLETED',
    output_format: 'TIFF',
    resolution: '',
    psnr: '',
    ssim: '',
    parent_image_id: ''
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadJobs()
  }, [])

  async function loadJobs() {
    try {
      setLoading(true)
      setLoadError(null)
      const { data: { user } } = await supabase.auth.getUser()
      
      let analystId = null
      if (user) {
        const { data: analyst } = await supabase
          .from('analyst')
          .select('*')
          .eq('auth_uid', user.id)
          .single()
        setCurrentAnalyst(analyst)
        analystId = analyst?.analyst_id
      }

      if (analystId) {
        const { data: jobsData, error } = await supabase
          .from('reconstruction_job')
          .select(`
            job_id,
            algorithm_used,
            parameters,
            start_time,
            end_time,
            status,
            reconstructed_image (
              image_id, resolution, output_format, generated_timestamp
            )
          `)
          .eq('analyst_id', analystId)
          .order('start_time', { ascending: false })
        
        if (error) throw error
        setJobs(jobsData || [])
      }
    } catch (err: any) {
      console.error('Error loading jobs:', err)
      setLoadError(err.message || JSON.stringify(err))
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (jobId: number, e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setSubmitLoading(true)

    try {
      // 1. Update Job Status
      const { error: jobErr } = await supabase
        .from('reconstruction_job')
        .update({ 
          status: completionForm.status,
          end_time: new Date().toISOString()
        })
        .eq('job_id', jobId)

      if (jobErr) throw jobErr

      // 2. If COMPLETED, insert image metadata
      if (completionForm.status === 'COMPLETED') {
        const { data: imgData, error: imgErr } = await supabase
          .from('reconstructed_image')
          .insert({
            job_id: jobId,
            output_format: completionForm.output_format,
            resolution: parseFloat(completionForm.resolution),
            original_image_id: completionForm.parent_image_id ? parseInt(completionForm.parent_image_id) : null
          })
          .select('image_id')
          .single()
        
        if (imgErr) throw imgErr

        // Insert quality metrics if provided
        if (imgData?.image_id) {
          if (completionForm.psnr) {
            await supabase.from('quality_assessment').insert({
              image_id: imgData.image_id,
              metric_type: 'PSNR',
              score: parseFloat(completionForm.psnr)
            })
          }
          if (completionForm.ssim) {
            await supabase.from('quality_assessment').insert({
              image_id: imgData.image_id,
              metric_type: 'SSIM',
              score: parseFloat(completionForm.ssim)
            })
          }
        }
      }

      setActiveJobForCompletion(null)
      loadJobs() // reload to show updated state
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to update job.')
    } finally {
      setSubmitLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-cyan-400 font-mono text-sm animate-pulse">Loading Your Jobs...</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-cyan-400" />
            My Reconstruction Jobs
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track your pipeline executions and log output image metadata.
          </p>
        </div>
        {currentAnalyst && (
          <div className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            Filtering for: <span className="text-cyan-400">{currentAnalyst.name}</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {loadError && (
          <div className="glass-panel p-6 bg-rose-950/20 border-rose-900/50">
            <h3 className="text-rose-400 font-bold mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Database Query Failed
            </h3>
            <p className="text-slate-300 font-mono text-xs">{loadError}</p>
          </div>
        )}
        
        {jobs.length === 0 && !loadError ? (
          <div className="glass-panel p-8 text-center text-slate-400 text-sm">
            You haven't logged any jobs yet.
          </div>
        ) : (
          jobs.map((job) => {
            const isRunning = job.status?.toUpperCase() === 'RUNNING'
            const isCompleted = job.status?.toUpperCase() === 'COMPLETED'
            const isFailed = job.status?.toUpperCase() === 'FAILED'
            const image = job.reconstructed_image?.[0]

            return (
              <div key={job.job_id} className={`glass-panel p-5 transition-all border ${
                isRunning ? 'border-amber-900/50 hover:border-amber-500/50' : 
                isCompleted ? 'border-emerald-900/30' : 'border-rose-900/30'
              }`}>
                
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 p-2 rounded-lg ${
                      isRunning ? 'bg-amber-950 text-amber-400' :
                      isCompleted ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                    }`}>
                      {isRunning ? <Clock className="w-5 h-5 animate-pulse" /> :
                       isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        Job #{job.job_id} 
                        <span className="text-slate-500 font-normal">— {job.algorithm_used}</span>
                      </h3>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-4">
                        <span>Started: {new Date(job.start_time).toLocaleString()}</span>
                        {job.end_time && <span>Ended: {new Date(job.end_time).toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    {isRunning && activeJobForCompletion !== job.job_id && (
                      <button 
                        onClick={() => setActiveJobForCompletion(job.job_id)}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        Update Status & Log Output
                      </button>
                    )}
                    {!isRunning && (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-medium uppercase border ${
                        isCompleted ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}>
                        {job.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Display Output Image Metadata if completed */}
                {isCompleted && image && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
                    <h4 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 mb-3 uppercase tracking-wider">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                      Generated Output Image Metadata
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <div className="text-slate-500 mb-1">Image ID</div>
                        <div className="font-mono text-cyan-400">#{image.image_id}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Resolution (GSD)</div>
                        <div className="text-slate-200">{image.resolution} m/px</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">PSNR (Quality)</div>
                        <div className="font-mono text-slate-200">{image.psnr || 'N/A'} dB</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">SSIM</div>
                        <div className="font-mono text-slate-200">{image.ssim || 'N/A'}</div>
                      </div>
                      <div className="col-span-2 sm:col-span-4 mt-2">
                        <div className="text-slate-500 mb-1">Output Format & Timestamp</div>
                        <div className="text-slate-300 font-mono text-[10px] bg-slate-950 p-2 rounded border border-slate-800 flex items-center justify-between">
                          Format: {image.output_format} | Logged: {new Date(image.generated_timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Completion Form */}
                {activeJobForCompletion === job.job_id && (
                  <form onSubmit={(e) => handleStatusUpdate(job.job_id, e)} className="mt-6 pt-5 border-t border-slate-800 animate-fade-in">
                    <h4 className="text-xs font-semibold text-slate-200 mb-4 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      Log Job Outcome
                    </h4>

                    {submitError && (
                      <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider">Final Status</label>
                        <select
                          value={completionForm.status}
                          onChange={(e) => setCompletionForm(p => ({ ...p, status: e.target.value }))}
                          className="glass-input text-xs w-64"
                        >
                          <option value="COMPLETED">Success - Image Reconstructed</option>
                          <option value="FAILED">Failed - Pipeline Crashed</option>
                        </select>
                      </div>

                      {completionForm.status === 'COMPLETED' && (
                        <>
                          <div className="md:col-span-2">
                            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                              Output Format
                              <Tooltip title="Output Format" content="The type of file saved (like a JPEG or PNG). For satellites, we often use 'GeoTIFF' because it saves the image along with exact map coordinates." />
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. TIFF, GeoTIFF, PNG"
                              value={completionForm.output_format}
                              onChange={(e) => setCompletionForm(p => ({ ...p, output_format: e.target.value }))}
                              className="glass-input text-xs"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                              Resolution (GSD in meters)
                              <Tooltip title="Ground Sample Distance" content="In satellite imagery, resolution is measured as the physical distance on the ground represented by a single pixel. E.g., 0.5 means each pixel represents 0.5 meters." />
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder="e.g. 0.5"
                              value={completionForm.resolution}
                              onChange={(e) => setCompletionForm(p => ({ ...p, resolution: e.target.value }))}
                              className="glass-input text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                              Parent Image ID
                              <Tooltip title="Lineage Refinement" content="Sometimes we don't start from scratch. If this job took an older, blurry image and enhanced it, put the ID of the older image here. This helps us track the 'family tree' of how an image got better over time." />
                            </label>
                            <input
                              type="number"
                              placeholder="Optional - If refining"
                              value={completionForm.parent_image_id}
                              onChange={(e) => setCompletionForm(p => ({ ...p, parent_image_id: e.target.value }))}
                              className="glass-input text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                              PSNR (dB)
                              <Tooltip title="Peak Signal-to-Noise Ratio" content="It's a math score (in decibels) showing how close the pixels are to a perfect reference image. Higher is better (30-40 dB is good). However, it only looks at raw math, so an image might score high but still look blurry to a human." />
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="e.g. 32.45"
                              value={completionForm.psnr}
                              onChange={(e) => setCompletionForm(p => ({ ...p, psnr: e.target.value }))}
                              className="glass-input text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider flex items-center">
                              SSIM Score
                              <Tooltip title="Structural Similarity Index" content="This scores how similar two images look to the human eye, looking at shapes, contrast, and edges. It ranges from 0 to 1, where 1.0 means they look exactly identical." />
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              max="1.0"
                              placeholder="e.g. 0.895"
                              value={completionForm.ssim}
                              onChange={(e) => setCompletionForm(p => ({ ...p, ssim: e.target.value }))}
                              className="glass-input text-xs"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button 
                        type="button"
                        onClick={() => setActiveJobForCompletion(null)}
                        className="btn-secondary text-xs py-1.5"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        disabled={submitLoading}
                        className="btn-primary text-xs py-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {submitLoading ? 'Saving...' : 'Save Job Outcome'}
                      </button>
                    </div>
                  </form>
                )}

              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
