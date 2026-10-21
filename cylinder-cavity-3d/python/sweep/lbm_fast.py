"""Fast multicore CPU version of lbm3d.py (numba).  Research / development tool.

Same physics, same parameters (make_params / init_state are imported from lbm3d), same state
dict, same order of operations as lbm3d.step, so results agree with the numpy reference to
round-off (see test_lbm_fast.py).  API:

    step_fast(s, p)                      advance one dt in place (like lbm3d.step)
    run_fast(p, t_end, every_t, outfile) run and record diagnostics + snapshots

How a step maps onto the reference (lbm3d.step)
-----------------------------------------------
  reference                              here
  --------------------------------------------------------------------------------------------
  make_body, solid_mask, find_links      lbm3d functions, cached while the body does not move
  refill                                 _refill_kernel (only the few uncovered nodes)
  collide + stream + bounce_back_walls   _collide_stream_kernel, one fused pass over all nodes
  bounce_back_body (+ momentum exchange) _body_links_kernel, one pass over the cut links
  mass_correction                        sums tracked in the two kernels + _mass_add_kernel
  _reset_solid                           _reset_solid_kernel

The fused pass is "collide at the node, then push each post-collision population to its
destination" in a second array g (A-B scheme).  A population that would leave the box is written
back reflected (halfway bounce-back).  It is the push form of the same fusion as the pull form,
and it keeps the state array f identical to the reference (post-stream, pre-collision), which
the cut-link pass needs.  The body links need f*_q(x_f), f*_qbar(x_f) of their own node: these are
saved in a small buffer by the fused pass; the second fluid node f*_q(x_f - c_q) is simply the
value that was streamed into g_q(x_f).

Porting changes in lbm3d: step() order is  refill -> collide -> stream -> walls -> body links ->
mass_correction -> reset solid.  To add another post-step correction, add a kernel call at the
marked place in step_fast and (if it has a switch) read it from p.
"""
import json
import math
import os
import sys
import time

# The OpenMP threads of numba spin-wait by default, which is very slow when the cores are shared with
# other jobs (measured 6x slower on a busy machine); passive waiting costs little on an idle one.
os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")

import numpy as np                                       # noqa: E402
from numba import njit, prange, set_num_threads, get_num_threads

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lbm3d                                            # noqa: E402  (the reference)
import diagnostics                                      # noqa: E402
from lbm3d import make_params, init_state               # noqa: E402,F401  (re-exported)

CX = np.ascontiguousarray(lbm3d.C[:, 0], dtype=np.int64)
CY = np.ascontiguousarray(lbm3d.C[:, 1], dtype=np.int64)
CZ = np.ascontiguousarray(lbm3d.C[:, 2], dtype=np.int64)
CXF, CYF, CZF = CX.astype(float), CY.astype(float), CZ.astype(float)
WQ = np.ascontiguousarray(lbm3d.W)
OPPQ = np.ascontiguousarray(lbm3d.OPP, dtype=np.int64)
KIND = {"bgk": 0, "reg": 1, "mrt": 2}
_JIT = dict(cache=True, nogil=True)


