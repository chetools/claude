//! Heat exchanger network synthesis: the fast solver behind the page.
//!
//! Same algorithm, same function names and the same order of operations as
//! python/hen.py, sections 2 and 5-7:
//!
//!   Model      flat description of the problem (built by Python or JS)
//!   evaluate   TAC of a network with given heat loads, barrier/penalty
//!              terms and the exact gradient (adjoint through the stage
//!              temperatures)
//!   optimize_loads  log-barrier continuation with L-BFGS (the NLP)
//!   anneal     simulated annealing over the topology, NLP inside
//!
//! plus the problem table / composite curves for the charts and the
//! WebAssembly interface (plain f64 buffers, no wasm-bindgen).

// ---------------------------------------------------------------------------
// 1. Costs
// ---------------------------------------------------------------------------

pub const M2_TO_FT2: f64 = 10.7639104;
pub const LAW_POWER: usize = 0;
pub const LAW_SEIDER: usize = 1;
pub const LAW_TURTON: usize = 2;

/// Annualised capital cost [$/yr] of one exchanger of area `a` [m2] and its
/// derivative dC/dA.  See hen.unit_cost for the parameter layout.
pub fn unit_cost(kind: usize, p: &[f64; 8], a: f64) -> (f64, f64) {
    match kind {
        LAW_POWER => {
            let (cf, cv, beta, mult) = (p[0], p[1], p[2], p[3]);
            if a <= 0.0 {
                return (mult * cf, 0.0);
            }
            (mult * (cf + cv * a.powf(beta)), mult * cv * beta * a.powf(beta - 1.0))
        }
        LAW_SEIDER => {
            let (c0, c1, c2, scale, fbm, flp, aa, b) = (p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
            let mut af = a * M2_TO_FT2;
            let clamp = af < 150.0;
            if clamp {
                af = 150.0;
            }
            let l = af.ln();
            let cb = (c0 + c1 * l + c2 * l * l).exp();
            let fm = aa + (af / 100.0).powf(b);
            let c = scale * cb * (fbm + flp * fm - 1.0);
            if clamp {
                return (c, 0.0);
            }
            let dcb = cb * (c1 + 2.0 * c2 * l) / af;
            let dfm = if b != 0.0 { b * (af / 100.0).powf(b - 1.0) / 100.0 } else { 0.0 };
            let dc = scale * (dcb * (fbm + flp * fm - 1.0) + cb * flp * dfm);
            (c, dc * M2_TO_FT2)
        }
        _ => {
            let (k1, k2, k3, scale, b1, bfp, amin) = (p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
            let clamp = a < amin;
            let am = if clamp { amin } else { a };
            let x = am.log10();
            let cp = 10f64.powf(k1 + k2 * x + k3 * x * x);
            let c = scale * cp * (b1 + bfp);
            if clamp {
                return (c, 0.0);
            }
            (c, scale * (b1 + bfp) * cp * (k2 + 2.0 * k3 * x) / am)
        }
    }
}

// ---------------------------------------------------------------------------
// 2. Model (flat layout written by hen.flatten_model and app.js)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct Opt {
    pub u: usize,
    pub uu: f64,
    pub kind: usize,
    pub par: [f64; 8],
    pub tin: f64,
    pub tout: f64,
    pub cost: f64,
}

#[derive(Clone, Debug)]
pub struct Model {
    pub nh: usize,
    pub nc: usize,
    pub k: usize,
    pub emat: f64,
    pub th_in: Vec<f64>,
    pub th_out: Vec<f64>,
    pub fh: Vec<f64>,
    pub tc_in: Vec<f64>,
    pub tc_out: Vec<f64>,
    pub fc: Vec<f64>,
    pub qh: Vec<f64>,
    pub qc: Vec<f64>,
    pub allowed: Vec<bool>, // nh * nc
    pub u_pc: Vec<f64>,
    pub kind_pc: Vec<usize>,
    pub par_pc: Vec<[f64; 8]>,
    pub cool: Vec<Vec<Opt>>,
    pub heat: Vec<Vec<Opt>>,
}

fn read_opt(v: &[f64], at: &mut usize) -> Opt {
    let mut par = [0.0; 8];
    par.copy_from_slice(&v[*at + 3..*at + 11]);
    let o = Opt {
        u: v[*at] as usize,
        uu: v[*at + 1],
        kind: v[*at + 2] as usize,
        par,
        tin: v[*at + 11],
        tout: v[*at + 12],
        cost: v[*at + 13],
    };
    *at += 14;
    o
}

impl Model {
    /// [nH, nC, K, emat, (Tin, Tout, F) per hot, per cold,
    ///  (allowed, U, kind, p0..p7) per (i, j),
    ///  per hot: n, then n x (u, U, kind, p0..p7, Tin, Tout, cost), per cold likewise]
    pub fn from_flat(v: &[f64]) -> Model {
        let nh = v[0] as usize;
        let nc = v[1] as usize;
        let k = v[2] as usize;
        let emat = v[3];
        let mut at = 4;
        let (mut th_in, mut th_out, mut fh) = (vec![], vec![], vec![]);
        for _ in 0..nh {
            th_in.push(v[at]);
            th_out.push(v[at + 1]);
            fh.push(v[at + 2]);
            at += 3;
        }
        let (mut tc_in, mut tc_out, mut fc) = (vec![], vec![], vec![]);
        for _ in 0..nc {
            tc_in.push(v[at]);
            tc_out.push(v[at + 1]);
            fc.push(v[at + 2]);
            at += 3;
        }
        let (mut allowed, mut u_pc, mut kind_pc, mut par_pc) = (vec![], vec![], vec![], vec![]);
        for _ in 0..nh * nc {
            allowed.push(v[at] != 0.0);
            u_pc.push(v[at + 1]);
            kind_pc.push(v[at + 2] as usize);
            let mut p = [0.0; 8];
            p.copy_from_slice(&v[at + 3..at + 11]);
            par_pc.push(p);
            at += 11;
        }
        let mut cool = vec![];
        for _ in 0..nh {
            let n = v[at] as usize;
            at += 1;
            cool.push((0..n).map(|_| read_opt(v, &mut at)).collect());
        }
        let mut heat = vec![];
        for _ in 0..nc {
            let n = v[at] as usize;
            at += 1;
            heat.push((0..n).map(|_| read_opt(v, &mut at)).collect());
        }
        let qh = (0..nh).map(|i| fh[i] * (th_in[i] - th_out[i])).collect();
        let qc = (0..nc).map(|j| fc[j] * (tc_out[j] - tc_in[j])).collect();
        Model { nh, nc, k, emat, th_in, th_out, fh, tc_in, tc_out, fc, qh, qc, allowed, u_pc, kind_pc,
                par_pc, cool, heat }
    }
}

/// A network: matches (i, j, k); hu[j] / cu[i] index a utility option, -1 = off.
#[derive(Clone, Debug, PartialEq)]
pub struct Net {
    pub matches: Vec<(usize, usize, usize)>,
    pub hu: Vec<i32>,
    pub cu: Vec<i32>,
}

impl Net {
    /// [n, (i, j, k) x n, hu x nC, cu x nH]
    pub fn from_flat(v: &[f64], nh: usize, nc: usize) -> Net {
        let n = v[0] as usize;
        let matches = (0..n).map(|m| (v[1 + 3 * m] as usize, v[2 + 3 * m] as usize, v[3 + 3 * m] as usize)).collect();
        let b = 1 + 3 * n;
        Net { matches, hu: (0..nc).map(|j| v[b + j] as i32).collect(), cu: (0..nh).map(|i| v[b + nc + i] as i32).collect() }
    }
    pub fn to_flat(&self) -> Vec<f64> {
        let mut v = vec![self.matches.len() as f64];
        for &(i, j, k) in &self.matches {
            v.extend([i as f64, j as f64, k as f64]);
        }
        v.extend(self.hu.iter().map(|&u| u as f64));
        v.extend(self.cu.iter().map(|&u| u as f64));
        v
    }
}

// ---------------------------------------------------------------------------
// 5. Network evaluation
// ---------------------------------------------------------------------------
//
// The hot path (L-BFGS inside annealing) calls evaluate many thousand times,
// so it works in a reusable workspace `Work` and allocates nothing: in a
// browser, small allocations in parallel Web Workers were measured to slow
// every worker down several-fold.  The arithmetic and its order are those of
// hen.py; `evaluate`, `slacks` and `temperatures` below are thin wrappers.

/// Log-mean temperature difference and its partial derivatives.
pub fn lmtd(a: f64, b: f64) -> (f64, f64, f64) {
    let m = 0.5 * (a + b);
    let d = a - b;
    if d.abs() < 1e-4 * m {
        let l = m - d * d / (12.0 * m);
        return (l, 0.5 - d / (6.0 * m) + d * d / (24.0 * m * m), 0.5 + d / (6.0 * m) + d * d / (24.0 * m * m));
    }
    let lr = (a / b).ln();
    let l = d / lr;
    (l, (lr - d / a) / (lr * lr), (d / b - lr) / (lr * lr))
}

/// Buffers for one network (stage temperatures and their adjoints, stage
/// membership lists, slack vectors, scratch loads).  th[i*(K+1)+k] is hot i
/// entering stage k; tc[j*(K+1)+k] is cold j leaving stage k.
pub struct Work {
    k: usize,
    th: Vec<f64>,
    tc: Vec<f64>,
    dh: Vec<f64>,
    dc: Vec<f64>,
    gth: Vec<f64>,
    gtc: Vec<f64>,
    pub grad: Vec<f64>,
    hot_start: Vec<usize>,
    hot_idx: Vec<usize>,
    cold_start: Vec<usize>,
    cold_idx: Vec<usize>,
    s0: Vec<f64>,
    s1: Vec<f64>,
    xd: Vec<f64>,
}

impl Work {
    pub fn new(model: &Model, net: &Net) -> Work {
        let kk = model.k;
        let n = net.matches.len();
        // matches of hot i in stage k, in match order (CSR layout)
        let mut hot_start = vec![0usize; model.nh * kk + 1];
        let mut cold_start = vec![0usize; model.nc * kk + 1];
        for &(i, j, k) in &net.matches {
            hot_start[i * kk + k + 1] += 1;
            cold_start[j * kk + k + 1] += 1;
        }
        for c in 1..hot_start.len() {
            hot_start[c] += hot_start[c - 1];
        }
        for c in 1..cold_start.len() {
            cold_start[c] += cold_start[c - 1];
        }
        let mut hot_idx = vec![0usize; n];
        let mut cold_idx = vec![0usize; n];
        let mut fh = hot_start.clone();
        let mut fc = cold_start.clone();
        for (m, &(i, j, k)) in net.matches.iter().enumerate() {
            hot_idx[fh[i * kk + k]] = m;
            fh[i * kk + k] += 1;
            cold_idx[fc[j * kk + k]] = m;
            fc[j * kk + k] += 1;
        }
        let ns = 3 * n + 2 * (model.nh + model.nc);
        Work {
            k: kk,
            th: vec![0.0; model.nh * (kk + 1)],
            tc: vec![0.0; model.nc * (kk + 1)],
            dh: vec![0.0; model.nh * kk],
            dc: vec![0.0; model.nc * kk],
            gth: vec![0.0; model.nh * (kk + 1)],
            gtc: vec![0.0; model.nc * (kk + 1)],
            grad: vec![0.0; n],
            hot_start,
            hot_idx,
            cold_start,
            cold_idx,
            s0: Vec::with_capacity(ns),
            s1: Vec::with_capacity(ns),
            xd: vec![0.0; n],
        }
    }

    /// Stage temperatures from the loads (into th, tc).
    fn temperatures(&mut self, model: &Model, net: &Net, x: &[f64]) {
        let kk = self.k;
        self.dh.iter_mut().for_each(|v| *v = 0.0);
        self.dc.iter_mut().for_each(|v| *v = 0.0);
        for (m, &(i, j, k)) in net.matches.iter().enumerate() {
            self.dh[i * kk + k] += x[m];
            self.dc[j * kk + k] += x[m];
        }
        for i in 0..model.nh {
            let b = i * (kk + 1);
            self.th[b] = model.th_in[i];
            for k in 0..kk {
                self.th[b + k + 1] = self.th[b + k] - self.dh[i * kk + k] / model.fh[i];
            }
        }
        for j in 0..model.nc {
            let b = j * (kk + 1);
            self.tc[b + kk] = model.tc_in[j];
            for k in (0..kk).rev() {
                self.tc[b + k] = self.tc[b + k + 1] + self.dc[j * kk + k] / model.fc[j];
            }
        }
    }
}

/// th[i][k]: hot i entering stage k; tc[j][k]: cold j leaving stage k.
pub fn temperatures(model: &Model, net: &Net, x: &[f64]) -> (Vec<Vec<f64>>, Vec<Vec<f64>>) {
    let mut w = Work::new(model, net);
    w.temperatures(model, net, x);
    let kk = model.k;
    (w.th.chunks(kk + 1).map(|c| c.to_vec()).collect(), w.tc.chunks(kk + 1).map(|c| c.to_vec()).collect())
}

/// One exchanger of a result: kind 0 match, 1 cooler, 2 heater.
#[derive(Clone, Debug)]
pub struct Unit {
    pub typ: usize,
    pub i: usize,
    pub j: usize,
    pub k: usize,
    pub q: f64,
    pub a: f64,
    pub cost: f64,
    pub op: f64,
    pub dt1: f64,
    pub dt2: f64,
}

pub struct Eval {
    pub ok: bool,
    pub phi: f64,
    pub tac: f64,
    pub penalty: f64,
    pub grad: Vec<f64>,
    pub units: Vec<Unit>,
}

/// Result of evaluate_into (the gradient, if asked for, is in work.grad).
#[derive(Clone, Copy, Debug)]
pub struct Val {
    pub ok: bool,
    pub phi: f64,
    pub tac: f64,
    pub penalty: f64,
}

struct Acc {
    tau: f64,
    barrier: f64,
    ok: bool,
}

impl Acc {
    #[inline]
    fn slack(&mut self, s: f64) -> f64 {
        if s < 0.0 || (s == 0.0 && self.tau > 0.0) {
            self.ok = false;
            return 0.0;
        }
        if self.tau == 0.0 {
            return 0.0;
        }
        self.barrier -= s.ln();
        -self.tau / s
    }
}

/// phi = TAC/scale - tau * sum(log slack) + mu * sum((residual/duty)^2), its
/// gradient (into w.grad, if asked) and, with `units`, the exchanger table.
#[allow(clippy::too_many_arguments)]
pub fn evaluate_into(model: &Model, net: &Net, x: &[f64], tau: f64, mu: f64, scale: f64, want_grad: bool,
                     w: &mut Work, mut units: Option<&mut Vec<Unit>>) -> Val {
    let kk = model.k;
    let k1 = kk + 1;
    let e = model.emat;
    w.temperatures(model, net, x);
    w.gth.iter_mut().for_each(|v| *v = 0.0);
    w.gtc.iter_mut().for_each(|v| *v = 0.0);
    w.grad.iter_mut().for_each(|v| *v = 0.0);
    let mut tac = 0.0;
    let mut penalty = 0.0;
    let mut acc = Acc { tau, barrier: 0.0, ok: true };

    for (m, &(i, j, k)) in net.matches.iter().enumerate() {
        let q = x[m];
        let a = w.th[i * k1 + k] - w.tc[j * k1 + k];
        let b = w.th[i * k1 + k + 1] - w.tc[j * k1 + k + 1];
        let mut gq = acc.slack(q);
        let mut ga = acc.slack(a - e);
        let mut gb = acc.slack(b - e);
        if !acc.ok {
            continue;
        }
        let (l, la, lb) = lmtd(a, b);
        let u = model.u_pc[i * model.nc + j];
        let area = q / (u * l);
        let (c, dc) = unit_cost(model.kind_pc[i * model.nc + j], &model.par_pc[i * model.nc + j], area);
        tac += c;
        if let Some(us) = units.as_deref_mut() {
            us.push(Unit { typ: 0, i, j, k, q, a: area, cost: c, op: 0.0, dt1: a, dt2: b });
        }
        let dcs = dc / scale;
        gq += if q > 0.0 { dcs * area / q } else { 0.0 };
        ga += -dcs * area / l * la;
        gb += -dcs * area / l * lb;
        w.grad[m] += gq;
        w.gth[i * k1 + k] += ga;
        w.gtc[j * k1 + k] -= ga;
        w.gth[i * k1 + k + 1] += gb;
        w.gtc[j * k1 + k + 1] -= gb;
    }

    for i in 0..model.nh {
        let t_out = w.th[i * k1 + kk];
        let q = model.fh[i] * (t_out - model.th_out[i]);
        let u = net.cu[i];
        if u < 0 {
            let r = q / model.qh[i];
            penalty += r * r;
            w.gth[i * k1 + kk] += mu * 2.0 * r / model.qh[i] * model.fh[i];
            continue;
        }
        let o = &model.cool[i][u as usize];
        let mut gq = acc.slack(q);
        let a = t_out - o.tout;
        let b = model.th_out[i] - o.tin;
        let mut ga = acc.slack(a - e);
        if !acc.ok {
            continue;
        }
        let (l, la, _lb) = lmtd(a, b);
        let area = q / (o.uu * l);
        let (c, dc) = unit_cost(o.kind, &o.par, area);
        let c_op = o.cost * q;
        tac += c + c_op;
        if let Some(us) = units.as_deref_mut() {
            us.push(Unit { typ: 1, i, j: o.u, k: kk, q, a: area, cost: c, op: c_op, dt1: a, dt2: b });
        }
        let dcs = dc / scale;
        gq += (if q > 0.0 { dcs * area / q } else { 0.0 }) + o.cost / scale;
        ga += -dcs * area / l * la;
        w.gth[i * k1 + kk] += gq * model.fh[i] + ga;
    }

    for j in 0..model.nc {
        let t_out = w.tc[j * k1];
        let q = model.fc[j] * (model.tc_out[j] - t_out);
        let u = net.hu[j];
        if u < 0 {
            let r = q / model.qc[j];
            penalty += r * r;
            w.gtc[j * k1] += -mu * 2.0 * r / model.qc[j] * model.fc[j];
            continue;
        }
        let o = &model.heat[j][u as usize];
        let mut gq = acc.slack(q);
        let a = o.tin - model.tc_out[j];
        let b = o.tout - t_out;
        let mut gb = acc.slack(b - e);
        if !acc.ok {
            continue;
        }
        let (l, _la, lb) = lmtd(a, b);
        let area = q / (o.uu * l);
        let (c, dc) = unit_cost(o.kind, &o.par, area);
        let c_op = o.cost * q;
        tac += c + c_op;
        if let Some(us) = units.as_deref_mut() {
            us.push(Unit { typ: 2, i: o.u, j, k: 0, q, a: area, cost: c, op: c_op, dt1: a, dt2: b });
        }
        let dcs = dc / scale;
        gq += (if q > 0.0 { dcs * area / q } else { 0.0 }) + o.cost / scale;
        gb += -dcs * area / l * lb;
        w.gtc[j * k1] += -gq * model.fc[j] - gb;
    }

    if !acc.ok {
        return Val { ok: false, phi: f64::INFINITY, tac: f64::INFINITY, penalty };
    }
    let phi = tac / scale + tau * acc.barrier + mu * penalty;
    if want_grad {
        backprop(model, w);
    }
    Val { ok: true, phi, tac, penalty }
}

/// Chain rule through th[i][k+1] = th[i][k] - sum q/Fh, tc[j][k] = tc[j][k+1] + sum q/Fc
/// (w.grad holds the direct part on entry and the full gradient on exit).
fn backprop(model: &Model, w: &mut Work) {
    let kk = w.k;
    let k1 = kk + 1;
    for i in 0..model.nh {
        let mut acc = 0.0;
        for k in (0..kk).rev() {
            acc += w.gth[i * k1 + k + 1];
            for c in w.hot_start[i * kk + k]..w.hot_start[i * kk + k + 1] {
                let m = w.hot_idx[c];
                w.grad[m] -= acc / model.fh[i];
            }
        }
    }
    for j in 0..model.nc {
        let mut acc = 0.0;
        for k in 0..kk {
            acc += w.gtc[j * k1 + k];
            for c in w.cold_start[j * kk + k]..w.cold_start[j * kk + k + 1] {
                let m = w.cold_idx[c];
                w.grad[m] += acc / model.fc[j];
            }
        }
    }
}

/// Allocating convenience wrapper (tests, dump, reports).
#[allow(clippy::too_many_arguments)]
pub fn evaluate(model: &Model, net: &Net, x: &[f64], tau: f64, mu: f64, scale: f64, want_grad: bool,
                want_units: bool) -> Eval {
    let mut w = Work::new(model, net);
    let mut units = Vec::new();
    let v = evaluate_into(model, net, x, tau, mu, scale, want_grad, &mut w,
                          if want_units { Some(&mut units) } else { None });
    if !v.ok {
        return Eval { ok: false, phi: v.phi, tac: v.tac, penalty: v.penalty, grad: vec![], units: vec![] };
    }
    Eval { ok: true, phi: v.phi, tac: v.tac, penalty: v.penalty, grad: if want_grad { w.grad.clone() } else { vec![] },
           units }
}

// ---------------------------------------------------------------------------
// 6. Loads: barrier NLP solved with L-BFGS
// ---------------------------------------------------------------------------

pub const TAUS: [f64; 7] = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9];
pub const MUS: [f64; 7] = [1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7];

