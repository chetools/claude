//! Sequential design of experiments for a global model: the Rust solver.
//!
//! The same functions as python/sdl.py, in the same order and with the same
//! names, drawing the same random numbers.  Compiled to WebAssembly, it
//! computes every chart in the page's App tab.
//!
//! Conventions (as in sdl.py)
//!   d   number of inputs (1 or 2), scaled to [0, 1]
//!   x   experiments run so far, n x d, stored row by row in a flat Vec
//!   y   measured responses, length n
//!   g   the grid: candidate points AND error-measurement points, m x d

use std::f64::consts::PI;

// ---------------------------------------------------------------- random numbers
/// SplitMix64 generator: identical stream to `sdl.Rng`.
pub struct Rng {
    s: u64,
}

impl Rng {
    pub fn new(seed: u64, stream: u64) -> Rng {
        Rng { s: seed.wrapping_mul(1000003).wrapping_add(stream) }
    }
    pub fn next_u64(&mut self) -> u64 {
        self.s = self.s.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.s;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }
    /// Uniform on [0, 1).
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (2.0f64).powi(-53)
    }
    /// Standard normal (Box-Muller).
    pub fn normal(&mut self) -> f64 {
        let u1 = self.uniform();
        let u2 = self.uniform();
        (-2.0 * (1.0 - u1).ln()).sqrt() * (2.0 * PI * u2).cos()
    }
    /// Random order of 0..n-1 (Fisher-Yates shuffle).
    pub fn permutation(&mut self, n: usize) -> Vec<usize> {
        let mut p: Vec<usize> = (0..n).collect();
        for i in (1..n).rev() {
            let j = (self.uniform() * (i + 1) as f64) as usize;
            p.swap(i, j);
        }
        p
    }
}

// ---------------------------------------------------------------- true functions
pub fn forrester(u: f64) -> f64 {
    (6.0 * u - 2.0).powi(2) * (12.0 * u - 4.0).sin()
}

pub fn gramacy_lee(u: f64) -> f64 {
    let x = 0.5 + 2.0 * u;
    (10.0 * PI * x).sin() / (2.0 * x) + (x - 1.0).powi(4)
}

/// Yield of B [%] for A -> B -> C, T in K, tau in s.
pub fn reactor_yield(t: f64, tau: f64) -> f64 {
    let k1 = 0.05 * (-6000.0 * (1.0 / t - 1.0 / 350.0)).exp();
    let k2 = 0.02 * (-9000.0 * (1.0 / t - 1.0 / 350.0)).exp();
    100.0 * k1 / (k2 - k1) * ((-k1 * tau).exp() - (-k2 * tau).exp())
}

pub fn branin(u: f64, v: f64) -> f64 {
    let (x1, x2) = (-5.0 + 15.0 * u, 15.0 * v);
    (x2 - 5.1 / (4.0 * PI * PI) * x1 * x1 + 5.0 / PI * x1 - 6.0).powi(2)
        + 10.0 * (1.0 - 1.0 / (8.0 * PI)) * x1.cos()
        + 10.0
}

/// Truth ids, in the order of `sdl.TRUTH_IDS`.
pub const N_TRUTHS: usize = 6;

pub fn truth_dim(id: usize) -> usize {
    if id < 3 { 1 } else { 2 }
}

/// The true function `id` at one scaled point x (length d).
pub fn truth(id: usize, x: &[f64]) -> f64 {
    match id {
        0 => forrester(x[0]),
        1 => gramacy_lee(x[0]),
        2 => reactor_yield(350.0, 100.0 * x[0]),
        3 => branin(x[0], x[1]),
        4 => forrester(x[0]),
        _ => reactor_yield(330.0 + 50.0 * x[0], 5.0 + 95.0 * x[1]),
    }
}

/// 201 points in 1-D, 31 x 31 in 2-D (x1 fastest), flattened.
pub fn grid(d: usize) -> Vec<f64> {
    if d == 1 {
        return (0..201).map(|i| i as f64 / 200.0).collect();
    }
    let mut g = Vec::with_capacity(2 * 961);
    for j in 0..31 {
        for i in 0..31 {
            g.push(i as f64 / 30.0);
            g.push(j as f64 / 30.0);
        }
    }
    g
}