# ------------------------------------------------------------------ fused collide + stream + walls
@njit(parallel=True, **_JIT)
def _collide_stream_kernel(f, g, solid, lnode, fpl, kind, omega, A, wall_z):
    """f (19,Nz,N,N) -> g.  Works on one x-row (k, j) at a time with the x index innermost, so that
    every inner loop is contiguous and vectorises.  Per row: macroscopic, collide (kind 0 bgk,
    1 reg, 2 mrt), save f* of link nodes into fpl, push f*_q to x + c_q (the populations that would
    leave the box are reflected into g_qbar of the same node: halfway bounce-back).
    Returns the mass (sum of rho) of the fluid nodes, which collision conserves; see step_fast."""
    Nz, N = f.shape[1], f.shape[2]
    cs2 = 1.0 / 3.0
    nrow = Nz * N
    nch = min(nrow, 64)                                   # chunks of rows; buffers allocated once per chunk
    msum = 0.0
    for c in prange(nch):
        fp = np.empty((19, N))
        tmp = np.empty((19, N))
        rho = np.empty(N)
        ux = np.empty(N)
        uy = np.empty(N)
        uz = np.empty(N)
        uu = np.empty(N)
        pxx = np.empty(N)
        pyy = np.empty(N)
        pzz = np.empty(N)
        pxy = np.empty(N)
        pxz = np.empty(N)
        pyz = np.empty(N)
        mrow = 0.0
        for r in range(c * nrow // nch, (c + 1) * nrow // nch):
            k = r // N
            j = r % N
            # ---- macroscopic: rho = sum f, u = sum c f / rho
            for i in range(N):
                rho[i] = 0.0
                ux[i] = 0.0
                uy[i] = 0.0
                uz[i] = 0.0
            for q in range(19):
                cx = CXF[q]
                cy = CYF[q]
                cz = CZF[q]
                for i in range(N):
                    rho[i] += f[q, k, j, i]
                if cx != 0.0:
                    for i in range(N):
                        ux[i] += cx * f[q, k, j, i]
                if cy != 0.0:
                    for i in range(N):
                        uy[i] += cy * f[q, k, j, i]
                if cz != 0.0:
                    for i in range(N):
                        uz[i] += cz * f[q, k, j, i]
            for i in range(N):
                ux[i] = ux[i] / rho[i]
                uy[i] = uy[i] / rho[i]
                uz[i] = uz[i] / rho[i]
                uu[i] = ux[i] * ux[i] + uy[i] * uy[i] + uz[i] * uz[i]
            for i in range(N):
                if not solid[j, i]:
                    mrow += rho[i]
            # ---- collision
            if kind == 0:                                  # BGK
                for q in range(19):
                    cx = CXF[q]
                    cy = CYF[q]
                    cz = CZF[q]
                    w = WQ[q]
                    for i in range(N):
                        cu = cx * ux[i] + cy * uy[i] + cz * uz[i]
                        feq = w * rho[i] * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu[i])
                        v = f[q, k, j, i]
                        fp[q, i] = v - omega * (v - feq)
            elif kind == 1:                                # regularised
                for i in range(N):
                    pxx[i] = 0.0
                    pyy[i] = 0.0
                    pzz[i] = 0.0
                    pxy[i] = 0.0
                    pxz[i] = 0.0
                    pyz[i] = 0.0
                for q in range(19):
                    cx = CXF[q]
                    cy = CYF[q]
                    cz = CZF[q]
                    w = WQ[q]
                    for i in range(N):
                        cu = cx * ux[i] + cy * uy[i] + cz * uz[i]
                        fp[q, i] = f[q, k, j, i] - w * rho[i] * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu[i])
                    if cx != 0.0:
                        for i in range(N):
                            pxx[i] += cx * cx * fp[q, i]
                    if cy != 0.0:
                        for i in range(N):
                            pyy[i] += cy * cy * fp[q, i]
                    if cz != 0.0:
                        for i in range(N):
                            pzz[i] += cz * cz * fp[q, i]
                    if cx * cy != 0.0:
                        for i in range(N):
                            pxy[i] += cx * cy * fp[q, i]
                    if cx * cz != 0.0:
                        for i in range(N):
                            pxz[i] += cx * cz * fp[q, i]
                    if cy * cz != 0.0:
                        for i in range(N):
                            pyz[i] += cy * cz * fp[q, i]
                a = 1.0 - omega
                for q in range(19):
                    cx = CXF[q]
                    cy = CYF[q]
                    cz = CZF[q]
                    w = WQ[q]
                    for i in range(N):
                        cu = cx * ux[i] + cy * uy[i] + cz * uz[i]
                        feq = w * rho[i] * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu[i])
                        qp = (cx * cx * pxx[i] + cy * cy * pyy[i] + cz * cz * pzz[i]
                              + 2.0 * (cx * cy * pxy[i] + cx * cz * pxz[i] + cy * cz * pyz[i])
                              - cs2 * (pxx[i] + pyy[i] + pzz[i]))
                        fp[q, i] = feq + a * ((0.5 / (cs2 * cs2)) * w * qp)
            else:                                          # MRT: f - A f_neq
                for q in range(19):
                    cx = CXF[q]
                    cy = CYF[q]
                    cz = CZF[q]
                    w = WQ[q]
                    for i in range(N):
                        cu = cx * ux[i] + cy * uy[i] + cz * uz[i]
                        tmp[q, i] = f[q, k, j, i] - w * rho[i] * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu[i])
                for q in range(19):
                    for i in range(N):
                        fp[q, i] = 0.0
                    for m in range(19):
                        a_qm = A[q, m]
                        for i in range(N):
                            fp[q, i] += a_qm * tmp[m, i]
                    for i in range(N):
                        fp[q, i] = f[q, k, j, i] - fp[q, i]
            # ---- save f* of the nodes that carry cut links
            for i in range(N):
                ln = lnode[j, i]
                if ln >= 0:
                    base = (ln * Nz + k) * 19
                    for q in range(19):
                        fpl[base + q] = fp[q, i]
            # ---- push (stream) with halfway bounce-back at the walls
            for q in range(19):
                cx = CX[q]
                ty = j + CY[q]
                tz = k + CZ[q]
                if ty < 0 or ty >= N or (wall_z and (tz < 0 or tz >= Nz)):
                    qo = OPPQ[q]                           # whole row leaves the box: reflect
                    for i in range(N):
                        g[qo, k, j, i] = fp[q, i]
                else:
                    tz = tz % Nz
                    lo = max(0, -cx)
                    hi = N - max(0, cx)
                    for i in range(lo, hi):
                        g[q, tz, ty, i + cx] = fp[q, i]
                    if cx == 1:                            # the node at i = N-1 leaves through x = 1
                        g[OPPQ[q], k, j, N - 1] = fp[q, N - 1]
                    elif cx == -1:
                        g[OPPQ[q], k, j, 0] = fp[q, 0]
        msum += mrow
    return msum


