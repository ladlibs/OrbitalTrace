import hashlib, io, json, os
from datetime import datetime, timezone

import numpy as np, requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from supabase import create_client

from fusion import cloud_mask, fuse
from provenance import input_shares, build_vector, pack_vector, unpack_vector

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
BUCKET, TILE, ENGINE_VERSION = "satellite-images", 32, "fuse-v2-provenance"
_inflight: set[int] = set()

# Registry of algorithms the engine can really execute. Keep in sync with ALGORITHMS in LogNewJobPage.tsx.
# The recorded algorithm_used must always equal what actually ran, otherwise provenance is false.
ALGORITHMS = {"FUSION_WEIGHTED_V1": fuse}

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])

def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def get_bytes(url):
    r = requests.get(url, timeout=60); r.raise_for_status()
    return r.content

def fetch(url):
    data = get_bytes(url)
    return Image.open(io.BytesIO(data)).convert("RGB"), sha(data)

def put_bytes(path, data, ctype):
    sb.storage.from_(BUCKET).upload(path, data, {"content-type": ctype, "upsert": "true"})
    return sb.storage.from_(BUCKET).get_public_url(path), sha(data)

def put_png(path, arr):
    buf = io.BytesIO(); Image.fromarray(arr).save(buf, format="PNG")
    return put_bytes(path, buf.getvalue(), "image/png")

def cleanup(iid):
    for t in ("tile_source", "tile_summary", "provenance_layer", "quality_assessment"):
        sb.table(t).delete().eq("image_id", iid).execute()
    sb.table("reconstructed_image").delete().eq("image_id", iid).execute()

def load_parent(parent_id):
    p = sb.table("reconstructed_image").select("image_id,image_url,content_hash,resolution") \
        .eq("image_id", parent_id).single().execute().data
    img, h = fetch(p["image_url"])
    if not p.get("content_hash") or p["content_hash"] != h:
        raise ValueError(f"parent image {parent_id}: content hash missing or does not match stored file")
    pl = sb.table("provenance_layer").select("layer_url,layer_hash,meta") \
        .eq("image_id", parent_id).eq("layer_type", "SOURCE_WEIGHT").execute().data
    if not pl:
        raise ValueError(f"parent image {parent_id} has no SOURCE_WEIGHT layer (not produced by this engine)")
    blob = get_bytes(pl[0]["layer_url"])
    if sha(blob) != pl[0]["layer_hash"]:
        raise ValueError(f"parent image {parent_id}: SOURCE_WEIGHT layer hash mismatch (tampered?)")
    depth = sb.table("quality_assessment").select("score").eq("image_id", parent_id) \
        .eq("metric_type", "GENERATION_DEPTH").execute().data
    return {"img": img, "hash": h, "vec": unpack_vector(blob), "ids": pl[0]["meta"]["frame_ids"],
            "resolution": p["resolution"], "depth": int(depth[0]["score"]) if depth else 1}

