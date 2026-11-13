#!/usr/bin/env python3
"""Build feet/legs.json from the MakeHuman CC0 base mesh + default rig.

Inputs (all CC0, from github.com/makehumancommunity/makehuman):
  makehuman/data/3dobjs/base.obj
  makehuman/data/rigs/default.mhskel
  makehuman/data/rigs/default_weights.mhw

Usage: build_legs.py base.obj default.mhskel default_weights.mhw out.json [levels]
"""
import sys, json, base64
import numpy as np

obj_path, skel_path, w_path, out_path = sys.argv[1:5]
LEVELS = int(sys.argv[5]) if len(sys.argv) > 5 else 2

# ---------- parse obj ----------
V = []
faces = []
group = None
for line in open(obj_path):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '):
        group = line.split()[1]
    elif line.startswith('f ') and group == 'body':
        faces.append([int(p.split('/')[0]) - 1 for p in line.split()[1:]])
V = np.array(V)
assert all(len(f) == 4 for f in faces)

# ---------- skeleton ----------
skel = json.load(open(skel_path))
wts = json.load(open(w_path))['weights']
jpos = {k: V[idx].mean(axis=0) for k, idx in skel['joints'].items()}

def is_leg(b):
    return any(k in b for k in ('upperleg', 'lowerleg', 'foot', 'toe'))

bone_names = ['root'] + sorted([b for b in skel['bones'] if is_leg(b)],
                               key=lambda b: (b[-1], b))
# order parents before children
def depth(b):
    d = 0
    while b in skel['bones'] and skel['bones'][b]['parent']:
        b = skel['bones'][b]['parent']; d += 1
    return d
bone_names = ['root'] + sorted(bone_names[1:], key=lambda b: (depth(b), b))
bidx = {b: i for i, b in enumerate(bone_names)}
bones = []
for b in bone_names:
    if b == 'root':
        bones.append(dict(name=b, parent=-1, head=[0, 0, 0], tail=[0, 1, 0]))
        continue
    bd = skel['bones'][b]
    p = bd['parent']
    bones.append(dict(name=b, parent=bidx.get(p, 0),
                      head=jpos[bd['head']].tolist(), tail=jpos[bd['tail']].tolist()))

NB = len(bone_names)
W = np.zeros((len(V), NB))
total = np.zeros(len(V))
for b, lst in wts.items():
    for vi, w in lst:
        total[vi] += w
        if b in bidx:
            W[vi, bidx[b]] += w
legw = W.sum(axis=1)
total[total == 0] = 1
W /= total[:, None]
legfrac = W.sum(axis=1)
W[:, 0] = 1 - legfrac  # everything else is static root

# ---------- crop ----------
hip = jpos[skel['bones']['upperleg01.L']['head']]
knee = jpos[skel['bones']['lowerleg01.L']['head']]
ycut = hip[1] - 0.16 * (hip[1] - knee[1])
keep = [f for f in faces if all(V[i][1] < ycut and legfrac[i] > 0.5 for i in f)]
used = sorted({i for f in keep for i in f})
remap = {o: n for n, o in enumerate(used)}
P = V[used]
Wt = W[used]
Q = np.array([[remap[i] for i in f] for f in keep])
print('cropped', len(P), 'verts', len(Q), 'quads; ycut', ycut)

# ---------- Catmull-Clark (positions + weights as channels) ----------
def subdivide(X, Q):
    nv = len(X)
    fpts = X[Q].mean(axis=1)
    edges = {}
    efaces = []
    for fi, q in enumerate(Q):
        for k in range(4):
            a, b = int(q[k]), int(q[(k + 1) % 4])
            key = (a, b) if a < b else (b, a)
            if key not in edges:
                edges[key] = len(efaces); efaces.append([])
            efaces[edges[key]].append(fi)
    ekeys = list(edges.keys())
    ne = len(ekeys)
    epts = np.zeros((ne, X.shape[1]))
    boundary_v = {}
    for (a, b), ei in edges.items():
        fl = efaces[ei]
        if len(fl) == 2:
            epts[ei] = (X[a] + X[b] + fpts[fl[0]] + fpts[fl[1]]) / 4
        else:
            epts[ei] = (X[a] + X[b]) / 2
            boundary_v.setdefault(a, []).append(b)
            boundary_v.setdefault(b, []).append(a)
    vf = [[] for _ in range(nv)]
    ve = [[] for _ in range(nv)]
    for fi, q in enumerate(Q):
        for v in q: vf[int(v)].append(fi)
    for (a, b) in ekeys:
        ve[a].append(b); ve[b].append(a)
    newv = np.zeros_like(X)
    for v in range(nv):
        if v in boundary_v:
            nb = boundary_v[v]
            newv[v] = 0.75 * X[v] + 0.125 * (X[nb[0]] + X[nb[1]])
        else:
            n = len(vf[v])
            F = fpts[vf[v]].mean(axis=0)
            R = ((X[ve[v]] + X[v]) / 2).mean(axis=0)
            newv[v] = (F + 2 * R + (n - 3) * X[v]) / n
    X2 = np.vstack([newv, epts, fpts])
    Q2 = []
    for fi, q in enumerate(Q):
        fp = nv + ne + fi
        for k in range(4):
            a, b, c = int(q[k]), int(q[(k + 1) % 4]), int(q[(k - 1) % 4])
            e1 = nv + edges[(a, b) if a < b else (b, a)]
            e0 = nv + edges[(c, a) if c < a else (a, c)]
            Q2.append([a, e1, fp, e0])
    return X2, np.array(Q2)

