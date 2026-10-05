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