// ---------------------------------------------------------------- Gaussian process
const SQRT5: f64 = 2.23606797749979;
const JITTER: f64 = 1e-8;

/// Matern 5/2 covariance between two points a and b (ARD length scales ell).
#[inline]
pub fn matern52(a: &[f64], b: &[f64], ell: &[f64], sf2: f64) -> f64 {
    let mut r2 = 0.0;
    for i in 0..ell.len() {
        let t = (a[i] - b[i]) / ell[i];
        r2 += t * t;
    }
    let s = SQRT5 * r2.sqrt();
    sf2 * (1.0 + s + s * s / 3.0) * (-s).exp()
}

/// Covariance matrix between point sets a (na x d) and b (nb x d), row-major na x nb.
pub fn matern52_matrix(a: &[f64], b: &[f64], d: usize, ell: &[f64], sf2: f64) -> Vec<f64> {
    let (na, nb) = (a.len() / d, b.len() / d);
    let mut k = vec![0.0; na * nb];
    for i in 0..na {
        for j in 0..nb {
            k[i * nb + j] = matern52(&a[i * d..i * d + d], &b[j * d..j * d + d], ell, sf2);
        }
    }
    k
}

/// Search box for theta = [log l_1..log l_d, log sigma_f, log sigma_n].
pub fn bounds(d: usize) -> (Vec<f64>, Vec<f64>) {
    let mut lo = vec![(0.02f64).ln(); d];
    let mut hi = vec![(5.0f64).ln(); d];
    lo.extend([(0.1f64).ln(), (1e-3f64).ln()]);
    hi.extend([(10.0f64).ln(), 0.0]);
    (lo, hi)
}

/// Unconstrained z -> theta inside the box, and d theta / d z.
pub fn to_theta(z: &[f64], d: usize) -> (Vec<f64>, Vec<f64>) {
    let (lo, hi) = bounds(d);
    let mut th = vec![0.0; z.len()];
    let mut dth = vec![0.0; z.len()];
    for k in 0..z.len() {
        th[k] = lo[k] + (hi[k] - lo[k]) * 0.5 * (1.0 + (0.5 * z[k]).tanh());
        dth[k] = (th[k] - lo[k]) * (hi[k] - th[k]) / (hi[k] - lo[k]);
    }
    (th, dth)
}

pub fn to_z(theta: &[f64], d: usize) -> Vec<f64> {
    let (lo, hi) = bounds(d);
    (0..theta.len())
        .map(|k| {
            let p = (theta[k] - lo[k]) / (hi[k] - lo[k]);
            (p / (1.0 - p)).ln()
        })
        .collect()
}

/// In-place Cholesky factorization of the n x n matrix a (lower triangle
/// is overwritten with L, upper set to 0).  Returns false if not positive definite.
pub fn cholesky(a: &mut [f64], n: usize) -> bool {
    for j in 0..n {
        let mut s = a[j * n + j];
        for k in 0..j {
            s -= a[j * n + k] * a[j * n + k];
        }
        if !(s > 0.0) {
            return false;
        }
        let ljj = s.sqrt();
        a[j * n + j] = ljj;
        for i in j + 1..n {
            let mut s = a[i * n + j];
            for k in 0..j {
                s -= a[i * n + k] * a[j * n + k];
            }
            a[i * n + j] = s / ljj;
        }
        for i in 0..j {
            a[i * n + j] = 0.0;
        }
    }
    true
}

/// Solve L x = b in place (forward substitution), for `cols` right-hand sides
/// stored as the columns of the n x cols row-major matrix b.
pub fn solve_lower(l: &[f64], n: usize, b: &mut [f64], cols: usize) {
    for i in 0..n {
        for k in 0..i {
            let lik = l[i * n + k];
            if lik != 0.0 {
                let (head, tail) = b.split_at_mut(i * cols);
                let src = &head[k * cols..k * cols + cols];
                for (t, s) in tail[..cols].iter_mut().zip(src) {
                    *t -= lik * s;
                }
            }
        }
        let lii = l[i * n + i];
        for t in &mut b[i * cols..i * cols + cols] {
            *t /= lii;
        }
    }
}

