"""Generate reference values for diag_test.js with python/diagnostics.py (numpy). Run: python3 diag_gen.py"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "python"))
import diagnostics as D


def field_random(N, Nz, seed, f32=False):
    U = np.random.default_rng(seed).standard_normal((3, Nz, N, N))
    return U.astype(np.float32).astype(np.float64) if f32 else U


def field_analytic(N, Nz):
    x = (np.arange(N) + 0.5) / N
    z = (np.arange(Nz) + 0.5) / Nz
    Z, Y, X = np.meshgrid(z, x, x, indexing="ij")
    u = np.sin(np.pi * X) * np.cos(np.pi * Y) + 0.3 * np.cos(2 * np.pi * Z)
    v = -np.cos(np.pi * X) * np.sin(np.pi * Y)
    w = 0.1 * np.sin(np.pi * X) * np.sin(np.pi * Y) * (np.cos(2 * np.pi * Z + 1) + 0.5 * np.cos(4 * np.pi * Z + 2))
    return np.array([u, v, w])


def field_solidbody(N, Nz):
    x = (np.arange(N) + 0.5) / N
    z = (np.arange(Nz) + 0.5) / Nz
    Z, Y, X = np.meshgrid(z, x, x, indexing="ij")
    return np.array([-(Y - 0.5), (X - 0.5), 0 * Z + 0.2 * (Z - 0.5)])


CASES = [
    ("random periodic N16 Nz4", field_random(16, 4, 1), "periodic", False),
    ("random walls N16 Nz8", field_random(16, 8, 2), "walls", False),
    ("random periodic N8 Nz1", field_random(8, 1, 3), "periodic", False),
    ("random periodic N16 Nz6 (direct DFT)", field_random(16, 6, 4), "periodic", False),
    ("random periodic N12 Nz3 (non-pow2 xy)", field_random(12, 3, 5), "periodic", False),
    ("random walls N8 Nz1", field_random(8, 1, 6), "walls", False),
    ("analytic periodic N32 Nz8", field_analytic(32, 8), "periodic", False),
    ("analytic walls N32 Nz8", field_analytic(32, 8), "walls", False),
    ("solid body walls N32 Nz4", field_solidbody(32, 4), "walls", False),
    ("random float32 periodic N16 Nz4", field_random(16, 4, 7, f32=True), "periodic", True),
]
out = []
for name, U, span, f32 in CASES:
    _, Nz, N, _ = U.shape
    h, Lz = 1.0 / N, Nz / N
    sp = D.spanwise_energy(U, h, Lz, span)
    k, Ek = D.spectrum_h(U, h)
    s = D.summary(U, {"torque": 1.5, "maxdiv": 2.5e-3}, dict(h=h, Lz=Lz, span=span))
    out.append(dict(name=name, N=N, Nz=Nz, h=h, Lz=Lz, span=span, f32=f32, U=U.ravel().tolist(),
                    vort=D.vorticity(U, h, span).ravel().tolist(), Q=D.q_criterion(U, h, span).ravel().tolist(),
                    E=D.energy(U, h, Lz), Z=D.enstrophy(U, h, Lz, span), Ew=sp["Ew"], E3d=sp["E3d"],
                    Ekz=None if sp["Ekz"] is None else sp["Ekz"].tolist(), k=k.tolist(), Ek=Ek.tolist(),
                    summary={a: b for a, b in s.items()}))
json.dump(out, open(os.path.join(HERE, "diag_ref.json"), "w"))
print("wrote", len(out), "cases")
