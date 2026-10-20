//! Print a JSON list of reference results for the Python cross-check
//! (python/test_pbr.py):  cargo run --release --example dump > ref.json
use pbr::*;
fn main() {
    let base = oxylene_preset();
    let mut rows = Vec::new();
    for &one_d in &[false, true] {
        for &p0 in &[0.008, 0.011, 0.015, 0.017, 0.02] {
            for &tc in &[615.0, 625.0, 635.0] {
                let mut q = base.clone();
                q[p::P0] = p0;
                q[p::T_C] = tc;
                let mut cfg = default_config();
                cfg.one_d = one_d;
                let (gr, t0) = groups_from_dimensional(&q);
                let run = integrate(&gr, &cfg, |_, _| {});
                let (ts, dts, s, _) = sensitivity_dimensional(&q, &cfg, p::P0);
                rows.push(format!(
                    "{{\"one_d\":{},\"p0\":{},\"T_c\":{},\"T_star\":{:.12e},\"xi_star\":{:.12e},\"steps\":{},\"rejected\":{},\"x_out_axis\":{:.12e},\"dT_dp0\":{:.12e},\"s_p0\":{:.12e},\"T_star_ad\":{:.12e},\"theta_star\":{:.12e}}}",
                    one_d, p0, tc, t0 * (1.0 + run.theta_star / gr.gamma), run.xi_star, run.steps,
                    run.rejected, run.y_out[0], dts, s, ts, run.theta_star
                ));
            }
        }
    }
    println!("[{}]", rows.join(",\n"));
}
