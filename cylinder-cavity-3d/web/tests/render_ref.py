"""Reference data for render_test.html: writes render_ref.json.
 * velocity fields (float32-rounded) and the five derived fields from python/diagnostics.py, for span periodic and walls;
 * a scalar field and the triangle count / area / closedness of its marching-cubes mesh, emulated in numpy with the
   triangle table parsed out of web/iso.wgsl (so the table that ships is the table that is tested)."""
import json, re, sys, pathlib
import numpy as np
here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parents[1] / "python"))
import diagnostics as D

N, Nz = 16, 4
h = 1.0 / N
x = (np.arange(N) + 0.5) * h
z = (np.arange(Nz) + 0.5) * h
Lz = Nz * h
Z, Y, X = np.meshgrid(z, x, x, indexing="ij")          # [k, j, i]

def cases():
    om = 3.0
    solid = np.array([-om * (Y - 0.5), om * (X - 0.5), 0 * X])
    tg = np.array([np.sin(2 * np.pi * X) * np.cos(2 * np.pi * Y) * np.cos(2 * np.pi * Z / Lz),
                   -np.cos(2 * np.pi * X) * np.sin(2 * np.pi * Y) * np.cos(2 * np.pi * Z / Lz),
                   0.3 * np.sin(2 * np.pi * X) * np.sin(2 * np.pi * Y) * np.sin(2 * np.pi * Z / Lz)])
    sp = np.array([np.sin(3 * Y + 2 * np.cos(2 * np.pi * Z / Lz)) * (1 + X),
                   np.cos(2 * X + np.sin(2 * np.pi * Z / Lz)) * Y,
                   np.sin(4 * X * Y) + 0.5 * np.cos(2 * np.pi * Z / Lz + 3 * X) - Y * Z])
    return {"solid_body": solid, "taylor_green": tg, "spanwise": sp}

FN = ["vort_mag", "vort_z", "q", "speed", "w"]
def fields(U, span):
    w = D.vorticity(U, h, span)
    return {"vort_mag": np.sqrt((w ** 2).sum(0)), "vort_z": w[2], "q": D.q_criterion(U, h, span),
            "speed": np.sqrt((U ** 2).sum(0)), "w": U[2]}

out = {"N": N, "Nz": Nz, "cases": []}
for name, U in cases().items():
    U = U.astype(np.float32).astype(np.float64)
    c = {"name": name, "vel": U.astype(np.float32).ravel().tolist()}
    for span in ("periodic", "walls"):
        c[span] = {f: np.asarray(v).ravel().tolist() for f, v in fields(U, span).items()}
    out["cases"].append(c)

# ---------------------------------------------------------------- marching cubes emulation
src = (here.parent / "iso.wgsl").read_text()
body = re.search(r"var<private> TRI: array<u32, 512> = array<u32, 512>\((.*?)\);", src, re.S).group(1)
words = [int(w.strip().rstrip("u")) for w in body.replace("\n", "").split(",") if w.strip()]
assert len(words) == 512
TRI = np.array([[(words[(c * 16 + m) >> 3] >> (((c * 16 + m) & 7) * 4)) & 15 for m in range(16)] for c in range(256)])
EA = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3]; EB = [1, 2, 3, 0, 5, 6, 7, 4, 4, 5, 6, 7]
CO = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]

def mc(f, iso, periodic, h):
    nz, n = f.shape[0], f.shape[1]
    nzc = nz + 1 if periodic else nz - 1
    tris = []; edgecount = {}
    for kc in range(nzc):
        k0, k1, zb = kc, kc + 1, (kc + 0.5) * h
        if periodic and kc >= nz - 1:
            k0, k1 = nz - 1, 0
            zb = (-0.5 * h) if kc == nz else (nz - 0.5) * h
        for j in range(n - 1):
            for i in range(n - 1):
                val = [f[(k1 if o[2] else k0), j + o[1], i + o[0]] for o in CO]
                cube = sum(1 << c for c in range(8) if val[c] < iso)
                if cube in (0, 255): continue
                row = TRI[cube]
                for q in range(0, 15, 3):
                    if row[q] == 15: break
                    pts = []; ids = []
                    for e in row[q:q + 3]:
                        a, b = EA[e], EB[e]
                        s = np.clip((iso - val[a]) / (val[b] - val[a]), 0, 1) if abs(val[b] - val[a]) > 1e-30 else 0.5
                        pa = np.array([(i + CO[a][0] + .5) * h, (j + CO[a][1] + .5) * h, zb + CO[a][2] * h])
                        pb = np.array([(i + CO[b][0] + .5) * h, (j + CO[b][1] + .5) * h, zb + CO[b][2] * h])
                        pts.append(pa + (pb - pa) * s)
                        node = lambda o: ((((k1 if o[2] else k0) % nz) * n + j + o[1]) * n + i + o[0])
                        ids.append(tuple(sorted((node(CO[a]), node(CO[b])))))
                    tris.append(pts)
                    if not (periodic and kc == nz):          # wrap cell is emitted twice: count its edges once
                        for a_, b_ in ((0, 1), (1, 2), (2, 0)):
                            key = tuple(sorted((ids[a_], ids[b_])))
                            edgecount[key] = edgecount.get(key, 0) + 1
    T = np.array(tris)
    area = 0.5 * np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1)
    return len(tris), float(area.sum()), edgecount

MN, MNz = 16, 8; mh = 1.0 / MN; mLz = MNz * mh
mx = (np.arange(MN) + .5) * mh; mz = (np.arange(MNz) + .5) * mh
MZ, MY, MX = np.meshgrid(mz, mx, mx, indexing="ij")
# a sphere (closed, inside the box) and a wiggly tube along z (closed only through the periodic wrap)
sphere = np.sqrt((MX - .5) ** 2 + (MY - .5) ** 2 + ((MZ - mLz / 2) * 1.0) ** 2).astype(np.float32)
tube = np.sqrt((MX - .5 - .06 * np.sin(2 * np.pi * MZ / mLz)) ** 2 + (MY - .5) ** 2).astype(np.float32)
out["mc"] = {"N": MN, "Nz": MNz, "cases": []}
for name, f, iso, per in (("sphere_walls", sphere, 0.2, False), ("tube_periodic", tube, 0.22, True)):
    nt, area, ec = mc(f.astype(np.float64), iso, per, mh)
    # the periodic wrap cell appears twice (upper and lower placement): count each triangle once for edge sharing
    shared = sorted(set(ec.values()))
    out["mc"]["cases"].append({"name": name, "field": f.ravel().tolist(), "iso": iso, "periodic": per,
                               "triangles": nt, "area": area, "edge_valence_set": shared})
    print(name, nt, area, "edge valences", shared)
(here / "render_ref.json").write_text(json.dumps(out))
print("wrote", here / "render_ref.json")