pub fn load_scale(model: &Model, net: &Net) -> Vec<f64> {
    net.matches.iter().map(|&(i, j, _)| model.qh[i].min(model.qc[j])).collect()
}

pub fn start_point(model: &Model, net: &Net, frac: f64) -> Vec<f64> {
    load_scale(model, net).iter().map(|s| frac * s).collect()
}

/// All barrier slacks in a fixed order (same as evaluate), into `s`.
fn slacks_into(model: &Model, net: &Net, x: &[f64], w: &mut Work, which: usize) {
    let kk = model.k;
    let k1 = kk + 1;
    let e = model.emat;
    w.temperatures(model, net, x);
    let s = if which == 0 { &mut w.s0 } else { &mut w.s1 };
    s.clear();
    for (m, &(i, j, k)) in net.matches.iter().enumerate() {
        s.push(x[m]);
        s.push(w.th[i * k1 + k] - w.tc[j * k1 + k] - e);
        s.push(w.th[i * k1 + k + 1] - w.tc[j * k1 + k + 1] - e);
    }
    for i in 0..model.nh {
        let u = net.cu[i];
        if u >= 0 {
            s.push(model.fh[i] * (w.th[i * k1 + kk] - model.th_out[i]));
            s.push(w.th[i * k1 + kk] - model.cool[i][u as usize].tout - e);
        }
    }
    for j in 0..model.nc {
        let u = net.hu[j];
        if u >= 0 {
            s.push(model.fc[j] * (model.tc_out[j] - w.tc[j * k1]));
            s.push(model.heat[j][u as usize].tout - w.tc[j * k1] - e);
        }
    }
}

