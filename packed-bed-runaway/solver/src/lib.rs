//! 2D pseudo-homogeneous packed-bed reactor (radial + axial), solved by the
//! method of lines, with forward-mode automatic differentiation (AD) for
//! parametric sensitivity.
//!
//! Every function here has a twin in `python/pbr.py`; the names match.
//!
//! Model (dimensionless, steady state, plug flow, radial dispersion only):
//!
//!   dx/dxi     = a_m * Lap(x)     + Da * r(x, theta)
//!   dtheta/dxi = a_h * Lap(theta) + S * Da * r(x, theta)
//!   r(x, theta) = (1 - x) * exp(theta / (1 + theta / gamma))
//!   Lap(u) = (1/rho) d/drho (rho du/drho)
//!   rho = 0 : symmetry      rho = 1 : dx/drho = 0, dtheta/drho = -Bi (theta - theta_w)
//!
//! xi = z/L, rho = r/R, x = conversion, theta = gamma (T - T0) / T0.
//! The axial coordinate xi plays the role of time: after discretising rho
//! with finite volumes we get a system of ODEs in xi (the "method of lines"),
//! integrated with an adaptive Rosenbrock 2(3) method (the ode23s scheme).
//!
//! The 1D model is the same code with one radial cell and the wall heat flux
//! replaced by an overall coefficient: dtheta/dxi = S Da r - St (theta - theta_w).

use std::ops::{Add, Div, Mul, Neg, Sub};

// ---------------------------------------------------------------------------
// 1. Numbers that can carry a derivative: the `Real` trait and `Dual` numbers
// ---------------------------------------------------------------------------

/// Anything the solver can compute with: plain `f64`, or a dual number that
/// also carries a derivative.  All model code is written once, generically.
pub trait Real:
    Copy
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Div<Output = Self>
    + Neg<Output = Self>
{
    /// A constant (its derivative is zero).
    fn cst(v: f64) -> Self;
    /// The plain value, dropping any derivative part.
    fn val(self) -> f64;
    /// The derivative part as a plain number (0 for f64).  Used only by the
    /// step-size control, so the sensitivities are kept as accurate as the
    /// solution itself.
    fn tan(self) -> f64;
    fn exp(self) -> Self;
}

impl Real for f64 {
    #[inline(always)]
    fn cst(v: f64) -> Self {
        v
    }
    #[inline(always)]
    fn val(self) -> f64 {
        self
    }
    #[inline(always)]
    fn tan(self) -> f64 {
        0.0
    }
    #[inline(always)]
    fn exp(self) -> Self {
        f64::exp(self)
    }
}

/// Forward-mode dual number  v + d*eps  with eps^2 = 0.
/// Arithmetic on duals applies the chain rule automatically, so `d` is the
/// exact derivative of `v` with respect to whatever input was seeded with d=1.
/// `T` may itself be a Dual, which gives second derivatives for free.
#[derive(Clone, Copy, Debug)]
pub struct Dual<T> {
    pub v: T,
    pub d: T,
}

impl<T: Real> Dual<T> {
    pub fn new(v: T, d: T) -> Self {
        Dual { v, d }
    }
}

impl<T: Real> Add for Dual<T> {
    type Output = Self;
    #[inline(always)]
    fn add(self, o: Self) -> Self {
        Dual { v: self.v + o.v, d: self.d + o.d }
    }
}
impl<T: Real> Sub for Dual<T> {
    type Output = Self;
    #[inline(always)]
    fn sub(self, o: Self) -> Self {
        Dual { v: self.v - o.v, d: self.d - o.d }
    }
}
impl<T: Real> Mul for Dual<T> {
    type Output = Self;
    #[inline(always)]
    fn mul(self, o: Self) -> Self {
        // product rule
        Dual { v: self.v * o.v, d: self.d * o.v + self.v * o.d }
    }
}
impl<T: Real> Div for Dual<T> {
    type Output = Self;
    #[inline(always)]
    fn div(self, o: Self) -> Self {
        // quotient rule
        let q = self.v / o.v;
        Dual { v: q, d: (self.d - q * o.d) / o.v }
    }
}
impl<T: Real> Neg for Dual<T> {
    type Output = Self;
    #[inline(always)]
    fn neg(self) -> Self {
        Dual { v: -self.v, d: -self.d }
    }
}
impl<T: Real> Real for Dual<T> {
    #[inline(always)]
    fn cst(v: f64) -> Self {
        Dual { v: T::cst(v), d: T::cst(0.0) }
    }
    #[inline(always)]
    fn val(self) -> f64 {
        self.v.val()
    }
    #[inline(always)]
    fn tan(self) -> f64 {
        self.d.val()
    }
    #[inline(always)]
    fn exp(self) -> Self {
        let e = self.v.exp();
        Dual { v: e, d: self.d * e }
    }
}

// ---------------------------------------------------------------------------
// 2. Parameters: dimensional inputs -> dimensionless groups
// ---------------------------------------------------------------------------

