//! Reference values for the Python parity test:
//!   cd python && python make_ref_inputs.py
//!   cd solver && cargo run --release --example dump      -> solver/ref.json
use hen::*;
use std::fmt::Write as _;

fn nums(s: &str) -> Vec<f64> {
    s.split_whitespace().map(|t| t.parse().unwrap()).collect()
}

fn arr(v: &[f64]) -> String {
    let parts: Vec<String> = v.iter().map(|x| format!("{:?}", x)).collect();
    format!("[{}]", parts.join(", "))
}

fn main() {
    let text = std::fs::read_to_string("ref_inputs.txt").expect("run python/make_ref_inputs.py first");
    let mut cases = Vec::new();
    let mut anneals = Vec::new();
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        let parts: Vec<&str> = line.split(" | ").collect();
        if let Some(name) = parts[0].strip_prefix("ANNEAL ") {
            let model = Model::from_flat(&nums(parts[1]));
            let p = nums(parts[2]);
            let r = anneal(&model, p[0] as usize, p[1] as u32, None, 0.05, 1e-4, 200);
            let b = r.best.expect("no feasible network");
            anneals.push(format!("{{\"problem\": {:?}, \"iters\": {}, \"seed\": {}, \"best_tac\": {:?}, \"evals\": {}}}",
                                 name, p[0] as usize, p[1] as u32, b.tac, r.evals));
            continue;
        }
        let model = Model::from_flat(&nums(parts[1]));
        let net = Net::from_flat(&nums(parts[2]), model.nh, model.nc);
        let x = nums(parts[3]);
        let t = nums(parts[4]);
        let ev = evaluate(&model, &net, &x, t[0], t[1], t[2], true, false);
        let opt = optimize_loads(&model, &net, None, None, 200);
        let mut s = String::new();
        let ms: Vec<String> = net.matches.iter().map(|(i, j, k)| format!("[{}, {}, {}]", i, j, k)).collect();
        write!(s, "{{\"problem\": {:?}, \"net\": {{\"matches\": [{}], \"hu\": {:?}, \"cu\": {:?}}}, \"x\": {}, \
                   \"tau\": {:?}, \"mu\": {:?}, \"scale\": {:?}, \"phi\": {:?}, \"grad\": {}, \"opt_tac\": {:?}, \"opt_x\": {}}}",
               parts[0], ms.join(", "), net.hu, net.cu, arr(&x), t[0], t[1], t[2], ev.phi, arr(&ev.grad),
               opt.tac, arr(&opt.x)).unwrap();
        cases.push(s);
    }
    let out = format!("{{\"cases\": [\n{}\n], \"anneal\": [\n{}\n]}}\n", cases.join(",\n"), anneals.join(",\n"));
    std::fs::write("ref.json", out).unwrap();
    println!("wrote ref.json ({} cases, {} anneal runs)", cases.len(), anneals.len());
}