P0, Q0, W0 = P.copy(), Q.copy(), Wt.copy()
X = np.hstack([P, Wt])
for _ in range(LEVELS):
    X, Q = subdivide(X, Q)
P, Wt = X[:, :3], X[:, 3:]
print('subdivided', len(P), 'verts', len(Q), 'quads')

# ---------- units: decimetres -> metres, ground at y=0 ----------
S = 0.1
ymin = P[:, 1].min()
def conv(p):
    p = np.asarray(p, dtype=float) * S
    p[..., 1] -= ymin * S
    return p
P = conv(P)
for b in bones[1:]:
    b['head'] = conv(b['head']).tolist(); b['tail'] = conv(b['tail']).tolist()

# ---------- top-K weights ----------
K = 8
print('influence counts', np.bincount((Wt > 0.004).sum(axis=1)))
order = np.argsort(-Wt, axis=1)[:, :K]
w4 = np.take_along_axis(Wt, order, axis=1)
w4 = np.clip(w4, 0, None)
w4 /= w4.sum(axis=1, keepdims=True)
dom = order[:, 0]

# ---------- per-toe info (nails, lengths) ----------
toes = []
for side in 'LR':
    for t in range(1, 6):
        chain = [f'toe{t}-{k}.{side}' for k in (1, 2, 3) if f'toe{t}-{k}.{side}' in bidx]
        distal = bones[bidx[chain[-1]]]
        h, tl = np.array(distal['head']), np.array(distal['tail'])
        a = tl - h; a /= np.linalg.norm(a)
        up = np.array([0, 1.0, 0]); up -= a * up.dot(a); up /= np.linalg.norm(up)
        sd = np.cross(a, up)
        # fit the nail to the modelled nail groove: a ring of tiny dorsal faces on the base mesh
        bi = bidx[chain[-1]]
        d0 = W0.argmax(axis=1)
        fsel = np.array([q for q in Q0 if all(d0[i] == bi for i in q)])
        FP = conv(P0[fsel])
        fn = np.cross(FP[:, 2] - FP[:, 0], FP[:, 3] - FP[:, 1])
        area = np.linalg.norm(fn, axis=1) / 2
        fn /= np.linalg.norm(fn, axis=1)[:, None]
        fc = FP.mean(axis=1) - h
        dorsal = fn @ up > 0.2
        ring = dorsal & (area < np.percentile(area[dorsal], 45))
        ra, rs = fc[ring] @ a, fc[ring] @ sd
        a0, a1 = np.percentile(ra, 4), np.percentile(ra, 96)
        s0, s1 = np.percentile(rs, 4), np.percentile(rs, 96)
        inside = dorsal & (fc @ a > a0) & (fc @ a < a1) & (fc @ sd > s0) & (fc @ sd < s1)
        top = np.percentile((fc @ up)[inside], 80)
        nup = (fn[inside] * area[inside, None]).sum(axis=0); nup /= np.linalg.norm(nup)
        c = h + a * (a0 + a1) / 2 + sd * (s0 + s1) / 2 + up * top
        L = (a1 - a0) / 0.72; smin, smax = (s0 - (s1 - s0) * 0.125), (s1 + (s1 - s0) * 0.125)
        up = nup
        print(chain[-1], 'nail len %.4f width %.4f' % (a1 - a0, s1 - s0))
        toes.append(dict(side=side, toe=t, bones=[bidx[c_] for c_ in chain],
                         center=c.tolist(), axis=a.tolist(), sideAxis=sd.tolist(), up=up.tolist(),
                         halfLen=float(0.36 * L), halfWidth=float(0.40 * (smax - smin)),
                         base=bones[bidx[chain[0]]]['head']))

