"""ONE script for everything. Run from the repo root:  python apply_all.py
Safe to run many times: already-applied patches are skipped, missing ones are reported."""
import json, pathlib, sys

REPORT = {"applied": 0, "skipped": 0, "missing": []}

def patch(path, pairs):
    p = pathlib.Path(path)
    if not p.exists():
        REPORT["missing"].append((path, "FILE NOT FOUND")); print("MISSING FILE", path); return
    s = p.read_text()
    for old, new in pairs:
        if new in s:
            REPORT["skipped"] += 1
        elif old in s:
            s = s.replace(old, new, 1); REPORT["applied"] += 1
        else:
            REPORT["missing"].append((path, old[:70].replace("\n", " "))); 
    p.write_text(s); print("checked", path)

def write(path, text):
    p = pathlib.Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists() or p.read_text() != text:
        p.write_text(text); print("wrote", path)

write("src/lib/supabase/client.ts", r'''import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let instance: SupabaseClient | null = null

// Singleton: every caller gets the same client (one auth listener / one session store)
export function createClient(): SupabaseClient {
  if (!instance) {
    instance = createSupabaseClient(
      import.meta.env.VITE_SUPABASE_URL || '',
      import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    )
  }
  return instance
}
''')
write("src/vite-env.d.ts", "/// <reference types=\"vite/client\" />\n")
write("tsconfig.json", r'''{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "types", "vite.config.ts"]
}
''')
# ---- END HELPERS ----
"""Run from repo root:  python apply_fixes.py
Applies exact-string patches; aborts loudly if a snippet isn't found."""
import json, pathlib, sys


# --- package.json: drop duplicate reactflow + tailwind v4 postcss plugin ---
pj = json.loads(pathlib.Path("package.json").read_text())
pj["dependencies"].pop("reactflow", None)
pj["devDependencies"].pop("@tailwindcss/postcss", None)
pathlib.Path("package.json").write_text(json.dumps(pj, indent=2) + "\n")
print("patched package.json  -> now run: npm install")

# --- LogNewJobPage: stop mutating state ---
patch("src/pages/LogNewJobPage.tsx", [(
"""      const copy = [...prev]
      copy[index][field] = val
      return copy""",
"""      return prev.map((pair, i) => (i === index ? { ...pair, [field]: val } : pair))"""
)])

# --- LineagePage: v12 typings (data is Record<string, unknown>) + type-only import ---
patch("src/pages/LineagePage.tsx", [
("  Position,\n  NodeProps\n}", "  Position,\n  type NodeProps\n}"),
("function RawFrameNode({ data }: NodeProps) {", "function RawFrameNode({ data: raw }: NodeProps) {\n  const data = raw as any"),
("function JobNode({ data }: NodeProps) {", "function JobNode({ data: raw }: NodeProps) {\n  const data = raw as any"),
("function ReconstructedNode({ data }: NodeProps) {", "function ReconstructedNode({ data: raw }: NodeProps) {\n  const data = raw as any"),
])

# --- JobsPage: join quality_assessment, string resolution, assessed_by ---
patch("src/pages/JobsPage.tsx", [
("""              image_id, resolution, output_format, generated_timestamp
            )""",
"""              image_id, resolution, output_format, generated_timestamp,
              quality_assessment ( metric_type, score )
            )"""),
("""            const image = job.reconstructed_image?.[0]""",
"""            const image = job.reconstructed_image?.[0]
            const scoreOf = (m: string) =>
              image?.quality_assessment?.find((q: any) => String(q.metric_type).toUpperCase() === m)?.score"""),
("{image.psnr || 'N/A'} dB", "{scoreOf('PSNR') ?? 'N/A'} dB"),
("{image.ssim || 'N/A'}</div>", "{scoreOf('SSIM') ?? 'N/A'}</div>"),
("""              metric_type: 'PSNR',
              score: parseFloat(completionForm.psnr)""",
"""              metric_type: 'PSNR',
              assessed_by: currentAnalyst?.analyst_id,
              score: parseFloat(completionForm.psnr)"""),
("""              metric_type: 'SSIM',
              score: parseFloat(completionForm.ssim)""",
"""              metric_type: 'SSIM',
              assessed_by: currentAnalyst?.analyst_id,
              score: parseFloat(completionForm.ssim)"""),
])

"""Run from repo root AFTER apply_fixes.py:  python apply_fixes_2.py
Adds parent-image selection to LogNewJobPage and triggers the backend run."""
import pathlib, sys


PANEL = """        {/* Optional: refine an existing image */}
        <div className="glass-panel p-6 space-y-3">
          <div className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">
            Optional: Refine an Existing Image (adds a provenance generation)
          </div>
          <select
            value={parentImageId}
            onChange={(e) => setParentImageId(e.target.value)}
            className="glass-input w-full"
          >
            <option value="">-- Fresh reconstruction (no parent) --</option>
            {parentImages.map((im) => (
              <option key={im.image_id} value={im.image_id}>
                Image #{im.image_id} (job #{im.job_id}, {new Date(im.generated_timestamp).toLocaleDateString()})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">
            With a parent, frames below are optional extra evidence. Add a parameter
            <span className="font-mono text-cyan-400"> parent_weight </span>
            (default 1.0) to control how much the parent counts.
          </p>
        </div>

        {/* Step D: Algorithm & JSONB Parameters */}"""