# ------------------------------------------------------------------ interpolated bounce-back on the body
@njit(parallel=True, **_JIT)
def _body_links_kernel(g, fpl, lnode, solid, lq, lj, li, ls, cxb, cyb, wo, Om, wall_z):
    """All cut links in all z-planes.  Writes g_qbar(x_f), returns lattice (Fx, Fy, Tz) and the mass change dM of the fluid nodes.
    Formulas as lbm3d.bounce_back_body (Bouzidi et al. with moving-wall term, Wen momentum exchange)."""
    Nz, N = g.shape[1], g.shape[2]
    L = lq.size
    Fx = 0.0
    Fy = 0.0
    Tz = 0.0
    dM = 0.0
    for idx in prange(L * Nz):
        l = idx // Nz
        k = idx % Nz
        q = lq[l]
        cx = CX[q]
        cy = CY[q]
        cz = CZ[q]
        if wall_z and (k + cz < 0 or k + cz >= Nz):
            continue
        qb = OPPQ[q]
        j = lj[l]
        i = li[l]
        S = ls[l]
        xw = i + 0.5 + S * cx
        yw = j + 0.5 + S * cy
        ub = -wo * (cyb - N / 2) - Om * (yw - cyb)
        vb = wo * (cxb - N / 2) + Om * (xw - cxb)
        gw = -6.0 * WQ[q] * (cx * ub + cy * vb)
        base = (lnode[j, i] * Nz + k) * 19
        fq = fpl[base + q]
        fqb = fpl[base + qb]
        i2 = i - cx
        j2 = j - cy
        k2 = k - cz
        ok = i2 >= 0 and i2 < N and j2 >= 0 and j2 < N
        if ok:
            ok = not solid[j2, i2]
        if ok and wall_z:
            ok = k2 >= 0 and k2 < Nz
        f2 = g[q, k, j, i] if ok else fq            # streamed value = f*_q(x_f - c_q)
        if S < 0.5:
            new = 2 * S * fq + (1 - 2 * S) * f2 + gw
        else:
            new = (fq + (2 * S - 1) * fqb + gw) / (2 * S)
        g[qb, k, j, i] = new
        Px = (cx - ub) * fq + (cx + ub) * new
        Py = (cy - vb) * fq + (cy + vb) * new
        Fx += Px
        Fy += Py
        Tz += (xw - cxb) * Py - (yw - cyb) * Px
        dM += new - fq                              # f*_q(x_f) went into the body, `new` came back
    return Fx, Fy, Tz, dM


# ------------------------------------------------------------------ global mass correction
@njit(parallel=True, **_JIT)
def _mass_add_kernel(g, solid, delta):
    Nz, N = g.shape[1], g.shape[2]
    for r in prange(Nz * N):
        k = r // N
        j = r % N
        for i in range(N):
            if not solid[j, i]:
                g[0, k, j, i] += delta