# ---------- hosiery toe cap ----------
# Pantyhose don't wrap each toe: the fabric spans them like a sock. Build a separate
# surface on the convex hull of the toes (swept around a spine running across them).
from scipy.spatial import ConvexHull, cKDTree
toe_cols = [i for i, b in enumerate(bones) if b['name'].startswith('toe')]
NT, NA, NBODY = 72, 12, 40
capP, capW, capI = [], [], []
for side in 'LR':
    cols = [i for i in toe_cols if bones[i]['name'].endswith(side)]
    tw = Wt[:, cols].sum(axis=1)
    eq = ConvexHull(P[tw > 0.1]).equations
    def mid(t):
        ch = [b for b in bones if b['name'].startswith(f'toe{t}-') and b['name'].endswith(side)]
        return (np.array(ch[0]['head']) + np.array(ch[-1]['tail'])) / 2
    A, B = mid(1), mid(5)
    AB = B - A; ABn = AB / np.linalg.norm(AB)
    e1 = np.array([0, 1.0, 0]); e1 -= ABn * e1.dot(ABn); e1 /= np.linalg.norm(e1)
    e2 = np.cross(ABn, e1)
    rows = [(A, -ABn, (NA - j) / NA * np.pi / 2) for j in range(NA)]
    rows += [(A + AB * j / NBODY, ABn, 0.0) for j in range(NBODY + 1)]
    rows += [(B, ABn, (j + 1) / NA * np.pi / 2) for j in range(NA)]
    pts = np.zeros((len(rows), NT, 3))
    for j, (o, ax, al) in enumerate(rows):
        for i in range(NT):
            th = 2 * np.pi * i / NT
            d = np.cos(al) * (np.cos(th) * e1 + np.sin(th) * e2) + np.sin(al) * ax
            den = eq[:, :3] @ d; num = -(eq[:, :3] @ o + eq[:, 3]); ok = den > 1e-9
            pts[j, i] = o + d * (num[ok] / den[ok]).min()
    cand = np.where(tw > 0.02)[0]
    _, nn = cKDTree(P[cand]).query(pts.reshape(-1, 3))
    w = Wt[cand[nn]].reshape(len(rows), NT, -1)
    for _ in range(4):
        up_, dn_ = np.vstack([w[:1], w[:-1]]), np.vstack([w[1:], w[-1:]])
        w = (2 * w + np.roll(w, 1, axis=1) + np.roll(w, -1, axis=1) + up_ + dn_) / 6
    base = sum(len(x) for x in capP)
    tris = []
    for j in range(len(rows) - 1):
        for i in range(NT):
            a_, b_ = base + j * NT + i, base + j * NT + (i + 1) % NT
            c_, d_ = a_ + NT, b_ + NT
            tris += [[a_, c_, b_], [b_, c_, d_]]
    tris = np.array(tris)
    flat = pts.reshape(-1, 3)
    t0 = tris[len(tris) // 2] - base
    nrm = np.cross(flat[t0[1]] - flat[t0[0]], flat[t0[2]] - flat[t0[0]])
    if nrm.dot(flat[t0[0]] - (A + B) / 2) < 0: tris = tris[:, ::-1]
    capP.append(flat); capW.append(w.reshape(-1, w.shape[-1])); capI.append(tris)
capP, capW, capI = np.vstack(capP), np.vstack(capW), np.vstack(capI)
capToe = capW[:, toe_cols].sum(axis=1)
corder = np.argsort(-capW, axis=1)[:, :K]
cw = np.clip(np.take_along_axis(capW, corder, axis=1), 0, None); cw /= cw.sum(axis=1, keepdims=True)
print('toe cap', len(capP), 'verts', len(capI), 'tris')

def b64(arr, dt):
    return base64.b64encode(np.ascontiguousarray(arr, dtype=dt).tobytes()).decode()

out = dict(
    source='MakeHuman hm08 base mesh + default rig (CC0)',
    vertexCount=len(P), influences=K, quadCount=len(Q), ycut=float((ycut - ymin) * S),
    bones=bones, toes=toes,
    positions=b64(P, '<f4'), quads=b64(Q, '<u4'),
    cap=dict(vertexCount=len(capP), positions=b64(capP, '<f4'), index=b64(capI, '<u4'),
             skinIndex=b64(corder, 'u1'), skinWeight=b64(np.round(cw * 255), 'u1'), toe=b64(np.round(np.clip(capToe, 0, 1) * 255), 'u1')),
    skinIndex=b64(order, 'u1'), skinWeight=b64(np.round(w4 * 255), 'u1'),
)
json.dump(out, open(out_path, 'w'), separators=(',', ':'))
print('wrote', out_path)