patch("src/pages/LogNewJobPage.tsx", [
("  const [currentAnalyst, setCurrentAnalyst] = useState<any>(null)\n",
 "  const [currentAnalyst, setCurrentAnalyst] = useState<any>(null)\n"
 "  const [parentImages, setParentImages] = useState<any[]>([])\n"
 "  const [parentImageId, setParentImageId] = useState<string>('')\n"),
("      setSatellites(sats || [])",
 "      setSatellites(sats || [])\n\n"
 "      const { data: imgs } = await supabase\n"
 "        .from('reconstructed_image')\n"
 "        .select('image_id, job_id, generated_timestamp')\n"
 "        .order('image_id', { ascending: false })\n"
 "      setParentImages(imgs || [])"),
("    if (selectedFramesList.length === 0) {\n      setError('Please select at least one raw satellite frame for this job.')",
 "    if (selectedFramesList.length === 0 && !parentImageId) {\n      setError('Select at least one raw frame, or choose a parent image to refine.')"),
("          analyst_id: currentAnalyst.analyst_id,",
 "          analyst_id: currentAnalyst.analyst_id,\n          parent_image_id: parentImageId ? Number(parentImageId) : null,"),
("""      const { error: ctErr } = await supabase
        .from('contributes_to')
        .insert(contributesRows)

      if (ctErr) throw ctErr
""",
"""      if (contributesRows.length > 0) {
        const { error: ctErr } = await supabase.from('contributes_to').insert(contributesRows)
        if (ctErr) throw ctErr
      }

      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/jobs/${newJobId}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!resp.ok) throw new Error(`Backend refused to start the job (HTTP ${resp.status})`)
"""),
("            <select\n              required\n              value={selectedSatelliteId}",
 "            <select\n              required={!parentImageId}\n              value={selectedSatelliteId}"),
("        {/* Step D: Algorithm & JSONB Parameters */}", PANEL),
])

"""Run from repo root AFTER apply_fixes.py and apply_fixes_2.py:  python apply_fixes_3.py
Replaces the fake algorithm list with the algorithms the backend can really run."""
import pathlib, sys


patch("src/pages/LogNewJobPage.tsx", [
("interface SelectedFrame {",
 "// Must match the ALGORITHMS registry in backend/main.py\n"
 "const ALGORITHMS = [\n"
 "  { id: 'FUSION_WEIGHTED_V1', label: 'Weighted Cloud-Masked Fusion (v1)' },\n"
 "]\n\ninterface SelectedFrame {"),
("""  const [algorithmUsed, setAlgorithmUsed] = useState<string>('POCS')
  const [customAlgorithm, setCustomAlgorithm] = useState<string>('')
  const [paramPairs, setParamPairs] = useState<Array<{ key: string; value: string }>>([
    { key: 'iterations', value: '500' },
    { key: 'learning_rate', value: '0.001' },
  ])""",
"""  const [algorithmUsed, setAlgorithmUsed] = useState<string>(ALGORITHMS[0].id)
  const [paramPairs, setParamPairs] = useState<Array<{ key: string; value: string }>>([
    { key: 'parent_weight', value: '1.0' },
  ])"""),
("    const finalAlgorithm = algorithmUsed === 'OTHER' ? customAlgorithm : algorithmUsed",
 "    const finalAlgorithm = algorithmUsed"),
("algorithm_used: finalAlgorithm || 'POCS',", "algorithm_used: finalAlgorithm,"),
("""                <option value="POCS">POCS (Projection Onto Convex Sets)</option>
                <option value="ESRGAN">ESRGAN (Super-Resolution GAN)</option>
                <option value="Bicubic Interpolation">Bicubic Interpolation</option>
                <option value="Deep Iterative Reconstruction">Deep Iterative Reconstruction</option>
                <option value="OTHER">Custom Free-Text Algorithm...</option>""",
"""                {ALGORITHMS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}"""),
("""            {algorithmUsed === 'OTHER' && (
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
            )}""",
"""            <p className="text-[11px] text-slate-500 self-end">
              Only algorithms the processing engine can execute are listed, so the recorded
              algorithm always matches what actually ran.
            </p>"""),
("Traditional math programs are very accurate but can look blurry. Modern AI programs (like ESRGAN) make images look incredibly sharp, but sometimes they 'guess' details that aren't really there.",
 "Only algorithms the processing engine can actually run are listed, so the recorded algorithm always matches what was executed."),
])

# --- My Jobs: two FKs now exist between the tables, name the one to embed through ---
patch("src/pages/JobsPage.tsx", [("reconstructed_image (\n", "reconstructed_image!reconstructed_image_job_id_fkey (\n")])

print(f"\napplied {REPORT['applied']}, already-applied {REPORT['skipped']}, missing {len(REPORT['missing'])}")
for path, snip in REPORT["missing"]:
    print("  MISSING in", path, ":", snip)
if REPORT["missing"]:
    print("Send me the MISSING lines above; those parts of your files differ from what I patched.")
else:
    print("All patches in place. Now run: npm install")
sys.exit(1 if REPORT["missing"] else 0)