def process(job_id: int):
    iid = None
    try:
        job = sb.table("reconstruction_job").select("parameters,algorithm_used,parent_image_id,ground_truth_url") \
            .eq("job_id", job_id).single().execute().data
        algo = ALGORITHMS.get(job["algorithm_used"])
        if algo is None:
            raise ValueError(f"unsupported algorithm: {job['algorithm_used']}")
        params = job["parameters"] or {}
        parent_id = job.get("parent_image_id")
        ct = sb.table("contributes_to").select("frame_id,contribution_weight").eq("job_id", job_id).execute().data
        if not ct and not parent_id:
            raise ValueError("job has no contributing frames and no parent image")
        wmap = {c["frame_id"]: float(c["contribution_weight"]) for c in ct}

        rows = []
        if wmap:
            rows = sb.table("raw_frame").select("frame_id,image_url,content_hash") \
                .in_("frame_id", list(wmap)).execute().data
            rows.sort(key=lambda r: r["frame_id"])
        fetched = [fetch(r["image_url"]) for r in rows]
        for r, (_, h) in zip(rows, fetched):
            if r.get("content_hash") and r["content_hash"] != h:
                raise ValueError(f"raw frame {r['frame_id']}: file does not match recorded content_hash")
        frame_ids = [r["frame_id"] for r in rows]
        N = len(rows)

        parent = load_parent(parent_id) if parent_id else None
        size = parent["img"].size if parent else fetched[0][0].size
        W, H = size
        arrs = [np.asarray(i.resize(size), dtype=np.float32) / 255 for i, _ in fetched]
        valids = [(~cloud_mask(a)).astype(np.float32) for a in arrs]
        wl = [wmap[f] for f in frame_ids]
        pw = None
        if parent:
            if parent["vec"].shape[:2] != (H, W):
                raise ValueError("parent provenance layer size does not match parent image")
            pw = float(params.get("parent_weight", 1.0))
            if pw <= 0:
                raise ValueError("parent_weight must be > 0")
            arrs.append(np.asarray(parent["img"], dtype=np.float32) / 255)
            valids.append(1.0 - parent["vec"][..., -1])      # synthetic parent pixels carry no weight
            wl.append(pw)
        frames, valid, weights = np.stack(arrs), np.stack(valids), np.array(wl, dtype=np.float32)

        out, cls, unc, src = algo(frames, weights, valid)
        a, hole = input_shares(weights, valid)
        vec, ids = build_vector(a[:N], frame_ids, hole,
                                a[N] if parent else None,
                                parent["vec"] if parent else None,
                                parent["ids"] if parent else ())
        M = len(ids)
        syn = vec[..., M]
        cls = np.where(syn >= 0.5, 2, cls).astype(np.uint8)  # inherited synthetic stays synthetic

        input_hash = sha(json.dumps({
            "engine": ENGINE_VERSION, "algorithm": job["algorithm_used"],
            "frames": [h for _, h in fetched], "weights": weights.tolist(), "params": params,
            "parent": {"image_id": parent_id, "content_hash": parent["hash"], "weight": pw} if parent else None,
        }, sort_keys=True).encode())
        sb.table("reconstruction_job").update({"input_hash": input_hash}).eq("job_id", job_id).execute()

        img = sb.table("reconstructed_image").insert({
            "job_id": job_id, "original_image_id": parent_id,
            "resolution": parent["resolution"] if parent else 10, "output_format": "PNG"}).execute().data[0]
        iid = img["image_id"]

        url, h = put_png(f"outputs/{iid}.png", (out * 255).astype(np.uint8))
        sb.table("reconstructed_image").update({
            "image_url": url, "content_hash": h, "width": W, "height": H}).eq("image_id", iid).execute()

        def layer(lt, url_, h_, meta):
            sb.table("provenance_layer").upsert({"image_id": iid, "layer_type": lt, "layer_url": url_,
                                                 "layer_hash": h_, "meta": meta}).execute()

        qa_records = [
            {"image_id": iid, "metric_type": "SYNTH_FRACTION", "score": float((cls == 2).mean())},
            {"image_id": iid, "metric_type": "INHERITED_SYNTH_FRACTION", "score": float(syn.mean())},
            {"image_id": iid, "metric_type": "GENERATION_DEPTH", "score": (parent["depth"] + 1) if parent else 1},
            {"image_id": iid, "metric_type": "MEAN_UNCERTAINTY", "score": float(unc.mean())},
        ]
        layers = [
            ("CLASS_MAP", cls * 127, {}),
            ("UNCERTAINTY", (unc * 255).astype(np.uint8), {}),
            ("SOURCE_INDEX", src, {"frame_order": frame_ids, "parent_index": N if parent else None}),
        ]

        if job.get("ground_truth_url"):
            try:
                from skimage.metrics import peak_signal_noise_ratio, structural_similarity
                gt_img, _ = fetch(job["ground_truth_url"])
                gt_arr = np.asarray(gt_img.resize(size), dtype=np.float32) / 255.0
                psnr = peak_signal_noise_ratio(gt_arr, out, data_range=1.0)
                ssim = structural_similarity(gt_arr, out, data_range=1.0, channel_axis=-1)
                qa_records.extend([
                    {"image_id": iid, "metric_type": "PSNR", "score": float(psnr)},
                    {"image_id": iid, "metric_type": "SSIM", "score": float(ssim)},
                ])
                err = np.abs(gt_arr - out).mean(axis=-1)
                layers.append(("ERROR_MAP", (err * 255).astype(np.uint8), {}))
            except Exception as e:
                print("Failed to calculate PSNR/SSIM/ERROR_MAP:", e)

        for lt, arr, meta in layers:
            lurl, lh = put_png(f"outputs/{iid}_{lt}.png", arr)
            layer(lt, lurl, lh, meta)
        lurl, lh = put_bytes(f"outputs/{iid}_SOURCE_WEIGHT.npz", pack_vector(vec), "application/octet-stream")
        layer("SOURCE_WEIGHT", lurl, lh, {"frame_ids": ids, "synthetic_channel": M, "parent_image_id": parent_id})

        summary, sources = [], []
        for ty in range(0, H, TILE):
            for tx in range(0, W, TILE):
                c, u = cls[ty:ty+TILE, tx:tx+TILE], unc[ty:ty+TILE, tx:tx+TILE]
                key = {"image_id": iid, "tile_x": tx // TILE, "tile_y": ty // TILE}
                summary.append({**key, "observed_pct": float((c == 0).mean() * 100),
                                "weak_pct": float((c == 1).mean() * 100),
                                "synth_pct": float((c == 2).mean() * 100),
                                "mean_uncertainty": float(u.mean())})
                tv = vec[ty:ty+TILE, tx:tx+TILE, :M].reshape(-1, M).mean(0) * 100   # effective share per RAW frame
                for k, fid in enumerate(ids):
                    if tv[k] > 0.01:
                        sources.append({**key, "frame_id": fid, "contribution_pct": float(tv[k])})
        sb.table("tile_summary").insert(summary).execute()      # parents first
        if sources: sb.table("tile_source").insert(sources).execute()

        sb.table("quality_assessment").upsert(qa_records).execute()

        sb.table("reconstruction_job").update({
            "status": "COMPLETED", "end_time": datetime.now(timezone.utc).isoformat()}).eq("job_id", job_id).execute()
    except Exception as e:
        print("JOB FAILED:", repr(e))
        if iid is not None:
            try: cleanup(iid)
            except Exception as ce: print("cleanup failed:", repr(ce))
        sb.table("reconstruction_job").update({
            "status": "FAILED", "error_message": str(e)[:500],
            "end_time": datetime.now(timezone.utc).isoformat()}).eq("job_id", job_id).execute()
    finally:
        _inflight.discard(job_id)

def caller_analyst_id(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    try:
        uid = sb.auth.get_user(authorization[7:]).user.id
    except Exception:
        raise HTTPException(401, "invalid token")
    a = sb.table("analyst").select("analyst_id").eq("auth_uid", uid).execute().data
    if not a:
        raise HTTPException(403, "user is not linked to an analyst")
    return a[0]["analyst_id"]

@app.get("/health")
def health(): return {"ok": True}

@app.post("/jobs/{job_id}/run")
def run(job_id: int, bg: BackgroundTasks, authorization: str | None = Header(default=None)):
    me = caller_analyst_id(authorization)
    job = sb.table("reconstruction_job").select("analyst_id,status,algorithm_used").eq("job_id", job_id).execute().data
    if not job: raise HTTPException(404, "job not found")
    if job[0]["analyst_id"] != me: raise HTTPException(403, "not your job")
    if job[0]["algorithm_used"] not in ALGORITHMS:
        raise HTTPException(422, f"unsupported algorithm: {job[0]['algorithm_used']}")
    if job[0]["status"] not in ("QUEUED", "RUNNING") or job_id in _inflight:
        raise HTTPException(409, "job already started or finished")
    if sb.table("reconstructed_image").select("image_id").eq("job_id", job_id).execute().data:
        raise HTTPException(409, "job already has an output image")
    _inflight.add(job_id)
    bg.add_task(process, job_id)
    return {"queued": job_id}