/// Index of each dimensional input in the flat parameter array (SI units
/// except pressures in atm and the Arrhenius constant, which follow Froment).
pub mod p {
    pub const T_IN: usize = 0; // inlet temperature [K]
    pub const T_C: usize = 1; // coolant (wall) temperature [K]
    pub const P0: usize = 2; // inlet o-xylene partial pressure [atm]
    pub const DT: usize = 3; // tube diameter [m]
    pub const L: usize = 4; // bed length [m]
    pub const G: usize = 5; // superficial mass flux [kg/m2/s]
    pub const LAM: usize = 6; // effective radial conductivity lambda_er [W/m/K]
    pub const AW: usize = 7; // wall heat-transfer coefficient alpha_w [W/m2/K]
    pub const DER: usize = 8; // effective radial dispersivity D_er [m2/s]
    pub const ER: usize = 9; // activation temperature E/R [K]
    pub const LNA: usize = 10; // ln pre-exponential, k in kmol/(kg_cat h atm2)
    pub const DH: usize = 11; // heat of reaction -dH [J/kmol]
    pub const RHOB: usize = 12; // catalyst bulk density [kg/m3]
    pub const CP: usize = 13; // gas heat capacity [J/kg/K]
    pub const MM: usize = 14; // mean molar mass of gas [kg/kmol]
    pub const PO2: usize = 15; // oxygen partial pressure (constant) [atm]
    pub const RHOG: usize = 16; // gas density [kg/m3]
    pub const NP: usize = 17;
}

/// Index of each dimensionless group in the flat groups array.
pub mod g {
    pub const GAMMA: usize = 0; // Arrhenius number E/(R T0)
    pub const S: usize = 1; // dimensionless adiabatic rise gamma*dT_ad/T0
    pub const DA: usize = 2; // Damkoehler number at inlet temperature
    pub const AM: usize = 3; // radial mass dispersion   D_er L / (u R^2)
    pub const AH: usize = 4; // radial heat conduction   lambda_er L / (G cp R^2)
    pub const BI: usize = 5; // wall Biot number          alpha_w R / lambda_er
    pub const ST: usize = 6; // 1D Stanton number         2 U L / (R G cp)
    pub const THW: usize = 7; // coolant temperature in theta units
    pub const NG: usize = 8;
}

/// The dimensionless groups, generic so a derivative can ride along.
#[derive(Clone, Copy, Debug)]
pub struct Groups<T> {
    pub gamma: T,
    pub s: T,
    pub da: T,
    pub a_m: T,
    pub a_h: T,
    pub bi: T,
    pub st: T,
    pub theta_w: T,
}

impl<T: Real> Groups<T> {
    pub fn from_slice(v: &[T]) -> Self {
        Groups {
            gamma: v[g::GAMMA],
            s: v[g::S],
            da: v[g::DA],
            a_m: v[g::AM],
            a_h: v[g::AH],
            bi: v[g::BI],
            st: v[g::ST],
            theta_w: v[g::THW],
        }
    }
}

/// Convert dimensional inputs to dimensionless groups.  Also returns the
/// reference temperature T0 (= inlet temperature) used to turn theta back
/// into kelvin.  Python twin: `groups_from_dimensional`.
pub fn groups_from_dimensional<T: Real>(q: &[T]) -> (Groups<T>, T) {
    let one = T::cst(1.0);
    let t0 = q[p::T_IN];
    let r = q[p::DT] / T::cst(2.0);
    let gamma = q[p::ER] / t0;
    // k(T0) in kmol/(kg_cat s atm^2); total pressure P = 1 atm
    let k0 = (q[p::LNA] - q[p::ER] / t0).exp() / T::cst(3600.0);
    let da = q[p::L] * q[p::MM] * q[p::RHOB] * k0 * q[p::PO2] / q[p::G];
    let dt_ad = q[p::DH] * q[p::P0] / (q[p::MM] * q[p::CP]);
    let s = gamma * dt_ad / t0;
    let u = q[p::G] / q[p::RHOG];
    let a_m = q[p::DER] * q[p::L] / (u * r * r);
    let a_h = q[p::LAM] * q[p::L] / (q[p::G] * q[p::CP] * r * r);
    let bi = q[p::AW] * r / q[p::LAM];
    // 1D overall coefficient: 1/U = 1/alpha_w + R/(4 lambda_er)
    let u_ov = one / (one / q[p::AW] + r / (T::cst(4.0) * q[p::LAM]));
    let st = T::cst(2.0) * u_ov * q[p::L] / (r * q[p::G] * q[p::CP]);
    let theta_w = gamma * (q[p::T_C] - t0) / t0;
    (Groups { gamma, s, da, a_m, a_h, bi, st, theta_w }, t0)
}

// ---------------------------------------------------------------------------
// 3. Radial finite-volume grid
// ---------------------------------------------------------------------------