def _mass_correction(g, solid, p, mass_fluid):
    """Same as lbm3d.mass_correction (delta added to f_0 of every fluid node).  The mass of the
    fluid nodes after the body step is not summed over the whole array (an extra pass over all of
    memory) but followed through the step:
        sum_fluid g = sum_fluid rho(before collision)     collision conserves mass; every f* goes
                      - sum_links f*_q(x_f)               into g, except those that go into the body
                      + sum_links g_qbar(x_f, new)        the links write the populations that
                                                           came from the body (the streamed ones
                                                           from solid nodes are not counted)
    which is what the two kernels return."""
    if not p.get("mass_fix", True):
        return
    n = float((~solid).sum() * p["Nz"])
    _mass_add_kernel(g, solid, (n - mass_fluid) / n)


# ------------------------------------------------------------------ solid nodes and refill
@njit(parallel=True, **_JIT)
def _reset_solid_kernel(f, sj, si, ub, vb):
    """Solid nodes carry the equilibrium (rho = 1) of the body velocity (lbm3d._reset_solid)."""
    Nz = f.shape[1]
    n = sj.size
    for idx in prange(n * Nz):
        m = idx // Nz
        k = idx % Nz
        uu = ub[m] * ub[m] + vb[m] * vb[m]
        for q in range(19):
            cu = CX[q] * ub[m] + CY[q] * vb[m]
            f[q, k, sj[m], si[m]] = WQ[q] * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu)


@njit(parallel=True, **_JIT)
def _refill_kernel(f, jj, ii, valid, ub, vb):
    """lbm3d.refill: equilibrium at the body velocity and the mean density of the valid
    neighbours, plus their mean non-equilibrium part."""
    Nz, N = f.shape[1], f.shape[2]
    n = jj.size
    for idx in prange(n * Nz):
        m = idx // Nz
        k = idx % Nz
        j0 = jj[m]
        i0 = ii[m]
        acc = np.zeros(19)
        accr = 0.0
        cnt = 0.0
        for dj in range(-1, 2):
            for di in range(-1, 2):
                if dj == 0 and di == 0:
                    continue
                jn = (j0 + dj) % N
                inn = (i0 + di) % N
                if not valid[jn, inn]:
                    continue
                rho = 0.0
                mx = 0.0
                my = 0.0
                mz = 0.0
                for q in range(19):
                    v = f[q, k, jn, inn]
                    rho += v
                    mx += CX[q] * v
                    my += CY[q] * v
                    mz += CZ[q] * v
                ux = mx / rho
                uy = my / rho
                uz = mz / rho
                uu = ux * ux + uy * uy + uz * uz
                for q in range(19):
                    cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz
                    acc[q] += f[q, k, jn, inn] - WQ[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu)
                accr += rho
                cnt += 1.0
        c = max(cnt, 1.0)
        rho = accr / c if cnt > 0 else 1.0
        uu = ub[m] * ub[m] + vb[m] * vb[m]
        for q in range(19):
            cu = CX[q] * ub[m] + CY[q] * vb[m]
            f[q, k, j0, i0] = WQ[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu) + acc[q] / c


# ------------------------------------------------------------------ geometry (cached for a static body)
@njit(**_JIT)
def _node_is_solid(i, j, cxb, cyb, R):
    dx = i + 0.5 - cxb
    dy = j + 0.5 - cyb
    d2 = dx * dx + dy * dy
    if d2 < (R - 0.5) ** 2:                         # clearly inside / outside: no need for the exact test
        return True
    if d2 > (R + 0.5) ** 2:
        return False
    return math.hypot(dx, dy) < R                   # same test as lbm3d.solid_mask


