# OrbitalTrace Console - Project Documentation

## Architecture Overview
OrbitalTrace is a modern, single-page React application built with Vite and Tailwind CSS. It serves as an Analyst Console for a satellite imagery reconstruction pipeline. 

**Key Technologies:**
- **Frontend Framework:** React 18 (via Vite)
- **Routing:** React Router v7 (`createBrowserRouter`)
- **Styling:** Tailwind CSS + Lucide React (Icons)
- **State & Graph Visualization:** React Flow (`@xyflow/react`) for rendering the image lineage tree.
- **Backend & Auth:** Supabase (PostgreSQL, Row Level Security, Storage, Authentication).

## How the App Works (End-to-End Flow)
1. **Authentication (`LoginPage.tsx`):** Analysts log in using Supabase Auth. The session is managed globally in `App.tsx`.
2. **Dashboard (`DashboardPage.tsx`):** Provides high-level metrics (Total jobs, Satellites, Active workflows) fetched directly from the database views.
3. **Raw Frame Ingestion (`AddRawFramePage.tsx`):** Analysts upload actual raw satellite image files to Supabase Storage, linking them to a specific Satellite & Sensor, and saving the public URL to the `raw_frame` table.
4. **Job Logging (`LogNewJobPage.tsx`):** Analysts select noisy raw frames, assign contribution weights, choose a reconstruction algorithm (e.g., POCS, ESRGAN) with JSON hyperparameters, and log a job as 'RUNNING' in the `reconstruction_job` table.
5. **Job QA & Completion (`JobsPage.tsx`):** Analysts view their running jobs and mark them as 'COMPLETED'. They input the output resolution (GSD), output format, and Quality Assessment metrics (PSNR and SSIM) which are stored in the `quality_assessment` table.
6. **Provenance Lineage (`LineagePage.tsx`):** A dynamic React Flow graph that queries the database to visualize the entire family tree of an image (Raw Frames -> Job -> Reconstructed Image -> Refinement Job -> Refined Image).

---

## Directory Structure & Codebase
Below is the full source code for the core application files.

### src/main.tsx

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import LogNewJobPage from './pages/LogNewJobPage'
import JobsPage from './pages/JobsPage'
import LineagePage from './pages/LineagePage'
import './globals.css'
import AddRawFramePage from './pages/AddRawFramePage'

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "jobs/new",
        element: <LogNewJobPage />,
      },
      {
        path: "jobs",
        element: <JobsPage />,
      },
      {
        path: "lineage",
        element: <LineagePage />,
      },
      {
        path: "add-raw-frame",
        element: <AddRawFramePage />,
      }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
)

```

---

### src/App.tsx

```tsx
import { useEffect, useState, useRef } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { createClient } from './lib/supabase/client'
import { Orbit, LogOut } from 'lucide-react'