/// Solve L^T x = b in place (back substitution), same layout as solve_lower.
pub fn solve_upper_t(l: &[f64], n: usize, b: &mut [f64], cols: usize) {
    for i in (0..n).rev() {
        for k in i + 1..n {
            let lki = l[k * n + i];
            if lki != 0.0 {
                let (head, tail) = b.split_at_mut(k * cols);
                for (t, s) in head[i * cols..i * cols + cols].iter_mut().zip(&tail[..cols]) {
                    *t -= lki * s;
                }
            }
        }
        let lii = l[i * n + i];
        for t in &mut b[i * cols..i * cols + cols] {
            *t /= lii;
        }
    }
}

/// Negative log marginal likelihood of standardized y and its gradient with
/// respect to z (written into grad).  Returns +inf if K is not positive definite.
pub fn nll_grad(z: &[f64], x: &[f64], d: usize, y: &[f64], grad: &mut [f64]) -> f64 {
    let n = y.len();
    let (theta, dtheta) = to_theta(z, d);
    let ell: Vec<f64> = theta[..d].iter().map(|t| t.exp()).collect();
    let sf2 = (2.0 * theta[d]).exp();
    let sn2 = (2.0 * theta[d + 1]).exp();
    // pairwise scaled squared distances, Matern parts
    let mut d2 = vec![0.0; n * n * d];
    let mut kf = vec![0.0; n * n];
    let mut common = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            let mut r2 = 0.0;
            for c in 0..d {
                let t = (x[i * d + c] - x[j * d + c]) / ell[c];
                d2[(i * n + j) * d + c] = t * t;
                r2 += t * t;
            }
            let s = SQRT5 * r2.sqrt();
            let e = (-s).exp();
            kf[i * n + j] = sf2 * (1.0 + s + s * s / 3.0) * e;
            common[i * n + j] = sf2 * (5.0 / 3.0) * (1.0 + s) * e;
        }
    }
    let mut l = kf.clone();
    for i in 0..n {
        l[i * n + i] += sn2 + JITTER;
    }
    if !cholesky(&mut l, n) {
        return f64::INFINITY;
    }
    let mut alpha = y.to_vec();
    solve_lower(&l, n, &mut alpha, 1);
    solve_upper_t(&l, n, &mut alpha, 1);
    let mut nll = 0.5 * n as f64 * (2.0 * PI).ln();
    for i in 0..n {
        nll += 0.5 * y[i] * alpha[i] + l[i * n + i].ln();
    }
    // W = K^-1 - alpha alpha^T
    let mut w = vec![0.0; n * n];
    for i in 0..n {
        w[i * n + i] = 1.0;
    }
    solve_lower(&l, n, &mut w, n);
    solve_upper_t(&l, n, &mut w, n);
    for i in 0..n {
        for j in 0..n {
            w[i * n + j] -= alpha[i] * alpha[j];
        }
    }
    let p = d + 2;
    let mut g = vec![0.0; p];
    let mut tr = 0.0;
    for i in 0..n {
        tr += w[i * n + i];
        for j in 0..n {
            let wij = w[i * n + j];
            for c in 0..d {
                g[c] += wij * common[i * n + j] * d2[(i * n + j) * d + c];
            }
            g[d] += wij * 2.0 * kf[i * n + j];
        }
    }
    g[d + 1] = tr * 2.0 * sn2;
    for k in 0..p {
        grad[k] = 0.5 * g[k] * dtheta[k];
    }
    nll
}

