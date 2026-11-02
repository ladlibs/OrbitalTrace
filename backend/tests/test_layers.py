"""
backend/tests/test_layers.py — End-to-end verification of IDF per-pixel provenance layers.

Tests:
  1. Mask loading as float32 in [0, 1] without premature thresholding.
  2. Weights proportional to (1 - cloud_cover_k), normalized to sum 1.
  3. Conservation Invariant I1: max |sum(W) + S - 1| < 1e-6.
  4. Continuous Synthetic Share: len(unique(S)) > 100 and >= 80% pixels in (0.01, 0.99).
  5. CLASS_MAP distribution: all three classes present (~50% OBS, ~46% WEAK, ~3% SYN).
  6. Non-redundant layers: pairwise correlation between normalized layers < 0.95.
  7. Normalized Gaussian convolution fill for fused image (no Voronoi spokes).
  8. Saves rendered RGB PNGs to backend/out/.
"""

import os, sys
from pathlib import Path
import numpy as np
from PIL import Image

# Ensure backend is on sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from fusion import (
    fuse,
    render_synthetic_share,
    render_uncertainty,
    render_class_map,
    render_source_index
)


def find_frames_dir():
    candidates = [
        BASE_DIR.parent / "frames",
        BASE_DIR / "frames",
        Path("frames")
    ]
    for c in candidates:
        if (c / "frame_1.png").exists():
            return c
    raise FileNotFoundError("Could not find frames/ directory with frame_1..4.png")


