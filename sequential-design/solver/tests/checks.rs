//! cargo test --release: checks that do not need Python.
use sdl::*;

fn data(n: usize, seed: u64) -> (Vec<f64>, Vec<f64>) {
    let x = lhs_maximin(&mut Rng::new(seed, 0), n, 2, 50);
    let y: Vec<f64> = (0..n).map(|k| branin(x[2 * k], x[2 * k + 1])).collect();
    let m = y.iter().sum::<f64>() / n as f64;
    let s = (y.iter().map(|v| (v - m) * (v - m)).sum::<f64>() / n as f64).sqrt();
    (x, y.iter().map(|v| (v - m) / s).collect())
}

#[test]
fn gradient_matches_finite_differences() {
    let (x, y) = data(12, 3);
    for z in [[0.3, -0.2, 0.1, -0.5], [-1.0, 1.5, 0.7, 2.0]] {
        let mut g = [0.0; 4];
        let mut tmp = [0.0; 4];
        nll_grad(&z, &x, 2, &y, &mut g);
        for k in 0..4 {
            let h = 1e-6;
            let (mut zp, mut zm) = (z, z);
            zp[k] += h;
            zm[k] -= h;
            let fd = (nll_grad(&zp, &x, 2, &y, &mut tmp) - nll_grad(&zm, &x, 2, &y, &mut tmp)) / (2.0 * h);
            assert!((g[k] - fd).abs() < 1e-6 * (1.0 + fd.abs()), "k={k} AD-free gradient {} vs FD {}", g[k], fd);
        }
    }
}

#[test]
fn cholesky_reconstructs_matrix() {
    let (x, _) = data(15, 4);
    let k = matern52_matrix(&x, &x, 2, &[0.3, 0.5], 1.3);
    let mut l = k.clone();
    for i in 0..15 {
        l[i * 15 + i] += 1e-6;
    }
    assert!(cholesky(&mut l, 15));
    for i in 0..15 {
        for j in 0..15 {
            let s: f64 = (0..15).map(|c| l[i * 15 + c] * l[j * 15 + c]).sum();
            let want = k[i * 15 + j] + if i == j { 1e-6 } else { 0.0 };
            assert!((s - want).abs() < 1e-12);
        }
    }
}

#[test]
fn downdate_equals_reconditioning() {
    let (x, y) = data(10, 5);
    let gp = gp_fit(&x, 2, &y);
    let g = grid(2);
    let m = g.len() / 2;
    let mut c = posterior_cov(&gp, &g);
    let (picks, _) = greedy_batch(&mut c, m, gp.sn2, 3, IMSE);
    let mut x3 = x.clone();
    let mut y3 = y.clone();
    for &j in &picks {
        x3.extend_from_slice(&g[2 * j..2 * j + 2]);
        y3.push(0.0);
    }
    let gp3 = gp_build(&x3, 2, &y3, &gp.ell, gp.sf2, gp.sn2);
    let c3 = posterior_cov(&gp3, &g);
    let worst = c.iter().zip(&c3).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
    assert!(worst < 1e-7, "max |difference| {worst}");
}

#[test]
fn lhs_has_one_point_per_slice() {
    let n = 12;
    let x = lhs_maximin(&mut Rng::new(5, 0), n, 2, 50);
    for i in 0..2 {
        let mut s: Vec<usize> = (0..n).map(|k| (x[k * 2 + i] * n as f64) as usize).collect();
        s.sort();
        assert_eq!(s, (0..n).collect::<Vec<_>>());
    }
}

#[test]
fn imse_beats_random_on_average() {
    // Not a proof, a smoke test of the whole loop: median over 9 seeds at the budget.
    let med = |s: usize| {
        let mut v: Vec<f64> = (1..10).map(|seed| run_session(3, s, 8, 4, 32, 5.0, seed, false).0.last().unwrap().nrmse).collect();
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        v[4]
    };
    let (r, i) = (med(RANDOM), med(IMSE));
    assert!(i < r, "IMSE {i} vs random {r}");
}
