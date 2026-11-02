import { useState, useEffect, useMemo } from 'react'
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
  type Edge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitBranch, ImageIcon, Cpu, Layers, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

// --- Custom Node Data Types ---
type RawFrameNodeData = {
  id: number
  cloud: number
  imageUrl?: string
}

type JobNodeData = {
  id: number
  algorithm: string
  status?: string
  ra?: number | string
  gci?: number | string
  isQuarantined?: boolean
}

type ReconstructedNodeData = {
  id: number
  imageUrl?: string
  resolution?: string
  psnr?: number
  ssim?: number
}

// --- Custom Node Components for React Flow ---

// 1. Raw Frame Node
function RawFrameNode({ data }: { data: RawFrameNodeData }) {
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
function JobNode({ data }: { data: JobNodeData }) {
  const isQuarantined = data.isQuarantined || data.status === 'FAILED'
  return (
    <div className={`border-2 rounded-xl py-2 px-4 shadow-xl font-sans min-w-[200px] ${
      isQuarantined 
        ? 'bg-rose-950/90 border-rose-600 text-rose-200 shadow-rose-950/50' 
        : 'bg-cyan-950/80 border-cyan-800/80 text-cyan-200 shadow-cyan-900/20'
    }`}>
      <Handle type="target" position={Position.Top} className={`w-2 h-2 ${isQuarantined ? '!bg-rose-500' : '!bg-cyan-500'}`} />
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1 mb-1">
        <div className="flex items-center gap-1.5">
          <Cpu className={`w-3.5 h-3.5 ${isQuarantined ? 'text-rose-400' : 'text-cyan-400'}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Job #{data.id}</span>
        </div>
        {isQuarantined ? (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-900 text-rose-200 font-bold font-mono">QUARANTINED</span>
        ) : (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-200 font-mono">r_a = {data.ra ?? '0.00'}</span>
        )}
      </div>
      <div className="text-[10px] font-mono opacity-90 flex justify-between">
        <span>Algorithm:</span>
        <span className="font-bold">{data.algorithm}</span>
      </div>
      {data.gci !== undefined && (
        <div className="text-[10px] font-mono opacity-90 flex justify-between mt-0.5">
          <span>Synthetic Share:</span>
          <span className="font-bold text-purple-300">{data.gci}</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className={`w-2 h-2 ${isQuarantined ? '!bg-rose-500' : '!bg-cyan-500'}`} />
    </div>
  )
}

// 3. Reconstructed Image Node
function ReconstructedNode({ data }: { data: ReconstructedNodeData }) {
  const psnr = data.psnr
  const ssim = data.ssim
  return (
    <div className="bg-slate-900 border-2 border-emerald-800/50 rounded-xl overflow-hidden shadow-2xl shadow-emerald-900/20 w-60 font-sans">
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-emerald-500" />
      <div className="bg-emerald-950/50 p-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex justify-between items-center border-b border-emerald-900/50">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-3.5 h-3.5" />
          Output Image #{data.id}
        </div>
        <Link to={`/inspect/${data.id}`} className="bg-emerald-900 hover:bg-emerald-800 text-emerald-200 px-1.5 py-0.5 rounded text-[8px] font-mono transition-colors">
          Inspect
        </Link>
      </div>
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="Reconstructed" className="w-full h-28 object-cover" />
      ) : (
        <div className="w-full h-28 bg-slate-950 flex items-center justify-center text-[10px] text-slate-600">No URL Available</div>
      )}
      <div className="p-2 bg-slate-950 text-[10px] grid grid-cols-2 gap-2">
        <div className="bg-slate-900 border border-slate-800 rounded p-1 text-center">
          <div className="text-slate-500 uppercase text-[8px] mb-0.5">PSNR</div>
          <div className="font-mono font-bold text-cyan-400">{psnr ? `${Number(psnr).toFixed(2)} dB` : 'N/A'}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded p-1 text-center">
          <div className="text-slate-500 uppercase text-[8px] mb-0.5">SSIM</div>
          <div className="font-mono font-bold text-emerald-400">{ssim ? Number(ssim).toFixed(4) : 'N/A'}</div>
        </div>
        <div className="col-span-2 mt-1">
          <Link 
            to={`/inspect/${data.id}`}
            className="flex items-center justify-center gap-1 w-full bg-emerald-950/50 hover:bg-emerald-900 border border-emerald-900/50 py-1 rounded text-emerald-400 font-bold transition-colors"
          >
            <Search className="w-3 h-3" />
            Inspect Pixel Provenance
          </Link>
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
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

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
      const { data: jobData } = await supabase.from('reconstruction_job').select('*').order('job_id', { ascending: true })
      const { data: imgData } = await supabase.from('reconstructed_image').select('*')
      const { data: qData } = await supabase.from('quality_assessment').select('*')
      const { data: ctData } = await supabase.from('contributes_to').select('*')

      if (!rawData || !jobData || !imgData) {
        throw new Error("Missing required tables. Did you run the sample_dataset.sql script to add image_url columns?")
      }

      const newNodes: any[] = []
      const newEdges: any[] = []

      // Let's dynamically layout the dataset
      // Top row: only true Raw frames (exclude mirrored reconstructed products)
      const frames = rawData
        .filter((f) => f.source_dataset !== 'RECONSTRUCTED' && !String(f.frame_id).startsWith('REC-'))
        .sort((a,b) => a.frame_id - b.frame_id)

      frames.forEach((f, index) => {
        newNodes.push({
          id: `frame-${f.frame_id}`,
          type: 'rawFrame',
          position: { x: index * 240 + 60, y: 30 },
          data: { id: f.frame_id, cloud: f.cloud_cover_pct, imageUrl: f.image_url }
        })
      })

      // Build a weight-sum per job for normalisation
      const jobWeightSums: Record<string, number> = {}
      ctData?.forEach(ct => {
        const jk = String(ct.job_id)
        jobWeightSums[jk] = (jobWeightSums[jk] || 0) + (ct.contribution_weight || 0)
      })

      // Jobs and Images (Diamond DAG Topology)
      jobData.forEach((job, i) => {
        // Find if this job produced an image, and if that image has a parent
        const resultingImg = imgData.find(img => String(img.job_id) === String(job.job_id))
        
        let xPos = 400
        let yBase = 260

        if (i === 0) {
          xPos = 400
          yBase = 260
        } else if (i === 1) {
          xPos = 140
          yBase = 580
        } else if (i === 2) {
          xPos = 660
          yBase = 580
        } else if (i === 3) {
          xPos = 400
          yBase = 900
        } else if (i === 4) {
          xPos = 240
          yBase = 1220
        } else if (i >= 5) {
          xPos = 560
          yBase = 1220
        }

        const isQuarantined = job.status === 'FAILED' || job.parameters?.anomaly_gate === 'TRIGGERED'
        const raVal = job.parameters?.ra !== undefined ? Number(job.parameters.ra).toFixed(2) : (job.algorithm_used === 'ESRGAN' ? '0.35' : '0.00')
        const gciVal = job.parameters?.gci !== undefined ? `${(Number(job.parameters.gci) * 100).toFixed(1)}%` : (job.algorithm_used === 'ESRGAN' ? '35.0%' : '0.0%')

        // Job Node
        newNodes.push({
          id: `job-${job.job_id}`,
          type: 'job',
          position: { x: xPos + 10, y: yBase },
          data: { 
            id: job.job_id, 
            algorithm: job.algorithm_used,
            status: job.status,
            ra: raVal,
            gci: gciVal,
            isQuarantined
          }
        })

        // Connect Frames -> Job
        ctData?.filter(ct => String(ct.job_id) === String(job.job_id)).forEach(ct => {
          const matchedFrame = rawData.find(f => String(f.frame_id) === String(ct.frame_id))
          const isRecon = matchedFrame?.source_dataset === 'RECONSTRUCTED' || String(ct.frame_id).startsWith('REC-')
          const parentImgId = isRecon ? (matchedFrame?.scene_id || String(ct.frame_id).replace('REC-', '')) : null

          const sourceNodeId = isRecon && parentImgId ? `img-${parentImgId}` : `frame-${ct.frame_id}`

          const totalWeight = jobWeightSums[String(job.job_id)] || 1
          const rawWeight = ct.contribution_weight || 0
          const normalizedPct = Math.round((rawWeight / (totalWeight > 0 ? totalWeight : 1)) * 100)

          newEdges.push({
            id: `edge-${sourceNodeId}-j${job.job_id}`,
            source: sourceNodeId,
            target: `job-${job.job_id}`,
            animated: true,
            label: isRecon ? `Parent Input (${normalizedPct}%)` : `${normalizedPct}%`,
            labelStyle: { fill: isRecon ? '#34d399' : '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0f172a' },
            style: { 
              stroke: isRecon ? '#059669' : '#475569', 
              strokeWidth: 2,
              strokeDasharray: isRecon ? '5,5' : undefined
            }
          })
        })

        // If Job produced an image, add the image node and connect Job -> Image
        if (resultingImg) {
          const psnr = qData?.find(q => String(q.image_id) === String(resultingImg.image_id) && q.metric_type === 'PSNR')?.score
          const ssim = qData?.find(q => String(q.image_id) === String(resultingImg.image_id) && q.metric_type === 'SSIM')?.score
          
          newNodes.push({
            id: `img-${resultingImg.image_id}`,
            type: 'reconstructed',
            position: { x: xPos - 20, y: yBase + 110 },
            data: { id: resultingImg.image_id, imageUrl: resultingImg.image_url, resolution: resultingImg.resolution, psnr, ssim }
          })

          newEdges.push({
            id: `edge-j${job.job_id}-i${resultingImg.image_id}`,
            source: `job-${job.job_id}`,
            target: `img-${resultingImg.image_id}`,
            animated: true,
            style: { stroke: '#0891b2', strokeWidth: 2 }
          })

          // If it's a refinement and not already connected via ctData
          const isRefinement = Boolean(resultingImg?.original_image_id)
          if (isRefinement) {
            const alreadyConnected = newEdges.some(
              e => e.source === `img-${resultingImg.original_image_id}` && e.target === `job-${job.job_id}`
            )
            if (!alreadyConnected) {
              newEdges.push({
                id: `edge-i${resultingImg.original_image_id}-j${job.job_id}`,
                source: `img-${resultingImg.original_image_id}`,
                target: `job-${job.job_id}`,
                animated: true,
                label: 'Refines Parent',
                labelStyle: { fill: '#34d399', fontSize: 10, fontFamily: 'monospace' },
                labelBgStyle: { fill: '#0f172a' },
                style: { stroke: '#059669', strokeWidth: 2, strokeDasharray: '5,5' }
              })
            }
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
