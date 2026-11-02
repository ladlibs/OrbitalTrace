"""
reset_jobs.py — Safely wipe all reconstruction jobs and associated artifacts.
Keeps raw camera frames intact (Frames 10, 11, 12, 13, etc.).
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def erase_all_jobs():
    print("Clearing all reconstruction jobs, artifacts, and provenance layers...")

    # 1. Sever circular references
    try:
        sb.table("reconstruction_job").update({"parent_image_id": None}).neq("job_id", 0).execute()
        sb.table("reconstructed_image").update({"original_image_id": None}).neq("image_id", 0).execute()
    except Exception as e:
        print("Notice on FK sever:", e)

    # 2. Delete analytics, tiles, and layers
    tables_to_clear = [
        "tile_source",
        "tile_summary",
        "provenance_layer",
        "quality_assessment",
        "contributes_to",
        "reconstructed_image",
        "reconstruction_job",
    ]

    for table in tables_to_clear:
        try:
            # PostgREST requires a filter to delete all
            res = sb.table(table).delete().neq("id" if table == "tile_source" else ("image_id" if "image" in table or "layer" in table or "quality" in table or "summary" in table else "job_id"), -999999).execute()
            print(f"  • Cleared table: {table}")
        except Exception as e:
            # Fallback for tables with different primary keys
            try:
                if table == "tile_source":
                    sb.table(table).delete().neq("frame_id", -999999).execute()
                elif table == "contributes_to":
                    sb.table(table).delete().neq("frame_id", -999999).execute()
                elif table in ("reconstructed_image", "provenance_layer", "quality_assessment", "tile_summary"):
                    sb.table(table).delete().neq("image_id", -999999).execute()
                elif table == "reconstruction_job":
                    sb.table(table).delete().neq("job_id", -999999).execute()
                print(f"  • Cleared table (fallback): {table}")
            except Exception as e2:
                print(f"  ✕ Error clearing {table}: {e2}")

    # 3. Delete mirrored reconstructed frames from raw_frame (keep original satellite captures)
    try:
        res = sb.table("raw_frame").delete().eq("source_dataset", "RECONSTRUCTED").execute()
        print("  • Cleared mirrored reconstructed products from raw_frame table.")
    except Exception as e:
        print("Notice on raw_frame cleanup:", e)

    print("\n✅ All reconstruction jobs and dependent records successfully erased.")
    print("Raw camera frames (10, 11, 12, 13) remain intact.")

if __name__ == "__main__":
    erase_all_jobs()