/// BFGS with a backtracking (Armijo) line search: the same steps as `sdl.bfgs`.
pub fn bfgs<F: FnMut(&[f64], &mut [f64]) -> f64>(mut fg: F, z0: &[f64], iters: usize, gtol: f64) -> (Vec<f64>, f64) {
    let p = z0.len();
    let mut z = z0.to_vec();
    let mut g = vec![0.0; p];
    let mut f = fg(&z, &mut g);
    let eye = |h: &mut Vec<f64>| {
        h.iter_mut().for_each(|v| *v = 0.0);
        for i in 0..p {
            h[i * p + i] = 1.0;
        }
    };
    let mut h = vec![0.0; p * p];
    eye(&mut h);
    let mut z1 = vec![0.0; p];
    let mut g1 = vec![0.0; p];
    for _ in 0..iters {
        if g.iter().fold(0.0f64, |m, v| m.max(v.abs())) < gtol {
            break;
        }
        let mut dir: Vec<f64> = (0..p).map(|i| -(0..p).map(|j| h[i * p + j] * g[j]).sum::<f64>()).collect();
        let mut gp: f64 = (0..p).map(|i| g[i] * dir[i]).sum();
        if gp >= 0.0 {
            eye(&mut h);
            dir = g.iter().map(|v| -v).collect();
            gp = (0..p).map(|i| g[i] * dir[i]).sum();
        }
        let mut a = 1.0;
        let f1 = loop {
            for i in 0..p {
                z1[i] = z[i] + a * dir[i];
            }
            let f1 = fg(&z1, &mut g1);
            if f1 <= f + 1e-4 * a * gp {
                break f1;
            }
            a *= 0.5;
            if a < 1e-10 {
                return (z, f);
            }
        };
        let s: Vec<f64> = (0..p).map(|i| z1[i] - z[i]).collect();
        let yv: Vec<f64> = (0..p).map(|i| g1[i] - g[i]).collect();
        let sy: f64 = (0..p).map(|i| s[i] * yv[i]).sum();
        if sy > 1e-12 {
            let r = 1.0 / sy;
            // H <- (I - r s y^T) H (I - r y s^T) + r s s^T
            let mut a1 = vec![0.0; p * p];
            for i in 0..p {
                for j in 0..p {
                    a1[i * p + j] = if i == j { 1.0 } else { 0.0 } - r * s[i] * yv[j];
                }
            }
            let mut t = vec![0.0; p * p];
            for i in 0..p {
                for j in 0..p {
                    t[i * p + j] = (0..p).map(|k| a1[i * p + k] * h[k * p + j]).sum();
                }
            }
            for i in 0..p {
                for j in 0..p {
                    // (I - r y s^T)[k][j] = a1[j][k]
                    h[i * p + j] = (0..p).map(|k| t[i * p + k] * a1[j * p + k]).sum::<f64>() + r * s[i] * s[j];
                }
            }
        }
        z.copy_from_slice(&z1);
        g.copy_from_slice(&g1);
        f = f1;
    }
    (z, f)
}

/// A fitted Gaussian process (same fields as the dict from `sdl.gp_fit`).
pub struct Gp {
    pub x: Vec<f64>,
    pub d: usize,
    pub n: usize,
    pub ym: f64,
    pub ys: f64,
    pub ell: Vec<f64>,
    pub sf2: f64,
    pub sn2: f64,
    pub nll: f64,
    pub l: Vec<f64>,
    pub alpha: Vec<f64>,
}

fn mean_std(v: &[f64]) -> (f64, f64) {
    let m = v.iter().sum::<f64>() / v.len() as f64;
    let var = v.iter().map(|t| (t - m) * (t - m)).sum::<f64>() / v.len() as f64;
    (m, var.sqrt())
}

/// Standardize y, maximize the marginal likelihood from three starts, keep the best.
pub fn gp_fit(x: &[f64], d: usize, y: &[f64]) -> Gp {
    let (ym, mut ys) = mean_std(y);
    if ys == 0.0 {
        ys = 1.0;
    }
    let yz: Vec<f64> = y.iter().map(|v| (v - ym) / ys).collect();
    let mut best: Option<(Vec<f64>, f64)> = None;
    for ell0 in [0.1f64, 0.3, 1.0] {
        let mut th0 = vec![ell0.ln(); d];
        th0.extend([0.0, (0.1f64).ln()]);
        let z0 = to_z(&th0, d);
        let (z, f) = bfgs(|zz, gg| nll_grad(zz, x, d, &yz, gg), &z0, 200, 1e-5);
        if best.as_ref().map_or(true, |b| f < b.1) {
            best = Some((z, f));
        }
    }
    let (z, nll) = best.unwrap();
    let (theta, _) = to_theta(&z, d);
    let ell: Vec<f64> = theta[..d].iter().map(|t| t.exp()).collect();
    let mut gp = gp_build(x, d, y, &ell, (2.0 * theta[d]).exp(), (2.0 * theta[d + 1]).exp());
    gp.nll = nll;
    gp
}