// Singleton — created once at module level, NOT inside component
const supabase = createClient()

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const subscriptionRef = useRef<any>(null)

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check initial session once
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Subscribe once — store reference to unsubscribe on cleanup
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    subscriptionRef.current = subscription

    return () => {
      subscriptionRef.current?.unsubscribe()
    }
  }, []) // empty deps — runs once only

  useEffect(() => {
    if (!loading && !user && location.pathname !== '/login') {
      navigate('/login', { replace: true })
    }
  }, [user, loading, location.pathname, navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-cyan-400 font-mono text-sm">
          <Orbit className="w-5 h-5 animate-spin" />
          Loading System...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-100">
      {user && (
        <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">

              <Link to="/" className="flex items-center gap-3">
                <div className="p-1.5 bg-cyan-950 rounded-lg border border-cyan-800 text-cyan-400">
                  <Orbit className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-base font-bold text-slate-100 tracking-tight">OrbitalTrace</span>
                  <span className="ml-2 text-[10px] font-mono text-cyan-500 bg-cyan-950/50 px-1.5 py-0.5 rounded uppercase border border-cyan-900">Console</span>
                </div>
              </Link>

              <div className="flex items-center gap-6">
                <Link to="/" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Dashboard</Link>
                <Link to="/jobs/new" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Log Job</Link>
                <Link to="/jobs" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">My Jobs</Link>
                <Link to="/lineage" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Lineage</Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 bg-rose-950/30 px-3 py-1.5 rounded-full border border-rose-900/50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>

            </div>
          </div>
        </nav>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}

```

---

### src/lib/supabase/client.ts

```tsx
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
  return createSupabaseClient(
    import.meta.env.VITE_SUPABASE_URL || '',
    import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  )
}

```

---

### src/pages/LoginPage.tsx

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../lib/supabase/client'
import { Orbit, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel p-8 relative overflow-hidden">
        
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 mb-4 shadow-lg shadow-cyan-950">
            <Orbit className="w-8 h-8 animate-spin-slow" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">OrbitalTrace Console</h1>
          <p className="text-xs text-slate-400 mt-1">Satellite Image Lineage & Provenance System</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Analyst Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@orbitaltrace.org"
                className="glass-input w-full pl-9"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="glass-input w-full pl-9"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2.5 mt-2 font-semibold text-sm"
          >
            {loading ? 'Authenticating...' : 'Sign In to Console'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            Restricted System • Authorized Analysts Only
          </div>
        </div>

      </div>
    </div>
  )
}

```

---

### src/pages/DashboardPage.tsx

```tsx
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

```

---

### src/pages/AddRawFramePage.tsx

```tsx
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
  const [file, setFile] = useState<File | null>(null)

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
    if (!file) return setError('Please select an image file to upload.')

    setLoading(true)

    try {
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

      setSuccess(true)
      // Reset form
      setFile(null)
      setCloudCover('0')
      ;(document.getElementById('file-upload') as HTMLInputElement).value = ''
      
    } catch (err: any) {
      setError(err.message || 'Failed to upload frame.')
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
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-950 file:text-indigo-300 hover:file:bg-indigo-900 cursor-pointer"
                required
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedSensorId || !file}
          className="btn-primary w-full py-2.5 mt-4"
        >
          {loading ? 'Uploading...' : 'Upload & Save Frame'}
        </button>
      </form>
    </div>
  )
}
```

---

### src/pages/LogNewJobPage.tsx

```tsx
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

```

---

### src/pages/JobsPage.tsx

```tsx
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

```

---

### src/pages/LineagePage.tsx

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '../lib/supabase/client'
import { 
  ReactFlow, 
  MiniMap, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState,
  Handle,
  Position,
  NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitBranch, ImageIcon, Cpu, Layers } from 'lucide-react'

// --- Custom Node Components for React Flow ---

// 1. Raw Frame Node
function RawFrameNode({ data }: NodeProps) {
  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden shadow-2xl w-48 font-sans">
      <div className="bg-slate-800 p-2 text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-700">
        <Layers className="w-3.5 h-3.5 text-slate-400" />
        Raw Frame #{data.id}
      </div>
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="Raw" className="w-full h-24 object-cover opacity-80 filter blur-[1px]" />
      ) : (
        <div className="w-full h-24 bg-slate-950 flex items-center justify-center text-[10px] text-slate-600">No Image Data</div>
      )}
      <div className="p-2 bg-slate-950 text-[10px] space-y-1">
        <div className="text-slate-400 flex justify-between">
          <span>Cloud Cover:</span>
          <span className="font-mono text-cyan-500">{data.cloud}%</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-slate-500" />
    </div>
  )
}

// 2. Job Node
function JobNode({ data }: NodeProps) {
  return (
    <div className="bg-cyan-950/80 border-2 border-cyan-800/80 rounded-full py-2 px-6 shadow-xl shadow-cyan-900/20 font-sans flex items-center gap-2">
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-cyan-500" />
      <Cpu className="w-4 h-4 text-cyan-400" />
      <div>
        <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">Job #{data.id}</div>
        <div className="text-[10px] text-cyan-500 font-mono">{data.algorithm}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-cyan-500" />
    </div>
  )
}