/// N annular cells of equal width d = 1/N.  Cell i spans faces
/// rho_{i-1/2} = i d  and  rho_{i+1/2} = (i+1) d,  area V_i = (rho_e^2 - rho_w^2)/2.
/// Lap(u)_i = (flux_e - flux_w)/V_i  with  flux = rho * du/drho at a face.
pub struct Grid {
    pub n: usize,
    pub d: f64,
    pub rho: Vec<f64>,  // cell centres
    pub area: Vec<f64>, // V_i
    pub cw: Vec<f64>,   // rho_w / (d V_i): coupling to the cell inside
    pub ce: Vec<f64>,   // rho_e / (d V_i): coupling to the cell outside
}

impl Grid {
    pub fn new(n: usize) -> Self {
        let d = 1.0 / n as f64;
        let mut g = Grid { n, d, rho: vec![], area: vec![], cw: vec![], ce: vec![] };
        for i in 0..n {
            let rw = i as f64 * d;
            let re = (i + 1) as f64 * d;
            let a = 0.5 * (re * re - rw * rw);
            g.rho.push(0.5 * (rw + re));
            g.area.push(a);
            g.cw.push(if i == 0 { 0.0 } else { rw / (d * a) }); // rho=0: symmetry
            g.ce.push(if i == n - 1 { 0.0 } else { re / (d * a) }); // wall handled apart
        }
        g
    }
}

/// The wall flux of the last cell.  The wall temperature is eliminated with
/// a half-cell difference, giving an effective Biot number
/// Bi_eff = Bi / (1 + Bi d/2)  and  Lap gets  -Bi_eff (theta_N - theta_w) / V_N.
#[inline(always)]
fn wall_coeff<T: Real>(bi: T, grid: &Grid) -> T {
    let n = grid.n;
    bi / (T::cst(1.0) + bi * T::cst(0.5 * grid.d)) / T::cst(grid.area[n - 1])
}

// ---------------------------------------------------------------------------
// 4. Rate law, right-hand side and Jacobian
// ---------------------------------------------------------------------------

/// Dimensionless first-order rate  r = (1 - x) exp(theta / (1 + theta/gamma)).
#[inline(always)]
pub fn rate<T: Real>(x: T, th: T, gamma: T) -> T {
    (T::cst(1.0) - x) * (th / (T::cst(1.0) + th / gamma)).exp()
}

/// d rate/dx and d rate/dtheta, obtained by automatic differentiation:
/// evaluate `rate` once with x seeded (dx=1) and once with theta seeded.
/// No hand-derived formula needed; works for T = f64 and T = Dual<f64>.
#[inline(always)]
pub fn rate_grad<T: Real>(x: T, th: T, gamma: T) -> (T, T) {
    let z = T::cst(0.0);
    let o = T::cst(1.0);
    let gm = Dual::new(gamma, z);
    let rx = rate(Dual::new(x, o), Dual::new(th, z), gm).d;
    let rt = rate(Dual::new(x, z), Dual::new(th, o), gm).d;
    (rx, rt)
}

/// The unknowns are interleaved  y = [x_0, th_0, x_1, th_1, ..., x_{N-1}, th_{N-1}].
/// Python twin: `rhs`.
pub fn rhs<T: Real>(gr: &Groups<T>, grid: &Grid, one_d: bool, y: &[T], f: &mut [T]) {
    let n = grid.n;
    let wall = wall_coeff(gr.bi, grid);
    for i in 0..n {
        let x = y[2 * i];
        let th = y[2 * i + 1];
        let r = gr.da * rate(x, th, gr.gamma);
        let (mut lx, mut lt) = (T::cst(0.0), T::cst(0.0));
        if i > 0 {
            let c = T::cst(grid.cw[i]);
            lx = lx + c * (y[2 * i - 2] - x);
            lt = lt + c * (y[2 * i - 1] - th);
        }
        if i + 1 < n {
            let c = T::cst(grid.ce[i]);
            lx = lx + c * (y[2 * i + 2] - x);
            lt = lt + c * (y[2 * i + 3] - th);
        }
        let cool = if one_d {
            gr.st * (th - gr.theta_w)
        } else if i == n - 1 {
            gr.a_h * wall * (th - gr.theta_w)
        } else {
            T::cst(0.0)
        };
        f[2 * i] = gr.a_m * lx + r;
        f[2 * i + 1] = gr.a_h * lt + gr.s * r - cool;
    }
}

/// Block-tridiagonal Jacobian: for every cell a full 2x2 diagonal block
/// (reaction couples x and theta) and diagonal 2-vectors for the couplings
/// to the inner (`lo`) and outer (`up`) neighbour cells (dispersion).
pub struct Jac<T> {
    pub diag: Vec<[[T; 2]; 2]>,
    pub lo: Vec<[T; 2]>,
    pub up: Vec<[T; 2]>,
}

