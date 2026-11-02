"""
main.py — OrbitalTrace backend (IDF §6.3–6.4 compliant).

Changes vs. previous version:
  • process() now orchestrates full IDF provenance pipeline:
    - fetches parent SOURCE_WEIGHT (.npz) and SYNTHETIC_SHARE (PNG) for recon inputs
    - builds global all_frame_ids ordered union
    - calls new fusion.fuse() receiving (out, cls, unc, src, W_out, SI_out)
    - computes whole-image GCI: s(I) = (1-ra)·Σ(w·s_parent) + ra
    - uploads SYNTHETIC_SHARE PNG and SOURCE_WEIGHT .npz to storage
    - stores 5 provenance_layer rows (CLASS_MAP, UNCERTAINTY, SOURCE_INDEX,
      SYNTHETIC_SHARE, SOURCE_WEIGHT), SOURCE_WEIGHT meta includes frame_ids
    - stores GCI in quality_assessment
    - computes and stores record_hash (SHA-256 hash-linked DAG, IDF §6.5)
    - tile_source only inserted for numeric (real) frame IDs
  • Helpers: put_npz(), fetch_parent_provenance(), get_parent_gci(),
    get_parent_record_hash()
  • delete_frames endpoint and /jobs/{job_id}/run endpoint unchanged.
"""

import hashlib, io, json, os
from datetime import datetime, timezone

import numpy as np, requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from scipy.ndimage import zoom as ndimage_zoom
from supabase import create_client

from fusion import (
    cloud_mask,
    fuse,
    get_ra,
    render_synthetic_share,
    render_uncertainty,
    render_class_map,
    render_source_index
)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
BUCKET, TILE = "satellite-images", 32

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])


# ── Utility helpers ────────────────────────────────────────────────────────────

def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch(url: str, retries: int = 3):
    """Download image from URL with retry. Returns (PIL.Image RGB, sha256_hex)."""
    import time
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            return Image.open(io.BytesIO(r.content)).convert("RGB"), sha(r.content)
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(1.0)


def put_png(path: str, arr: np.ndarray):
    """Upload uint8 (H,W) or (H,W,3) array as PNG. Returns (public_url, sha256_hex)."""
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    data = buf.getvalue()
    sb.storage.from_(BUCKET).upload(path, data, {"content-type": "image/png", "upsert": "true"})
    return sb.storage.from_(BUCKET).get_public_url(path), sha(data)


def put_npz(path: str, **arrays) -> tuple:
    """
    Save numpy arrays as compressed .npz and upload to storage.
    Returns (public_url, sha256_hex).
    """
    buf = io.BytesIO()
    np.savez_compressed(buf, **arrays)
    data = buf.getvalue()
    sb.storage.from_(BUCKET).upload(path, data,
                                    {"content-type": "application/octet-stream", "upsert": "true"})
    return sb.storage.from_(BUCKET).get_public_url(path), sha(data)


def put_npy(path: str, arr: np.ndarray) -> tuple:
    """Save float32 numpy array as raw .npy and upload to storage."""
    buf = io.BytesIO()
    np.save(buf, arr)
    data = buf.getvalue()
    sb.storage.from_(BUCKET).upload(path, data,
                                    {"content-type": "application/octet-stream", "upsert": "true"})
    return sb.storage.from_(BUCKET).get_public_url(path), sha(data)


# ── Parent provenance helpers ──────────────────────────────────────────────────

