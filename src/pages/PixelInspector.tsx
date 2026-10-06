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

  useEffect(() => {
    (async () => {
      const { data: img } = await supabase.from('reconstructed_image').select('image_url').eq('image_id', imageId).single()
      const { data: ls } = await supabase.from('provenance_layer').select('*').eq('image_id', imageId)
      
      if (!img) return;

      const u: Record<string, string> = { IMAGE: img.image_url }
      ls?.forEach(l => { u[l.layer_type] = l.layer_url })
      setUrls(u)
      
      setOrder(ls?.find(l => l.layer_type === 'SOURCE_INDEX')?.meta?.frame_order ?? [])
      
      const d: Record<string, ImageData> = {}
      for (const k of ['CLASS_MAP', 'UNCERTAINTY', 'SOURCE_INDEX']) {
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
    
    const at = (k: string) => {
      if(!data[k]) return 0;
      return data[k].data[(y * data[k].width + x) * 4]
    }

    const s = at('SOURCE_INDEX')
    setInfo({ 
      x, 
      y, 
      cls: CLS[Math.round(at('CLASS_MAP') / 127)] || 'Unknown',
      unc: (at('UNCERTAINTY') / 255).toFixed(2),
      source: s === 255 ? 'none (filled by interpolation)' : `Frame #${order[s] || '?'}` 
    })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-6 animate-fade-in">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Search className="w-5 h-5 text-fuchsia-400" />
          Per-Pixel Provenance Inspector
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Inspecting reconstruction layers for Image #{imageId}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {['IMAGE', 'CLASS_MAP', 'UNCERTAINTY', 'SOURCE_INDEX'].map(v => (
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
      
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-4 flex justify-center">
        {urls[view] ? (
          <img 
            src={urls[view]} 
            onMouseMove={onMove} 
            onMouseLeave={() => setInfo(null)}
            className="max-w-full h-auto cursor-crosshair border border-slate-700/50" 
            style={{ imageRendering: 'pixelated' }}
            alt={view}
          />
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm font-mono">
            Layer '{view}' not found for this image.
          </div>
        )}
      </div>

      {info ? (
        <div className="glass-panel p-4 text-xs font-mono flex flex-wrap gap-6 items-center">
          <div><span className="text-slate-500">Coordinate:</span> <span className="text-cyan-400">({info.x}, {info.y})</span></div>
          <div><span className="text-slate-500">Class:</span> <span className="text-fuchsia-400">{info.cls}</span></div>
          <div><span className="text-slate-500">Uncertainty:</span> <span className="text-rose-400">{info.unc}</span></div>
          <div><span className="text-slate-500">Dominant Source:</span> <span className="text-emerald-400">{info.source}</span></div>
        </div>
      ) : (
        <div className="glass-panel p-4 text-xs font-mono text-slate-500 text-center">
          Hover over the image to inspect pixel provenance.
        </div>
      )}
    </div>
  )
}
