"""The step-by-step breakdown shown in the page's Python tab and generated
into the MoLab notebook (make_molab.py).  Each cell: a title, an explanation
(Markdown + LaTeX) and code.  Cells share one namespace, run in order, and
read their inputs from USER_INPUTS; figure(traces, **layout) shows a chart.
marimo rule: every global name is defined in exactly one cell (use _names
for loop variables and temporaries)."""

DEFAULT_INPUTS = dict(truth="forrester", strategy="imse", n0=4, batch=2, budget=16, noise_pct=5.0, seed=1)

CELLS = [
    dict(title="The hidden process and the grid", md=r"""
The **true process** $f(\mathbf x)$ is what the experiments measure. The designer never sees it; we use
it only to *score* the model afterwards. Inputs are scaled to $[0, 1]$.

The **grid** $G$ plays two roles: its points are the **candidates** for the next experiment, and it is
where we **measure the error** of the model (the average over the grid approximates the average over
the whole input range). It has 201 points in 1-D and $31 \times 31 = 961$ in 2-D.

`field()` turns values on the grid into a chart trace: a line in 1-D, a heat map in 2-D.
""", code=r'''
import numpy as np
import sdl

truth = USER_INPUTS["truth"]
T = sdl.TRUTHS[truth]
G = sdl.grid(T["d"])        # candidates for the next run = points where the error is measured
f_grid = T["f"](G)          # the true response on the grid (hidden from the designer)
print(T["name"], "|", T["d"], "input(s) |", len(G), "grid points")
print(f"true response over the grid: mean {f_grid.mean():.4g}, standard deviation {f_grid.std():.4g}")


def field(values, name, **style):
    """Chart trace of grid values: a line in 1-D, a heat map in 2-D."""
    if T["d"] == 1:
        return dict(type="scatter", x=G[:, 0].tolist(), y=np.asarray(values).tolist(), name=name, **style)
    return dict(type="heatmap", x=G[:31, 0].tolist(), y=G[::31, 1].tolist(),
                z=np.asarray(values).reshape(31, 31).tolist(), name=name, **style)


figure([field(f_grid, "true f", line=dict(color="#31333f"))],
       title="The hidden true function (scaled inputs)", xaxis=dict(title="x₁"),
       yaxis=dict(title="f" if T["d"] == 1 else "x₂"))
'''),

    dict(title="The initial design: a maximin Latin hypercube", md=r"""
Before any model exists, the first $n_0$ runs can only aim to **cover** the input space.

A **Latin hypercube** cuts each input's range into $n_0$ equal slices and puts exactly one point in each
slice, so every input is explored over its whole range. Among 50 random Latin hypercubes,
`lhs_maximin` keeps the one whose two closest points are farthest apart (**maximin**), so no two runs are wasted
close together.

Each experiment returns the true value plus Gaussian **measurement noise** with standard deviation
$\sigma = (\text{noise \%}/100) \times \mathrm{std}(f)$.

Random numbers come from `sdl.Rng`, a 10-line generator that Rust reproduces exactly, so both languages
make the same design.
""", code=r'''
seed, n0 = USER_INPUTS["seed"], USER_INPUTS["n0"]
X0 = sdl.lhs_maximin(sdl.Rng(seed, 0), n0, T["d"])
sigma = USER_INPUTS["noise_pct"] / 100 * f_grid.std()       # noise standard deviation
rng_noise = sdl.Rng(seed, 1)
y0 = T["f"](X0) + sigma * np.array([rng_noise.normal() for _ in range(n0)])
print(f"noise standard deviation sigma = {sigma:.4g}")
print("initial design (scaled inputs) and measured responses:")
for _x, _y in zip(X0, y0):
    print("  x =", np.round(_x, 3), "  y =", round(float(_y), 4))

_runs = dict(type="scatter", mode="markers", x=X0[:, 0].tolist(),
             y=(y0 if T["d"] == 1 else X0[:, 1]).tolist(), name="runs",
             marker=dict(color="#ff4b4b", size=10, line=dict(color="white", width=1)))
figure([field(f_grid, "true f", line=dict(color="#808495", dash="dash")), _runs],
       title=f"Initial design: {n0} runs", xaxis=dict(title="x₁"), yaxis=dict(title="y" if T["d"] == 1 else "x₂"))
'''),

    dict(title="The Gaussian process model and its covariance", md=r"""
A **Gaussian process** (GP) treats the unknown function as random, with values at any two points
correlated more strongly the closer the points are. The correlation is set by a **covariance function**.
We use the Matérn 5/2 covariance:

$$k(\mathbf x, \mathbf x') = \sigma_f^2 \left(1 + s + \tfrac{s^2}{3}\right) e^{-s}, \qquad
s = \sqrt{5}\,\sqrt{\sum_i \frac{(x_i - x_i')^2}{\ell_i^2}}$$

* $\sigma_f$ is the typical size of the function's variation;
* $\ell_i$ is the **length scale** of input $i$, the distance over which the function changes appreciably. Each input
  has its own (*automatic relevance determination*): an input with no effect gets a very long $\ell_i$.

The plot shows how the correlation decays with distance for three length scales.
""", code=r'''
dist = np.linspace(0, 1, 101)[:, None]
figure([dict(type="scatter", x=dist[:, 0].tolist(),
             y=sdl.matern52(dist, np.zeros((1, 1)), np.array([_l]), 1.0)[:, 0].tolist(), name=f"ℓ = {_l}")
        for _l in (0.1, 0.3, 1.0)],
       title="Matérn 5/2 correlation vs distance", xaxis=dict(title="distance |x − x′|"),
       yaxis=dict(title="k / σ_f²"))
'''),

    dict(title="Fitting the model: maximum likelihood", md=r"""
The GP has $d + 2$ unknowns, the hyperparameters $\ell_1, \dots, \ell_d$, $\sigma_f$ and the noise $\sigma_n$. They are chosen to make
the measured data most probable, by minimizing the **negative log marginal likelihood**
(with $y$ standardized to mean 0 and standard deviation 1)

$$\mathrm{NLL} = \tfrac12\, \mathbf y^{\mathsf T} K^{-1} \mathbf y + \tfrac12 \log\det K + \tfrac n2 \log 2\pi,
\qquad K = k(X, X) + \sigma_n^2 I .$$

The first term rewards fitting the data, the second penalizes overly flexible models. `nll_grad`
also returns the exact gradient; `bfgs` (a quasi-Newton method, written out in `sdl.py`)
follows it downhill from three starting length scales, and `gp_fit` keeps the best result.

The chart scans the first length scale, holding the other hyperparameters at their fitted values: the fit sits at the minimum.

**Few runs, odd fits.** With only a handful of runs the likelihood cannot always tell signal from noise. If the fitted
$\sigma_n$ printed below is much larger than the true $\sigma$ (and $\ell$ is very short), the model has explained the
data as noise. It usually recovers as runs are added (watch the length scales in the App).
""", code=r'''
gp = sdl.gp_fit(X0, y0)
print("length scale(s) l       :", np.round(gp["ell"], 4))
print(f"signal std   sigma_f    : {np.sqrt(gp['sf2']) * gp['ys']:.4g}")
print(f"noise std    sigma_n    : {np.sqrt(gp['sn2']) * gp['ys']:.4g}   (true sigma = {sigma:.4g})")
print(f"negative log likelihood : {gp['nll']:.4f}")

_lo, _hi = sdl.bounds(T["d"])
theta_hat = np.r_[np.log(gp["ell"]), 0.5 * np.log(gp["sf2"]), 0.5 * np.log(gp["sn2"])]
scan_ell = np.exp(np.linspace(_lo[0] + 0.01, _hi[0] - 0.01, 80))
_yz = (y0 - gp["ym"]) / gp["ys"]
scan_nll = [sdl.nll_grad(sdl.to_z(np.r_[np.log(_l), theta_hat[1:]], T["d"]), X0, _yz)[0] for _l in scan_ell]
figure([dict(type="scatter", x=scan_ell.tolist(), y=scan_nll, name="NLL"),
        dict(type="scatter", mode="markers", x=[float(gp["ell"][0])], y=[gp["nll"]], name="fit",
             marker=dict(color="#ff4b4b", size=11))],
       title="Likelihood scan over the first length scale", xaxis=dict(title="ℓ₁", type="log"),
       yaxis=dict(title="negative log likelihood"))
'''),

    dict(title="Predictions and their uncertainty", md=r"""
With the hyperparameters fixed, the GP gives at every grid point a **prediction** (posterior mean) and an
**uncertainty** (posterior standard deviation). With $\mathbf k_*$ the covariances between a new point and the
runs, and $K = L L^{\mathsf T}$ (Cholesky factorization):

$$\mu(\mathbf x) = \bar y + s_y\, \mathbf k_*^{\mathsf T} K^{-1} \mathbf y, \qquad
\mathrm{var}(\mathbf x) = s_y^2 \left(\sigma_f^2 - \lVert L^{-1} \mathbf k_* \rVert^2\right),$$

where $\bar y$ and $s_y$ are the mean and standard deviation used to standardize the data.
The uncertainty is small near the runs and grows away from them. It does **not** depend on the
measured values, only on where the runs are; this is what makes batch selection possible below.
""", code=r'''
mean, var = sdl.gp_predict(gp, G)
sd = np.sqrt(var)
if T["d"] == 1:
    _x = G[:, 0].tolist()
    figure([dict(type="scatter", x=_x + _x[::-1], y=(mean + 2 * sd).tolist() + (mean - 2 * sd).tolist()[::-1],
                 fill="toself", fillcolor="rgba(31,119,180,0.18)", line=dict(width=0), name="± 2 sd"),
            field(f_grid, "true f", line=dict(color="#808495", dash="dash")),
            field(mean, "GP mean", line=dict(color="#1f77b4")),
            dict(type="scatter", mode="markers", x=X0[:, 0].tolist(), y=y0.tolist(), name="runs",
                 marker=dict(color="#ff4b4b", size=9))],
           title="GP prediction after the initial design", xaxis=dict(title="x"), yaxis=dict(title="y"))
else:
    figure([field(mean, "GP mean", colorscale="Viridis")], title="GP mean", xaxis=dict(title="x₁"),
           yaxis=dict(title="x₂"))
    figure([field(sd, "GP sd", colorscale="Blues"),
            dict(type="scatter", mode="markers", x=X0[:, 0].tolist(), y=X0[:, 1].tolist(), name="runs",
                 marker=dict(color="#ff4b4b", size=9))],
           title="GP standard deviation (uncertainty)", xaxis=dict(title="x₁"), yaxis=dict(title="x₂"))
'''),

    dict(title="How good is the model?", md=r"""
The goal is a **global** model: small error *everywhere*, not just at one optimum. We score it by the
root-mean-square error over the grid, divided by the standard deviation of the true function
(**normalized RMSE**; 0 is perfect, 1 is no better than predicting the average):

$$\text{nRMSE} = \frac{\sqrt{\operatorname{mean}_G (\mu - f)^2}}{\operatorname{std}_G f} .$$

This needs the hidden truth, so a real experimenter cannot compute it. What they *can* compute is the
model's own estimate, the root-mean-square posterior standard deviation (same normalization). Comparing the two
shows whether the GP knows how wrong it is.
""", code=r'''
nrmse = np.sqrt(np.mean((mean - f_grid) ** 2)) / f_grid.std()
est = np.sqrt(np.mean(var)) / f_grid.std()
print(f"true normalized RMSE           : {nrmse:.4f}")
print(f"GP's own estimate (RMS sd/std) : {est:.4f}")
'''),

    dict(title="Choosing the next batch", md=r"""
The adaptive strategies use the **posterior covariance** between all grid points,
$C = K(G, G) - V^{\mathsf T} V$ with $V = L^{-1} K(X, G)$ (in standardized units). Its diagonal is the variance.

* **Max variance**: run the next experiment where the model is least certain, $\arg\max_j C_{jj}$.
* **IMSE** (integrated mean squared error): run it where it **reduces the average variance over the grid the most**.
  An experiment at grid point $j$ (noise $\sigma_n^2$) lowers the variance at every grid point $r$ by
  $C_{rj}^2 / (C_{jj} + \sigma_n^2)$, so its score is
  $$\Delta_j = \frac{1}{M}\, \frac{\sum_r C_{rj}^2}{C_{jj} + \sigma_n^2} .$$

Variance is usually highest at the **edges** of the input range, where there are no neighbouring runs, so max variance
is drawn there; but a run on the edge informs only the region on one side of it. IMSE scores the information a run spreads
over the whole grid. The cell counts how many picks of each batch lie on the edge for the current inputs.

**Batches.** Because the variance does not depend on the measured values, we can pick a whole batch before
running it: after each pick, update $C \leftarrow C - \mathbf u \mathbf u^{\mathsf T}$ with
$\mathbf u = C_{:,j} / \sqrt{C_{jj} + \sigma_n^2}$ (exactly the effect of that run, see the tests), then pick again.
""", code=r'''
C = sdl.posterior_cov(gp, G)
b = min(USER_INPUTS["batch"], USER_INPUTS["budget"] - n0)
picks_mv, score_mv = sdl.greedy_batch(C, gp["sn2"], b, "maxvar")
picks_im, score_im = sdl.greedy_batch(C, gp["sn2"], b, "imse")
print("next batch, max variance:", np.round(G[picks_mv], 3).tolist())
print("next batch, IMSE        :", np.round(G[picks_im], 3).tolist())
on_edge = lambda p: int(np.sum(np.any((G[p] == 0) | (G[p] == 1), axis=1)))
print(f"picks on the edge of the range: max variance {on_edge(picks_mv)} of {b}, IMSE {on_edge(picks_im)} of {b}")
if T["d"] == 1:
    figure([field(score_mv / score_mv.max(), "max variance score", line=dict(color="#ff7f0e")),
            field(score_im / score_im.max(), "IMSE score", line=dict(color="#2ca02c")),
            dict(type="scatter", mode="markers", x=X0[:, 0].tolist(), y=[0] * n0, name="runs so far",
                 marker=dict(color="#ff4b4b", size=9))],
           title="Scores of the first pick (each scaled to max 1)", xaxis=dict(title="x"), yaxis=dict(title="score"))
else:
    for _s, _p, _name in ((score_mv, picks_mv, "Max variance"), (score_im, picks_im, "IMSE")):
        figure([field(_s, _name, colorscale="Greens"),
                dict(type="scatter", mode="markers+text", x=G[_p, 0].tolist(), y=G[_p, 1].tolist(),
                     text=[str(_k + 1) for _k in range(b)], textposition="top center", name="batch",
                     marker=dict(color="#ff4b4b", size=11, symbol="x"))],
               title=f"{_name}: score of the first pick and the batch", xaxis=dict(title="x₁"),
               yaxis=dict(title="x₂"))
'''),

    dict(title="The whole loop, and the four strategies", md=r"""
`run_session` repeats *fit → score → choose a batch → run it* until the budget is spent, for any of the four strategies:

* **Random**: batch points drawn uniformly. Ignores the model.
* **One-shot LHS**: no sequential learning at all. A design has to be planned for a known total, so at each total $N$ we use a
  fresh maximin Latin hypercube of $N$ points (the design you would have run had your budget been $N$).
* **Max variance** and **IMSE**: the adaptive strategies of the previous step.

All four start from the same initial design and see the same noise on it. The chart shows one session each (this seed only;
the App's *Compare strategies* tab repeats this over many seeds, because a single session is noisy).
""", code=r'''
curves = {}
for _s in sdl.STRATEGIES:
    _rounds = sdl.run_session(truth, _s, n0, USER_INPUTS["batch"], USER_INPUTS["budget"],
                              USER_INPUTS["noise_pct"], seed, keep=False)
    curves[_s] = ([_r["n"] for _r in _rounds], [_r["nrmse"] for _r in _rounds])
    print(f"{_s:7s}: nRMSE at {curves[_s][0][-1]} runs = {curves[_s][1][-1]:.4f}")
figure([dict(type="scatter", x=curves[_s][0], y=curves[_s][1], name=_s, mode="lines+markers")
        for _s in sdl.STRATEGIES],
       title="Learning curves, one seed", xaxis=dict(title="runs"), yaxis=dict(title="nRMSE", type="log"))
'''),
]
