import hashlib, io, json, os
from datetime import datetime, timezone

import numpy as np, requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from supabase import create_client

from fusion import cloud_mask, fuse

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
BUCKET, TILE = "satellite-images", 32

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])

def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def fetch(url):
    r = requests.get(url, timeout=60); r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert("RGB"), sha(r.content)

def put_png(path, arr):
    buf = io.BytesIO(); Image.fromarray(arr).save(buf, format="PNG")
    data = buf.getvalue()
    sb.storage.from_(BUCKET).upload(path, data, {"content-type": "image/png", "upsert": "true"})
    return sb.storage.from_(BUCKET).get_public_url(path), sha(data)

def process(job_id: str):
    try:
        job = sb.table("reconstruction_job").select("parameters,ground_truth_url").eq("job_id", job_id).single().execute().data
        ct = sb.table("contributes_to").select("frame_id,contribution_weight").eq("job_id", job_id).execute().data
        if not ct: raise ValueError("job has no contributing frames")
        wmap = {c["frame_id"]: float(c["contribution_weight"]) for c in ct}

        rows = sb.table("raw_frame").select("frame_id,image_url").in_("frame_id", list(wmap)).execute().data
        rows.sort(key=lambda r: r["frame_id"])
        imgs, hashes = zip(*[fetch(r["image_url"]) for r in rows])
        size = imgs[0].size
        frames = np.stack([np.asarray(i.resize(size), dtype=np.float32) / 255 for i in imgs])
        weights = np.array([wmap[r["frame_id"]] for r in rows], dtype=np.float32)
        valid = np.stack([~cloud_mask(f) for f in frames]).astype(np.float32)

        out, cls, unc, src = fuse(frames, weights, valid)
        H, W = cls.shape

        input_hash = sha(json.dumps({"frames": hashes, "weights": weights.tolist(),
                                     "params": job["parameters"]}, sort_keys=True).encode())
        sb.table("reconstruction_job").update({"input_hash": input_hash}).eq("job_id", job_id).execute()

        img = sb.table("reconstructed_image").insert({
            "job_id": job_id, "resolution": 10, "output_format": "PNG"}).execute().data[0]
        iid = img["image_id"]

        url, h = put_png(f"outputs/{iid}.png", (out * 255).astype(np.uint8))
        sb.table("reconstructed_image").update({"image_url": url}).eq("image_id", iid).execute()

        qa_records = [
            {"image_id": iid, "metric_type": "SYNTH_FRACTION", "score": float((cls == 2).mean())},
            {"image_id": iid, "metric_type": "MEAN_UNCERTAINTY", "score": float(unc.mean())}
        ]

        order = [r["frame_id"] for r in rows]
        layers = {"CLASS_MAP": cls * 127, "UNCERTAINTY": (unc * 255).astype(np.uint8), "SOURCE_INDEX": src}

        if job.get("ground_truth_url"):
            try:
                from skimage.metrics import peak_signal_noise_ratio, structural_similarity
                gt_img, _ = fetch(job["ground_truth_url"])
                gt_arr = np.asarray(gt_img.resize(size), dtype=np.float32) / 255.0
                psnr = peak_signal_noise_ratio(gt_arr, out, data_range=1.0)
                ssim = structural_similarity(gt_arr, out, data_range=1.0, channel_axis=-1)
                qa_records.extend([
                    {"image_id": iid, "metric_type": "PSNR", "score": float(psnr)},
                    {"image_id": iid, "metric_type": "SSIM", "score": float(ssim)}
                ])
                # Generate ERROR_MAP
                err = np.abs(gt_arr - out).mean(axis=-1)
                layers["ERROR_MAP"] = (err * 255).astype(np.uint8)
            except Exception as e:
                print("Failed to calculate PSNR/SSIM/ERROR_MAP:", e)

        for lt, arr in layers.items():
            lurl, lh = put_png(f"outputs/{iid}_{lt}.png", arr)
            sb.table("provenance_layer").upsert({
                "image_id": iid, "layer_type": lt, "layer_url": lurl, "layer_hash": lh,
                "meta": {"frame_order": order} if lt == "SOURCE_INDEX" else {}}).execute()

        summary, sources = [], []
        for ty in range(0, H, TILE):
            for tx in range(0, W, TILE):
                c, u, s = cls[ty:ty+TILE, tx:tx+TILE], unc[ty:ty+TILE, tx:tx+TILE], src[ty:ty+TILE, tx:tx+TILE]
                key = {"image_id": iid, "tile_x": tx // TILE, "tile_y": ty // TILE}
                summary.append({**key, "observed_pct": float((c == 0).mean() * 100),
                                "weak_pct": float((c == 1).mean() * 100),
                                "synth_pct": float((c == 2).mean() * 100),
                                "mean_uncertainty": float(u.mean())})
                for k, r in enumerate(rows):
                    p = float((s == k).mean() * 100)
                    if p > 0: sources.append({**key, "frame_id": r["frame_id"], "contribution_pct": p})
        sb.table("tile_summary").insert(summary).execute()      # parents first
        if sources: sb.table("tile_source").insert(sources).execute()

        sb.table("quality_assessment").upsert(qa_records).execute()

        sb.table("reconstruction_job").update({
            "status": "COMPLETED", "end_time": datetime.now(timezone.utc).isoformat()}).eq("job_id", job_id).execute()
    except Exception as e:
        print("JOB FAILED:", repr(e))
        sb.table("reconstruction_job").update({
            "status": "FAILED", "error_message": str(e)[:500],
            "end_time": datetime.now(timezone.utc).isoformat()}).eq("job_id", job_id).execute()

@app.get("/health")
def health(): return {"ok": True}

@app.post("/jobs/{job_id}/run")
def run(job_id: int, bg: BackgroundTasks):
    bg.add_task(process, job_id)
    return {"queued": job_id}