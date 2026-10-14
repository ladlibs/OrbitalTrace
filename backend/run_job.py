"""Run a stuck job directly (no browser, no token):   python run_job.py <job_id>
Shows the real error in this terminal. Run from the backend folder."""
import sys
from main import sb, process, ALGORITHMS

job_id = int(sys.argv[1])
job = sb.table("reconstruction_job").select("status,algorithm_used,parent_image_id").eq("job_id", job_id).execute().data
if not job:
    sys.exit(f"job {job_id} not found")
print("job:", job[0])
if job[0]["algorithm_used"] not in ALGORITHMS:
    sys.exit(f"algorithm {job[0]['algorithm_used']!r} not supported. Supported: {list(ALGORITHMS)}")
if sb.table("reconstructed_image").select("image_id").eq("job_id", job_id).execute().data:
    sys.exit("job already has an output image; refusing to create a duplicate")
process(job_id)
print("done; status now:", sb.table("reconstruction_job").select("status,error_message").eq("job_id", job_id).execute().data)