@njit(**_JIT)
def _geometry_kernel(N, cxb, cyb, R):
    """solid mask and cut links of a circle (solid inside): the arithmetic of lbm3d.solid_mask and
    lbm3d.find_links, evaluated only for nodes near the surface (the rest cannot have a link)."""
    solid = np.zeros((N, N), np.bool_)
    for j in range(N):
        for i in range(N):
            solid[j, i] = _node_is_solid(i, j, cxb, cyb, R)
    j0, j1 = max(0, int(cyb - R - 3)), min(N, int(cyb + R + 4))      # bounding box of all candidates
    i0, i1 = max(0, int(cxb - R - 3)), min(N, int(cxb + R + 4))
    lo2 = (R - 2.5) ** 2
    hi2 = (R + 2.5) ** 2
    out_q = np.empty(0, np.int64)
    out_j = np.empty(0, np.int64)
    out_i = np.empty(0, np.int64)
    out_s = np.empty(0)
    for fill in range(2):
        n = 0
        for q in range(1, 19):
            cx = CX[q]
            cy = CY[q]
            a = cx * cx + cy * cy
            if a == 0:
                continue
            for j in range(j0, j1):
                for i in range(i0, i1):
                    dx = i + 0.5 - cxb
                    dy = j + 0.5 - cyb
                    d2 = dx * dx + dy * dy
                    if d2 < lo2 or d2 > hi2 or solid[j, i]:
                        continue
                    if not _node_is_solid(i + cx, j + cy, cxb, cyb, R):
                        continue
                    b = dx * cx + dy * cy
                    disc = max(b * b - a * (dx * dx + dy * dy - R ** 2), 0.0)
                    sc = min(max((-b - np.sqrt(disc)) / a, 0.0), 1.0)
                    if fill:
                        out_q[n] = q
                        out_j[n] = j
                        out_i[n] = i
                        out_s[n] = sc
                    n += 1
        if not fill:
            out_q = np.empty(n, np.int64)
            out_j = np.empty(n, np.int64)
            out_i = np.empty(n, np.int64)
            out_s = np.empty(n)
    return solid, out_q, out_j, out_i, out_s


def _geometry(phi, p):
    """Body, solid mask, link arrays (concatenated over q) and the link-node index for orbit angle phi."""
    N = p["N"]
    body = lbm3d.make_body(phi, p)
    solid, lq, lj, li, ls = _geometry_kernel(N, body["cx"], body["cy"], body["R"])
    has = np.zeros((N, N), bool)
    has[lj, li] = True
    lnode = np.full((N, N), -1, np.int64)
    lnode[has] = np.arange(has.sum())
    return dict(phi=phi, body=body, solid=solid, lq=lq, lj=lj, li=li, ls=ls, lnode=lnode,
                nlnode=int(has.sum()))


def _geometry_numpy(phi, p):
    """Same result from the lbm3d numpy functions (reference for the test)."""
    N = p["N"]
    body = lbm3d.make_body(phi, p)
    solid = lbm3d.solid_mask(body, N)
    links = lbm3d.find_links(body, ~solid, N)
    lq, lj, li, ls = [], [], [], []
    for q in range(1, 19):
        if links[q] is None or links[q][0].size == 0:
            continue
        jj, ii, sq = links[q]
        lq.append(np.full(jj.size, q, np.int64))
        lj.append(jj.astype(np.int64))
        li.append(ii.astype(np.int64))
        ls.append(np.asarray(sq, float))
    return solid, np.concatenate(lq), np.concatenate(lj), np.concatenate(li), np.concatenate(ls)