/// GP conditioned on (x, y) with given hyperparameters (standardized units).
pub fn gp_build(x: &[f64], d: usize, y: &[f64], ell: &[f64], sf2: f64, sn2: f64) -> Gp {
    let n = y.len();
    let (ym, mut ys) = mean_std(y);
    if ys == 0.0 {
        ys = 1.0;
    }
    let mut l = matern52_matrix(x, x, d, ell, sf2);
    for i in 0..n {
        l[i * n + i] += sn2 + JITTER;
    }
    cholesky(&mut l, n);
    let mut alpha: Vec<f64> = y.iter().map(|v| (v - ym) / ys).collect();
    solve_lower(&l, n, &mut alpha, 1);
    solve_upper_t(&l, n, &mut alpha, 1);
    Gp { x: x.to_vec(), d, n, ym, ys, ell: ell.to_vec(), sf2, sn2, nll: f64::NAN, l, alpha }
}

/// Posterior mean and variance of the true function at the grid points g (units of y).
pub fn gp_predict(gp: &Gp, g: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let m = g.len() / gp.d;
    let mut v = matern52_matrix(&gp.x, g, gp.d, &gp.ell, gp.sf2); // n x m = K(X, G)
    let mut mean = vec![gp.ym; m];
    for k in 0..gp.n {
        let a = gp.ys * gp.alpha[k];
        for j in 0..m {
            mean[j] += a * v[k * m + j];
        }
    }
    solve_lower(&gp.l, gp.n, &mut v, m);
    let mut var = vec![gp.sf2; m];
    for k in 0..gp.n {
        for j in 0..m {
            var[j] -= v[k * m + j] * v[k * m + j];
        }
    }
    let ys2 = gp.ys * gp.ys;
    for t in &mut var {
        *t = t.max(0.0) * ys2;
    }
    (mean, var)
}

/// Posterior covariance C = K(G, G) - V^T V between all grid points (standardized), m x m.
/// C is symmetric, so only the upper triangle is computed and then mirrored.
pub fn posterior_cov(gp: &Gp, g: &[f64]) -> Vec<f64> {
    let d = gp.d;
    let m = g.len() / d;
    let mut v = matern52_matrix(&gp.x, g, d, &gp.ell, gp.sf2);
    solve_lower(&gp.l, gp.n, &mut v, m);
    let mut c = vec![0.0; m * m];
    for i in 0..m {
        for j in i..m {
            c[i * m + j] = matern52(&g[i * d..i * d + d], &g[j * d..j * d + d], &gp.ell, gp.sf2);
        }
    }
    for k in 0..gp.n {
        let vk = &v[k * m..k * m + m];
        for i in 0..m {
            let a = vk[i];
            let row = &mut c[i * m + i..i * m + m];
            for (cij, vj) in row.iter_mut().zip(&vk[i..]) {
                *cij -= a * vj;
            }
        }
    }
    for i in 0..m {
        for j in 0..i {
            c[i * m + j] = c[j * m + i];
        }
    }
    c
}

// ---------------------------------------------------------------- designs
/// Maximin Latin hypercube: best of `tries` random LHS of n points (flattened n x d).
pub fn lhs_maximin(rng: &mut Rng, n: usize, d: usize, tries: usize) -> Vec<f64> {
    let mut best = Vec::new();
    let mut best_dmin = -1.0;
    for _ in 0..tries {
        let mut x = vec![0.0; n * d];
        for i in 0..d {
            let perm = rng.permutation(n);
            for k in 0..n {
                x[k * d + i] = (perm[k] as f64 + rng.uniform()) / n as f64;
            }
        }
        let mut dmin = if n > 1 { f64::INFINITY } else { 1.0 };
        for a in 0..n {
            for b in a + 1..n {
                let mut s = 0.0;
                for c in 0..d {
                    let t = x[a * d + c] - x[b * d + c];
                    s += t * t;
                }
                dmin = dmin.min(s.sqrt());
            }
        }
        if dmin > best_dmin {
            best = x;
            best_dmin = dmin;
        }
    }
    best
}

