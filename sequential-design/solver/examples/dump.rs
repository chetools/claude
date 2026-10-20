//! Reference values for the Python parity test (python/test_sdl.py):
//!     cargo run --release --example dump > ref.json
use sdl::*;

fn main() {
    let mut cases = Vec::new();
    for truth in 0..N_TRUTHS {
        let d = truth_dim(truth);
        let (n0, b, budget) = if d == 1 { (4, 2, 14) } else { (8, 4, 28) };
        for strategy in 0..4 {
            for seed in [1u64, 2] {
                let (rounds, _) = run_session(truth, strategy, n0, b, budget, 5.0, seed, true);
                let rs: Vec<String> = rounds.iter().map(|r| {
                    format!("{{\"n\":{},\"nrmse\":{:e},\"est\":{:e},\"ell\":{:?},\"nll\":{:e},\"sf\":{:e},\"sn\":{:e},\"next\":{:?}}}",
                            r.n, r.nrmse, r.est, r.ell, r.nll, r.sf, r.sn, r.next)
                }).collect();
                cases.push(format!("{{\"truth\":{},\"strategy\":{},\"n0\":{},\"batch\":{},\"budget\":{},\"seed\":{},\"rounds\":[{}]}}",
                                   truth, strategy, n0, b, budget, seed, rs.join(",")));
            }
        }
    }
    let mut r = Rng::new(7, 3);
    let u: Vec<String> = (0..5).map(|_| format!("{:e}", r.uniform())).collect();
    println!("{{\"uniform_7_3\":[{}],\"cases\":[{}]}}", u.join(","), cases.join(",\n"));
}