pub fn jacobian<T: Real>(gr: &Groups<T>, grid: &Grid, one_d: bool, y: &[T], j: &mut Jac<T>) {
    let n = grid.n;
    let wall = wall_coeff(gr.bi, grid);
    for i in 0..n {
        let (rx, rt) = rate_grad(y[2 * i], y[2 * i + 1], gr.gamma);
        let (rx, rt) = (gr.da * rx, gr.da * rt);
        let c = T::cst(grid.cw[i] + grid.ce[i]);
        let cool = if one_d {
            gr.st
        } else if i == n - 1 {
            gr.a_h * wall
        } else {
            T::cst(0.0)
        };
        j.diag[i] = [[rx - gr.a_m * c, rt], [gr.s * rx, gr.s * rt - gr.a_h * c - cool]];
        j.lo[i] = [gr.a_m * T::cst(grid.cw[i]), gr.a_h * T::cst(grid.cw[i])];
        j.up[i] = [gr.a_m * T::cst(grid.ce[i]), gr.a_h * T::cst(grid.ce[i])];
    }
}

// ---------------------------------------------------------------------------
// 5. Linear algebra: W = I - h d J, factored by block-Thomas elimination
// ---------------------------------------------------------------------------

#[inline(always)]
fn inv2<T: Real>(m: [[T; 2]; 2]) -> [[T; 2]; 2] {
    let det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    [[m[1][1] / det, -m[0][1] / det], [-m[1][0] / det, m[0][0] / det]]
}

#[inline(always)]
fn mv2<T: Real>(m: &[[T; 2]; 2], v: [T; 2]) -> [T; 2] {
    [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]]
}

/// LU factors of the block-tridiagonal W.  Block-Thomas is Gaussian
/// elimination that only touches the three block diagonals: O(N) work
/// instead of O(N^3) for a dense matrix.
pub struct Factor<T> {
    minv: Vec<[[T; 2]; 2]>, // inverse of each eliminated diagonal block
    lo: Vec<[T; 2]>,        // W's lower couplings (diagonal blocks)
    cp: Vec<[[T; 2]; 2]>,   // modified upper blocks  C'_i = M_i^{-1} U_i
}

impl<T: Real> Factor<T> {
    pub fn new(n: usize) -> Self {
        let z = T::cst(0.0);
        Factor { minv: vec![[[z; 2]; 2]; n], lo: vec![[z; 2]; n], cp: vec![[[z; 2]; 2]; n] }
    }

    /// Factor W = I - hd*J.
    pub fn factor(&mut self, j: &Jac<T>, hd: T) {
        let n = j.diag.len();
        let one = T::cst(1.0);
        for i in 0..n {
            let d = j.diag[i];
            let mut m = [[one - hd * d[0][0], -hd * d[0][1]], [-hd * d[1][0], one - hd * d[1][1]]];
            let wl = [-hd * j.lo[i][0], -hd * j.lo[i][1]];
            if i > 0 {
                // M_i = W_ii - L_i C'_{i-1};  L_i is diagonal
                let c = self.cp[i - 1];
                for r in 0..2 {
                    for k in 0..2 {
                        m[r][k] = m[r][k] - wl[r] * c[r][k];
                    }
                }
            }
            let mi = inv2(m);
            let wu = [-hd * j.up[i][0], -hd * j.up[i][1]];
            // C'_i = M_i^{-1} U_i  (U_i diagonal -> scale columns)
            self.cp[i] = [[mi[0][0] * wu[0], mi[0][1] * wu[1]], [mi[1][0] * wu[0], mi[1][1] * wu[1]]];
            self.minv[i] = mi;
            self.lo[i] = wl;
        }
    }

    /// Solve W k = b in place (b becomes k).
    pub fn solve(&self, b: &mut [T]) {
        let n = self.minv.len();
        let mut prev = [T::cst(0.0); 2];
        for i in 0..n {
            let mut v = [b[2 * i], b[2 * i + 1]];
            if i > 0 {
                v = [v[0] - self.lo[i][0] * prev[0], v[1] - self.lo[i][1] * prev[1]];
            }
            prev = mv2(&self.minv[i], v);
            b[2 * i] = prev[0];
            b[2 * i + 1] = prev[1];
        }
        for i in (0..n.saturating_sub(1)).rev() {
            let nx = [b[2 * i + 2], b[2 * i + 3]];
            let c = mv2(&self.cp[i], nx);
            b[2 * i] = b[2 * i] - c[0];
            b[2 * i + 1] = b[2 * i + 1] - c[1];
        }
    }
}

// ---------------------------------------------------------------------------
// 6. Adaptive Rosenbrock 2(3) integration along the bed (ode23s scheme)
// ---------------------------------------------------------------------------

/// Solver settings.  Python twin: the keyword arguments of `integrate`.
#[derive(Clone, Copy, Debug)]
pub struct Config {
    pub n: usize,
    pub rtol: f64,
    pub atol: f64,
    pub h0: f64,
    pub hmax: f64,
    pub one_d: bool,
    pub max_steps: usize,
}

