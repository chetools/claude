//! cargo test --release
use hen::*;

fn h2c2() -> Model {
    // flat model of "H2C2 (Escobar & Trierweiler)", copied from ref_inputs.txt
    let text = std::fs::read_to_string("ref_inputs.txt").expect("run python/make_ref_inputs.py");
    let line = text.lines().find(|l| l.starts_with("H2C2 (Escobar")).unwrap();
    let v: Vec<f64> = line.split(" | ").nth(1).unwrap().split_whitespace().map(|t| t.parse().unwrap()).collect();
    Model::from_flat(&v)
}

#[test]
fn mulberry32_matches_javascript() {
    let mut r = Mulberry32::new(1);
    let v: Vec<u32> = (0..4).map(|_| r.next_u32()).collect();
    assert_eq!(v, vec![2693262067, 11749833, 2265367787, 4213581821]);
}

#[test]
fn lmtd_derivatives() {
    for &(a, b) in &[(30.0, 10.0), (10.0, 30.0), (20.0, 20.00001), (5.0, 50.0)] {
        let (_, la, lb) = lmtd(a, b);
        let h = 1e-4;
        let fa = (lmtd(a + h, b).0 - lmtd(a - h, b).0) / (2.0 * h);
        let fb = (lmtd(a, b + h).0 - lmtd(a, b - h).0) / (2.0 * h);
        assert!((la - fa).abs() < 1e-7 && (lb - fb).abs() < 1e-7, "{a} {b}");
    }
}

#[test]
fn unit_cost_derivatives() {
    let laws: [(usize, [f64; 8]); 3] = [
        (LAW_POWER, [4000.0, 500.0, 0.83, 1.2, 0.0, 0.0, 0.0, 0.0]),
        (LAW_SEIDER, [12.031, -0.8709, 0.09005, 0.23, 3.17, 1.01, 5.2, 0.16]),
        (LAW_TURTON, [4.8306, -0.8509, 0.3187, 0.3, 1.63, 1.78, 10.0, 0.0]),
    ];
    for (kind, p) in laws.iter() {
        for &a in &[20.0, 150.0, 900.0] {
            let (_, d) = unit_cost(*kind, p, a);
            let h = 1e-4 * a;
            let f = (unit_cost(*kind, p, a + h).0 - unit_cost(*kind, p, a - h).0) / (2.0 * h);
            assert!((d - f).abs() <= 1e-6 * f.abs().max(1e-9), "{kind} {a}: {d} vs {f}");
        }
    }
}

#[test]
fn gradient_matches_finite_differences() {
    let m = h2c2();
    let net = Net { matches: vec![(0, 0, 1), (0, 1, 0), (1, 0, 0), (1, 1, 1)], hu: vec![-1, 0], cu: vec![0, 0] };
    let x = start_point(&m, &net, 0.05);
    for &(tau, mu) in &[(0.0, 0.0), (1e-3, 100.0)] {
        let ev = evaluate(&m, &net, &x, tau, mu, 1e5, true, false);
        assert!(ev.ok);
        for k in 0..x.len() {
            let h = 1e-5 * x[k];
            let mut xp = x.clone();
            let mut xm = x.clone();
            xp[k] += h;
            xm[k] -= h;
            let f = (evaluate(&m, &net, &xp, tau, mu, 1e5, false, false).phi
                - evaluate(&m, &net, &xm, tau, mu, 1e5, false, false).phi) / (2.0 * h);
            assert!((ev.grad[k] - f).abs() <= 1e-5 * f.abs(), "{k}: {} vs {f}", ev.grad[k]);
        }
    }
}

#[test]
fn chang_global_optimum_h2c2() {
    // Chang et al. (2020): 360,037 $/yr for the isothermal-mixing stage model.
    let m = h2c2();
    let net = Net { matches: vec![(0, 0, 1), (0, 1, 0), (1, 0, 0)], hu: vec![-1, 0], cu: vec![-1, 0] };
    let r = optimize_loads(&m, &net, None, None, 200);
    assert!(r.feasible);
    assert!((r.tac - 360037.0).abs() < 0.5, "{}", r.tac);
}

#[test]
fn annealing_finds_the_h2c2_optimum() {
    let m = h2c2();
    let best = (1..=8).map(|s| anneal(&m, 1500, s, None, 0.05, 1e-4, 200).best.unwrap().tac)
        .fold(f64::INFINITY, f64::min);
    assert!((best - 360037.0).abs() < 1.0, "{best}");
}

#[test]
fn composite_curves_balance_the_problem_table() {
    let m = h2c2();
    let (qh, qc, _, cascade) = problem_table(&m);
    let hot: f64 = m.qh.iter().sum();
    let cold: f64 = m.qc.iter().sum();
    assert!((qh - qc - (cold - hot)).abs() < 1e-9);
    assert!(cascade.iter().all(|&c| c >= -1e-9));
    let (_, hh) = composite(&m.th_in, &m.th_out, &m.fh);
    assert!((hh[hh.len() - 1] - hot).abs() < 1e-9);
}