def fetch_parent_provenance(parent_image_id, target_hw: tuple):
    """
    Fetch SOURCE_WEIGHT (.npz) and SYNTHETIC_SHARE (PNG) for a parent reconstructed image.

    Returns
    -------
    sw_arr   : (H,W,m_p) float32 SOURCE_WEIGHT resized to target_hw
    si_arr   : (H,W)     float32 SYNTHETIC_SHARE resized to target_hw
    frame_ids: list[str] ordered ancestral raw frame IDs
    """
    H, W = target_hw

    # Fetch provenance_layer rows for this parent image
    layers = sb.table("provenance_layer").select("layer_type,layer_url,meta") \
               .eq("image_id", parent_image_id).execute().data

    sw_row = next((l for l in layers if l["layer_type"] == "SOURCE_WEIGHT"), None)
    si_row = next((l for l in layers if l["layer_type"] == "SYNTHETIC_SHARE"), None)

    if sw_row is None or si_row is None:
        print(f"Notice: No provenance found for parent image {parent_image_id}; using synthetic fallback.")
        return (
            np.zeros((H, W, 1), dtype=np.float32),
            np.ones((H, W), dtype=np.float32),
            [f"SYNTH-{parent_image_id}"],
        )

    # Load SOURCE_WEIGHT npz
    try:
        r = requests.get(sw_row["layer_url"], timeout=60)
        r.raise_for_status()
        npz = np.load(io.BytesIO(r.content))
        sw_raw = npz["source_weight"].astype(np.float32)  # (H_p,W_p,m_p)
        frame_ids: list = (sw_row.get("meta") or {}).get("frame_ids", [f"SYNTH-{parent_image_id}"])
        # Resize to target if needed
        if sw_raw.shape[:2] != (H, W):
            sh = H / sw_raw.shape[0]
            sw_arr = ndimage_zoom(sw_raw, (sh, W / sw_raw.shape[1], 1.0), order=1)
        else:
            sw_arr = sw_raw
    except Exception as e:
        print(f"Notice: Failed to load SOURCE_WEIGHT for {parent_image_id}: {e}")
        sw_arr = np.zeros((H, W, 1), dtype=np.float32)
        frame_ids = [f"SYNTH-{parent_image_id}"]

    # Load SYNTHETIC_SHARE (from raw_npy_url or derived strictly from SOURCE_WEIGHT conservation)
    try:
        raw_npy_url = (si_row.get("meta") or {}).get("raw_npy_url")
        if raw_npy_url:
            r2 = requests.get(raw_npy_url, timeout=60)
            r2.raise_for_status()
            si_raw = np.load(io.BytesIO(r2.content)).astype(np.float32)
            if si_raw.shape != (H, W):
                sh = H / si_raw.shape[0]
                si_arr = ndimage_zoom(si_raw, (sh, W / si_raw.shape[1]), order=1)
            else:
                si_arr = si_raw
        else:
            # Enforce exact conservation Invariant I1: S = 1.0 - sum(W)
            si_arr = np.clip(1.0 - sw_arr.sum(axis=-1), 0.0, 1.0).astype(np.float32)
    except Exception as e:
        print(f"Notice: Deriving SYNTHETIC_SHARE via conservation from SOURCE_WEIGHT: {e}")
        si_arr = np.clip(1.0 - sw_arr.sum(axis=-1), 0.0, 1.0).astype(np.float32)

    # Invariant I1 safety guarantee: ensure sum(W) + S == 1.0 identically
    dev = float(np.abs(sw_arr.sum(axis=-1) + si_arr - 1.0).max())
    if dev > 1e-5:
        si_arr = np.clip(1.0 - sw_arr.sum(axis=-1), 0.0, 1.0).astype(np.float32)

    return sw_arr, si_arr, frame_ids


def get_parent_gci(parent_image_id) -> float:
    """Retrieve stored GCI score for a parent image. Returns 0.0 if not found."""
    rows = sb.table("quality_assessment").select("score") \
              .eq("image_id", parent_image_id).eq("metric_type", "GCI").execute().data
    return float(rows[0]["score"]) if rows else 0.0


def get_parent_record_hash(parent_image_id) -> str | None:
    """Retrieve record_hash of the reconstruction_job that produced a given image."""
    # reconstructed_image.job_id → reconstruction_job.record_hash
    img_rows = sb.table("reconstructed_image").select("job_id") \
                 .eq("image_id", parent_image_id).execute().data
    if not img_rows or not img_rows[0].get("job_id"):
        return None
    job_rows = sb.table("reconstruction_job").select("record_hash") \
                 .eq("job_id", img_rows[0]["job_id"]).execute().data
    if job_rows and job_rows[0].get("record_hash"):
        return job_rows[0]["record_hash"]
    return None


# ── Main processing pipeline ───────────────────────────────────────────────────