impl Config {
    pub fn from_slice(c: &[f64]) -> Self {
        Config {
            n: c[0].max(1.0) as usize,
            rtol: c[1],
            atol: c[2],
            h0: c[3],
            hmax: c[4],
            one_d: c[5] != 0.0,
            max_steps: c[6] as usize,
        }
    }
}

/// What a run returns: the hot-spot peak theta* (generic, so it can carry a
/// derivative), where it is, the outlet state and solver statistics.
pub struct Run<T> {
    pub theta_star: T,
    pub xi_star: f64,
    pub i_star: usize,
    pub y_out: Vec<T>,
    pub steps: usize,
    pub rejected: usize,
    pub n_rhs: usize,
    pub ok: bool,
}

/// Hot-spot peak from the accepted steps.  Between two steps we know the
/// values *and* the slopes dtheta/dxi (the right-hand side), so the
/// solution is a cubic Hermite polynomial there.  We find the maximum of
/// that cubic in the bracket around the largest sample.  The location t*
/// is found with plain values and then frozen: at a maximum dtheta/dxi = 0,
/// so moving the location changes the peak only to second order
/// (envelope theorem) and the derivative part stays exact.
/// `xs` shape (K,), `ys`/`ms` = values/slopes of the hottest cell, shape (K,).
pub fn hermite_peak<T: Real>(xs: &[f64], ys: &[T], ms: &[T]) -> (T, f64) {
    let mut k = 0;
    for i in 1..ys.len() {
        if ys[i].val() > ys[k].val() {
            k = i;
        }
    }
    let mut best = (ys[k], xs[k]);
    for j in [k.wrapping_sub(1), k] {
        if j == usize::MAX || j + 1 >= ys.len() {
            continue;
        }
        let h = xs[j + 1] - xs[j];
        let (y0, y1) = (ys[j].val(), ys[j + 1].val());
        let (m0, m1) = (h * ms[j].val(), h * ms[j + 1].val());
        // dp/dt = A t^2 + B t + C for the cubic Hermite p(t), t in [0, 1]
        let a = 6.0 * y0 + 3.0 * m0 - 6.0 * y1 + 3.0 * m1;
        let b = -6.0 * y0 - 4.0 * m0 + 6.0 * y1 - 2.0 * m1;
        let c = m0;
        let mut roots = [f64::NAN; 2];
        if a.abs() < 1e-14 * (b.abs() + c.abs()) {
            if b != 0.0 {
                roots[0] = -c / b;
            }
        } else {
            let disc = b * b - 4.0 * a * c;
            if disc >= 0.0 {
                let sq = disc.sqrt();
                let qq = -0.5 * (b + b.signum() * sq);
                roots = [qq / a, if qq != 0.0 { c / qq } else { f64::NAN }];
            }
        }
        for &t in roots.iter() {
            if !(t > 0.0 && t < 1.0) {
                continue;
            }
            let (t2, t3) = (t * t, t * t * t);
            let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
            let h10 = t3 - 2.0 * t2 + t;
            let h01 = -2.0 * t3 + 3.0 * t2;
            let h11 = t3 - t2;
            let p = ys[j] * T::cst(h00)
                + ms[j] * T::cst(h * h10)
                + ys[j + 1] * T::cst(h01)
                + ms[j + 1] * T::cst(h * h11);
            if p.val() > best.0.val() {
                best = (p, xs[j] + t * h);
            }
        }
    }
    best
}