pub fn slacks(model: &Model, net: &Net, x: &[f64]) -> Vec<f64> {
    let mut w = Work::new(model, net);
    slacks_into(model, net, x, &mut w, 0);
    w.s0
}

fn min_slack_w(model: &Model, net: &Net, x: &[f64], w: &mut Work) -> f64 {
    slacks_into(model, net, x, w, 0);
    w.s0.iter().cloned().fold(1.0f64, |a, b| if b < a { b } else { a })
}

/// x itself if strictly feasible; otherwise the loads scaled down by the
/// largest factor theta (bisection) that makes them feasible, each kept
/// above the tiny start value.  theta -> 0 is the (feasible) tiny start.
pub fn feasible_start(model: &Model, net: &Net, x: &[f64]) -> Vec<f64> {
    let mut w = Work::new(model, net);
    if min_slack_w(model, net, x, &mut w) > 0.0 {
        return x.to_vec();
    }
    let eps = start_point(model, net, 1e-4);
    let mut xs = vec![0.0; x.len()];
    let (mut lo, mut hi) = (0.0f64, 1.0f64);
    for _ in 0..30 {
        let mid = 0.5 * (lo + hi);
        for m in 0..x.len() {
            xs[m] = (mid * x[m]).max(eps[m]);
        }
        if min_slack_w(model, net, &xs, &mut w) > 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    for m in 0..x.len() {
        xs[m] = (lo * x[m]).max(eps[m]);
    }
    if min_slack_w(model, net, &xs, &mut w) > 0.0 { xs } else { eps }
}

fn max_feasible_step_w(model: &Model, net: &Net, x: &[f64], dx: &[f64], w: &mut Work) -> f64 {
    slacks_into(model, net, x, w, 0);
    for m in 0..x.len() {
        w.xd[m] = x[m] + dx[m];
    }
    let xd = std::mem::take(&mut w.xd);
    slacks_into(model, net, &xd, w, 1);
    w.xd = xd;
    let mut amax = f64::INFINITY;
    for (a, b) in w.s0.iter().zip(w.s1.iter()) {
        let ds = b - a;
        if ds < 0.0 {
            amax = amax.min(-a / ds);
        }
    }
    amax
}

pub fn max_feasible_step(model: &Model, net: &Net, x: &[f64], dx: &[f64]) -> f64 {
    let mut w = Work::new(model, net);
    max_feasible_step_w(model, net, x, dx, &mut w)
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    let mut s = 0.0;
    for k in 0..a.len() {
        s += a[k] * b[k];
    }
    s
}

fn max_abs(a: &[f64]) -> f64 {
    let mut m = f64::NEG_INFINITY;
    for v in a {
        if v.abs() > m {
            m = v.abs();
        }
    }
    m
}

/// Minimise phi over scaled loads y at fixed tau, mu (see hen.lbfgs_level).
/// The L-BFGS history is a ring buffer; no allocation inside the loop.
/// Returns (y, f, nfev).
#[allow(clippy::too_many_arguments)]
pub fn lbfgs_level(model: &Model, net: &Net, y0: Vec<f64>, sx: &[f64], tau: f64, mu: f64, scale: f64,
                   max_iter: usize, mem: usize, w: &mut Work) -> (Vec<f64>, f64, usize) {
    let n = y0.len();
    let mut y = y0;
    let mut xs = vec![0.0; n];
    for m in 0..n {
        xs[m] = y[m] * sx[m];
    }
    let ev = evaluate_into(model, net, &xs, tau, mu, scale, true, w, None);
    let mut f = ev.phi;
    let mut g: Vec<f64> = (0..n).map(|m| w.grad[m] * sx[m]).collect();
    let mut hs = vec![vec![0.0; n]; mem];
    let mut hy = vec![vec![0.0; n]; mem];
    let (mut h0, mut hl) = (0usize, 0usize);          // oldest entry, number of entries
    let mut d = vec![0.0; n];
    let mut dxs = vec![0.0; n];
    let mut yn = vec![0.0; n];
    let mut gn = vec![0.0; n];
    let mut s = vec![0.0; n];
    let mut yv = vec![0.0; n];
    let mut al: Vec<(f64, f64)> = Vec::with_capacity(mem);
    let mut nfev = 1;
    let mut small = 0;
    for _it in 0..max_iter {
        for m in 0..n {
            d[m] = -g[m];
        }
        al.clear();
        for r in (0..hl).rev() {
            let c = (h0 + r) % mem;
            let rho = 1.0 / dot(&hy[c], &hs[c]);
            let a_ = rho * dot(&hs[c], &d);
            al.push((a_, rho));
            for m in 0..n {
                d[m] -= a_ * hy[c][m];
            }
        }
        let gam = if hl > 0 {
            let c = (h0 + hl - 1) % mem;
            dot(&hs[c], &hy[c]) / dot(&hy[c], &hy[c])
        } else {
            0.1 / 1e-300f64.max(max_abs(&g))
        };
        for v in d.iter_mut() {
            *v *= gam;
        }
        for (r, &(a_, rho)) in al.iter().rev().enumerate() {
            let c = (h0 + r) % mem;
            let b_ = rho * dot(&hy[c], &d);
            for m in 0..n {
                d[m] += (a_ - b_) * hs[c][m];
            }
        }
        let mut gd = dot(&g, &d);
        if gd >= 0.0 {
            hl = 0;
            h0 = 0;
            let gam = 0.1 / 1e-300f64.max(max_abs(&g));
            for m in 0..n {
                d[m] = -gam * g[m];
            }
            gd = dot(&g, &d);
        }
        for m in 0..n {
            dxs[m] = d[m] * sx[m];
            xs[m] = y[m] * sx[m];
        }
        let amax = max_feasible_step_w(model, net, &xs, &dxs, w);
        let mut a = 1.0f64.min(0.99 * amax);
        let evn = loop {
            for m in 0..n {
                yn[m] = y[m] + a * d[m];
                xs[m] = yn[m] * sx[m];
            }
            let evn = evaluate_into(model, net, &xs, tau, mu, scale, true, w, None);
            nfev += 1;
            if evn.ok && evn.phi <= f + 1e-4 * a * gd {
                break evn;
            }
            a *= 0.5;
            if a < 1e-16 {
                return (y, f, nfev);
            }
        };
        for m in 0..n {
            gn[m] = w.grad[m] * sx[m];
            s[m] = yn[m] - y[m];
            yv[m] = gn[m] - g[m];
        }
        let sy = dot(&s, &yv);
        if sy > 1e-12 * (dot(&s, &s) * dot(&yv, &yv)).sqrt() {
            let c = if hl < mem {
                hl += 1;
                (h0 + hl - 1) % mem
            } else {
                let c = h0;
                h0 = (h0 + 1) % mem;
                c
            };
            hs[c].copy_from_slice(&s);
            hy[c].copy_from_slice(&yv);
        }
        let df = f - evn.phi;
        std::mem::swap(&mut y, &mut yn);
        f = evn.phi;
        std::mem::swap(&mut g, &mut gn);
        small = if df <= 1e-12 * (f.abs() + 1e-12) { small + 1 } else { 0 };
        if small >= 3 || max_abs(&s) < 1e-14 {
            return (y, f, nfev);
        }
    }
    (y, f, nfev)
}

pub fn residuals(model: &Model, net: &Net, x: &[f64]) -> Vec<f64> {
    let (th, tc) = temperatures(model, net, x);
    let kk = model.k;
    let mut r = Vec::new();
    for i in 0..model.nh {
        if net.cu[i] < 0 {
            r.push(model.fh[i] * (th[i][kk] - model.th_out[i]) / model.qh[i]);
        }
    }
    for j in 0..model.nc {
        if net.hu[j] < 0 {
            r.push(model.fc[j] * (model.tc_out[j] - tc[j][0]) / model.qc[j]);
        }
    }
    r
}

#[derive(Clone, Debug)]
pub struct LoadResult {
    pub net: Net,
    pub x: Vec<f64>,
    pub tac: f64,
    pub ok: bool,
    pub feasible: bool,
    pub resid: Vec<f64>,
    pub nfev: usize,
}

/// Optimal loads of a fixed topology (barrier/penalty continuation).
pub fn optimize_loads(model: &Model, net: &Net, x0: Option<&[f64]>, scale: Option<f64>, max_iter: usize) -> LoadResult {
    let n = net.matches.len();
    let sx = load_scale(model, net);
    let x0: Vec<f64> = match x0 {
        Some(x) if x.len() == n => feasible_start(model, net, x),
        _ => start_point(model, net, 1e-4),
    };
    let mut w = Work::new(model, net);
    let scale = match scale {
        Some(s) => s,
        None => 1.0f64.max(evaluate_into(model, net, &x0, 0.0, 0.0, 1.0, false, &mut w, None).tac),
    };
    let mut y: Vec<f64> = (0..n).map(|m| x0[m] / sx[m]).collect();
    let mut nfev = 0;
    for (&tau, &mu) in TAUS.iter().zip(MUS.iter()) {
        if n > 0 {
            let (yn, _f, nf) = lbfgs_level(model, net, y, &sx, tau, mu, scale, max_iter, 8, &mut w);
            y = yn;
            nfev += nf;
        }
    }
    let x: Vec<f64> = (0..n).map(|m| y[m] * sx[m]).collect();
    let ev = evaluate_into(model, net, &x, 0.0, 0.0, 1.0, false, &mut w, None);
    let resid = residuals(model, net, &x);
    let worst = resid.iter().fold(0.0f64, |a, &b| if b.abs() > a { b.abs() } else { a });
    let feasible = ev.ok && worst <= 1e-6;
    LoadResult { net: net.clone(), x, tac: ev.tac, ok: ev.ok, feasible, resid, nfev }
}

// ---------------------------------------------------------------------------
// 7. Topology: simulated annealing
// ---------------------------------------------------------------------------

/// Mulberry32, bit-identical to the Python and JavaScript versions.
pub struct Mulberry32 {
    a: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Mulberry32 { a: seed }
    }
    pub fn next_u32(&mut self) -> u32 {
        self.a = self.a.wrapping_add(0x6D2B79F5);
        let mut t = self.a;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
    pub fn random(&mut self) -> f64 {
        self.next_u32() as f64 / 4294967296.0
    }
    pub fn below(&mut self, n: usize) -> usize {
        (self.next_u32() % n as u32) as usize
    }
}

pub fn initial_network(model: &Model) -> Net {
    Net {
        matches: vec![],
        hu: (0..model.nc).map(|j| if model.heat[j].is_empty() { -1 } else { 0 }).collect(),
        cu: (0..model.nh).map(|i| if model.cool[i].is_empty() { -1 } else { 0 }).collect(),
    }
}

pub fn objective(res: &LoadResult, rf: f64) -> f64 {
    if !res.ok {
        return f64::INFINITY;
    }
    let mut s = 0.0;
    for r in &res.resid {
        s += r.abs();
    }
    res.tac + rf * 10.0 * s
}

/// One random topology move (None if the drawn move is not valid).
pub fn propose(model: &Model, net: &Net, rng: &mut Mulberry32) -> Option<Net> {
    let mv = rng.random();
    let mut mm = net.matches.clone();
    if mv < 0.35 || mm.is_empty() {
        let i = rng.below(model.nh);
        let j = rng.below(model.nc);
        let k = rng.below(model.k);
        if !model.allowed[i * model.nc + j] || mm.contains(&(i, j, k)) {
            return None;
        }
        mm.push((i, j, k));
    } else if mv < 0.6 {
        let m = rng.below(mm.len());
        mm.remove(m);
    } else if mv < 0.8 {
        let m = rng.below(mm.len());
        let (i, j, k) = mm[m];
        let k2 = rng.below(model.k);
        if k2 == k || mm.contains(&(i, j, k2)) {
            return None;
        }
        mm[m] = (i, j, k2);
    } else {
        let s = rng.below(model.nh + model.nc);
        let mut hu = net.hu.clone();
        let mut cu = net.cu.clone();
        if s < model.nh {
            let n = model.cool[s].len();
            cu[s] = rng.below(n + 1) as i32 - 1;
            if cu[s] == net.cu[s] {
                return None;
            }
        } else {
            let j = s - model.nh;
            let n = model.heat[j].len();
            hu[j] = rng.below(n + 1) as i32 - 1;
            if hu[j] == net.hu[j] {
                return None;
            }
        }
        return Some(Net { matches: mm, hu, cu });
    }
    mm.sort();
    Some(Net { matches: mm, hu: net.hu.clone(), cu: net.cu.clone() })
}

pub fn warm_start(old_net: &Net, old_x: &[f64], new_net: &Net, model: &Model) -> Vec<f64> {
    let sx = load_scale(model, new_net);
    new_net.matches.iter().enumerate().map(|(m, mt)| {
        match old_net.matches.iter().position(|o| o == mt) {
            Some(p) => old_x[p],
            None => 1e-4 * sx[m],
        }
    }).collect()
}

pub struct AnnealResult {
    pub best: Option<LoadResult>,
    pub nfev: usize,
    pub trace: Vec<(usize, f64)>,
    pub evals: usize,
}

/// Simulated annealing over the topology (see hen.anneal).
pub fn anneal(model: &Model, iters: usize, seed: u32, net0: Option<Net>, t0: f64, t1: f64, max_iter: usize) -> AnnealResult {
    let mut rng = Mulberry32::new(seed);
    let mut cur_net = net0.unwrap_or_else(|| initial_network(model));
    let mut cur = optimize_loads(model, &cur_net, None, None, max_iter);
    let rf = if cur.tac.is_finite() { cur.tac } else { 1e6 };
    let mut cur_obj = objective(&cur, rf);
    let mut best = if cur.feasible { Some(cur.clone()) } else { None };
    let mut temp = t0 * rf;
    let alpha = (t1 / t0).powf(1.0 / (iters.max(1) as f64));
    let mut nfev = cur.nfev;
    let mut trace = Vec::new();
    let mut evals = 1;
    if let Some(b) = &best {
        trace.push((0, b.tac));
    }
    for it in 0..iters {
        if let Some(cand_net) = propose(model, &cur_net, &mut rng) {
            let x0 = warm_start(&cur_net, &cur.x, &cand_net, model);
            let cand = optimize_loads(model, &cand_net, Some(&x0), None, max_iter);
            nfev += cand.nfev;
            evals += 1;
            let obj = objective(&cand, rf);
            let d = obj - cur_obj;
            let u = rng.random(); // always drawn, so round-off cannot shift the stream
            if d < 0.0 || (d.is_finite() && u < (-d / temp).exp()) {
                cur_net = cand_net;
                cur = cand;
                cur_obj = obj;
                let better = match &best {
                    None => true,
                    Some(b) => cur.tac < b.tac,
                };
                if cur.feasible && better {
                    best = Some(cur.clone());
                    trace.push((it, cur.tac));
                }
            }
        }
        temp *= alpha;
    }
    AnnealResult { best, nfev, trace, evals }
}

// ---------------------------------------------------------------------------
// Targets for the charts: problem table and composite curves
// ---------------------------------------------------------------------------

/// Heat cascade on the hot scale (cold + EMAT): (QH_min, QC_min, T, cascade).
pub fn problem_table(model: &Model) -> (f64, f64, Vec<f64>, Vec<f64>) {
    let dt = model.emat;
    let mut b: Vec<f64> = Vec::new();
    let push = |t: f64, b: &mut Vec<f64>| if !b.contains(&t) { b.push(t) };
    for i in 0..model.nh {
        push(model.th_in[i], &mut b);
        push(model.th_out[i], &mut b);
    }
    for j in 0..model.nc {
        push(model.tc_in[j] + dt, &mut b);
        push(model.tc_out[j] + dt, &mut b);
    }
    b.sort_by(|x, y| y.partial_cmp(x).unwrap());
    let mut cascade = vec![0.0];
    let mut flow = 0.0;
    for w in b.windows(2) {
        let (hi, lo) = (w[0], w[1]);
        let mut net = 0.0;
        for i in 0..model.nh {
            net += model.fh[i] * 0f64.max(hi.min(model.th_in[i]) - lo.max(model.th_out[i]));
        }
        for j in 0..model.nc {
            net -= model.fc[j] * 0f64.max(hi.min(model.tc_out[j] + dt) - lo.max(model.tc_in[j] + dt));
        }
        flow += net;
        cascade.push(flow);
    }
    let mn = cascade.iter().cloned().fold(f64::INFINITY, f64::min);
    let qh = 0f64.max(-mn);
    let flows: Vec<f64> = cascade.iter().map(|c| c + qh).collect();
    (qh, flows[flows.len() - 1], b, flows)
}

/// Composite curve of a set of streams: (T, cumulative H from the cold end).
pub fn composite(tin: &[f64], tout: &[f64], f: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let mut t: Vec<f64> = Vec::new();
    for k in 0..tin.len() {
        for v in [tin[k], tout[k]] {
            if !t.contains(&v) {
                t.push(v);
            }
        }
    }
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut h = vec![0.0];
    for w in t.windows(2) {
        let mut cp = 0.0;
        for k in 0..tin.len() {
            let (lo, hi) = (tin[k].min(tout[k]), tin[k].max(tout[k]));
            if lo <= w[0] && hi >= w[1] {
                cp += f[k];
            }
        }
        let last = h[h.len() - 1];
        h.push(last + cp * (w[1] - w[0]));
    }
    (t, h)
}

// ---------------------------------------------------------------------------
// WebAssembly interface
// ---------------------------------------------------------------------------

static mut OUT: Vec<f64> = Vec::new();
static mut MODEL: Option<Model> = None;

fn set_out(v: Vec<f64>) -> usize {
    // Safety: each WebAssembly instance is single-threaded (one per Web Worker).
    unsafe {
        OUT = v;
        (*std::ptr::addr_of!(OUT)).len()
    }
}

fn model() -> &'static Model {
    unsafe { (*std::ptr::addr_of!(MODEL)).as_ref().expect("set_model first") }
}

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut f64 {
    let mut v = vec![0.0f64; n.max(1)];
    let ptr = v.as_mut_ptr();
    std::mem::forget(v);
    ptr
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const f64 {
    unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() }
}

