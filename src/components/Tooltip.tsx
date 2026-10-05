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
