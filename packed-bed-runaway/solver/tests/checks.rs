//! Correctness checks for the solver (run natively: `cargo test --release`).
use pbr::*;

fn tight() -> Config {
    Config { n: 30, rtol: 1e-9, atol: 1e-12, h0: 1e-6, hmax: 0.05, one_d: false, max_steps: 2_000_000 }
}

fn tstar(q: &[f64], cfg: &Config) -> f64 {
    let (gr, t0) = groups_from_dimensional(q);
    t0 * (1.0 + integrate(&gr, cfg, |_, _| {}).theta_star / gr.gamma)
}

/// Without wall cooling (Bi = 0) the bed is adiabatic and radially uniform,
/// so energy and mass balances give theta = S x everywhere.
#[test]
fn adiabatic_invariant() {
    let gv = [20.0, 8.0, 0.5, 1.0, 2.0, 0.0, 0.0, 0.0];
    let gr = Groups::from_slice(&gv);
    let mut worst: f64 = 0.0;
    integrate(&gr, &default_config(), |_, y| {
        for i in 0..y.len() / 2 {
            worst = worst.max((y[2 * i + 1] - 8.0 * y[2 * i]).abs());
        }
    });
    assert!(worst < 1e-9, "theta - S x = {worst}");
}

/// The AD gradient of the rate equals the hand-derived formula.
#[test]
fn ad_rate_gradient_matches_analytic() {
    for &(x, th, gm) in &[(0.1, 0.5, 20.0), (0.7, 3.0, 15.0), (0.0, -1.0, 30.0)] {
        let (rx, rt) = rate_grad(x, th, gm);
        let e = (th / (1.0 + th / gm)).exp();
        assert!((rx + e).abs() < 1e-12 * e);
        let at = (1.0 - x) * e / (1.0 + th / gm).powi(2);
        assert!((rt - at).abs() < 1e-12 * at.abs().max(1.0));
    }
}

/// Block-Thomas solve of W k = b agrees with dense Gaussian elimination.
#[test]
fn block_thomas_matches_dense() {
    let (gr, _) = groups_from_dimensional(&oxylene_preset());
    let n = 7;
    let grid = Grid::new(n);
    let y: Vec<f64> = (0..2 * n).map(|i| 0.05 * i as f64).collect();
    let mut j = Jac { diag: vec![[[0.0; 2]; 2]; n], lo: vec![[0.0; 2]; n], up: vec![[0.0; 2]; n] };
    jacobian(&gr, &grid, false, &y, &mut j);
    let hd = 0.01;
    let m = 2 * n;
    let mut a = vec![vec![0.0; m]; m];
    for i in 0..n {
        for r in 0..2 {
            for c in 0..2 {
                a[2 * i + r][2 * i + c] = -hd * j.diag[i][r][c];
            }
            a[2 * i + r][2 * i + r] += 1.0;
            if i > 0 {
                a[2 * i + r][2 * i - 2 + r] = -hd * j.lo[i][r];
            }
            if i + 1 < n {
                a[2 * i + r][2 * i + 2 + r] = -hd * j.up[i][r];
            }
        }
    }
    let b: Vec<f64> = (0..m).map(|i| (i as f64).sin()).collect();
    let mut k = b.clone();
    let mut f = Factor::new(n);
    f.factor(&j, hd);
    f.solve(&mut k);
    for r in 0..m {
        let ax: f64 = (0..m).map(|c| a[r][c] * k[c]).sum();
        assert!((ax - b[r]).abs() < 1e-12, "row {r}: {ax} vs {}", b[r]);
    }
}

/// AD sensitivity (one dual-number run) agrees with central finite
/// differences of tightly converged solves.
#[test]
fn ad_sensitivity_matches_finite_differences() {
    let q0 = oxylene_preset();
    let cfg = Config { rtol: 1e-8, atol: 1e-11, ..default_config() };
    for &(which, rel) in &[(p::P0, 1e-4), (p::T_C, 1e-6), (p::AW, 1e-4)] {
        let (_, d_ad, _, _) = sensitivity_dimensional(&q0, &cfg, which);
        let h = rel * q0[which];
        let (mut qp, mut qm) = (q0.clone(), q0.clone());
        qp[which] += h;
        qm[which] -= h;
        let d_fd = (tstar(&qp, &tight()) - tstar(&qm, &tight())) / (2.0 * h);
        let relerr = (d_ad - d_fd).abs() / d_fd.abs();
        assert!(relerr < 2e-3, "param {which}: AD {d_ad} FD {d_fd}");
    }
}

/// Spatial convergence: finite volumes are second order in the radial step.
#[test]
fn radial_grid_second_order() {
    let mut q = oxylene_preset();
    q[p::P0] = 0.013;
    let t: Vec<f64> = [10, 20, 40]
        .iter()
        .map(|&n| tstar(&q, &Config { n, ..tight() }))
        .collect();
    let order = ((t[0] - t[1]) / (t[1] - t[2])).abs().log2();
    assert!(order > 1.6 && order < 2.6, "observed order {order}, T* = {t:?}");
}
