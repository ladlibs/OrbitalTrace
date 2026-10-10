import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createClient } from '../lib/supabase/client'
import { Search } from 'lucide-react'

const supabase = createClient()
const CLS = ['Observed', 'Weakly observed', 'Synthesized']

function pixels(url: string): Promise<ImageData> {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height
      const ctx = c.getContext('2d')!; ctx.drawImage(im, 0, 0)
      res(ctx.getImageData(0, 0, c.width, c.height))
    }
    im.onerror = rej; im.src = url
  })
}

export default function PixelInspector() {
  const { imageId } = useParams()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [data, setData] = useState<Record<string, ImageData>>({})
  const [order, setOrder] = useState<string[]>([])
  const [view, setView] = useState('IMAGE')
  const [info, setInfo] = useState<any>(null)

  const [psnr, setPsnr] = useState<number | null>(null)
  const [ssim, setSsim] = useState<number | null>(null)

  const [inspectMode, setInspectMode] = useState<'PIXEL' | 'TILE'>('PIXEL')
  const [tileSummary, setTileSummary] = useState<Record<string, any>>({})
  const [tileSource, setTileSource] = useState<Record<string, any[]>>({})
  const [highlight, setHighlight] = useState<{x: number, y: number, w: number, h: number} | null>(null)

  useEffect(() => {
    (async () => {
      const { data: img } = await supabase.from('reconstructed_image')
        .select('image_url, job_id')
        .eq('image_id', imageId)
        .single()
        
      const { data: ls } = await supabase.from('provenance_layer').select('*').eq('image_id', imageId)
      const { data: qa } = await supabase.from('quality_assessment').select('*').eq('image_id', imageId)
      
      const { data: tsData } = await supabase.from('tile_summary').select('*').eq('image_id', imageId)
      const { data: srcData } = await supabase.from('tile_source').select('*').eq('image_id', imageId)
      
      if (!img) return;

      const { data: job } = await supabase.from('reconstruction_job')
        .select('ground_truth_url')
        .eq('job_id', img.job_id)
        .single()

      setPsnr(qa?.find(q => q.metric_type === 'PSNR')?.score ?? null)
      setSsim(qa?.find(q => q.metric_type === 'SSIM')?.score ?? null)

      const tsMap: Record<string, any> = {}
      tsData?.forEach(t => tsMap[`${t.tile_x}_${t.tile_y}`] = t)
      setTileSummary(tsMap)

      const srcMap: Record<string, any[]> = {}
      srcData?.forEach(s => {
        const key = `${s.tile_x}_${s.tile_y}`
        if (!srcMap[key]) srcMap[key] = []
        srcMap[key].push(s)
      })
      setTileSource(srcMap)

      const u: Record<string, string> = { IMAGE: img.image_url }
      if (job?.ground_truth_url) {
        u['GROUND_TRUTH'] = job.ground_truth_url
      }
      
      ls?.forEach(l => { u[l.layer_type] = l.layer_url })
      setUrls(u)
      
      setOrder(ls?.find(l => l.layer_type === 'SOURCE_INDEX')?.meta?.frame_order ?? [])
      
      const d: Record<string, ImageData> = {}
      for (const k of ['CLASS_MAP', 'UNCERTAINTY', 'SOURCE_INDEX', 'ERROR_MAP']) {
        if (u[k]) {
          try {
            d[k] = await pixels(u[k])
          } catch(e) {
            console.error("Failed to load image data for", k)
          }
        }
      }
      setData(d)
    })()
  }, [imageId])

  const onMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const d = data.CLASS_MAP
    if (!d) return
    const x = Math.floor((e.clientX - r.left) / r.width * d.width)
    const y = Math.floor((e.clientY - r.top) / r.height * d.height)
    
    const tX = Math.floor(x / 32)
    const tY = Math.floor(y / 32)
    const tKey = `${tX}_${tY}`

    if (inspectMode === 'TILE') {
      const scaleX = r.width / d.width
      const scaleY = r.height / d.height
      setHighlight({
        x: tX * 32 * scaleX,
        y: tY * 32 * scaleY,
        w: 32 * scaleX,
        h: 32 * scaleY
      })
      
      setInfo({
        mode: 'TILE',
        tX, tY,
        summary: tileSummary[tKey],
        sources: tileSource[tKey] || []
      })
    } else {
      setHighlight(null)
      const at = (k: string) => {
        if(!data[k]) return 0;
        return data[k].data[(y * data[k].width + x) * 4]
      }

      const s = at('SOURCE_INDEX')
      setInfo({ 
        mode: 'PIXEL',
        x, y, 
        cls: CLS[Math.round(at('CLASS_MAP') / 127)] || 'Unknown',
        unc: (at('UNCERTAINTY') / 255).toFixed(2),
        source: s === 255 ? 'none (filled by interpolation)' : `Frame #${order[s] || '?'}` ,
        err: data['ERROR_MAP'] ? (at('ERROR_MAP') / 255).toFixed(3) : null
      })
    }
  }

  const handleMouseLeave = () => {
    setInfo(null)
    setHighlight(null)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-6 animate-fade-in">
      <div className="border-b border-slate-800 pb-4 flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-fuchsia-400" />
            Provenance Inspector
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Inspecting reconstruction layers for Image #{imageId}
          </p>
        </div>
        
        <div className="flex gap-4 bg-slate-900 border border-slate-700 px-4 py-2 rounded-lg">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">PSNR</div>
            <div className="font-mono text-sm font-bold text-cyan-400">{psnr != null ? `${psnr.toFixed(2)} dB` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">SSIM</div>
            <div className="font-mono text-sm font-bold text-emerald-400">{ssim != null ? ssim.toFixed(4) : 'N/A'}</div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-slate-900/50 p-2 rounded-lg border border-slate-800">
        <div className="flex gap-2 flex-wrap">
          {['IMAGE', 'GROUND_TRUTH', 'ERROR_MAP', 'CLASS_MAP', 'UNCERTAINTY', 'SOURCE_INDEX'].map(v => (
            <button 
              key={v} 
              onClick={() => setView(v)}
              className={view === v ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
              disabled={!urls[v]}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-md border border-slate-800">
          <button 
            onClick={() => setInspectMode('PIXEL')}
            className={`px-3 py-1 text-xs rounded transition-colors ${inspectMode === 'PIXEL' ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Pixel Mode
          </button>
          <button 
            onClick={() => setInspectMode('TILE')}
            className={`px-3 py-1 text-xs rounded transition-colors ${inspectMode === 'TILE' ? 'bg-fuchsia-900/50 text-fuchsia-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Tile Mode
          </button>
        </div>
      </div>
      
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-4 flex justify-center relative">
        {urls[view] ? (
          <div className="relative inline-block">
            <img 
              src={urls[view]} 
              onMouseMove={onMove} 
              onMouseLeave={handleMouseLeave}
              className={`max-w-full h-auto border border-slate-700/50 ${inspectMode === 'TILE' ? 'cursor-default' : 'cursor-crosshair'}`} 
              style={{ imageRendering: 'pixelated' }}
              alt={view}
            />
            {highlight && (
              <div 
                className="absolute border-2 border-fuchsia-500 bg-fuchsia-500/20 pointer-events-none transition-all duration-75"
                style={{
                  left: highlight.x,
                  top: highlight.y,
                  width: highlight.w,
                  height: highlight.h
                }}
              />
            )}
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm font-mono">
            Layer '{view}' not found for this image.
          </div>
        )}
      </div>

      {info ? (
        info.mode === 'PIXEL' ? (
          <div className="glass-panel p-4 text-xs font-mono flex flex-wrap gap-6 items-center">
            <div><span className="text-slate-500">Coordinate:</span> <span className="text-cyan-400">({info.x}, {info.y})</span></div>
            <div><span className="text-slate-500">Class:</span> <span className="text-fuchsia-400">{info.cls}</span></div>
            <div><span className="text-slate-500">Uncertainty:</span> <span className="text-rose-400">{info.unc}</span></div>
            <div><span className="text-slate-500">Dominant Source:</span> <span className="text-emerald-400">{info.source}</span></div>
            {info.err != null && (
              <div><span className="text-slate-500">Absolute Error:</span> <span className="text-amber-400">{info.err}</span></div>
            )}
          </div>
        ) : (
          <div className="glass-panel p-4 text-xs font-mono grid grid-cols-2 gap-4">
            <div>
              <div className="text-slate-500 mb-2 border-b border-slate-800 pb-1">Tile Area: <span className="text-fuchsia-400">({info.tX}, {info.tY})</span></div>
              {info.summary ? (
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Observed:</span> <span className="text-cyan-400">{info.summary.observed_pct}%</span></div>
                  <div className="flex justify-between"><span>Weakly Observed:</span> <span className="text-amber-400">{info.summary.weak_pct}%</span></div>
                  <div className="flex justify-between"><span>Synthesized:</span> <span className="text-rose-400">{info.summary.synth_pct}%</span></div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-slate-800"><span>Mean Uncertainty:</span> <span className="text-slate-300">{info.summary.mean_uncertainty}</span></div>
                </div>
              ) : (
                <div className="text-slate-600">No summary data found for this tile.</div>
              )}
            </div>
            <div>
              <div className="text-slate-500 mb-2 border-b border-slate-800 pb-1">Raw Frame Contributions</div>
              {info.sources && info.sources.length > 0 ? (
                <ul className="space-y-1">
                  {info.sources.map((s: any) => (
                    <li key={s.frame_id} className="flex justify-between">
                      <span className="text-emerald-400">Frame #{s.frame_id}</span>
                      <span className="text-slate-300">{s.contribution_pct}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-slate-600">Completely synthesized (no raw frame sources).</div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="glass-panel p-4 text-xs font-mono text-slate-500 text-center">
          Hover over the image to inspect provenance data.
        </div>
      )}
    </div>
  )
}
