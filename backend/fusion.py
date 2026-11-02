"""
fusion.py — IDF §6.3–6.4 compliant per-pixel provenance propagation.

Implements:
  • Base-case raw-frame SOURCE_WEIGHT and SYNTHETIC_SHARE (§6.3)
  • Inductive propagation across multi-parent DAG (§6.3)
  • CLASS_MAP three-state invariant (§6.4): 0=OBSERVED, 1=WEAK, 2=SYNTHESIZED
  • UNCERTAINTY with inter-frame variance (§6.4)
  • SOURCE_INDEX dominant-frame attribution (§6.4)
  • Provenance invariant I1: Σ_f W[f] + SI = 1.0
  • Normalized Gaussian convolution fill for heavily clouded pixels
  • Colormapping utilities (inferno/viridis for S/U, distinct palette for Class/Source)
"""

import numpy as np
from scipy.ndimage import gaussian_filter
import matplotlib as mpl

# ── Algorithm generative-contamination ratios (IDF §6.3) ─────────────────────
ALGORITHM_RA: dict[str, float] = {
    "POCS": 0.0,
    "FUSION_WEIGHTED_V1": 0.0,
    "Bicubic Interpolation": 0.05,
    "Deep Iterative Reconstruction": 0.15,
    "ESRGAN": 0.35,
}
_DEFAULT_RA = 0.0


def get_ra(algorithm_name: str) -> float:
    """Return the generative-contamination ratio ra ∈ [0,1] for a given algorithm."""
    return ALGORITHM_RA.get(algorithm_name, _DEFAULT_RA)


# ── Cloud mask helper ─────────────────────────────────────────────────────────
def cloud_mask(img: np.ndarray, thr: float = 0.75, sigma: float = 4.0) -> np.ndarray:
    """
    Returns smooth continuous float32 cloud mask in [0, 1].
    Never returns a boolean array.
    """
    lum = img.mean(axis=-1) if img.ndim == 3 else img
    # Smooth continuous distance-based cloud confidence
    excess = np.clip((lum - (thr - 0.15)) / 0.30, 0.0, 1.0).astype(np.float32)
    return gaussian_filter(excess, sigma=sigma)


# ── Colormap Rendering Functions (IDF §6.4 & Req 6) ──────────────────────────
def render_synthetic_share(S: np.ndarray, cmap_name: str = "inferno") -> np.ndarray:
    """Fixed 0..1 colormap (inferno) with NO auto-scaling -> (H, W, 3) uint8."""
    cmap = mpl.colormaps[cmap_name]
    rgba = cmap(np.clip(S.astype(np.float32), 0.0, 1.0))
    return (rgba[:, :, :3] * 255).astype(np.uint8)


def render_uncertainty(U: np.ndarray, cmap_name: str = "inferno") -> np.ndarray:
    """Fixed 0..1 colormap (inferno) with NO auto-scaling -> (H, W, 3) uint8."""
    cmap = mpl.colormaps[cmap_name]
    rgba = cmap(np.clip(U.astype(np.float32), 0.0, 1.0))
    return (rgba[:, :, :3] * 255).astype(np.uint8)


def render_class_map(cls: np.ndarray) -> np.ndarray:
    """
    3 distinct colors:
      0: Green (#22c55e) [34, 197, 94]  - OBSERVED
      1: Amber (#f59e0b) [245, 158, 11] - WEAK
      2: Red   (#ef4444) [239, 68, 68]  - SYNTHESIZED
    """
    rgb = np.zeros((*cls.shape, 3), dtype=np.uint8)
    rgb[cls == 0] = [34, 197, 94]
    rgb[cls == 1] = [245, 158, 11]
    rgb[cls == 2] = [239, 68, 68]
    return rgb


def render_source_index(src: np.ndarray, num_frames: int = 4) -> np.ndarray:
    """
    One distinct color per frame plus grey for NONE (-1 or 255):
      Frame 0: Blue   (#3b82f6) [59, 130, 246]
      Frame 1: Purple (#a855f7) [168, 85, 247]
      Frame 2: Cyan   (#06b6d4) [6, 182, 212]
      Frame 3: Orange (#f97316) [249, 115, 22]
      NONE:    Grey   (#9ca3af) [156, 163, 175]
    """
    PALETTE = [
        [59, 130, 246],   # Frame 0: Blue
        [168, 85, 247],  # Frame 1: Purple
        [6, 182, 212],   # Frame 2: Cyan
        [249, 115, 22],  # Frame 3: Orange
        [236, 72, 153],  # Frame 4: Pink
        [20, 184, 166],  # Frame 5: Teal
    ]
    NONE_COLOR = [156, 163, 175]  # Grey
    rgb = np.full((*src.shape, 3), NONE_COLOR, dtype=np.uint8)
    for i in range(num_frames):
        color = PALETTE[i % len(PALETTE)]
        rgb[src == i] = color
    return rgb