#[no_mangle]
pub extern "C" fn out_len() -> usize {
    unsafe { (*std::ptr::addr_of!(OUT)).len() }
}

unsafe fn slice<'a>(ptr: *const f64, n: usize) -> &'a [f64] {
    std::slice::from_raw_parts(ptr, n)
}

#[no_mangle]
pub unsafe extern "C" fn set_model(p: *const f64, n: usize) -> usize {
    MODEL = Some(Model::from_flat(slice(p, n)));
    model().nh * model().nc
}

/// Result layout: [feasible, ok, tac, nfev, nunits, x (n), units x 10, net flat]
pub fn pack_result(model: &Model, r: &LoadResult) -> Vec<f64> {
    let ev = evaluate(model, &r.net, &r.x, 0.0, 0.0, 1.0, false, true);
    let mut v = vec![r.feasible as u8 as f64, r.ok as u8 as f64, r.tac, r.nfev as f64, ev.units.len() as f64];
    v.extend_from_slice(&r.x);
    for u in &ev.units {
        v.extend([u.typ as f64, u.i as f64, u.j as f64, u.k as f64, u.q, u.a, u.cost, u.op, u.dt1, u.dt2]);
    }
    let resid_max = r.resid.iter().fold(0.0f64, |a, &b| a.max(b.abs()));
    v.push(resid_max);
    v.extend(r.net.to_flat());
    v
}

