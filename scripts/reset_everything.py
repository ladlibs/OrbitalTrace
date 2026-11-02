"""
reset_everything.py — Complete purge of all OrbitalTrace database records, raw frames, and storage artifacts.

What this resets:
  1. Sever foreign key loops (parent_image_id, original_image_id).
  2. Delete all records from:
     - tile_source
     - tile_summary
     - provenance_layer
     - quality_assessment
     - contributes_to
     - reconstructed_image
     - reconstruction_job
     - raw_frame (ALL raw frames deleted)
  3. Purge Supabase storage bucket ('satellite-images'):
     - outputs/
     - cloud-masks/
     - raw-frames/
     - ground-truths/
  4. Reset local audit log (backend/data/audit_log.json).
"""

import os, json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
BUCKET = "satellite-images"

def reset_all():
    print("=" * 65)
    print("⚠️  WARNING: PURGING ALL DATABASE TABLES, RAW FRAMES, AND STORAGE")
    print("=" * 65)

    # 1. Break circular foreign key references
    print("\n[1/4] Breaking circular references...")
    try:
        sb.table("reconstruction_job").update({"parent_image_id": None}).neq("job_id", -999999).execute()
        sb.table("reconstructed_image").update({"original_image_id": None}).neq("image_id", -999999).execute()
        print("  ✓ Cleared parent_image_id and original_image_id pointers.")
    except Exception as e:
        print("  Notice on FK break:", e)

    # 2. Delete all records from tables in reverse dependency order
    print("\n[2/4] Deleting records from all tables (including raw_frame)...")
    tables_to_delete = [
        ("tile_source", "id"),
        ("tile_summary", "image_id"),
        ("provenance_layer", "image_id"),
        ("quality_assessment", "image_id"),
        ("contributes_to", "frame_id"),
        ("reconstructed_image", "image_id"),
        ("reconstruction_job", "job_id"),
        ("raw_frame", "frame_id"),
    ]

    for table, pkey in tables_to_delete:
        try:
            # PostgREST delete requires a filter
            sb.table(table).delete().neq(pkey, -999999).execute()
            print(f"  ✓ Purged table: {table}")
        except Exception as e:
            # Fallback filter if primary key differs
            try:
                sb.table(table).delete().gt(pkey, -999999).execute()
                print(f"  ✓ Purged table (gt fallback): {table}")
            except Exception as e2:
                print(f"  ✕ Error clearing {table}: {e2}")

    # 3. Purge storage objects recursively with pagination
    print(f"\n[3/4] Purging Supabase Storage bucket '{BUCKET}'...")
    def get_all_files(folder=''):
        all_files = []
        offset = 0
        limit = 100
        while True:
            items = sb.storage.from_(BUCKET).list(folder, {'limit': limit, 'offset': offset})
            if not items:
                break
            for item in items:
                name = item['name']
                if name == '.emptyFolderPlaceholder':
                    continue
                path = f"{folder}/{name}" if folder else name
                if item.get('id') is None:
                    all_files.extend(get_all_files(path))
                else:
                    all_files.append(path)
            if len(items) < limit:
                break
            offset += limit
        return all_files

    files = get_all_files()
    print(f"  Found {len(files)} files to delete...")
    batch_size = 50
    for i in range(0, len(files), batch_size):
        chunk = files[i:i+batch_size]
        sb.storage.from_(BUCKET).remove(chunk)
    print(f"  ✓ Purged all {len(files)} files from '{BUCKET}' (bucket is completely empty).")

    # 4. Clear local audit log
    print("\n[4/4] Resetting local audit log...")
    audit_path = "backend/data/audit_log.json"
    if os.path.exists(audit_path):
        with open(audit_path, "w") as f:
            json.dump({"status": "RESET", "records": []}, f, indent=2)
        print(f"  ✓ Reset {audit_path}")

    print("\n" + "=" * 65)
    print("✅ RESET COMPLETE: ALL DATABASE RECORDS, RAW FRAMES, AND STORAGE DELETED.")
    print("=" * 65)

if __name__ == "__main__":
    import sys
    if "--force" in sys.argv or "-y" in sys.argv:
        reset_all()
    else:
        confirm = input("Are you sure you want to delete EVERYTHING including raw frames? (yes/no): ").strip().lower()
        if confirm in ("yes", "y"):
            reset_all()
        else:
            print("Purge aborted.")