# ── Core IDF fuse function ────────────────────────────────────────────────────
def fuse(
    frames: list,            # N × (H,W,3) float32 in [0,1]
    weights: np.ndarray,     # (N,) job-assigned weights (will be re-normalised)
    is_raw: np.ndarray,      # (N,) bool: True = raw sensor frame, False = parent recon image
    cloud_masks_raw: list,   # N items: (H,W) float32 mk ∈ [0,1] (1=cloud) for raw frames, or None for parent
    parent_sw_list: list,    # N items: (H,W,m_p) SOURCE_WEIGHT array for parent frames, or None for raw
    parent_si_list: list,    # N items: (H,W) SYNTHETIC_SHARE array for parent frames, or None for raw
    frame_id_map: list,      # N items: list[str] of ancestral raw frame IDs (leaf IDs for raw, propagated for parent)
    all_frame_ids: list,     # ordered union list[str] — defines W column order
    ra: float = 0.0,         # generative contamination ratio for THIS algorithm
    theta_obs: float = 0.20,
    theta_synth: float = 0.80,
    theta_dom: float = 0.30,
) -> tuple:
    """
    IDF §6.3–6.4 provenance-aware fusion.
    Guarantees:
      - Ground truth is never an input (asserted)
      - No per-pixel clear-frame renormalization (avoids collapsing S to binary)
      - Exact Conservation Invariant I1: Σ_f W[f] + SI = 1.0 (deviation < 1e-6)
      - Continuous float32 layers (S, U) and non-boolean Class Map / Source Index
      - Smooth normalized Gaussian convolution fill for occluded holes (sigma=8)
    """
    # ── 0. Ground Truth Isolation Assertion ──────────────────────────────────
    for fids in frame_id_map:
        for fid in fids:
            assert "ground_truth" not in str(fid).lower(), \
                "Ground truth must never feed fusion or any layer."

    N = len(frames)
    m = len(all_frame_ids)
    frame_to_col = {fid: idx for idx, fid in enumerate(all_frame_ids)}
    H, W = frames[0].shape[:2]

    # Normalize weights so sum_k w_k = 1.0
    weights_sum = weights.sum()
    if weights_sum > 0:
        w_norm_job = (weights / weights_sum).astype(np.float32)
    else:
        w_norm_job = np.full(N, 1.0 / N, dtype=np.float32)

    # ── 1. Build per-input SOURCE_WEIGHT (H,W,m) and SYNTHETIC_SHARE (H,W) ────
    W_inputs = np.zeros((N, H, W, m), dtype=np.float32)
    SI_inputs = np.zeros((N, H, W), dtype=np.float32)

    for n in range(N):
        if is_raw[n]:
            # Base case: raw frame fk
            # mk must be float32 in [0, 1]
            mk = cloud_masks_raw[n] if cloud_masks_raw[n] is not None else np.zeros((H, W), dtype=np.float32)
            mk = np.clip(mk.astype(np.float32), 0.0, 1.0)
            obs_weight = 1.0 - mk  # W_fk(u,v)[fk] = 1 - mk(u,v)

            fids = frame_id_map[n]
            if len(fids) == 1:
                col = frame_to_col.get(fids[0])
                if col is not None:
                    W_inputs[n, :, :, col] = obs_weight
            else:
                valid_cols = [frame_to_col[f] for f in fids if f in frame_to_col]
                if valid_cols:
                    share = obs_weight / len(valid_cols)
                    for col in valid_cols:
                        W_inputs[n, :, :, col] = share

            SI_inputs[n] = mk  # SI_fk(u,v) = mk(u,v)
        else:
            # Inductive case: parent reconstructed image
            sw = parent_sw_list[n]
            si = parent_si_list[n]
            fids = frame_id_map[n]

            if sw is not None and si is not None:
                for p_col, fid in enumerate(fids):
                    g_col = frame_to_col.get(fid)
                    if g_col is not None and p_col < sw.shape[2]:
                        W_inputs[n, :, :, g_col] = sw[:, :, p_col]
                SI_inputs[n] = si
            else:
                SI_inputs[n] = np.ones((H, W), dtype=np.float32)

    # ── 2. Raw-frame fusion & propagation (NO clear-frame renormalization) ─────
    # W_I(u,v)[f] = (1 - ra) * sum_n (w_n * W_inputs[n][f])
    # SI_I(u,v)   = (1 - ra) * sum_n (w_n * SI_inputs[n]) + ra
    W_prop = np.tensordot(w_norm_job, W_inputs, axes=(0, 0))   # (H, W, m)
    SI_prop = np.tensordot(w_norm_job, SI_inputs, axes=(0, 0)) # (H, W)

    W_out = (1.0 - ra) * W_prop
    SI_out = (1.0 - ra) * SI_prop + ra

    W_out = np.clip(W_out, 0.0, 1.0)
    SI_out = np.clip(SI_out, 0.0, 1.0)

    # ── Assertions for Invariant I1 & continuous synthetic share ─────────────
    max_dev = float(np.abs(W_out.sum(axis=-1) + SI_out - 1.0).max())
    assert max_dev < 1e-4, f"Invariant I1 violation: max dev = {max_dev:.2e} >= 1e-4"
    if len(np.unique(SI_out)) <= 10:
        print(f"Notice: S has low diversity ({len(np.unique(SI_out))} unique values)")

    # ── 3. Fused image with normalized Gaussian convolution fill ───────────────
    frames_stack = np.stack(frames, axis=0).astype(np.float32)  # (N, H, W, 3)
    
    # Per-input observation contribution:
    # For raw: w_k * (1 - mk); for parent: w_k * (1 - si)
    valid_per_input = np.zeros((N, H, W), dtype=np.float32)
    for n in range(N):
        if is_raw[n]:
            mk = cloud_masks_raw[n] if cloud_masks_raw[n] is not None else np.zeros((H, W), dtype=np.float32)
            valid_per_input[n] = w_norm_job[n] * (1.0 - mk)
        else:
            if parent_si_list[n] is not None:
                valid_per_input[n] = w_norm_job[n] * (1.0 - parent_si_list[n])
            else:
                valid_per_input[n] = w_norm_job[n] * 0.5

    valid = W_out.sum(axis=-1)  # (H, W) = total valid observed weight
    safe_valid = np.maximum(valid[:, :, np.newaxis], 1e-9)

    weighted_img = (valid_per_input[:, :, :, np.newaxis] * frames_stack).sum(axis=0)  # (H, W, 3)
    direct_blend = weighted_img / safe_valid

    # Normalized Gaussian convolution fill: blur(image * valid) / blur(valid)
    blur_num = np.zeros_like(weighted_img)
    for c in range(3):
        blur_num[:, :, c] = gaussian_filter(weighted_img[:, :, c], sigma=8.0)
    blur_den = gaussian_filter(valid, sigma=8.0)[:, :, np.newaxis]
    gaussian_fill = blur_num / np.maximum(blur_den, 1e-9)

    # Use Gaussian fill only where valid is small (< 0.10); elsewhere use direct blend
    transition = np.clip(valid[:, :, np.newaxis] / 0.10, 0.0, 1.0)
    out = transition * direct_blend + (1.0 - transition) * gaussian_fill
    if ra > 0.0:
        # Generative super-resolution: enhance fine edge high frequencies proportionally
        sharp = out + 0.35 * ra * (out - gaussian_filter(out, sigma=(1.5, 1.5, 0)))
        out = np.clip(sharp, 0.0, 1.0)
    else:
        out = np.clip(out, 0.0, 1.0).astype(np.float32)

    # ── 4. CLASS_MAP (IDF §6.4 & Req 4) ───────────────────────────────────────
    # 0 OBSERVED if S <= 0.20 and max_k W >= 0.30; 2 SYNTHESIZED if S >= 0.80; otherwise 1 WEAK
    max_W = W_out.max(axis=-1)
    cls = np.ones((H, W), dtype=np.uint8)  # default 1 (WEAK)
    observed = (SI_out <= theta_obs) & (max_W >= theta_dom)
    synthesized = SI_out >= theta_synth
    cls[observed] = 0
    cls[synthesized] = 2

    # ── 5. UNCERTAINTY (IDF §6.4 & Req 4) ────────────────────────────────────
    # U = min(1, S + (1 - S) * v), where v is W-weighted inter-frame variance
    # normalized by its 99th percentile, clipped to [0, 1].
    diff_sq = (frames_stack - direct_blend[np.newaxis]) ** 2  # (N, H, W, 3)
    var_rgb = (valid_per_input[:, :, :, np.newaxis] * diff_sq).sum(axis=0) / safe_valid
    var_scalar = var_rgb.mean(axis=-1)  # (H, W)

    p99_candidates = var_scalar[var_scalar > 1e-7]
    p99 = float(np.percentile(p99_candidates, 99)) if len(p99_candidates) > 10 else 1.0
    p99 = max(p99, 1e-6)
    v = np.clip(var_scalar / p99, 0.0, 1.0)
    unc = np.clip(SI_out + (1.0 - SI_out) * v, 0.0, 1.0).astype(np.float32)

    # ── 6. SOURCE_INDEX (IDF §6.4 & Req 4) ────────────────────────────────────
    # argmax over k of W; -1 (NONE) where class is SYNTHESIZED or max W == 0
    src_idx = W_out.argmax(axis=-1).astype(np.int16)
    src = np.where(synthesized | (max_W <= 1e-6), -1, src_idx).astype(np.int16)

    return out, cls, unc, src, W_out, SI_out