/// Optimise the loads of a network [n, (i,j,k)..., hu..., cu...]; x0 may be empty (n0 = 0).
#[no_mangle]
pub unsafe extern "C" fn optimize(netp: *const f64, nn: usize, x0p: *const f64, n0: usize, max_iter: usize) -> usize {
    let m = model();
    let net = Net::from_flat(slice(netp, nn), m.nh, m.nc);
    let x0 = if n0 > 0 { Some(slice(x0p, n0)) } else { None };
    let r = optimize_loads(m, &net, x0, None, max_iter);
    set_out(pack_result(m, &r))
}

/// TAC of a network at the given loads: [ok, tac, units...] (no optimisation).
#[no_mangle]
pub unsafe extern "C" fn evaluate_net(netp: *const f64, nn: usize, xp: *const f64) -> usize {
    let m = model();
    let net = Net::from_flat(slice(netp, nn), m.nh, m.nc);
    let x = slice(xp, net.matches.len());
    let ev = evaluate(m, &net, x, 0.0, 0.0, 1.0, false, true);
    let mut v = vec![ev.ok as u8 as f64, ev.tac, ev.units.len() as f64];
    for u in &ev.units {
        v.extend([u.typ as f64, u.i as f64, u.j as f64, u.k as f64, u.q, u.a, u.cost, u.op, u.dt1, u.dt2]);
    }
    set_out(v)
}