/// Greedy batch on the grid (rule 2 = "maxvar", 3 = "imse"); C is consumed.
/// Returns the chosen grid indices and the scores of the first choice.
pub fn greedy_batch(c: &mut [f64], m: usize, sn2: f64, b: usize, rule: usize) -> (Vec<usize>, Vec<f64>) {
    let mut picks = Vec::with_capacity(b);
    let mut first = Vec::new();
    let mut score = vec![0.0; m];
    let mut u = vec![0.0; m];
    for step in 0..b {
        for j in 0..m {
            let var = c[j * m + j];
            score[j] = if rule == 2 {
                var
            } else {
                // C is symmetric: the sum over column j is the sum over row j
                let row = &c[j * m..j * m + m];
                row.iter().map(|t| t * t).sum::<f64>() / (var + sn2) / m as f64
            };
        }
        let mut jbest = 0;
        for j in 1..m {
            if score[j] > score[jbest] {
                jbest = j;
            }
        }
        if step == 0 {
            first = score.clone();
        }
        picks.push(jbest);
        let s = 1.0 / (c[jbest * m + jbest] + sn2).sqrt();
        for i in 0..m {
            u[i] = c[i * m + jbest] * s;
        }
        for i in 0..m {
            let a = u[i];
            let row = &mut c[i * m..i * m + m];
            for (cij, uj) in row.iter_mut().zip(&u) {
                *cij -= a * uj;
            }
        }
    }
    (picks, first)
}

// ---------------------------------------------------------------- one session
/// One round of a session (same fields as the records of `sdl.run_session`).
pub struct Round {
    pub n: usize,
    pub nrmse: f64,
    pub est: f64,
    pub ell: Vec<f64>,
    pub nll: f64,
    pub sf: f64,
    pub sn: f64,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub mean: Vec<f64>,
    pub sd: Vec<f64>,
    pub next: Vec<f64>,
    pub scores: Vec<f64>,
}

pub const RANDOM: usize = 0;
pub const LHS: usize = 1;
pub const MAXVAR: usize = 2;
pub const IMSE: usize = 3;

/// Simulate a session; `keep` = false stores only the learning curve.
pub fn run_session(truth_id: usize, strategy: usize, n0: usize, batch: usize, budget: usize,
                   noise_pct: f64, seed: u64, keep: bool) -> (Vec<Round>, Vec<f64>) {
    let d = truth_dim(truth_id);
    let g = grid(d);
    let m = g.len() / d;
    let fg: Vec<f64> = (0..m).map(|j| truth(truth_id, &g[j * d..j * d + d])).collect();
    let fstd = mean_std(&fg).1;
    let sigma = noise_pct / 100.0 * fstd;
    let experiment = |x: &[f64], rng: &mut Rng| -> Vec<f64> {
        (0..x.len() / d).map(|k| truth(truth_id, &x[k * d..k * d + d]) + sigma * rng.normal()).collect()
    };
    let mut rng_noise = Rng::new(seed, 1);
    let mut rng_pick = Rng::new(seed, 2);
    let mut x = lhs_maximin(&mut Rng::new(seed, 0), n0, d, 50);
    let mut y = experiment(&x, &mut rng_noise);
    let mut rounds = Vec::new();
    loop {
        let gp = gp_fit(&x, d, &y);
        let (mean, var) = gp_predict(&gp, &g);
        let mse = (0..m).map(|j| (mean[j] - fg[j]).powi(2)).sum::<f64>() / m as f64;
        let mvar = var.iter().sum::<f64>() / m as f64;
        let n = y.len();
        let mut rec = Round {
            n, nrmse: mse.sqrt() / fstd, est: mvar.sqrt() / fstd, ell: gp.ell.clone(), nll: gp.nll,
            sf: gp.sf2.sqrt() * gp.ys, sn: gp.sn2.sqrt() * gp.ys,
            x: Vec::new(), y: Vec::new(), mean: Vec::new(), sd: Vec::new(), next: Vec::new(), scores: Vec::new(),
        };
        if keep {
            rec.x = x.clone();
            rec.y = y.clone();
            rec.sd = var.iter().map(|v| v.sqrt()).collect();
            rec.mean = mean;
        }
        if n >= budget {
            rounds.push(rec);
            return (rounds, fg);
        }
        let b = batch.min(budget - n);
        if strategy == LHS {
            let nn = n + b;
            x = lhs_maximin(&mut Rng::new(seed, 1000 + nn as u64), nn, d, 50);
            y = experiment(&x, &mut Rng::new(seed, 2000 + nn as u64));
            if keep {
                rec.next = x.clone();
            }
            rounds.push(rec);
            continue;
        }
        let new: Vec<f64> = if strategy == RANDOM {
            (0..b * d).map(|_| rng_pick.uniform()).collect()
        } else {
            let mut c = posterior_cov(&gp, &g);
            let (idx, score) = greedy_batch(&mut c, m, gp.sn2, b, strategy);
            if keep {
                rec.scores = score;
            }
            idx.iter().flat_map(|&j| g[j * d..j * d + d].to_vec()).collect()
        };
        if keep {
            rec.next = new.clone();
        }
        rounds.push(rec);
        let ynew = experiment(&new, &mut rng_noise);
        x.extend_from_slice(&new);
        y.extend(ynew);
    }
}