// 3. Reconstructed Image Node
function ReconstructedNode({ data }: NodeProps) {
  return (
    <div className="bg-slate-900 border-2 border-emerald-800/50 rounded-xl overflow-hidden shadow-2xl shadow-emerald-900/20 w-64 font-sans">
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-emerald-500" />
      <div className="bg-emerald-950/50 p-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex justify-between items-center border-b border-emerald-900/50">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-3.5 h-3.5" />
          Output Image #{data.id}
        </div>
        <span className="bg-emerald-900 text-emerald-200 px-1.5 py-0.5 rounded text-[8px] font-mono">{data.resolution}</span>
      </div>
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="Reconstructed" className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32 bg-slate-950 flex items-center justify-center text-[10px] text-slate-600">No URL Available</div>
      )}
      <div className="p-3 bg-slate-950 text-[10px] grid grid-cols-2 gap-2">
        <div className="bg-slate-900 border border-slate-800 rounded p-1.5 text-center">
          <div className="text-slate-500 uppercase text-[8px] mb-0.5">PSNR</div>
          <div className="font-mono text-cyan-400 font-bold">{data.psnr || 'N/A'}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded p-1.5 text-center">
          <div className="text-slate-500 uppercase text-[8px] mb-0.5">SSIM</div>
          <div className="font-mono text-cyan-400 font-bold">{data.ssim || 'N/A'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-emerald-500" />
    </div>
  )
}


