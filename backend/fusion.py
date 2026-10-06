import numpy as np
from scipy.ndimage import binary_dilation, distance_transform_edt

def cloud_mask(img, thr=0.75, grow=5):
    """True = cloud. Grown by a few pixels to cover soft cloud edges."""
    return binary_dilation(img.min(axis=-1) > thr, iterations=grow)

def fuse(frames, weights, valid, weak_thr=0.15):
    """
    frames  (N,H,W,3) float32   weights (N,)   valid (N,H,W) 1 = clear pixel
    Returns: out (H,W,3), cls (H,W) 0=observed 1=weak 2=synthesized,
             unc (H,W) in [0,1], src (H,W) dominant frame index (255 = none)
    """
    w = weights[:, None, None] * valid                      # per-pixel weights
    den = w.sum(0)
    safe = np.maximum(den, 1e-6)
    out = (w[..., None] * frames).sum(0) / safe[..., None]  # weighted mean
    var = (w[..., None] * (frames - out) ** 2).sum(0).mean(-1) / safe

    hole = den <= 1e-6                                      # cloudy in EVERY frame
    if hole.any() and not hole.all():                       # fill from nearest observed pixel
        idx = distance_transform_edt(hole, return_distances=False, return_indices=True)
        out[hole] = out[idx[0][hole], idx[1][hole]]

    coverage = den / max(float(weights.sum()), 1e-6)        # share of total weight that saw this pixel
    unc = np.clip(var * 8 + (1 - np.minimum(coverage, 1)) * 0.5, 0, 1)
    unc[hole] = 1.0

    cls = np.where(hole, 2, np.where(den < weak_thr, 1, 0)).astype(np.uint8)
    src = np.where(hole, 255, w.argmax(0)).astype(np.uint8)
    return np.clip(out, 0, 1), cls, unc, src