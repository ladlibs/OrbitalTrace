import numpy as np
from provenance import input_shares, build_vector, pack_vector, unpack_vector

H = W = 4
def first_pass(ids, weights, valid):
    a, hole = input_shares(np.array(weights, np.float32), valid)
    return build_vector(a, ids, hole)

def test_first_pass():
    v, ids = first_pass([1, 2], [0.4, 0.6], np.ones((2, H, W), np.float32))
    assert np.allclose(v.sum(-1), 1)
    assert np.allclose(v[..., 0], 0.4) and np.allclose(v[..., 1], 0.6) and np.allclose(v[..., 2], 0)

def test_refinement_composes():
    v1, ids1 = first_pass([1, 2], [0.4, 0.6], np.ones((2, H, W), np.float32))
    valid = np.ones((2, H, W), np.float32)             # new frame 3 + parent
    a, hole = input_shares(np.array([1.0, 1.0], np.float32), valid)
    v2, ids2 = build_vector(a[:1], [3], hole, a[1], v1, ids1)
    assert ids2 == [1, 2, 3]
    assert np.allclose(v2.sum(-1), 1)
    assert np.allclose(v2[0, 0, :3], [0.2, 0.3, 0.5])

def test_synthetic_inherited_and_healed():
    valid = np.ones((1, H, W), np.float32); valid[0, 0, 0] = 0      # pixel (0,0) cloudy
    v1, ids1 = first_pass([1], [1.0], valid)
    assert v1[0, 0, -1] == 1
    # refinement: new frame 3 sees everything except pixel (0,0) and (1,1); parent valid = 1 - syn
    nv = np.ones((H, W), np.float32); nv[0, 0] = 0; nv[1, 1] = 0
    valid2 = np.stack([nv, 1 - v1[..., -1]])
    a, hole = input_shares(np.array([1.0, 1.0], np.float32), valid2)
    v2, ids2 = build_vector(a[:1], [3], hole, a[1], v1, ids1)
    assert np.allclose(v2.sum(-1), 1)
    assert v2[0, 0, -1] == 1                       # synthetic in both passes -> stays synthetic
    assert np.allclose(v2[2, 2, :2], [0.5, 0]) or v2[2, 2, -1] == 0
    valid3 = np.stack([np.ones((H, W), np.float32), 1 - v1[..., -1]])   # new frame covers (0,0)
    a, hole = input_shares(np.array([1.0, 1.0], np.float32), valid3)
    v3, _ = build_vector(a[:1], [3], hole, a[1], v1, ids1)
    assert v3[0, 0, -1] == 0 and v3[0, 0, ids2.index(3)] == 1      # healed by new observation

def test_pack_roundtrip():
    v, _ = first_pass([1, 2], [0.4, 0.6], np.ones((2, H, W), np.float32))
    assert np.allclose(unpack_vector(pack_vector(v)), v, atol=2e-3)