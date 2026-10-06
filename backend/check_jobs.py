import os
from supabase import create_client
from dotenv import load_dotenv
load_dotenv()
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
jobs = sb.table('reconstruction_job').select('job_id,status,error_message,start_time').order('start_time', desc=True).limit(5).execute()
for j in jobs.data:
    print("Job:", j['job_id'], "| Status:", j['status'], "| Error:", j['error_message'])