def step_fast(s, p):
    """Advance the state dict s by one time step dt (in place); same contract as lbm3d.step."""
    N, Nz = p["N"], p["Nz"]
    assert p.get("wall_x", True) and p.get("wall_y", True), "periodic x / y boxes are not supported"
    wall_z = p["span"] == "walls"
    if p.get("node_exchange", "none") != "none":
        raise NotImplementedError("lbm_fast supports node_exchange='none' only")
    s["phi"] += p["omega_o"] * p["dt"]
    geo = s.get("_geo")
    if geo is None or geo["phi"] != s["phi"]:
        geo = s["_geo"] = _geometry(s["phi"], p)
    body, solid = geo["body"], geo["solid"]
    f = s["f"]
    # 0. refill of the nodes the body has just left
    if not np.array_equal(s["solid"], solid):
        jj, ii = np.nonzero(s["solid"] & ~solid)
        if jj.size:
            ub, vb = body["velocity"](ii + 0.5, jj + 0.5)
            _refill_kernel(f, jj.astype(np.int64), ii.astype(np.int64), ~s["solid"] & ~solid, ub, vb)
    # 1-3. collide, stream, walls
    g = s.get("_g")
    if g is None or g.shape != f.shape:
        g = np.zeros_like(f)
    fpl = s.get("_fpl")
    need = max(geo["nlnode"] * Nz * 19, 1)
    if fpl is None or fpl.size != need:
        fpl = np.empty(need)
    A = p["mrt_A"] if p["collision"] == "mrt" else np.zeros((19, 19))
    mass_fluid = _collide_stream_kernel(f, g, solid, geo["lnode"], fpl, KIND[p["collision"]], p["omega"], A, wall_z)
    # 4. body links + momentum exchange
    wo, Om = p["omega_o"] * p["dt"], p["Omega"] * p["dt"]
    Fx, Fy, Tz, dM = _body_links_kernel(g, fpl, geo["lnode"], solid, geo["lq"], geo["lj"], geo["li"],
                                    geo["ls"], body["cx"], body["cy"], wo, Om, wall_z)
    s["exchange"] = np.array([Fx, Fy, Tz])
    # 5. post-step corrections (port new ones of lbm3d.step here, in the same order)
    _mass_correction(g, solid, p, mass_fluid + dM)
    s["mass"] = float((~solid).sum() * Nz) if p.get("mass_fix", True) else float(mass_fluid + dM)
    # 6. solid nodes
    sj, si = np.nonzero(solid)
    ub, vb = body["velocity"](si + 0.5, sj + 0.5)
    _reset_solid_kernel(g, sj.astype(np.int64), si.astype(np.int64), ub, vb)
    s["f"], s["_g"], s["_fpl"] = g, f, fpl
    s["solid"] = solid
    s["t"] += p["dt"]
    s["nstep"] += 1
    s["torque"] = lbm3d.torque(s, p)                # as lbm3d.step: last step's torque / fluid mass
    return s


# ------------------------------------------------------------------ diagnostics and the run loop
def diag_row(s, p, U=None):
    """One row of the time series (physical units; maxu_lb in lattice units)."""
    if U is None:
        U = lbm3d.cell_velocity(s, p)
    h, Lz, span = p["h"], p["Lz"], p["span"]
    sp = diagnostics.spanwise_energy(U, h, Lz, span)
    ekz = sp["Ekz"]
    ekz5 = [float(ekz[m]) if ekz is not None and m < len(ekz) else None for m in range(5)]
    speed = float(np.sqrt((U ** 2).sum(axis=0)).max())
    return dict(t=float(s["t"]), E=diagnostics.energy(U, h, Lz),
                Z=diagnostics.enstrophy(U, h, Lz, span), Ew=sp["Ew"], E3d=sp["E3d"],
                Ekz=ekz5, torque=float(lbm3d.torque(s, p)), maxu_lb=speed * p["dt"] / h,
                mass=float(s.get("mass", lbm3d.mass(s))))