/// Simulated annealing; start network optional (nn = 0).  Output:
/// [found, evals, nfev, ntrace, (iter, tac) x ntrace, pack_result...]
#[no_mangle]
pub unsafe extern "C" fn run_anneal(netp: *const f64, nn: usize, iters: usize, seed: u32, t0: f64, t1: f64,
                                    max_iter: usize) -> usize {
    let m = model();
    let net0 = if nn > 0 { Some(Net::from_flat(slice(netp, nn), m.nh, m.nc)) } else { None };
    let r = anneal(m, iters, seed, net0, t0, t1, max_iter);
    let mut v = vec![r.best.is_some() as u8 as f64, r.evals as f64, r.nfev as f64, r.trace.len() as f64];
    for (it, t) in &r.trace {
        v.extend([*it as f64, *t]);
    }
    if let Some(b) = &r.best {
        v.extend(pack_result(m, b));
    }
    set_out(v)
}

/// Problem table + composite curves of the current model:
/// [QH, QC, nT, T..., cascade..., nh, Th..., Hh..., nc, Tc..., Hc...]
#[no_mangle]
pub extern "C" fn targets() -> usize {
    let m = model();
    let (qh, qc, t, casc) = problem_table(m);
    let (th, hh) = composite(&m.th_in, &m.th_out, &m.fh);
    let (tc, hc) = composite(&m.tc_in, &m.tc_out, &m.fc);
    let mut v = vec![qh, qc, t.len() as f64];
    v.extend(&t);
    v.extend(&casc);
    v.push(th.len() as f64);
    v.extend(&th);
    v.extend(&hh);
    v.push(tc.len() as f64);
    v.extend(&tc);
    v.extend(&hc);
    set_out(v)
}