export default function LineagePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const nodeTypes = useMemo(() => ({
    rawFrame: RawFrameNode,
    job: JobNode,
    reconstructed: ReconstructedNode
  }), [])

  useEffect(() => {
    buildLineageGraph()
  }, [])

  async function buildLineageGraph() {
    try {
      setLoading(true)
      
      // We will build a hardcoded logical tree for the sample dataset layout,
      // but populated with actual data from Supabase.
      
      const { data: rawData } = await supabase.from('raw_frame').select('*')
      const { data: jobData } = await supabase.from('reconstruction_job').select('*')
      const { data: imgData } = await supabase.from('reconstructed_image').select('*')
      const { data: qData } = await supabase.from('quality_assessment').select('*')
      const { data: ctData } = await supabase.from('contributes_to').select('*')

      if (!rawData || !jobData || !imgData) {
        throw new Error("Missing required tables. Did you run the sample_dataset.sql script to add image_url columns?")
      }

      const newNodes: any[] = []
      const newEdges: any[] = []

      // Let's dynamically layout the dataset
      // Top row: Raw frames
      const frames = rawData.sort((a,b) => a.frame_id - b.frame_id)
      frames.forEach((f, index) => {
        newNodes.push({
          id: `frame-${f.frame_id}`,
          type: 'rawFrame',
          position: { x: index * 220 + 50, y: 50 },
          data: { id: f.frame_id, cloud: f.cloud_cover_pct, imageUrl: f.image_url }
        })
      })

      // Jobs and Images
      jobData.forEach((job, i) => {
        // Find if this job produced an image, and if that image has a parent
        const resultingImg = imgData.find(img => String(img.job_id) === String(job.job_id))
        const isRefinement = resultingImg && resultingImg.original_image_id != null
        
        // Simple layout logic: Base jobs lower down, Refinement jobs even lower
        const yBase = isRefinement ? 650 : 300
        const xPos = i * 320 + 50

        // Job Node
        newNodes.push({
          id: `job-${job.job_id}`,
          type: 'job',
          position: { x: xPos + 50, y: yBase },
          data: { id: job.job_id, algorithm: job.algorithm_used }
        })

        // Connect Frames -> Job
        ctData?.filter(ct => String(ct.job_id) === String(job.job_id)).forEach(ct => {
          newEdges.push({
            id: `edge-f${ct.frame_id}-j${job.job_id}`,
            source: `frame-${ct.frame_id}`,
            target: `job-${job.job_id}`,
            animated: true,
            style: { stroke: '#475569', strokeWidth: 2 }
          })
        })

        // If Job produced an image, add the image node and connect Job -> Image
        if (resultingImg) {
          const psnr = qData?.find(q => String(q.image_id) === String(resultingImg.image_id) && q.metric_type === 'PSNR')?.score
          const ssim = qData?.find(q => String(q.image_id) === String(resultingImg.image_id) && q.metric_type === 'SSIM')?.score
          
          newNodes.push({
            id: `img-${resultingImg.image_id}`,
            type: 'reconstructed',
            position: { x: xPos, y: yBase + 120 },
            data: { id: resultingImg.image_id, imageUrl: resultingImg.image_url, resolution: resultingImg.resolution, psnr, ssim }
          })

          newEdges.push({
            id: `edge-j${job.job_id}-i${resultingImg.image_id}`,
            source: `job-${job.job_id}`,
            target: `img-${resultingImg.image_id}`,
            animated: true,
            style: { stroke: '#0891b2', strokeWidth: 2 }
          })

          // If it's a refinement, connect Parent Image -> Refinement Job
          if (isRefinement) {
            newEdges.push({
              id: `edge-i${resultingImg.original_image_id}-j${job.job_id}`,
              source: `img-${resultingImg.original_image_id}`,
              target: `job-${job.job_id}`,
              animated: true,
              label: 'Refines Parent',
              labelStyle: { fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
              labelBgStyle: { fill: '#0f172a' },
              style: { stroke: '#059669', strokeWidth: 2, strokeDasharray: '5,5' }
            })
          }
        }
      })

      setNodes(newNodes)
      setEdges(newEdges)

    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-cyan-400 font-mono p-8 animate-pulse">Initializing Lineage Graph...</div>

  if (error) return (
    <div className="p-8">
      <div className="bg-rose-950/20 border border-rose-900 p-6 rounded-xl">
        <h2 className="text-rose-400 font-bold mb-2">Graph Error</h2>
        <p className="text-slate-300 font-mono text-sm">{error}</p>
        <p className="text-slate-400 mt-4 text-xs">Note: You must run the `sample_dataset.sql` script in Supabase first so the tables have the `image_url` columns and sample data.</p>
      </div>
    </div>
  )

  return (
    <div className="h-[calc(100vh-120px)] animate-fade-in flex flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-emerald-400" />
          Refinement Lineage Chain
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Visualizing the provenance tree: Raw Frames &gt; Mathematical Reconstruction &gt; AI Enhancement.
        </p>
      </div>
      
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative">
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background color="#1e293b" gap={16} />
          <Controls className="bg-slate-900 border-slate-800 fill-slate-300" />
          <MiniMap 
            nodeColor={(node) => {
              switch (node.type) {
                case 'rawFrame': return '#475569';
                case 'job': return '#0891b2';
                case 'reconstructed': return '#059669';
                default: return '#eee';
              }
            }}
            maskColor="rgba(2, 6, 23, 0.7)"
            style={{ backgroundColor: '#0f172a' }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}

```

---

### src/components/Tooltip.tsx

```tsx
import { Info } from 'lucide-react'

interface TooltipProps {
  title: string
  content: string
}

export function Tooltip({ title, content }: TooltipProps) {
  return (
    <div className="group relative inline-block ml-1 align-middle">
      <Info className="w-3.5 h-3.5 text-cyan-500/70 hover:text-cyan-400 cursor-help transition-colors" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-[11px] text-slate-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none leading-relaxed">
        <strong className="text-cyan-400 block mb-1 text-xs">{title}</strong>
        {content}
        {/* Invisible triangle pointer */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 -mt-[1px]"></div>
      </div>
    </div>
  )
}

```

---

### types/database.types.ts

```tsx
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      analyst: {
        Row: {
          analyst_id: string | number
          name: string
          role: string
          auth_uid: string | null
        }
        Insert: {
          analyst_id: string | number
          name: string
          role: string
          auth_uid?: string | null
        }
        Update: {
          analyst_id?: string | number
          name?: string
          role?: string
          auth_uid?: string | null
        }
      }
      mission: {
        Row: {
          mission_id: string | number
          name: string
          objective: string | null
          start_date: string
          lead_analyst_id: string | number | null
        }
        Insert: {
          mission_id: string | number
          name: string
          objective?: string | null
          start_date: string
          lead_analyst_id?: string | number | null
        }
        Update: {
          mission_id?: string | number
          name?: string
          objective?: string | null
          start_date?: string
          lead_analyst_id?: string | number | null
        }
      }
      satellite: {
        Row: {
          satellite_id: string | number
          name: string
          orbit_type: string
          launch_date: string
          agency: string
          mission_id: string | number
        }
        Insert: {
          satellite_id: string | number
          name: string
          orbit_type: string
          launch_date: string
          agency: string
          mission_id: string | number
        }
        Update: {
          satellite_id?: string | number
          name?: string
          orbit_type?: string
          launch_date?: string
          agency?: string
          mission_id?: string | number
        }
      }
      sensor: {
        Row: {
          sensor_id: string | number
          resolution: string
          sensor_type: 'OPTICAL' | 'INFRARED' | 'RADAR'
          satellite_id: string | number
        }
        Insert: {
          sensor_id: string | number
          resolution: string
          sensor_type: 'OPTICAL' | 'INFRARED' | 'RADAR'
          satellite_id: string | number
        }
        Update: {
          sensor_id?: string | number
          resolution?: string
          sensor_type?: 'OPTICAL' | 'INFRARED' | 'RADAR'
          satellite_id?: string | number
        }
      }
      raw_frame: {
        Row: {
          frame_id: string | number
          capture_timestamp: string
          latitude: number
          longitude: number
          altitude: number
          cloud_cover_pct: number
          status: string
          sensor_id: string | number
        }
        Insert: {
          frame_id: string | number
          capture_timestamp: string
          latitude: number
          longitude: number
          altitude: number
          cloud_cover_pct: number
          status: string
          sensor_id: string | number
        }
        Update: {
          frame_id?: string | number
          capture_timestamp?: string
          latitude?: number
          longitude?: number
          altitude?: number
          cloud_cover_pct?: number
          status?: string
          sensor_id?: string | number
        }
      }
      reconstruction_job: {
        Row: {
          job_id: string | number
          algorithm_used: string
          parameters: Json
          start_time: string
          end_time: string | null
          status: string
          analyst_id: string | number | null
        }
        Insert: {
          job_id?: string | number
          algorithm_used: string
          parameters?: Json
          start_time?: string
          end_time?: string | null
          status: string
          analyst_id?: string | number | null
        }
        Update: {
          job_id?: string | number
          algorithm_used?: string
          parameters?: Json
          start_time?: string
          end_time?: string | null
          status?: string
          analyst_id?: string | number | null
        }
      }
      reconstructed_image: {
        Row: {
          image_id: string | number
          resolution: string
          output_format: string
          generated_timestamp: string
          job_id: string | number
          original_image_id: string | number | null
        }
        Insert: {
          image_id?: string | number
          resolution: string
          output_format: string
          generated_timestamp?: string
          job_id: string | number
          original_image_id?: string | number | null
        }
        Update: {
          image_id?: string | number
          resolution?: string
          output_format?: string
          generated_timestamp?: string
          job_id?: string | number
          original_image_id?: string | number | null
        }
      }
      quality_assessment: {
        Row: {
          image_id: string | number
          metric_type: string
          score: number
          assessed_by: string | number | null
        }
        Insert: {
          image_id: string | number
          metric_type: string
          score: number
          assessed_by?: string | number | null
        }
        Update: {
          image_id?: string | number
          metric_type?: string
          score?: number
          assessed_by?: string | number | null
        }
      }
      contributes_to: {
        Row: {
          frame_id: string | number
          job_id: string | number
          contribution_weight: number
        }
        Insert: {
          frame_id: string | number
          job_id: string | number
          contribution_weight: number
        }
        Update: {
          frame_id?: string | number
          job_id?: string | number
          contribution_weight?: number
        }
      }
    }
  }
}

```

---

### sql/schema.sql

```sql
-- ============================================================================
-- ORBITALTRACE: PostgreSQL Database Schema DDL (11 Tables)
-- Coursework Review 1 & 2 Base Schema
-- ============================================================================

-- 1. ANALYST (Strong Entity)
CREATE TABLE IF NOT EXISTS analyst (
    analyst_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(100) NOT NULL
);

-- 2. MISSION (Strong Entity)
CREATE TABLE IF NOT EXISTS mission (
    mission_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    objective TEXT,
    start_date DATE NOT NULL,
    lead_analyst_id VARCHAR(50) REFERENCES analyst(analyst_id) ON DELETE SET NULL
);

-- 3. SATELLITE (Strong Entity)
CREATE TABLE IF NOT EXISTS satellite (
    satellite_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    orbit_type VARCHAR(50) NOT NULL,
    launch_date DATE NOT NULL,
    agency VARCHAR(100) NOT NULL,
    mission_id VARCHAR(50) REFERENCES mission(mission_id) ON DELETE CASCADE
);

-- 4. SENSOR (Superclass Entity)
CREATE TABLE IF NOT EXISTS sensor (
    sensor_id VARCHAR(50) PRIMARY KEY,
    resolution VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL CHECK (sensor_type IN ('OPTICAL', 'INFRARED', 'RADAR')),
    satellite_id VARCHAR(50) REFERENCES satellite(satellite_id) ON DELETE CASCADE
);

-- 5. OPTICAL_SENSOR (Subclass)
CREATE TABLE IF NOT EXISTS optical_sensor (
    sensor_id VARCHAR(50) PRIMARY KEY REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    band_range VARCHAR(100) NOT NULL
);

-- 6. INFRARED_SENSOR (Subclass)
CREATE TABLE IF NOT EXISTS infrared_sensor (
    sensor_id VARCHAR(50) PRIMARY KEY REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    wavelength_range VARCHAR(100) NOT NULL
);

-- 7. RADAR_SENSOR (Subclass)
CREATE TABLE IF NOT EXISTS radar_sensor (
    sensor_id VARCHAR(50) PRIMARY KEY REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    frequency_band VARCHAR(100) NOT NULL
);

-- 8. CALIBRATION_RECORD (Weak Entity)
CREATE TABLE IF NOT EXISTS calibration_record (
    sensor_id VARCHAR(50) REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    calibration_date TIMESTAMP WITH TIME ZONE NOT NULL,
    offset_parameters TEXT NOT NULL,
    PRIMARY KEY (sensor_id, calibration_date)
);

-- 9. RAW_FRAME (Strong Telemetry Entity)
CREATE TABLE IF NOT EXISTS raw_frame (
    frame_id VARCHAR(50) PRIMARY KEY,
    capture_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    altitude NUMERIC(10, 2) NOT NULL,
    cloud_cover_pct NUMERIC(5, 2) NOT NULL CHECK (cloud_cover_pct BETWEEN 0 AND 100),
    status VARCHAR(50) NOT NULL,
    sensor_id VARCHAR(50) REFERENCES sensor(sensor_id) ON DELETE CASCADE
);

-- 10. RECONSTRUCTION_JOB (Strong Process Entity)
CREATE TABLE IF NOT EXISTS reconstruction_job (
    job_id VARCHAR(50) PRIMARY KEY,
    algorithm_used VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,
    analyst_id VARCHAR(50) REFERENCES analyst(analyst_id) ON DELETE SET NULL
);

-- 11. RECONSTRUCTED_IMAGE (Strong Entity with Recursive Self-FK)
CREATE TABLE IF NOT EXISTS reconstructed_image (
    image_id VARCHAR(50) PRIMARY KEY,
    resolution VARCHAR(50) NOT NULL,
    output_format VARCHAR(50) NOT NULL,
    generated_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    job_id VARCHAR(50) REFERENCES reconstruction_job(job_id) ON DELETE CASCADE,
    original_image_id VARCHAR(50) REFERENCES reconstructed_image(image_id) ON DELETE SET NULL
);

-- 12. QUALITY_ASSESSMENT (Weak Entity)
CREATE TABLE IF NOT EXISTS quality_assessment (
    image_id VARCHAR(50) REFERENCES reconstructed_image(image_id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL,
    score NUMERIC(8, 4) NOT NULL,
    assessed_by VARCHAR(50) REFERENCES analyst(analyst_id) ON DELETE SET NULL,
    PRIMARY KEY (image_id, metric_type)
);

-- 13. CONTRIBUTES_TO (M:N Bridge Entity)
CREATE TABLE IF NOT EXISTS contributes_to (
    frame_id VARCHAR(50) REFERENCES raw_frame(frame_id) ON DELETE CASCADE,
    job_id VARCHAR(50) REFERENCES reconstruction_job(job_id) ON DELETE CASCADE,
    contribution_weight NUMERIC(5, 4) NOT NULL CHECK (contribution_weight BETWEEN 0 AND 1),
    PRIMARY KEY (frame_id, job_id)
);

```

---