/// Integrate from xi = 0 to 1.  `record(xi, y)` is called after every
/// accepted step.  The step sizes h are plain f64 numbers, so when T is a
/// Dual the derivative is the exact derivative of this discrete solution
/// ("internal differentiation"); including the derivative parts in the
/// error test makes that discrete derivative accurate as well.
/// Python twin: `integrate`.
pub fn integrate<T: Real>(
    gr: &Groups<T>,
    cfg: &Config,
    mut record: impl FnMut(f64, &[T]),
) -> Run<T> {
    let grid = Grid::new(if cfg.one_d { 1 } else { cfg.n });
    let n = grid.n;
    let m = 2 * n;
    let z = T::cst(0.0);
    // ode23s constants (Shampine & Reichelt 1997)
    let d = 1.0 / (2.0 + 2f64.sqrt());
    let e32 = 6.0 + 2f64.sqrt();

    let mut y = vec![z; m]; // inlet: x = 0, theta = 0
    let mut f0 = vec![z; m];
    let mut f1 = vec![z; m];
    let mut f2 = vec![z; m];
    let mut k1 = vec![z; m];
    let mut k2 = vec![z; m];
    let mut k3 = vec![z; m];
    let mut yt = vec![z; m];
    let mut jac = Jac { diag: vec![[[z; 2]; 2]; n], lo: vec![[z; 2]; n], up: vec![[z; 2]; n] };
    let mut fac = Factor::new(n);

    record(0.0, &y);

    let mut xi = 0.0;
    let mut h = cfg.h0;
    let (mut steps, mut rejected, mut n_rhs) = (0, 0, 1);
    rhs(gr, &grid, cfg.one_d, &y, &mut f0);
    // value and slope of the hottest cell after every accepted step
    let mut peak_xi = vec![0.0];
    let mut peak_th = vec![y[1]];
    let mut peak_m = vec![f0[1]];
    let mut peak_i = vec![0usize];
    let mut ok = true;

    while xi < 1.0 {
        if steps + rejected > cfg.max_steps {
            ok = false;
            break;
        }
        h = h.min(cfg.hmax).min(1.0 - xi);
        let ht = T::cst(h);
        jacobian(gr, &grid, cfg.one_d, &y, &mut jac);
        fac.factor(&jac, T::cst(h * d));

        // stage 1: W k1 = f(y)
        k1.copy_from_slice(&f0);
        fac.solve(&mut k1);
        // stage 2: W (k2 - k1) = f(y + h/2 k1) - k1
        for i in 0..m {
            yt[i] = y[i] + T::cst(0.5) * ht * k1[i];
        }
        rhs(gr, &grid, cfg.one_d, &yt, &mut f1);
        for i in 0..m {
            k2[i] = f1[i] - k1[i];
        }
        fac.solve(&mut k2);
        for i in 0..m {
            k2[i] = k2[i] + k1[i];
            yt[i] = y[i] + ht * k2[i]; // candidate y_new (2nd order)
        }
        rhs(gr, &grid, cfg.one_d, &yt, &mut f2);
        // stage 3, only for the error estimate
        for i in 0..m {
            k3[i] = f2[i] - T::cst(e32) * (k2[i] - f1[i]) - T::cst(2.0) * (k1[i] - f0[i]);
        }
        fac.solve(&mut k3);
        n_rhs += 2;

        // error = h/6 (k1 - 2 k2 + k3), scaled by atol + rtol |y|
        // For dual numbers the derivative parts get the same test, so the
        // sensitivities are resolved too (for f64, tan() = 0 and it vanishes).
        // The derivative parts are scaled by their largest component: tiny
        // components carry only round-off and must not stall the step size.
        let mut dmax: f64 = 0.0;
        for i in 0..m {
            dmax = dmax.max(y[i].tan().abs()).max(yt[i].tan().abs());
        }
        let mut err: f64 = 0.0;
        for i in 0..m {
            let e = (h / 6.0) * (k1[i].val() - 2.0 * k2[i].val() + k3[i].val());
            let sc = cfg.atol + cfg.rtol * y[i].val().abs().max(yt[i].val().abs());
            err = err.max((e / sc).abs());
            let es = (h / 6.0) * (k1[i].tan() - 2.0 * k2[i].tan() + k3[i].tan());
            let ss = cfg.atol + cfg.rtol * dmax;
            err = err.max((es / ss).abs());
        }
        if !err.is_finite() {
            err = 1e10;
        }
        if err <= 1.0 {
            xi += h;
            y.copy_from_slice(&yt);
            f0.copy_from_slice(&f2); // first-same-as-last
            steps += 1;
            record(xi, &y);
            // hottest cell at this axial position
            let mut ib = 0;
            for i in 1..n {
                if y[2 * i + 1].val() > y[2 * ib + 1].val() {
                    ib = i;
                }
            }
            peak_xi.push(xi);
            peak_th.push(y[2 * ib + 1]);
            peak_m.push(f0[2 * ib + 1]);
            peak_i.push(ib);
        } else {
            rejected += 1;
        }
        // new step: 3rd-order error estimate -> exponent 1/3, safety 0.8
        let fac_h = if err == 0.0 { 5.0 } else { (0.8 * err.powf(-1.0 / 3.0)).clamp(0.2, 5.0) };
        h *= fac_h;
        if h < 1e-15 * xi.max(1e-3) {
            ok = false;
            break;
        }
    }
    let (theta_star, xi_star) = hermite_peak(&peak_xi, &peak_th, &peak_m);
    let mut k = 0;
    for i in 1..peak_th.len() {
        if peak_th[i].val() > peak_th[k].val() {
            k = i;
        }
    }
    Run { theta_star, xi_star, i_star: peak_i[k], y_out: y, steps, rejected, n_rhs, ok }
}

// ---------------------------------------------------------------------------
// 7. Parametric sensitivity by forward-mode AD
// ---------------------------------------------------------------------------

/// `which` value meaning "inlet and coolant temperature together" (T_in = T_c).
pub const TIED_T: usize = 100;

