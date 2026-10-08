import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createClient } from '../lib/supabase/client'
import {
  Satellite,
  Rocket,
  Cpu,
  Image as ImageIcon,
  Clock,
  PlusCircle,
  GitBranch,
  Briefcase,
  ArrowRight,
  UserCheck
} from 'lucide-react'

export default function DashboardPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    satellitesCount: 0,
    missionsCount: 0,
    totalJobsCount: 0,
    myJobsCount: 0,
    imagesCount: 0,
    pendingJobsCount: 0,
  })
  const [recentJobs, setRecentJobs] = useState<any[]>([])
  const [currentAnalyst, setCurrentAnalyst] = useState<any>(null)

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()

        let analystData = null
        if (user) {
          const { data } = await supabase
            .from('analyst')
            .select('*')
            .eq('auth_uid', user.id)
            .single()
          analystData = data
          setCurrentAnalyst(data)
        }

        const [satRes, missRes, jobsRes, imgRes] = await Promise.all([
          supabase.from('satellite').select('satellite_id', { count: 'exact', head: true }),
          supabase.from('mission').select('mission_id', { count: 'exact', head: true }),
          supabase.from('reconstruction_job').select('*'),
          supabase.from('reconstructed_image').select('image_id', { count: 'exact', head: true }),
        ])

        const allJobs = jobsRes.data || []
        const myJobs = analystData
          ? allJobs.filter((j) => String(j.analyst_id) === String(analystData.analyst_id))
          : []
        const pendingJobs = allJobs.filter((j) => String(j.status).toUpperCase() === 'RUNNING')

        setStats({
          satellitesCount: satRes.count || 0,
          missionsCount: missRes.count || 0,
          totalJobsCount: allJobs.length,
          myJobsCount: myJobs.length,
          imagesCount: imgRes.count || 0,
          pendingJobsCount: pendingJobs.length,
        })

        const { data: recent } = await supabase
          .from('reconstruction_job')
          .select(`
            job_id,
            algorithm_used,
            status,
            start_time,
            analyst (name)
          `)
          .order('start_time', { ascending: false })
          .limit(5)

        setRecentJobs(recent || [])
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  return (
    <div className="space-y-8 animate-fade-in">

      {/* Welcome Banner */}
      <div className="glass-panel p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-cyan-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded border border-cyan-800">
            <UserCheck className="w-3.5 h-3.5" />
            {currentAnalyst ? `Logged in as: ${currentAnalyst.name} (${currentAnalyst.role})` : 'Orbital Lineage Console'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
            Satellite Reconstruction Provenance Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Record, track, and audit external satellite reconstruction pipeline jobs, raw frame telemetry weights, and output image quality metrics.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/jobs/new" className="btn-primary text-xs py-2.5">
            <PlusCircle className="w-4 h-4" />
            Log Reconstruction Job
          </Link>
          <Link to="/lineage" className="btn-secondary text-xs py-2.5">
            <GitBranch className="w-4 h-4 text-cyan-400" />
            Lineage Viewer
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Satellites</span>
            <Satellite className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">{loading ? '...' : stats.satellitesCount}</div>
            <div className="text-[10px] text-slate-500">Tracked in system</div>
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Missions</span>
            <Rocket className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">{loading ? '...' : stats.missionsCount}</div>
            <div className="text-[10px] text-slate-500">Active space programs</div>
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between border-cyan-900/30">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">My Jobs</span>
            <Briefcase className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-cyan-400">{loading ? '...' : stats.myJobsCount}</div>
            <div className="text-[10px] text-slate-500">Attributed to you</div>
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Jobs</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">{loading ? '...' : stats.totalJobsCount}</div>
            <div className="text-[10px] text-slate-500">All analyst pipeline runs</div>
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Images Output</span>
            <ImageIcon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">{loading ? '...' : stats.imagesCount}</div>
            <div className="text-[10px] text-slate-500">Reconstructed outputs</div>
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Pending Jobs</span>
            <Clock className="w-4 h-4 text-rose-400 animate-pulse" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">{loading ? '...' : stats.pendingJobsCount}</div>
            <div className="text-[10px] text-slate-500">Currently running</div>
          </div>
        </div>

      </div>

      {/* Quick Actions & Recent Jobs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Recent Pipeline Jobs */}
        <div className="lg:col-span-2 glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Recent Reconstruction Jobs</h2>
              <p className="text-xs text-slate-400">Latest pipeline executions logged across all analysts</p>
            </div>
            <Link to="/jobs" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium">
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Job ID</th>
                  <th className="p-3">Algorithm</th>
                  <th className="p-3">Analyst</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Start Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500 text-xs font-sans">
                      No reconstruction jobs logged yet. Click &quot;Log Reconstruction Job&quot; to add your first job.
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((job) => (
                    <tr key={job.job_id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="p-3 font-semibold text-cyan-400">#{job.job_id}</td>
                      <td className="p-3 font-sans text-slate-200">{job.algorithm_used}</td>
                      <td className="p-3 font-sans text-slate-400">{job.analyst?.name || 'Unassigned'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-medium uppercase ${job.status?.toUpperCase() === 'COMPLETED' || job.status?.toUpperCase() === 'SUCCESS'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : job.status?.toUpperCase() === 'RUNNING'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-400">
                        {new Date(job.start_time).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Workflows Column */}
        <div className="space-y-4">
          <div className="glass-panel p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-100">Analyst Workflows</h2>
            <div className="space-y-3">

              <Link to="/jobs/new" className="group block p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 transition-all">
                <div className="flex items-center justify-between text-xs font-medium text-slate-200 group-hover:text-cyan-400">
                  <div className="flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-cyan-400" />
                    Log New Job
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Select raw satellite frames, weights, & algorithm parameters.</p>
              </Link>

              <Link to="/jobs" className="group block p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 transition-all">
                <div className="flex items-center justify-between text-xs font-medium text-slate-200 group-hover:text-cyan-400">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-indigo-400" />
                    My Jobs & Output Images
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">View your jobs, mark completed, or add reconstructed output images.</p>
              </Link>

              <Link to="/lineage" className="group block p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 transition-all">
                <div className="flex items-center justify-between text-xs font-medium text-slate-200 group-hover:text-cyan-400">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-emerald-400" />
                    Refinement Lineage Chain
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Trace multi-generation image refine & redo trees with PSNR/SSIM scores.</p>
              </Link>

            </div>
          </div>
        </div>

      </div>

    </div>
  )
}