def snapshot(U, p):
    """Mid-plane xy slice of omega_z (N,N) and xz slice of w at y = 1/2 (Nz,N), float32."""
    h, N, Nz = p["h"], p["N"], p["Nz"]
    k = Nz // 2
    wz = (diagnostics.ddx(U[1, k:k + 1], 2, h) - diagnostics.ddx(U[0, k:k + 1], 1, h))[0]
    return wz.astype(np.float32), U[2, :, N // 2, :].astype(np.float32)


def _stem(outfile):
    for ext in (".json", ".npz", ".npy"):
        if outfile.endswith(ext):
            return outfile[:-len(ext)]
    return outfile


def run_fast(p, t_end, every_t, outfile=None, n_snap=4, save_volume=True, s=None,
             progress=None, max_wall=None):
    """Run to physical time t_end, recording a diagnostics row every `every_t` time units.

    Writes (if outfile is given; stem, any .json/.npz/.npy suffix is ignored):
      <stem>.json   params, series (lists: t, E, Z, Ew, E3d, Ekz[kz=0..4], torque, maxu_lb, mass), timing,
                    status "finished" | "diverged" (non-finite or max|u_lb| > 0.5; stops there)
      <stem>.npz    snapshots at n_snap equally spaced times (incl. the last): t_snap,
                    wz_xy (n, N, N), w_xz (n, Nz, N), both float32
      <stem>_u.npy  full cell velocity at the end (3, Nz, N, N) float32, if save_volume
    Returns (s, result dict).  progress(row, info) is called after each recorded row.
    """
    s = s or init_state(p)
    dt = p["dt"]
    nsteps = int(math.ceil(t_end / dt - 1e-9))
    every = max(1, int(round(every_t / dt)))
    snap_steps = sorted({int(round(nsteps * (m + 1) / n_snap)) for m in range(n_snap)}) if n_snap else []
    rows, snaps, status = [], [], "finished"
    t0 = time.time()
    t_diag = 0.0

    def record(final=False):
        nonlocal t_diag
        t1 = time.time()
        U = lbm3d.cell_velocity(s, p)
        row = diag_row(s, p, U)
        rows.append(row)
        if s["nstep"] in snap_steps or (final and not snaps):
            wz, wxz = snapshot(U, p)
            snaps.append((row["t"], wz, wxz))
        t_diag += time.time() - t1
        if progress:
            progress(row, dict(step=s["nstep"], nsteps=nsteps, wall=time.time() - t0))
        return U

    record()
    U = None
    for n in range(nsteps):
        step_fast(s, p)
        if (n + 1) % every == 0 or (n + 1) == nsteps or (n + 1) in snap_steps:
            U = record()
            r = rows[-1]
            if not (np.isfinite(r["E"]) and np.isfinite(r["maxu_lb"])) or r["maxu_lb"] > 0.5:
                status = "diverged"
                break
            if max_wall and time.time() - t0 > max_wall:
                status = "timeout"
                break
    wall = time.time() - t0
    series = {k: [r[k] for r in rows] for k in rows[0]}
    res = dict(status=status, params={k: v for k, v in p.items() if k != "mrt_A"},
               nsteps_done=int(s["nstep"]), nsteps=nsteps, t_final=float(s["t"]), series=series,
               timing=dict(wall_s=wall, diag_s=t_diag, threads=get_num_threads(),
                           wall_per_time_unit=wall / max(s["t"], 1e-300),
                           mlups=p["N"] ** 2 * p["Nz"] * s["nstep"] / max(wall - t_diag, 1e-9) / 1e6))
    if outfile:
        stem = _stem(outfile)
        os.makedirs(os.path.dirname(os.path.abspath(stem)), exist_ok=True)
        if snaps:
            np.savez_compressed(stem + ".npz", t_snap=np.array([x[0] for x in snaps]),
                                wz_xy=np.stack([x[1] for x in snaps]), w_xz=np.stack([x[2] for x in snaps]))
        if save_volume:
            np.save(stem + "_u.npy", lbm3d.cell_velocity(s, p).astype(np.float32))
        tmp = stem + ".json.tmp"
        with open(tmp, "w") as fh:
            json.dump(res, fh, default=float)
        os.replace(tmp, stem + ".json")            # the .json appears only when the case is complete
    return s, res


# ------------------------------------------------------------------ throughput benchmark
def bench(N, Nz, collision="reg", span="periodic", orbit=False, nsteps=40, **kw):
    """Million lattice updates per second of step_fast (compiled, after warm-up)."""
    p = make_params(N=64, Nz=Nz, Re=1000.0, Us=1.0, Uo=0.5 if orbit else 0.0, collision=collision,
                    span=span, **kw)
    if N != 64:        # make_params wants powers of two; the kernels do not (N = 96 is benchmarked too)
        h = 1.0 / N
        Umax = abs(p["Us"]) + abs(p["omega_o"]) * (p["ro"] + p["R"])
        dt = p["u_lb"] * h / Umax
        p.update(lbm3d.lattice_params(N, Nz, p["nu"] * dt / (h * h), collision, span),
                 h=h, Lz=Nz * h, dt=dt)
    s = init_state(p)
    for _ in range(3):
        step_fast(s, p)
    t0 = time.perf_counter()
    for _ in range(nsteps):
        step_fast(s, p)
    dt = time.perf_counter() - t0
    return N * N * Nz * nsteps / dt / 1e6


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="throughput benchmark of step_fast")
    ap.add_argument("--sizes", default="64x32,96x32,128x64", help="NxNz list, comma separated")
    ap.add_argument("--collision", default="reg")
    ap.add_argument("--steps", type=int, default=40)
    a = ap.parse_args()
    print(f"threads={get_num_threads()}")
    for sz in a.sizes.split(","):
        N, Nz = map(int, sz.split("x"))
        for orbit in (False, True):
            print(f"N={N} Nz={Nz} {a.collision} orbit={orbit}: "
                  f"{bench(N, Nz, a.collision, orbit=orbit, nsteps=a.steps):.1f} MLUPS", flush=True)