/// Normalised sensitivity of the hot-spot temperature to input `which`:
///   s = (phi / T*) dT*/dphi
/// computed in ONE integration with dual numbers (phi seeded with d = 1).
/// `which = TIED_T` seeds T_in and T_c together.
/// Returns (T*, dT*/dphi, s, run statistics).
pub fn sensitivity_dimensional(q: &[f64], cfg: &Config, which: usize) -> (f64, f64, f64, Run<Dual<f64>>) {
    let seeded = |i: usize| i == which || (which == TIED_T && (i == p::T_IN || i == p::T_C));
    let qd: Vec<Dual<f64>> = q
        .iter()
        .enumerate()
        .map(|(i, &v)| Dual::new(v, if seeded(i) { 1.0 } else { 0.0 }))
        .collect();
    let (gr, t0) = groups_from_dimensional(&qd);
    let run = integrate(&gr, cfg, |_, _| {});
    let tstar = t0 * (Dual::cst(1.0) + run.theta_star / gr.gamma);
    let phi = q[if which == TIED_T { p::T_IN } else { which }];
    let s = phi / tstar.v * tstar.d;
    (tstar.v, tstar.d, s, run)
}

/// Same, but with respect to one dimensionless group, and the sensitivity of
/// theta* itself: s = (phi/theta*) dtheta*/dphi (the Morbidelli-Varma form).
pub fn sensitivity_groups(gv: &[f64], cfg: &Config, which: usize) -> (f64, f64, f64, Run<Dual<f64>>) {
    let gd: Vec<Dual<f64>> = gv
        .iter()
        .enumerate()
        .map(|(i, &v)| Dual::new(v, if i == which { 1.0 } else { 0.0 }))
        .collect();
    let gr = Groups::from_slice(&gd);
    let run = integrate(&gr, cfg, |_, _| {});
    let th = run.theta_star;
    let s = gv[which] / th.v * th.d;
    (th.v, th.d, s, run)
}

// ---------------------------------------------------------------------------
// 8. WebAssembly interface: plain f64 buffers in linear memory
// ---------------------------------------------------------------------------
//
// JavaScript allocates input arrays with `alloc`, writes f64 values into
// them, calls a solver, then reads the result through a Float64Array view
// of `out_ptr()` / `out_len()` -- no copying, no serialisation.

static mut OUT: Vec<f64> = Vec::new();

