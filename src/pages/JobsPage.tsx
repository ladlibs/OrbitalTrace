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
  
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadJobs()
  }, [])

  useEffect(() => {
    const t = setInterval(() => { 
      if (jobs.some(j => j.status === 'RUNNING')) silentRefresh() 
    }, 3000)
    return () => clearInterval(t)
  }, [jobs])

  async function loadJobs(silent = false) {
    try {
      if (!silent) setLoading(true)
      setLoadError(null)
      const { data: { user } } = await supabase.auth.getUser()
      
      let analystId = currentAnalyst?.analyst_id ?? null
      if (user && !analystId) {
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
            reconstructed_image!reconstructed_image_job_id_fkey (
              image_id, resolution, output_format, generated_timestamp,
              quality_assessment (metric_type, score)
            )
          `)
          .eq('analyst_id', analystId)
          .order('start_time', { ascending: false })
        
        if (error) throw error
        setJobs(jobsData || [])
      }
    } catch (err: any) {
      if (!silent) {
        console.error('Error loading jobs:', err)
        setLoadError(err.message || JSON.stringify(err))
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  function silentRefresh() {
    loadJobs(true)
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
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-medium uppercase border ${
                      isCompleted ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 
                      isRunning ? 'bg-amber-950 text-amber-400 border-amber-800' : 'bg-rose-950 text-rose-400 border-rose-800'
                    }`}>
                      {job.status}
                    </span>
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
                        <div className="text-slate-500 mb-1">Synth Fraction</div>
                        <div className="font-mono text-slate-200">
                          {image.quality_assessment?.find((q: any) => q.metric_type === 'SYNTH_FRACTION')?.score?.toFixed(3) || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Uncertainty</div>
                        <div className="font-mono text-slate-200">
                          {image.quality_assessment?.find((q: any) => q.metric_type === 'MEAN_UNCERTAINTY')?.score?.toFixed(3) || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">PSNR (dB)</div>
                        <div className="font-mono text-slate-200">
                          {image.quality_assessment?.find((q: any) => q.metric_type === 'PSNR')?.score?.toFixed(2) || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">SSIM</div>
                        <div className="font-mono text-slate-200">
                          {image.quality_assessment?.find((q: any) => q.metric_type === 'SSIM')?.score?.toFixed(4) || 'N/A'}
                        </div>
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

              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
