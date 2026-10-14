"""Pixel-level provenance propagation across refinement generations.

Every output pixel carries a vector v of length M+1:
  v[k]  (k < M) = share of the pixel's value that traces back to raw frame ids[k]
  v[M]          = synthetic share (filled/hallucinated, no observed source)
v.sum() == 1 everywhere. A refinement composes the parent's vectors through the
fusion weights, so frame shares and synthetic share survive any number of passes.
"""
import io
import numpy as np


def input_shares(weights, valid):
    """weights (K,), valid (K,H,W) -> a (K,H,W) share of each input in the fused pixel, hole (H,W)."""
    w = weights[:, None, None] * valid
    den = w.sum(0)
    hole = den <= 1e-6
    a = w / np.maximum(den, 1e-6)
    a[:, hole] = 0.0
    return a.astype(np.float32), hole


def merge_ids(parent_ids, new_ids):
    ids = list(parent_ids)
    for f in new_ids:
        if f not in ids:
            ids.append(f)
    return ids


def build_vector(a_frames, frame_ids, hole, a_parent=None, parent_vec=None, parent_ids=()):
    """Compose provenance. a_frames (N,H,W); a_parent (H,W) or None; parent_vec (H,W,Kp+1)."""
    _, H, W = a_frames.shape
    ids = merge_ids(parent_ids, frame_ids)
    M = len(ids)
    v = np.zeros((H, W, M + 1), np.float32)
    if a_parent is not None:
        Kp = len(parent_ids)
        for k, fid in enumerate(parent_ids):
            v[..., ids.index(fid)] += a_parent * parent_vec[..., k]
        v[..., M] += a_parent * parent_vec[..., Kp]
    for j, fid in enumerate(frame_ids):
        v[..., ids.index(fid)] += a_frames[j]
    v[hole, M] = 1.0                      # nothing observed anywhere -> synthetic
    return v, ids


def pack_vector(v):
    buf = io.BytesIO()
    np.savez_compressed(buf, w=v.astype(np.float16))
    return buf.getvalue()


def unpack_vector(data):
    v = np.load(io.BytesIO(data))["w"].astype(np.float32)
    return v / np.maximum(v.sum(-1, keepdims=True), 1e-6)   # undo float16 rounding drift