fn set_out(v: Vec<f64>) -> usize {
    // Safety: a WebAssembly instance is single-threaded; each Web Worker has
    // its own instance and therefore its own OUT.
    unsafe {
        OUT = v;
        (*std::ptr::addr_of!(OUT)).len()
    }
}

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut f64 {
    let mut v = vec![0.0f64; n];
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

/// Header layout of `solve_*` results (then xi[steps+1], then for each
/// recorded xi: theta[N], x[N]).
pub const HDR: usize = 16;

fn pack_solve(gr: &Groups<f64>, t0: f64, cfg: &Config) -> Vec<f64> {
    let mut xs = Vec::new();
    let mut ys: Vec<f64> = Vec::new();
    let run = integrate(gr, cfg, |xi, y| {
        xs.push(xi);
        ys.extend_from_slice(y);
    });
    let n = if cfg.one_d { 1 } else { cfg.n };
    let grid = Grid::new(n);
    // cup-mixing outlet conversion (uniform velocity -> area weighted)
    let mut xm = 0.0;
    for i in 0..n {
        xm += 2.0 * grid.area[i] * run.y_out[2 * i];
    }
    let mut out = vec![0.0; HDR];
    out[0] = xs.len() as f64;
    out[1] = n as f64;
    out[2] = t0;
    out[3] = gr.gamma;
    out[4] = run.theta_star;
    out[5] = run.xi_star;
    out[6] = run.i_star as f64;
    out[7] = xm;
    out[8] = run.steps as f64;
    out[9] = run.rejected as f64;
    out[10] = run.n_rhs as f64;
    out[11] = if run.ok { 1.0 } else { 0.0 };
    out.extend_from_slice(&xs);
    for k in 0..xs.len() {
        for i in 0..n {
            out.push(ys[k * 2 * n + 2 * i + 1]);
        }
        for i in 0..n {
            out.push(ys[k * 2 * n + 2 * i]);
        }
    }
    out
}

/// Full solve from dimensional inputs (17 values) and config (7 values).
#[no_mangle]
pub unsafe extern "C" fn solve_dim(q: *const f64, c: *const f64) -> usize {
    let cfg = Config::from_slice(slice(c, 7));
    let (gr, t0) = groups_from_dimensional(slice(q, p::NP));
    set_out(pack_solve(&gr, t0, &cfg))
}

/// Full solve from dimensionless groups (8 values); T0 is passed as 1.
#[no_mangle]
pub unsafe extern "C" fn solve_groups(gv: *const f64, c: *const f64) -> usize {
    let cfg = Config::from_slice(slice(c, 7));
    let gr = Groups::from_slice(slice(gv, g::NG));
    set_out(pack_solve(&gr, 1.0, &cfg))
}

/// Dimensionless groups for display: [gamma, S, Da, a_m, a_h, Bi, St, theta_w].
#[no_mangle]
pub unsafe extern "C" fn groups_dim(q: *const f64) -> usize {
    let (gr, _) = groups_from_dimensional(slice(q, p::NP));
    set_out(vec![gr.gamma, gr.s, gr.da, gr.a_m, gr.a_h, gr.bi, gr.st, gr.theta_w])
}

fn pack_sens(r: (f64, f64, f64, Run<Dual<f64>>)) -> usize {
    let (v, dv, s, run) = r;
    set_out(vec![v, dv, s, run.xi_star, run.steps as f64, if run.ok { 1.0 } else { 0.0 }])
}

/// [T*, dT*/dphi, s, xi*, steps, ok] for dimensional input `which`.
#[no_mangle]
pub unsafe extern "C" fn sens_dim(q: *const f64, c: *const f64, which: usize) -> usize {
    let cfg = Config::from_slice(slice(c, 7));
    pack_sens(sensitivity_dimensional(slice(q, p::NP), &cfg, which))
}

/// [theta*, dtheta*/dphi, s, xi*, steps, ok] for group `which`.
#[no_mangle]
pub unsafe extern "C" fn sens_groups(gv: *const f64, c: *const f64, which: usize) -> usize {
    let cfg = Config::from_slice(slice(c, 7));
    pack_sens(sensitivity_groups(slice(gv, g::NG), &cfg, which))
}

/// Peak only (no recording) -- the inner loop of the speed race.
/// Returns [T*, xi*, steps].
#[no_mangle]
pub unsafe extern "C" fn peak_dim(q: *const f64, c: *const f64) -> usize {
    let cfg = Config::from_slice(slice(c, 7));
    let (gr, t0) = groups_from_dimensional(slice(q, p::NP));
    let run = integrate(&gr, &cfg, |_, _| {});
    set_out(vec![t0 * (1.0 + run.theta_star / gr.gamma), run.xi_star, run.steps as f64])
}

/// Micro-benchmark: time `reps` right-hand-side evaluations (for the
/// "why is Rust fast" table).  Returns a checksum so it is not optimised away.
#[no_mangle]
pub unsafe extern "C" fn bench_rhs(q: *const f64, n: usize, reps: usize) -> f64 {
    let (gr, _) = groups_from_dimensional(slice(q, p::NP));
    let grid = Grid::new(n);
    let y: Vec<f64> = (0..2 * n).map(|i| 0.01 * i as f64).collect();
    let mut f = vec![0.0; 2 * n];
    let mut acc = 0.0;
    for _ in 0..reps {
        rhs(&gr, &grid, false, &y, &mut f);
        acc += f[1];
    }
    acc
}

/// Micro-benchmark: `reps` Jacobian + factor + solve cycles.
#[no_mangle]
pub unsafe extern "C" fn bench_lin(q: *const f64, n: usize, reps: usize) -> f64 {
    let (gr, _) = groups_from_dimensional(slice(q, p::NP));
    let grid = Grid::new(n);
    let y: Vec<f64> = (0..2 * n).map(|i| 0.01 * i as f64).collect();
    let mut jac = Jac { diag: vec![[[0.0; 2]; 2]; n], lo: vec![[0.0; 2]; n], up: vec![[0.0; 2]; n] };
    let mut fac = Factor::new(n);
    let mut b = vec![0.0; 2 * n];
    let mut acc = 0.0;
    for _ in 0..reps {
        jacobian(&gr, &grid, false, &y, &mut jac);
        fac.factor(&jac, 1e-3);
        b.iter_mut().for_each(|v| *v = 1.0);
        fac.solve(&mut b);
        acc += b[0];
    }
    acc
}

/// Froment's o-xylene -> phthalic anhydride tube (Froment & Bischoff),
/// converted to SI.  Used by tests and the native dump tool.
pub fn oxylene_preset() -> Vec<f64> {
    let mut q = vec![0.0; p::NP];
    q[p::T_IN] = 625.0;
    q[p::T_C] = 625.0;
    q[p::P0] = 0.011;
    q[p::DT] = 0.0254;
    q[p::L] = 3.0;
    q[p::G] = 4684.0 / 3600.0;
    q[p::LAM] = 0.67 * 4184.0 / 3600.0; // 0.67 kcal/(m h K)
    q[p::AW] = 155.0 * 4184.0 / 3600.0; // 155 kcal/(m2 h K)
    q[p::DER] = 0.0;
    q[p::ER] = 13636.0;
    q[p::LNA] = 19.837;
    q[p::DH] = 307000.0 * 4184.0; // 307 000 kcal/kmol
    q[p::RHOB] = 1300.0;
    q[p::CP] = 0.237 * 4184.0;
    q[p::MM] = 29.48;
    q[p::PO2] = 0.208;
    q[p::RHOG] = 1.293 * 273.15 / 625.0 * 29.48 / 28.96;
    // D_er from a radial mass Peclet number u d_p / D_er = 10, d_p = 3 mm
    let u = q[p::G] / q[p::RHOG];
    q[p::DER] = u * 0.003 / 10.0;
    q
}

pub fn default_config() -> Config {
    Config { n: 30, rtol: 1e-5, atol: 1e-8, h0: 1e-4, hmax: 0.05, one_d: false, max_steps: 200_000 }
}
