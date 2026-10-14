import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("backend/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
sb = create_client(url, key)

print(sb.table("tile_summary").select("*").limit(5).execute().data)
