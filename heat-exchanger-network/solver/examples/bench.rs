//! Simulated annealing on the literature benchmarks: SEEDS chains in parallel
//! threads, EPOCHS epochs; every epoch after the first restarts all chains from
//! the best network so far at a lower start temperature (as the page does).
//!   cargo run --release --example bench -- ITERS SEEDS [filter] [EPOCHS]
//! Writes ../benchmarks/sa_results.json
use hen::*;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let iters: usize = args.get(1).map(|s| s.parse().unwrap()).unwrap_or(5000);
    let seeds: u32 = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(8);
    let filter = args.get(3).cloned().unwrap_or_default();
    let epochs: usize = args.get(4).map(|s| s.parse().unwrap()).unwrap_or(1);
    let text = std::fs::read_to_string("bench_inputs.txt").unwrap();
    let mut out = Vec::new();
    for line in text.lines().filter(|l| l.contains(&filter)) {
        let (name, flat) = line.split_once(" | ").unwrap();
        let v: Vec<f64> = flat.split_whitespace().map(|t| t.parse().unwrap()).collect();
        let model = Model::from_flat(&v);
        let t0 = Instant::now();
        let mut start: Option<Net> = None;
        let mut res: Vec<(u32, Option<(f64, Net, Vec<f64>)>, usize)> = Vec::new();
        let mut all_evals = 0;
        for ep in 0..epochs {
            let handles: Vec<_> = (1..=seeds).map(|s| {
                let m = model.clone();
                let st = start.clone();
                let seed = s + 1000 * ep as u32;
                let t0 = if ep == 0 { 0.05 } else { 0.01 };
                std::thread::spawn(move || {
                    let r = anneal(&m, iters, seed, st, t0, 1e-4, 200);
                    (seed, r.best.map(|b| (b.tac, b.net, b.x)), r.evals)
                })
            }).collect();
            let mut ep_res: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
            all_evals += ep_res.iter().map(|r| r.2).sum::<usize>();
            res.append(&mut ep_res);
            let best = res.iter().filter_map(|r| r.1.as_ref()).fold(None, |a: Option<&(f64, Net, Vec<f64>)>, b| match a {
                Some(x) if x.0 <= b.0 => Some(x), _ => Some(b) });
            start = best.map(|b| b.1.clone());
            println!("  epoch {}: best {:.1}", ep + 1, best.map(|b| b.0).unwrap_or(f64::NAN));
        }
        let secs = t0.elapsed().as_secs_f64();
        let tacs: Vec<f64> = res.iter().map(|r| r.1.as_ref().map(|b| b.0).unwrap_or(f64::INFINITY)).collect();
        let (bi, _) = tacs.iter().enumerate().fold((0, f64::INFINITY), |a, (i, &t)| if t < a.1 { (i, t) } else { a });
        let (tac, net, x) = res[bi].1.clone().unwrap();
        let evals = all_evals;
        println!("{name}: best {tac:.1} (seed {}), all {:?}, {evals} NLPs in {secs:.1} s", res[bi].0,
                 tacs.iter().map(|t| t.round()).collect::<Vec<_>>());
        let ms: Vec<String> = net.matches.iter().map(|(i, j, k)| format!("[{i},{j},{k}]")).collect();
        let xs: Vec<String> = x.iter().map(|v| format!("{v:?}")).collect();
        let ts: Vec<String> = tacs.iter().map(|v| format!("{v:?}")).collect();
        out.push(format!("{{\"problem\": {name:?}, \"iters\": {iters}, \"seeds\": {seeds}, \"best_seed\": {}, \
            \"epochs\": {epochs}, \"tac\": {tac:?}, \"all_tac\": [{}], \"net\": {{\"matches\": [{}], \"hu\": {:?}, \"cu\": {:?}}}, \"x\": [{}], \
            \"evals\": {evals}, \"seconds\": {secs:?}, \"stages\": {}}}", res[bi].0, ts.join(","), ms.join(","),
            net.hu, net.cu, xs.join(","), model.k));
    }
    let path = format!("../benchmarks/sa_results{}.json", if filter.is_empty() { String::new() } else { "_partial".into() });
    std::fs::write(&path, format!("[\n{}\n]\n", out.join(",\n"))).unwrap();
    println!("wrote {path}");
}
