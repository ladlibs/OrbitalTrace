"""Run from repo root:  python apply_fixes_4.py
Fixes 'Could not embed because more than one relationship was found' on My Jobs."""
import pathlib, sys
p = pathlib.Path("src/pages/JobsPage.tsx"); s = p.read_text()
old = "reconstructed_image (\n"
new = "reconstructed_image!reconstructed_image_job_id_fkey (\n"
if new in s:
    print("already patched")
elif old in s:
    p.write_text(s.replace(old, new, 1)); print("patched", p)
else:
    sys.exit("snippet not found: in the jobs select, change `reconstructed_image (` to "
             "`reconstructed_image!reconstructed_image_job_id_fkey (` by hand")