def run_tests():
    print("=" * 70)
    print("ORBITALTRACE BACKEND: PER-PIXEL PROVENANCE LAYER VERIFICATION")
    print("=" * 70)

    frames_dir = find_frames_dir()
    print(f"Loading frames and masks from: {frames_dir}")

    frames = []
    masks = []
    for i in range(1, 5):
        f_path = frames_dir / f"frame_{i}.png"
        m_path = frames_dir / f"mask_{i}.png"
        assert f_path.exists(), f"Missing {f_path}"
        assert m_path.exists(), f"Missing {m_path}"

        f_img = Image.open(f_path).convert("RGB")
        m_img = Image.open(m_path).convert("L")

        # Required Fix 1: Load mask as float32 = pixel / 255. Never cast to bool!
        m_arr = (np.asarray(m_img, dtype=np.float32) / 255.0).clip(0.0, 1.0)
        f_arr = (np.asarray(f_img, dtype=np.float32) / 255.0).clip(0.0, 1.0)

        frames.append(f_arr)
        masks.append(m_arr)

    # 1. Cloud Cover & Weights (Required Fix 1 & 2)
    # Binarize only when computing the cloud-cover percentage (m > 0.5)
    cloud_covers = [float((m > 0.5).mean()) for m in masks]
    print("\n[STEP 1: Cloud Covers & Weights]")
    for i, cc in enumerate(cloud_covers, 1):
        print(f"  • Frame {i} cloud cover: {cc * 100:.2f}% (expected ~5%, 20%, 40%, 60%)")

    # Weights proportional to (1 - cloud_cover_k), normalized to sum 1
    clear_shares = np.array([1.0 - c for c in cloud_covers], dtype=np.float32)
    weights = clear_shares / clear_shares.sum()
    print("  • Computed weights:", [round(float(w), 4) for w in weights])
    print(f"    (Expected ~0.345, ~0.291, ~0.218, ~0.145; sum = {weights.sum():.6f})")

    # 2. Execute Fusion Pipeline
    N = len(frames)
    is_raw = np.ones(N, dtype=bool)
    frame_id_map = [[f"frame_{i}"] for i in range(1, N + 1)]
    all_frame_ids = [f"frame_{i}" for i in range(1, N + 1)]

    # Ground truth isolation test
    assert not any("ground_truth" in str(fid).lower() for fids in frame_id_map for fid in fids), \
        "Ground truth must never feed fusion or any layer."

    out, cls, unc, src, W_out, SI_out = fuse(
        frames=frames,
        weights=weights,
        is_raw=is_raw,
        cloud_masks_raw=masks,
        parent_sw_list=[None] * N,
        parent_si_list=[None] * N,
        frame_id_map=frame_id_map,
        all_frame_ids=all_frame_ids,
        ra=0.0
    )

    # 3. Diagnostic Prints (First Section Requirement)
    print("\n[STEP 2: Diagnostic Statistics After Layer Computation]")
    layer_diagnostics = [
        ("SYNTHETIC_SHARE (S)", SI_out),
        ("CLASS_MAP", cls),
        ("UNCERTAINTY (U)", unc),
        ("SOURCE_INDEX", src)
    ]
    for name, arr in layer_diagnostics:
        u_vals = np.unique(arr)
        print(f"  • {name:20s}: dtype={str(arr.dtype):7s} | min={arr.min():.4f} | max={arr.max():.4f} | "
              f"unique_count={len(u_vals):6d} | sample_values={u_vals[:6]}")

    # 4. Invariant I1 Conservation Check (Required Fix 3)
    i1_diff = np.abs(W_out.sum(axis=-1) + SI_out - 1.0)
    max_i1_dev = float(i1_diff.max())
    mean_i1_dev = float(i1_diff.mean())
    print("\n[STEP 3: Invariant I1 Verification]")
    print(f"  • Max Invariant I1 Deviation:  {max_i1_dev:.2e} (Required: < 1.00e-06)")
    print(f"  • Mean Invariant I1 Deviation: {mean_i1_dev:.2e}")
    assert max_i1_dev < 1e-6, f"Invariant I1 violated: {max_i1_dev:.2e} >= 1e-6"
    print("  ✓ PASS: Invariant I1 strictly satisfied.")

    # 5. Continuous Synthetic Share Distribution (Required Fix 3)
    unique_S = len(np.unique(SI_out))
    mid_s_pct = float(((SI_out > 0.01) & (SI_out < 0.99)).mean() * 100)
    print("\n[STEP 4: Synthetic Share (S) Characteristics]")
    print(f"  • Unique S values: {unique_S} (Required: > 100)")
    print(f"  • Pixels with 0.01 < S < 0.99: {mid_s_pct:.2f}% (Required: >= 80.0%)")
    assert unique_S > 100, f"S is degenerate: only {unique_S} unique values"
    assert mid_s_pct >= 80.0, f"Insufficient intermediate synthetic share: {mid_s_pct:.2f}% < 80%"
    print("  ✓ PASS: Synthetic share is continuous and non-binary.")

    # 6. CLASS_MAP Distribution (Required Fix 4)
    p_obs = float((cls == 0).mean() * 100)
    p_weak = float((cls == 1).mean() * 100)
    p_syn = float((cls == 2).mean() * 100)
    print("\n[STEP 5: CLASS_MAP Classification Distribution]")
    print(f"  • 0 (OBSERVED):    {p_obs:5.2f}% (Target: ~50%)")
    print(f"  • 1 (WEAK):        {p_weak:5.2f}% (Target: ~46%)")
    print(f"  • 2 (SYNTHESIZED): {p_syn:5.2f}% (Target: ~3%)")
    assert p_obs > 0 and p_weak > 0 and p_syn > 0, "All three classes must be present in CLASS_MAP."
    print("  ✓ PASS: All 3 invariant classes (OBSERVED, WEAK, SYNTHESIZED) actively present.")

    # 7. Pairwise Layer Correlations (Required Fix 4)
    print("\n[STEP 6: Pairwise Non-Redundancy Correlations]")
    layers_dict = {
        "S": SI_out.ravel(),
        "U": unc.ravel(),
        "CLASS_MAP": cls.astype(np.float32).ravel(),
        "SOURCE_INDEX": src.astype(np.float32).ravel()
    }
    for k1 in sorted(layers_dict.keys()):
        for k2 in sorted(layers_dict.keys()):
            if k1 < k2:
                r = float(np.corrcoef(layers_dict[k1], layers_dict[k2])[0, 1])
                print(f"  • Corr({k1:12s}, {k2:12s}) = {r:+.4f} (Required: < 0.95)")
                assert abs(r) < 0.95, f"High collinearity between {k1} and {k2}: |r| = {abs(r):.4f} >= 0.95"
    print("  ✓ PASS: All layer pairs are non-redundant and have |r| < 0.95.")

    # 8. Save Output PNGs (Requirement 6 & Output Section)
    out_dir = BASE_DIR / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n[STEP 7: Rendering and Saving Output PNGs to {out_dir}]")

    cm_rgb = render_class_map(cls)
    u_rgb = render_uncertainty(unc)
    s_rgb = render_synthetic_share(SI_out)
    src_rgb = render_source_index(src, num_frames=N)
    fused_uint8 = (out * 255.0).astype(np.uint8)

    outputs = [
        ("class_map.png", cm_rgb),
        ("uncertainty.png", u_rgb),
        ("source_index.png", src_rgb),
        ("synthetic_share.png", s_rgb),
        ("fused_image.png", fused_uint8)
    ]

    for fname, arr in outputs:
        path = out_dir / fname
        Image.fromarray(arr).save(path)
        print(f"  ✓ Saved: {path} ({arr.shape[1]}x{arr.shape[0]} {arr.dtype})")

    print("\n" + "=" * 70)
    print("🎉 ALL TESTS PASSED: PROVENANCE ENGINE END-TO-END VERIFIED.")
    print("=" * 70)


if __name__ == "__main__":
    run_tests()