/// Timing helper for the performance tab: `reps` load optimisations.
#[no_mangle]
pub unsafe extern "C" fn bench_optimize(netp: *const f64, nn: usize, reps: usize) -> f64 {
    let m = model();
    let net = Net::from_flat(slice(netp, nn), m.nh, m.nc);
    let mut s = 0.0;
    for _ in 0..reps {
        s += optimize_loads(m, &net, None, None, 200).tac;
    }
    s
}

/// TAC of `n` load vectors (rows of xp, n x matches) of one network; NaN where
/// a vector violates an approach temperature or a utility load (WebGPU comparison).
#[no_mangle]
pub unsafe extern "C" fn eval_batch(netp: *const f64, nn: usize, xp: *const f64, n: usize) -> usize {
    let m = model();
    let net = Net::from_flat(slice(netp, nn), m.nh, m.nc);
    let nm = net.matches.len();
    let xs = slice(xp, n * nm);
    let mut v = Vec::with_capacity(n);
    let mut w = Work::new(m, &net);
    for b in 0..n {
        let ev = evaluate_into(m, &net, &xs[b * nm..(b + 1) * nm], 0.0, 0.0, 1.0, false, &mut w, None);
        v.push(if ev.ok { ev.tac } else { f64::NAN });
    }
    set_out(v)
}