// ---------------------------------------------------------------- WebAssembly interface
// Plain extern "C" functions.  JS writes inputs into buffers from `alloc`,
// calls a function, and reads the result through out_ptr() / out_len().
static mut OUT: Vec<f64> = Vec::new();

fn set_out(v: Vec<f64>) {
    unsafe {
        OUT = v;
    }
}

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut f64 {
    let mut v = vec![0.0f64; n];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const f64 {
    unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() }
}

#[no_mangle]
pub extern "C" fn out_len() -> usize {
    unsafe { (*std::ptr::addr_of!(OUT)).len() }
}

/// cfg = [truth, strategy, n0, batch, budget, noise_pct, seed]
fn read_cfg(cfg: *const f64) -> (usize, usize, usize, usize, usize, f64, u64) {
    let c = unsafe { std::slice::from_raw_parts(cfg, 7) };
    (c[0] as usize % N_TRUTHS, c[1] as usize % 4, (c[2] as usize).max(2), (c[3] as usize).max(1),
     c[4] as usize, c[5], c[6] as u64)
}

/// Full session for the step-by-step view.  Layout:
/// [d, m, rounds, f(grid) (m),
///  per round: n, nrmse, est, sf, sn, ell (d), x (n d), y (n), mean (m), sd (m),
///             n_next, next (n_next d), n_scores, scores (n_scores)]
#[no_mangle]
pub extern "C" fn session(cfg: *const f64) {
    let (t, s, n0, b, budget, noise, seed) = read_cfg(cfg);
    let d = truth_dim(t);
    let (rounds, fg) = run_session(t, s, n0, b, budget.max(n0), noise, seed, true);
    let mut o = vec![d as f64, fg.len() as f64, rounds.len() as f64];
    o.extend(&fg);
    for r in &rounds {
        o.extend([r.n as f64, r.nrmse, r.est, r.sf, r.sn]);
        o.extend(&r.ell);
        o.extend(&r.x);
        o.extend(&r.y);
        o.extend(&r.mean);
        o.extend(&r.sd);
        o.push((r.next.len() / d) as f64);
        o.extend(&r.next);
        o.push(r.scores.len() as f64);
        o.extend(&r.scores);
    }
    set_out(o);
}

/// Learning curve only: [rounds, then (n, nrmse, est) per round].
#[no_mangle]
pub extern "C" fn curve(cfg: *const f64) {
    let (t, s, n0, b, budget, noise, seed) = read_cfg(cfg);
    let (rounds, _) = run_session(t, s, n0, b, budget.max(n0), noise, seed, false);
    let mut o = vec![rounds.len() as f64];
    for r in &rounds {
        o.extend([r.n as f64, r.nrmse, r.est]);
    }
    set_out(o);
}