def process(job_id: str):
    try:
        # ── Load job metadata ──────────────────────────────────────────────────
        job = sb.table("reconstruction_job") \
                .select("parameters,ground_truth_url,algorithm_used") \
                .eq("job_id", job_id).single().execute().data
        ct = sb.table("contributes_to").select("frame_id,contribution_weight").eq("job_id", job_id).execute().data
        if not ct:
            raise ValueError("job has no contributing frames")

        wmap = {c["frame_id"]: float(c["contribution_weight"]) for c in ct}

        rows = sb.table("raw_frame") \
                 .select("frame_id,image_url,mask_url,source_dataset,scene_id,sensor_id") \
                 .in_("frame_id", list(wmap)).execute().data
        rows.sort(key=lambda r: r["frame_id"])

        # Download images
        imgs_hashes = [fetch(r["image_url"]) for r in rows]
        imgs = [ih[0] for ih in imgs_hashes]
        hashes = [ih[1] for ih in imgs_hashes]
        size = imgs[0].size  # (W, H)
        H_img, W_img = imgs[0].size[1], imgs[0].size[0]
        frames_list = [np.asarray(i.resize(size), dtype=np.float32) / 255.0 for i in imgs]
        weights_arr = np.array([wmap[r["frame_id"]] for r in rows], dtype=np.float32)
        # Normalise job weights
        w_sum = weights_arr.sum()
        weights_norm = weights_arr / max(float(w_sum), 1e-9)

        # ── Determine algorithm ra ─────────────────────────────────────────────
        algorithm = (job.get("algorithm_used") or "FUSION_WEIGHTED_V1").strip()
        ra = get_ra(algorithm)

        # ── Classify each input as raw or parent-recon, fetch provenance ───────
        is_raw = np.zeros(len(rows), dtype=bool)
        cloud_masks_raw = [None] * len(rows)
        parent_sw_list = [None] * len(rows)
        parent_si_list = [None] * len(rows)
        frame_id_map = [None] * len(rows)   # list[str] per input
        parent_image_ids_with_weights = []  # [(image_id_str, weight_float)]
        parent_record_hashes = []

        target_hw = (H_img, W_img)

        for n, r in enumerate(rows):
            if r.get("source_dataset") == "RECONSTRUCTED" and r.get("scene_id"):
                # ── Parent reconstructed image ─────────────────────────────────
                is_raw[n] = False
                parent_image_id = str(r["scene_id"]).replace("IMG-", "")
                sw_arr, si_arr, fids = fetch_parent_provenance(parent_image_id, target_hw)
                parent_sw_list[n] = sw_arr
                parent_si_list[n] = si_arr
                frame_id_map[n] = fids
                parent_image_ids_with_weights.append((parent_image_id, float(weights_norm[n])))
                ph = get_parent_record_hash(parent_image_id)
                if ph:
                    parent_record_hashes.append(ph)
            else:
                # ── Raw sensor frame ───────────────────────────────────────────
                is_raw[n] = True
                if r.get("mask_url"):
                    try:
                        m_img, _ = fetch(r["mask_url"])
                        # Required Fix 1: Load mask as float32 in [0, 1]. Never threshold or cast to bool!
                        mk = (np.asarray(m_img.convert("L").resize(size), dtype=np.float32) / 255.0).clip(0.0, 1.0)
                    except Exception:
                        mk = cloud_mask(frames_list[n])
                else:
                    pct = float(r.get("cloud_cover_pct") or 0.0) / 100.0
                    mk = cloud_mask(frames_list[n])
                    if (mk > 0.5).mean() < 0.01 and pct > 0.01:
                        rng = np.random.default_rng(int(r.get("frame_id") or 42))
                        noise = gaussian_filter(rng.standard_normal((H_img, W_img)), sigma=24.0)
                        thr = np.percentile(noise, (1.0 - pct) * 100)
                        mk = np.clip(1.0 / (1.0 + np.exp(-(noise - thr) * 8.0)), 0.0, 1.0).astype(np.float32)
                    try:
                        mask_url, _ = put_png(f"cloud-masks/{r['frame_id']}_mask.png", (mk * 255).astype(np.uint8))
                        sb.table("raw_frame").update({"mask_url": mask_url}).eq("frame_id", r["frame_id"]).execute()
                    except Exception as me:
                        print("Notice: Could not persist generated mask:", me)
                cloud_masks_raw[n] = mk
                fid_str = str(r["frame_id"])
                frame_id_map[n] = [fid_str]

        # ── Required Fix 2: Weights proportional to (1 - cloud_cover_k), normalized to sum 1 ──
        if all(is_raw):
            cloud_covers = [float((mk > 0.5).mean()) if mk is not None else 0.0 for mk in cloud_masks_raw]
            clear_shares = np.array([1.0 - c for c in cloud_covers], dtype=np.float32)
            weights_norm = clear_shares / max(float(clear_shares.sum()), 1e-9)

        # ── Build global all_frame_ids (ordered union) ─────────────────────────
        all_frame_ids: list[str] = []
        seen: set[str] = set()
        for fids in frame_id_map:
            for fid in fids:
                if fid not in seen:
                    seen.add(fid)
                    all_frame_ids.append(fid)

        # ── Compute whole-image GCI: s(I) = (1-ra)·Σ(w·s_parent) + ra ──────────
        if parent_image_ids_with_weights:
            parent_gci_sum = sum(get_parent_gci(pid) * w for pid, w in parent_image_ids_with_weights)
            raw_weight_sum = float(weights_norm[is_raw].sum())
            # raw frames contribute gci=0 (pure sensor data)
            gci_output = (1.0 - ra) * (parent_gci_sum) + ra
        else:
            gci_output = ra  # all raw inputs; only algorithm contamination

        # ── Ground Truth Isolation Assertion (Required Fix 7) ─────────────────
        assert not any("ground_truth" in str(fid).lower() for fids in frame_id_map for fid in fids), \
            "Ground truth must never feed fusion or any layer."

        # ── Run IDF fusion ─────────────────────────────────────────────────────
        out, cls, unc, src, W_out, SI_out = fuse(
            frames=frames_list,
            weights=weights_norm,
            is_raw=is_raw,
            cloud_masks_raw=cloud_masks_raw,
            parent_sw_list=parent_sw_list,
            parent_si_list=parent_si_list,
            frame_id_map=frame_id_map,
            all_frame_ids=all_frame_ids,
            ra=ra,
        )
        H, W = cls.shape

        # ── Compute input_hash ────────────────────────────────────────────────
        input_hash = sha(json.dumps(
            {"frames": hashes, "weights": weights_norm.tolist(), "params": job["parameters"]},
            sort_keys=True).encode())
        sb.table("reconstruction_job").update({"input_hash": input_hash}).eq("job_id", job_id).execute()

        # ── Identify primary parent for original_image_id linkage ─────────────
        primary_parent_id = None
        if parent_image_ids_with_weights:
            primary_parent_id = max(parent_image_ids_with_weights, key=lambda p: p[1])[0]

        img_payload = {"job_id": job_id, "resolution": 10, "output_format": "PNG"}
        if primary_parent_id:
            img_payload["original_image_id"] = primary_parent_id

        img_row = sb.table("reconstructed_image").insert(img_payload).execute().data[0]
        iid = img_row["image_id"]

        # ── Upload main image ─────────────────────────────────────────────────
        img_url, img_hash = put_png(f"outputs/{iid}.png", (out * 255).astype(np.uint8))
        sb.table("reconstructed_image").update({"image_url": img_url}).eq("image_id", iid).execute()

        # ── Mirror into raw_frame for future job mix-and-match ────────────────
        try:
            sb.table("raw_frame").insert({
                "capture_timestamp": datetime.now(timezone.utc).isoformat(),
                "latitude": 0, "longitude": 0, "altitude": 0,
                "cloud_cover_pct": float(round(float((cls == 2).mean() * 100), 2)),
                "status": "USABLE",
                "sensor_id": rows[0].get("sensor_id", 1) if rows else 1,
                "image_url": img_url,
                "source_dataset": "RECONSTRUCTED",
                "scene_id": str(iid)
            }).execute()
        except Exception as sync_err:
            print("Notice: Could not mirror to raw_frame:", sync_err)

        # ── Upload provenance layers (Required Fix 6) ──────────────────────────
        # Fixed 0..1 colormaps for S/U, distinct colors for Class Map & Source Index
        cm_rgb = render_class_map(cls)
        unc_rgb = render_uncertainty(unc)
        si_rgb = render_synthetic_share(SI_out)
        src_rgb = render_source_index(src, num_frames=len(all_frame_ids))

        # Upload float32 raw data (.npy) for S and U
        s_npy_url, _ = put_npy(f"outputs/{iid}_SYNTHETIC_SHARE.npy", SI_out.astype(np.float32))
        u_npy_url, _ = put_npy(f"outputs/{iid}_UNCERTAINTY.npy", unc.astype(np.float32))

        layers_to_upload = {
            "CLASS_MAP": cm_rgb,
            "UNCERTAINTY": unc_rgb,
            "SOURCE_INDEX": src_rgb,
            "SYNTHETIC_SHARE": si_rgb,
        }

        prov_rows = []
        layer_hashes = {}

        for lt, arr in layers_to_upload.items():
            lurl, lh = put_png(f"outputs/{iid}_{lt}.png", arr)
            layer_hashes[lt] = lh
            meta: dict = {}
            if lt == "SOURCE_INDEX":
                meta = {"frame_order": all_frame_ids}
            elif lt == "SYNTHETIC_SHARE":
                meta = {"raw_npy_url": s_npy_url}
            elif lt == "UNCERTAINTY":
                meta = {"raw_npy_url": u_npy_url}
            prov_rows.append({
                "image_id": iid,
                "layer_type": lt,
                "layer_url": lurl,
                "layer_hash": lh,
                "meta": meta,
            })

        # SOURCE_WEIGHT: upload as .npz; store frame_ids in meta (not in npz)
        sw_url, sw_hash = put_npz(f"outputs/{iid}_SOURCE_WEIGHT.npz", source_weight=W_out)
        layer_hashes["SOURCE_WEIGHT"] = sw_hash
        prov_rows.append({
            "image_id": iid,
            "layer_type": "SOURCE_WEIGHT",
            "layer_url": sw_url,
            "layer_hash": sw_hash,
            "meta": {"frame_ids": all_frame_ids},
        })

        sb.table("provenance_layer").upsert(prov_rows).execute()

        # ── Quality assessment ────────────────────────────────────────────────
        qa_records = [
            {"image_id": iid, "metric_type": "SYNTH_FRACTION",    "score": float((cls == 2).mean())},
            {"image_id": iid, "metric_type": "MEAN_UNCERTAINTY",  "score": float(unc.mean())},
            {"image_id": iid, "metric_type": "GCI",               "score": float(gci_output)},
            {"image_id": iid, "metric_type": "GCI_SPATIAL",       "score": float(SI_out.mean())},
        ]

        gt_url_to_use = job.get("ground_truth_url") or sb.storage.from_(BUCKET).get_public_url("ground-truths/canonical_ground_truth.png")
        if gt_url_to_use:
            try:
                from skimage.metrics import peak_signal_noise_ratio, structural_similarity
                gt_img, _ = fetch(gt_url_to_use)
                gt_arr = np.asarray(gt_img.resize(size), dtype=np.float32) / 255.0
                psnr = peak_signal_noise_ratio(gt_arr, out, data_range=1.0)
                ssim = structural_similarity(gt_arr, out, data_range=1.0, channel_axis=-1)
                qa_records.extend([
                    {"image_id": iid, "metric_type": "PSNR", "score": float(psnr)},
                    {"image_id": iid, "metric_type": "SSIM", "score": float(ssim)},
                ])
                err = np.abs(gt_arr - out).mean(axis=-1)
                em_arr = (err * 255).astype(np.uint8)
                em_url, em_hash = put_png(f"outputs/{iid}_ERROR_MAP.png", em_arr)
                sb.table("provenance_layer").upsert([{
                    "image_id": iid, "layer_type": "ERROR_MAP",
                    "layer_url": em_url, "layer_hash": em_hash, "meta": {},
                }]).execute()
                layer_hashes["ERROR_MAP"] = em_hash
                if not job.get("ground_truth_url"):
                    sb.table("reconstruction_job").update({"ground_truth_url": gt_url_to_use}).eq("job_id", job_id).execute()
            except Exception as e:
                print("Failed to calculate PSNR/SSIM/ERROR_MAP:", e)

        sb.table("quality_assessment").upsert(qa_records).execute()

        # ── Compute record_hash (IDF §6.5 hash-linked DAG) ───────────────────
        # HJ = SHA-256(CanonicalSerialize(inputs, parent_hashes, algorithm, params,
        #                                SHA-256(IMAGE), SHA-256(provenance_layers)))
        canonical = {
            "job_id": str(job_id),
            "algorithm": algorithm,
            "params": job["parameters"],
            "input_hashes": sorted(hashes),
            "parent_record_hashes": sorted(parent_record_hashes),
            "image_hash": img_hash,
            "layer_hashes": {k: v for k, v in sorted(layer_hashes.items())},
        }
        record_hash = sha(json.dumps(canonical, sort_keys=True).encode())
        sb.table("reconstruction_job").update({"record_hash": record_hash}).eq("job_id", job_id).execute()

        # ── Ed25519 Signature (IDF §6.5) ────────────────────────────────────
        try:
            from cryptography.hazmat.primitives.asymmetric import ed25519
            from cryptography.hazmat.primitives import serialization
            key_path = "backend/keys/ed25519_key.pem"
            if not os.path.exists(key_path):
                os.makedirs(os.path.dirname(key_path), exist_ok=True)
                priv_key = ed25519.Ed25519PrivateKey.generate()
                with open(key_path, "wb") as f:
                    f.write(priv_key.private_bytes(
                        encoding=serialization.Encoding.PEM,
                        format=serialization.PrivateFormat.PKCS8,
                        encryption_algorithm=serialization.NoEncryption()
                    ))
            else:
                with open(key_path, "rb") as f:
                    priv_key = serialization.load_pem_private_key(f.read(), password=None)

            sig = priv_key.sign(bytes.fromhex(record_hash)).hex()
            updated_params = {**(job.get("parameters") or {}), "signature": sig, "gci": gci_output, "ra": ra}
            sb.table("reconstruction_job").update({"parameters": updated_params}).eq("job_id", job_id).execute()
        except Exception as sig_err:
            print("Notice on Ed25519 signature:", sig_err)

        # ── Tile summaries ────────────────────────────────────────────────────
        # Build a frame-index → frame_id lookup for SOURCE_INDEX interpretation
        fi_arr = all_frame_ids  # W_out column order matches all_frame_ids
        numeric_fids = {i: fid for i, fid in enumerate(fi_arr) if fid.isdigit()}

        tile_summary, tile_source = [], []
        for ty in range(0, H, TILE):
            for tx in range(0, W, TILE):
                c = cls[ty:ty+TILE, tx:tx+TILE]
                u = unc[ty:ty+TILE, tx:tx+TILE]
                s = src[ty:ty+TILE, tx:tx+TILE]
                key = {"image_id": iid, "tile_x": tx // TILE, "tile_y": ty // TILE}
                tile_summary.append({
                    **key,
                    "observed_pct":   float((c == 0).mean() * 100),
                    "weak_pct":       float((c == 1).mean() * 100),
                    "synth_pct":      float((c == 2).mean() * 100),
                    "mean_uncertainty": float(u.mean()),
                })
                # tile_source: only for real (numeric) frame IDs to avoid FK violations
                W_tile = W_out[ty:ty+TILE, tx:tx+TILE, :]  # (th,tw,m)
                for col_idx, fid in numeric_fids.items():
                    if col_idx < W_tile.shape[2]:
                        contrib = float(W_tile[:, :, col_idx].mean() * 100)
                        if contrib > 0:
                            tile_source.append({**key, "frame_id": int(fid), "contribution_pct": contrib})

        sb.table("tile_summary").insert(tile_summary).execute()
        if tile_source:
            sb.table("tile_source").insert(tile_source).execute()

        sb.table("reconstruction_job").update({
            "status": "COMPLETED",
            "end_time": datetime.now(timezone.utc).isoformat(),
        }).eq("job_id", job_id).execute()

        print(f"Job {job_id} COMPLETED. image_id={iid} gci={gci_output:.4f} record_hash={record_hash[:16]}…")

    except Exception as e:
        import traceback
        print("JOB FAILED:", repr(e))
        traceback.print_exc()
        sb.table("reconstruction_job").update({
            "status": "FAILED",
            "error_message": str(e)[:500],
            "end_time": datetime.now(timezone.utc).isoformat(),
        }).eq("job_id", job_id).execute()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


class DeleteFramesRequest(BaseModel):
    frame_ids: list


@app.post("/frames/delete")
def delete_frames(req: DeleteFramesRequest):
    try:
        fids = [int(f) if str(f).isdigit() else str(f) for f in req.frame_ids]
        if not fids:
            return {"success": True, "deleted_frames": [], "deleted_jobs": []}

        # 1. Find all jobs that use any of these frames
        ct_rows = sb.table("contributes_to").select("job_id").in_("frame_id", fids).execute().data
        job_ids = list({r["job_id"] for r in ct_rows})

        # 2. Delete those reconstruction jobs (cascades to reconstructed_image, etc.)
        if job_ids:
            sb.table("reconstruction_job").delete().in_("job_id", job_ids).execute()

        # 3. Delete any tile_source referencing these frames
        try:
            sb.table("tile_source").delete().in_("frame_id", fids).execute()
        except Exception as te:
            print("Notice on tile_source delete:", te)

        # 4. Delete the raw frames
        sb.table("raw_frame").delete().in_("frame_id", fids).execute()

        return {"success": True, "deleted_frames": fids, "deleted_jobs": job_ids}
    except Exception as e:
        print("DELETE FRAMES FAILED:", repr(e))
        return {"success": False, "error": str(e)}


@app.post("/jobs/{job_id}/run")
def run(job_id: int, bg: BackgroundTasks):
    bg.add_task(process, job_id)
    return {"queued": job_id}
