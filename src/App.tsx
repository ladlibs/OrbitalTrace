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
