// HEN page core: problem set-up, costs, utility prices, the compiled model
// for the Rust solver, and the LP/MILP formulations for HiGHS.  No DOM, so
// node can test it against python/hen.py (python/test_js_core.py).
//
// Every function mirrors the hen.py function of the same (camelCased) name.
'use strict';

function makeCore(C) {
  const LAW_POWER = 0, LAW_SEIDER = 1, LAW_TURTON = 2;
  const SEIDER_FM = new Map(C.SEIDER_FM.map(([s, t, a, b]) => [s + '/' + t, [a, b]]));
  const PAIRS = C.SEIDER_FM.map(([s, t]) => [s, t]);

  // ------------------------------------------------------------ costs
  function seiderPressureFactor(p) { const x = p / 100; return 0.9803 + 0.018 * x + 0.0017 * x * x; }
  function turtonPressureFactor(p) {
    if (p < 5) return 1;
    const y = Math.log10(p), [c1, c2, c3] = C.TURTON_C;
    return 10 ** (c1 + c2 * y + c3 * y * y);
  }
  function unitCost(kind, p, A) {
    if (kind === LAW_POWER) {
      const [cf, cv, beta, mult] = p;
      if (A <= 0) return [mult * cf, 0];
      return [mult * (cf + cv * A ** beta), mult * cv * beta * A ** (beta - 1)];
    }
    if (kind === LAW_SEIDER) {
      const [c0, c1, c2, scale, fbm, flp, a, b] = p;
      let Af = A * C.M2_TO_FT2;
      const clamp = Af < 150;
      if (clamp) Af = 150;
      const L = Math.log(Af), cb = Math.exp(c0 + c1 * L + c2 * L * L), fm = a + (Af / 100) ** b;
      const c = scale * cb * (fbm + flp * fm - 1);
      if (clamp) return [c, 0];
      const dcb = cb * (c1 + 2 * c2 * L) / Af;
      const dfm = b !== 0 ? b * (Af / 100) ** (b - 1) / 100 : 0;
      return [c, scale * (dcb * (fbm + flp * fm - 1) + cb * flp * dfm) * C.M2_TO_FT2];
    }
    const [k1, k2, k3, scale, b1, bfp, amin] = p;
    const clamp = A < amin, Am = clamp ? amin : A, x = Math.log10(Am);
    const cp = 10 ** (k1 + k2 * x + k3 * x * x), c = scale * cp * (b1 + bfp);
    if (clamp) return [c, 0];
    return [c, scale * (b1 + bfp) * cp * (k2 + 2 * k3 * x) / Am];
  }
  function capitalRecoveryFactor(i, n) {
    if (i === 0) return 1 / n;
    const g = (1 + i) ** n;
    return i * g / (g - 1);
  }
  const lawKind = (law) => ({power: LAW_POWER, seider: LAW_SEIDER, turton: LAW_TURTON})[law.kind];
  function materialPairs(accA, accB, kind) {
    const out = [];
    for (const [shell, tube] of PAIRS) {
      if (accA.includes(tube) && accB.includes(tube) && (accA.includes(shell) || accB.includes(shell))) {
        if (kind === LAW_TURTON && (!(shell in C.TURTON_FM) || !(tube in C.TURTON_FM))) continue;
        out.push([shell, tube]);
      }
    }
    return out;
  }
  function lawParams(law, pair, mult) {
    if (law.kind === 'power') return [LAW_POWER, [law.cf, law.cv, law.beta, mult, 0, 0, 0, 0]];
    if (law.kind === 'seider') {
      const [c0, c1, c2] = C.SEIDER_CB[law.type || 'floating head'];
      const [a, b] = SEIDER_FM.get(pair[0] + '/' + pair[1]);
      const flp = C.SEIDER_LENGTH_FACTOR[String(law.tube_ft ?? 20)] * seiderPressureFactor(law.p_psig ?? 0);
      const scale = law.annual * law.cepci / C.SEIDER_CE * mult;
      return [LAW_SEIDER, [c0, c1, c2, scale, law.fbm ?? 3.17, flp, a, b]];
    }
    const [k1, k2, k3] = C.TURTON_K, [b1, b2] = C.TURTON_B;
    const bfp = b2 * C.TURTON_FM[pair[1]] * turtonPressureFactor(law.p_barg ?? 0);
    const scale = law.annual * law.cepci / C.TURTON_CE * mult;
    return [LAW_TURTON, [k1, k2, k3, scale, b1, bfp, 10, 0]];
  }
  function cheapestPair(law, pairs, mult, Aref = 100) {
    let best = null;
    for (const pr of pairs) {
      const [kind, p] = lawParams(law, pr, mult);
      const c = unitCost(kind, p, Aref)[0];
      if (best === null || c < best[0]) best = [c, pr];
    }
    return best ? best[1] : null;
  }

  // ------------------------------------------------------------ utility prices
  function steamProps(T) {
    const tab = C.STEAM_TABLE;
    if (!(tab[0][0] <= T && T <= tab[tab.length - 1][0]))
      throw new Error(`steam table covers ${tab[0][0]}-${tab[tab.length - 1][0]} C, got ${T}`);
    for (let k = 0; k + 1 < tab.length; k++) {
      const [t0, f0, g0] = tab[k], [t1, f1, g1] = tab[k + 1];
      if (T <= t1) { const w = (T - t0) / (t1 - t0); return [f0 + w * (f1 - f0), g0 + w * (g1 - g0)]; }
    }
  }
  function utilityPrice(kind, Tin, Tout, pr) {
    const E_GJ = pr.hours * 3600 / 1e6;
    const fuelGJ = (pr.fuel + pr.co2 * pr.ef_gas / 1000) / C.MMBTU_GJ;
    const elec = pr.elec + pr.co2 * pr.ef_elec / 1000;
    if (kind === 'steam') {
      const [hf, hg] = steamProps(Tin);
      const fph = (hg - C.H_FEEDWATER) / (hg - hf) / pr.eta_boiler;
      const kgPerGJ = 1e6 / (hg - hf);
      return [E_GJ * (fuelGJ * fph + pr.steam_water * kgPerGJ / 1000),
        `fuel × ${fph.toFixed(3)} GJ/GJ (boiler + sensible heat) + water`];
    }
    if (kind === 'furnace') return [E_GJ * fuelGJ / pr.eta_furnace, 'fuel / furnace efficiency'];
    if (kind === 'cw') {
      const dT = Math.abs(Tout - Tin), m = 1 / (4.18 * dT);
      const pump = m * 9.81 * pr.cw_head / pr.eta_pump / 1000;
      const makeup = (1 / 2400) * pr.cycles / (pr.cycles - 1);
      const m3 = makeup * pr.hours * 3600 / 1000;
      return [(pump + pr.fan) * pr.hours * elec + m3 * (pr.water + pr.chem), 'pump + fan power, makeup water and chemicals'];
    }
    if (kind === 'refrig') {
      const Te = Tin + 273.15 - 5, Tc = pr.T_cond + 273.15, cop = pr.cop_frac * Te / (Tc - Te);
      return [pr.hours * elec / cop, `electricity / COP (COP = ${cop.toFixed(2)})`];
    }
    if (kind === 'seawater') {
      const dT = Math.abs(Tout - Tin), m = 1 / (4.18 * dT);
      return [m * 9.81 * pr.cw_head / pr.eta_pump / 1000 * pr.hours * elec, 'pump power (once-through)'];
    }
    throw new Error(kind);
  }

  // ------------------------------------------------------------ problems
  const powerLaw = (cf, cv, beta) => ({kind: 'power', cf, cv, beta});
  function seiderLaw(o = {}) {
    return {kind: 'seider', type: o.type || 'floating head', cepci: o.cepci ?? 800, p_psig: o.p_psig ?? 150,
      tube_ft: o.tube_ft ?? 20, fbm: 3.17, annual: o.annual ?? capitalRecoveryFactor(0.10, 10)};
  }
  function benchmark(name) {
    const B = C.BENCHMARKS[name];
    const s = (rows, pre) => rows.map(([a, b, f, h], n) => ({name: `${pre}${n + 1}`, Tin: a, Tout: b, F: f, h}));
    const u = (rows, pre) => rows.map(([a, b, h, c], n) => ({name: `${pre}${n + 1}`, Tin: a, Tout: b, h, cost: c}));
    return {name, hot: s(B.hot, 'H'), cold: s(B.cold, 'C'), hu: u(B.hu, 'HU'), cu: u(B.cu, 'CU'), emat: B.emat,
      law: powerLaw(...B.law), stages: B.stages ?? null};
  }
  function illustrative(name, prices) {
    const pr = Object.assign({}, C.DEFAULT_PRICES, prices || {});
    const D = C.ILLUSTRATIVE[name];
    const s = (t) => t.map(([n, a, b, f, h, m, note]) => ({name: n, Tin: a, Tout: b, F: f, h, mat: m.slice(), note}));
    const ut = (t) => t.map(([n, k, a, b, h, m]) => ({name: n, kind: k, Tin: a, Tout: b, h, mat: m.slice(),
      cost: utilityPrice(k, a, b, pr)[0]}));
    const hot = s(D.hot), cold = s(D.cold);
    const forbid = hot.map((hs) => cold.map((cs) => D.forbid.some(([a, b]) => a === hs.name && b === cs.name)));
    return {name, hot, cold, hu: ut(D.hu), cu: ut(D.cu), emat: D.emat, law: seiderLaw(), forbid,
      mult: hot.map(() => cold.map(() => 1.0)), stages: D.stages ?? null, description: D.description};
  }

  const DEFAULT_CASE = 'Oxidation unit: oxygen vs hydrocarbons (illustrative)';
  function makeLaw(law) {
    const annual = capitalRecoveryFactor(law.rate, law.years);
    if (law.kind === 'seider') return seiderLaw({cepci: law.cepci, annual, p_psig: law.p_psig, tube_ft: law.tube_ft, type: law.type});
    if (law.kind === 'turton') return {kind: 'turton', cepci: law.cepci, annual, p_barg: law.p_barg};
    throw new Error(law.kind);
  }
  /** Mirror of hen.problem_from_inputs. */
  function problemFromInputs(inp) {
    const kase = inp.case || DEFAULT_CASE;
    const prices = Object.assign({}, C.DEFAULT_PRICES, inp.prices || {});
    const p = kase in C.BENCHMARKS ? benchmark(kase) : illustrative(kase, prices);
    if (inp.emat !== undefined && inp.emat !== null) p.emat = inp.emat;
    if (inp.stages) p.stages = inp.stages;
    if (inp.law && inp.law.kind !== 'paper') p.law = makeLaw(inp.law);
    for (const key of ['forbid', 'mult', 'material']) if (inp[key] !== undefined && inp[key] !== null) p[key] = inp[key];
    return p;
  }

  function overallU(h1, h2) { return 1 / (1 / h1 + 1 / h2); }

  /** Mirror of hen.Model: allowed matches, materials, cost parameters, utility options. */
  function compileModel(prob) {
    const hot = prob.hot, cold = prob.cold, nH = hot.length, nC = cold.length;
    const K = prob.stages || Math.max(nH, nC), emat = prob.emat, law = prob.law, kind = lawKind(law);
    const forbid = prob.forbid || hot.map(() => cold.map(() => false));
    const mult = prob.mult || hot.map(() => cold.map(() => 1.0));
    const override = prob.material || {};
    const acc = (s) => s.mat || C.MATERIALS;
    const M = {nH, nC, K, emat, allowed: [], reason: [], U: [], kind: [], par: [], pair: [], cool: [], heat: [],
      Qh: hot.map((s) => s.F * (s.Tin - s.Tout)), Qc: cold.map((s) => s.F * (s.Tout - s.Tin))};
    for (let i = 0; i < nH; i++) {
      const ok = [], why = [], U = [], kd = [], pa = [], pp = [];
      for (let j = 0; j < nC; j++) {
        let good = true, w = '', pr = null;
        if (forbid[i][j]) { good = false; w = 'forbidden'; } else {
          const pairs = materialPairs(acc(hot[i]), acc(cold[j]), kind);
          const key = `${i},${j}`;
          if (key in override) {
            pr = override[key];
            if (!pairs.some((q) => q[0] === pr[0] && q[1] === pr[1])) { good = false; w = 'material not compatible'; }
          } else if (!pairs.length) { good = false; w = 'no common material'; } else pr = cheapestPair(law, pairs, mult[i][j]);
          if (good && !(hot[i].Tin - cold[j].Tin > emat + 1e-9)) { good = false; w = 'no driving force'; }
        }
        ok.push(good); why.push(w); U.push(overallU(hot[i].h, cold[j].h));
        const [k, p] = good ? lawParams(law, pr || ['CS', 'CS'], mult[i][j]) : [0, [0, 0, 0, 0, 0, 0, 0, 0]];
        kd.push(k); pa.push(p); pp.push(pr);
      }
      M.allowed.push(ok); M.reason.push(why); M.U.push(U); M.kind.push(kd); M.par.push(pa); M.pair.push(pp);
    }
    for (let i = 0; i < nH; i++) {
      const opts = [];
      prob.cu.forEach((cu, u) => {
        if (hot[i].Tout - cu.Tin >= emat - 1e-9 && hot[i].Tin - cu.Tout > emat + 1e-9) {
          const pairs = materialPairs(acc(hot[i]), acc(cu), kind);
          if (pairs.length) {
            const pr = cheapestPair(law, pairs, 1.0), [k, p] = lawParams(law, pr, 1.0);
            opts.push({u, U: overallU(hot[i].h, cu.h), kind: k, par: p, Tin: cu.Tin, Tout: cu.Tout, cost: cu.cost, pair: pr});
          }
        }
      });
      M.cool.push(opts);
    }
    for (let j = 0; j < nC; j++) {
      const opts = [];
      prob.hu.forEach((hu, u) => {
        if (hu.Tin - cold[j].Tout >= emat - 1e-9 && hu.Tout - cold[j].Tin > emat + 1e-9) {
          const pairs = materialPairs(acc(cold[j]), acc(hu), kind);
          if (pairs.length) {
            const pr = cheapestPair(law, pairs, 1.0), [k, p] = lawParams(law, pr, 1.0);
            opts.push({u, U: overallU(cold[j].h, hu.h), kind: k, par: p, Tin: hu.Tin, Tout: hu.Tout, cost: hu.cost, pair: pr});
          }
        }
      });
      M.heat.push(opts);
    }
    M.flat = flattenModel(M, prob);
    return M;
  }
  function flattenModel(M, prob) {
    const v = [M.nH, M.nC, M.K, M.emat];
    for (const s of prob.hot) v.push(s.Tin, s.Tout, s.F);
    for (const s of prob.cold) v.push(s.Tin, s.Tout, s.F);
    for (let i = 0; i < M.nH; i++) for (let j = 0; j < M.nC; j++)
      v.push(M.allowed[i][j] ? 1 : 0, M.U[i][j], M.kind[i][j], ...M.par[i][j]);
    for (const opts of M.cool.concat(M.heat)) {
      v.push(opts.length);
      for (const o of opts) v.push(o.u, o.U, o.kind, ...o.par, o.Tin, o.Tout, o.cost);
    }
    return v;
  }
  function flattenNet(net) {
    const v = [net.matches.length];
    for (const [i, j, k] of net.matches) v.push(i, j, k);
    return v.concat(net.hu, net.cu);
  }

  // ------------------------------------------------------------ LP / MILP (HiGHS)
  function intervals(prob) {
    const dT = prob.emat, edges = new Set();
    for (const s of prob.hot.concat(prob.hu)) { edges.add(s.Tin); edges.add(s.Tout); }
    for (const s of prob.cold.concat(prob.cu)) { edges.add(s.Tin + dT); edges.add(s.Tout + dT); }
    const b = [...edges].sort((x, y) => y - x), n = b.length - 1;
    function share(top, bot, cold) {
      const out = new Array(n).fill(0);
      if (top - bot < 1e-9) {
        for (let k = 0; k < n; k++)
          if ((!cold && Math.abs(b[k] - top) < 1e-9) || (cold && Math.abs(b[k + 1] - bot) < 1e-9)) { out[k] = 1; break; }
        return out;
      }
      for (let k = 0; k < n; k++) out[k] = Math.max(0, Math.min(b[k], top) - Math.max(b[k + 1], bot)) / (top - bot);
      return out;
    }
    const H = prob.hot.map((s) => share(s.Tin, s.Tout, false).map((f) => s.F * (s.Tin - s.Tout) * f));
    const Cc = prob.cold.map((s) => share(s.Tout + dT, s.Tin + dT, true).map((f) => s.F * (s.Tout - s.Tin) * f));
    const fHU = prob.hu.map((u) => share(Math.max(u.Tin, u.Tout), Math.min(u.Tin, u.Tout), false));
    const fCU = prob.cu.map((u) => share(Math.max(u.Tin, u.Tout) + dT, Math.min(u.Tin, u.Tout) + dT, true));
    return {T: b, n, H, C: Cc, fHU, fCU};
  }

  /** Expanded transshipment model as CPLEX-LP text (mirror of hen._transship_structure).
   *  mode 'lp': minimise utility cost; 'milp': fixed utility loads QH/QC, minimise sum w y. */
  function transshipLP(prob, allowed, mode, QH, QC, weights) {
    const iv = intervals(prob), nH = prob.hot.length, nC = prob.cold.length, n = iv.n;
    const nHU = prob.hu.length, nCU = prob.cu.length;
    const hotHas = [], coldHas = [];
    for (let a = 0; a < nH; a++) hotHas.push(iv.H[a].map((v) => v > 1e-12));
    for (let u = 0; u < nHU; u++) hotHas.push(iv.fHU[u].map((v) => v > 1e-12));
    for (let b = 0; b < nC; b++) coldHas.push(iv.C[b].map((v) => v > 1e-12));
    for (let v = 0; v < nCU; v++) coldHas.push(iv.fCU[v].map((x) => x > 1e-12));
    const first = hotHas.map((r) => { const k = r.findIndex((x) => x); return k < 0 ? n : k; });
    const pairOk = (a, b) => (a >= nH && b >= nC) ? false : (a < nH && b < nC) ? allowed[a][b] : true;
    const q = new Map(), R = new Set();
    for (let a = 0; a < nH + nHU; a++) for (let b = 0; b < nC + nCU; b++) if (pairOk(a, b))
      for (let k = 0; k < n; k++) if (coldHas[b][k] && k >= first[a]) q.set(`${a},${b},${k}`, `q_${a}_${b}_${k}`);
    for (let a = 0; a < nH + nHU; a++) for (let k = first[a]; k < n - 1; k++) R.add(`${a},${k}`);
    const num = (x) => (x >= 0 ? '+ ' : '- ') + String(Math.abs(x));
    const rows = [];
    for (let a = 0; a < nH + nHU; a++) for (let k = first[a]; k < n; k++) {
      const t = [];
      if (R.has(`${a},${k - 1}`)) t.push(`- R_${a}_${k - 1}`);
      if (R.has(`${a},${k}`)) t.push(`+ R_${a}_${k}`);
      for (let b = 0; b < nC + nCU; b++) if (q.has(`${a},${b},${k}`)) t.push(`+ q_${a}_${b}_${k}`);
      if (a < nH) rows.push([t, iv.H[a][k]]);
      else { t.push(`${num(-iv.fHU[a - nH][k])} QH_${a - nH}`); rows.push([t, 0]); }
    }
    for (let b = 0; b < nC + nCU; b++) for (let k = 0; k < n; k++) {
      if (!coldHas[b][k]) continue;
      const t = [];
      for (let a = 0; a < nH + nHU; a++) if (q.has(`${a},${b},${k}`)) t.push(`+ q_${a}_${b}_${k}`);
      if (b < nC) rows.push([t, iv.C[b][k]]);
      else { t.push(`${num(-iv.fCU[b - nC][k])} QC_${b - nC}`); rows.push([t, 0]); }
    }
    const lines = [];
    const wrap = (terms) => { const out = []; for (let s = 0; s < terms.length; s += 8) out.push(' ' + terms.slice(s, s + 8).join(' ')); return out.join('\n'); };
    const pairs = [];
    if (mode === 'lp') {
      const obj = [];
      prob.hu.forEach((h, u) => obj.push(`${num(h.cost)} QH_${u}`));
      prob.cu.forEach((h, v) => obj.push(`${num(h.cost)} QC_${v}`));
      lines.push('Minimize', ' obj: ' + (obj.length ? '' : '0 QH_0'), wrap(obj));
    } else {
      const seen = new Set();
      for (const key of q.keys()) { const [a, b] = key.split(',').map(Number); const pk = `${a},${b}`; if (!seen.has(pk)) { seen.add(pk); pairs.push([a, b]); } }
      pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const obj = pairs.map(([a, b]) => `${num(weights ? (weights[`${a},${b}`] ?? 1) : 1)} y_${a}_${b}`);
      lines.push('Minimize', ' obj:', wrap(obj));
    }
    lines.push('Subject To');
    rows.forEach(([t, r], c) => { lines.push(` e${c}:`); lines.push(wrap(t)); lines.push(` = ${r}`); });
    if (mode === 'milp') {
      const totH = iv.H.map((r) => r.reduce((s, v) => s + v, 0)).concat(QH);
      const totC = iv.C.map((r) => r.reduce((s, v) => s + v, 0)).concat(QC);
      pairs.forEach(([a, b], p) => {
        const t = [];
        for (let k = 0; k < n; k++) if (q.has(`${a},${b},${k}`)) t.push(`+ q_${a}_${b}_${k}`);
        t.push(`- ${Math.min(totH[a], totC[b])} y_${a}_${b}`);
        lines.push(` L${p}:`); lines.push(wrap(t)); lines.push(' <= 0');
      });
    }
    lines.push('Bounds');
    if (mode === 'milp') {
      QH.forEach((v, u) => lines.push(` QH_${u} = ${v}`));
      QC.forEach((v, u) => lines.push(` QC_${u} = ${v}`));
      pairs.forEach(([a, b]) => lines.push(` 0 <= y_${a}_${b} <= 1`));
      lines.push('General', wrap(pairs.map(([a, b]) => `y_${a}_${b}`)));
    }
    lines.push('End');
    return {text: lines.join('\n') + '\n', iv, pairs, q, nH, nC};
  }

  /** Read a HiGHS solution of transshipLP. */
  function readLP(sol, f, prob) {
    const col = (name) => (sol.Columns[name] ? sol.Columns[name].Primal : 0);
    const QH = prob.hu.map((_, u) => col(`QH_${u}`)), QC = prob.cu.map((_, v) => col(`QC_${v}`));
    const out = {status: sol.Status, objective: sol.ObjectiveValue, QH, QC, matches: []};
    for (const [a, b] of f.pairs) {
      if (col(`y_${a}_${b}`) > 0.5) {
        let load = 0, tm = 0;
        for (let k = 0; k < f.iv.n; k++) {
          const v = col(`q_${a}_${b}_${k}`);
          load += v; tm += v * 0.5 * (f.iv.T[k] + f.iv.T[k + 1]);
        }
        out.matches.push({hot: a, cold: b, load, Tmean: tm / Math.max(load, 1e-12)});
      }
    }
    return out;
  }

  /** Mirror of hen.network_from_matches: each MILP process match in its own stage. */
  function networkFromMatches(prob, milp) {
    const nH = prob.hot.length, nC = prob.cold.length;
    const proc = milp.matches.filter((m) => m.hot < nH && m.cold < nC).sort((x, y) => y.Tmean - x.Tmean);
    const prob2 = Object.assign({}, prob, {stages: Math.max(1, proc.length)});
    const model = compileModel(prob2);
    const matches = proc.map((m, k) => [m.hot, m.cold, k]), x0 = proc.map((m) => m.load);
    const hu = new Array(nC).fill(-1), cu = new Array(nH).fill(-1);
    for (let j = 0; j < nC; j++) {
      const used = milp.matches.filter((m) => m.hot >= nH && m.cold === j);
      if (used.length) {
        const u = used.reduce((a, b) => (b.load > a.load ? b : a)).hot - nH, opts = model.heat[j].map((o) => o.u);
        hu[j] = opts.includes(u) ? opts.indexOf(u) : (opts.length ? 0 : -1);
      } else if (model.heat[j].length) hu[j] = 0;
    }
    for (let i = 0; i < nH; i++) {
      const used = milp.matches.filter((m) => m.cold >= nC && m.hot === i);
      if (used.length) {
        const u = used.reduce((a, b) => (b.load > a.load ? b : a)).cold - nC, opts = model.cool[i].map((o) => o.u);
        cu[i] = opts.includes(u) ? opts.indexOf(u) : (opts.length ? 0 : -1);
      } else if (model.cool[i].length) cu[i] = 0;
    }
    return {prob: prob2, model, net: {matches, hu, cu}, x0};
  }

  return {LAW_POWER, LAW_SEIDER, LAW_TURTON, unitCost, capitalRecoveryFactor, materialPairs, lawParams,
    cheapestPair, steamProps, utilityPrice, powerLaw, seiderLaw, benchmark, illustrative, compileModel,
    makeLaw, problemFromInputs, DEFAULT_CASE,
    flattenModel, flattenNet, intervals, transshipLP, readLP, networkFromMatches, seiderPressureFactor,
    turtonPressureFactor};
}

if (typeof module !== 'undefined') module.exports = {makeCore};
