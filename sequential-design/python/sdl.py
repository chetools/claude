"""Sequential design of experiments for a global model: the Python reference.

Readable numpy implementation of everything the page computes.  The Rust
solver (solver/src/lib.rs) implements the same functions, in the same order
and with the same names, and draws the same random numbers, so the two give
the same designs and agree to round-off.

Conventions
  d      number of inputs (1 or 2).  Inputs are scaled to [0, 1].
  X      experiments run so far, shape (n, d)
  y      measured responses, shape (n,)
  G      the grid: candidate points for the next experiment AND the points
         where the model error is measured, shape (M, d)
  f      the hidden true function (one of TRUTHS)
"""
import math

import numpy as np

# ---------------------------------------------------------------- random numbers
M64 = (1 << 64) - 1


class Rng:
    """SplitMix64 generator.  numpy's generators cannot be reproduced in Rust,
    so both languages use this tiny one and get identical random streams.
    `stream` separates independent uses of the same seed."""

    def __init__(self, seed, stream=0):
        self.s = (seed * 1000003 + stream) & M64

    def next_u64(self):
        self.s = (self.s + 0x9E3779B97F4A7C15) & M64
        z = self.s
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        return z ^ (z >> 31)

    def uniform(self):
        """Uniform on [0, 1)."""
        return (self.next_u64() >> 11) * 2.0 ** -53

    def normal(self):
        """Standard normal (Box-Muller)."""
        u1, u2 = self.uniform(), self.uniform()
        return math.sqrt(-2.0 * math.log(1.0 - u1)) * math.cos(2.0 * math.pi * u2)

    def permutation(self, n):
        """Random order of 0..n-1 (Fisher-Yates shuffle)."""
        p = list(range(n))
        for i in range(n - 1, 0, -1):
            j = int(self.uniform() * (i + 1))
            p[i], p[j] = p[j], p[i]
        return p


# ---------------------------------------------------------------- true functions
def forrester(u):
    """Forrester et al. (2008): (6u - 2)^2 sin(12u - 4) on [0, 1]."""
    return (6 * u - 2) ** 2 * np.sin(12 * u - 4)


def gramacy_lee(u):
    """Gramacy & Lee (2012) on x in [0.5, 2.5]: wiggly on the left, smooth on the right."""
    x = 0.5 + 2 * u
    return np.sin(10 * np.pi * x) / (2 * x) + (x - 1) ** 4


def reactor_yield(T, tau):
    """Yield of B [%] for A -> B -> C (first order, isothermal plug flow or batch).
    T in K, tau (residence time) in s.  k = k_ref exp(-E/R (1/T - 1/350 K))."""
    k1 = 0.05 * np.exp(-6000.0 * (1 / T - 1 / 350.0))
    k2 = 0.02 * np.exp(-9000.0 * (1 / T - 1 / 350.0))
    return 100 * k1 / (k2 - k1) * (np.exp(-k1 * tau) - np.exp(-k2 * tau))


def branin(u, v):
    """Branin-Hoo on x1 in [-5, 10], x2 in [0, 15]."""
    x1, x2 = -5 + 15 * u, 15 * v
    return ((x2 - 5.1 / (4 * np.pi ** 2) * x1 ** 2 + 5 / np.pi * x1 - 6) ** 2
            + 10 * (1 - 1 / (8 * np.pi)) * np.cos(x1) + 10)


# Each entry: number of inputs d, the function of scaled inputs X (n, d),
# and how to label the axes in physical units (lo, hi of each input).
TRUTHS = {
    "forrester": dict(d=1, f=lambda X: forrester(X[:, 0]),
                      name="Forrester (1-D)", xs=[("x", 0, 1)], ylab="f"),
    "gramacy_lee": dict(d=1, f=lambda X: gramacy_lee(X[:, 0]),
                        name="Gramacy & Lee (1-D)", xs=[("x", 0.5, 2.5)], ylab="f"),
    "reactor_1d": dict(d=1, f=lambda X: reactor_yield(350.0, 100 * X[:, 0]),
                       name="Reactor: yield vs residence time (1-D)",
                       xs=[("residence time τ [s]", 0, 100)], ylab="yield of B [%]"),
    "branin": dict(d=2, f=lambda X: branin(X[:, 0], X[:, 1]),
                   name="Branin (2-D)", xs=[("x₁", -5, 10), ("x₂", 0, 15)], ylab="f"),
    "inert": dict(d=2, f=lambda X: forrester(X[:, 0]),
                  name="Forrester in x₁, x₂ inert (2-D)", xs=[("x₁", 0, 1), ("x₂", 0, 1)], ylab="f"),
    "reactor_2d": dict(d=2, f=lambda X: reactor_yield(330 + 50 * X[:, 0], 5 + 95 * X[:, 1]),
                       name="Reactor: yield vs T and τ (2-D)",
                       xs=[("temperature T [K]", 330, 380), ("residence time τ [s]", 5, 100)],
                       ylab="yield of B [%]"),
}
TRUTH_IDS = list(TRUTHS)          # integer id used by the Rust solver = position here
STRATEGIES = ["random", "lhs", "maxvar", "imse"]


def grid(d):
    """The candidate / reference grid: 201 points in 1-D, 31 x 31 in 2-D
    (x1 varies fastest, so grid values reshape to (31, 31) as [x2, x1])."""
    if d == 1:
        return np.linspace(0, 1, 201)[:, None]
    g = np.linspace(0, 1, 31)
    x1, x2 = np.meshgrid(g, g)
    return np.column_stack([x1.ravel(), x2.ravel()])


# ---------------------------------------------------------------- Gaussian process
SQRT5 = math.sqrt(5.0)
JITTER = 1e-8


def matern52(A, B, ell, sf2):
    """Matern 5/2 covariance with one length scale per input (ARD).
    A (na, d), B (nb, d) -> (na, nb)."""
    D = (A[:, None, :] - B[None, :, :]) / ell
    s = SQRT5 * np.sqrt(np.sum(D ** 2, axis=-1))
    return sf2 * (1 + s + s ** 2 / 3) * np.exp(-s)


def bounds(d):
    """Search box for theta = [log l_1..log l_d, log sigma_f, log sigma_n]
    (standardized y, scaled x)."""
    lo = np.array([math.log(0.02)] * d + [math.log(0.1), math.log(1e-3)])
    hi = np.array([math.log(5.0)] * d + [math.log(10.0), math.log(1.0)])
    return lo, hi


def to_theta(z, d):
    """Unconstrained z -> theta inside the box (logistic map), and d theta / d z."""
    lo, hi = bounds(d)
    theta = lo + (hi - lo) * 0.5 * (1 + np.tanh(0.5 * z))
    return theta, (theta - lo) * (hi - theta) / (hi - lo)


def to_z(theta, d):
    lo, hi = bounds(d)
    p = (theta - lo) / (hi - lo)
    return np.log(p / (1 - p))


def nll_grad(z, X, y):
    """Negative log marginal likelihood of standardized data y and its
    gradient with respect to z.  Returns (inf, None) if K is not positive definite."""
    n, d = X.shape
    theta, dtheta = to_theta(z, d)
    ell, sf2, sn2 = np.exp(theta[:d]), math.exp(2 * theta[d]), math.exp(2 * theta[d + 1])
    D2 = ((X[:, None, :] - X[None, :, :]) / ell) ** 2          # (n, n, d)
    s = SQRT5 * np.sqrt(D2.sum(-1))
    e = np.exp(-s)
    Kf = sf2 * (1 + s + s ** 2 / 3) * e
    K = Kf + (sn2 + JITTER) * np.eye(n)
    try:
        L = np.linalg.cholesky(K)
    except np.linalg.LinAlgError:
        return math.inf, None
    alpha = np.linalg.solve(L.T, np.linalg.solve(L, y))
    nll = 0.5 * y @ alpha + np.sum(np.log(np.diag(L))) + 0.5 * n * math.log(2 * math.pi)
    # d nll / d theta_k = 0.5 * sum( (K^-1 - alpha alpha^T) * dK/dtheta_k )
    Kinv = np.linalg.solve(L.T, np.linalg.solve(L, np.eye(n)))
    W = Kinv - np.outer(alpha, alpha)
    g = np.empty(d + 2)
    common = sf2 * (5 / 3) * (1 + s) * e                       # dK/dlog l_i = common * D2_i
    for i in range(d):
        g[i] = 0.5 * np.sum(W * common * D2[:, :, i])
    g[d] = 0.5 * np.sum(W * 2 * Kf)                            # dK/dlog sigma_f = 2 Kf
    g[d + 1] = 0.5 * np.trace(W) * 2 * sn2                     # dK/dlog sigma_n = 2 sn2 I
    return nll, g * dtheta


def bfgs(fg, z0, iters=200, gtol=1e-5):
    """Minimize with BFGS and a backtracking (Armijo) line search.
    fg(z) -> (value, gradient).  Written out so that Rust can do exactly the same steps."""
    z = np.array(z0, float)
    f, g = fg(z)
    H = np.eye(len(z))                                         # inverse-Hessian estimate
    for _ in range(iters):
        if np.max(np.abs(g)) < gtol:
            break
        p = -H @ g
        if g @ p >= 0:                                         # not a descent direction: reset
            H = np.eye(len(z))
            p = -g
        a = 1.0
        while True:
            z1 = z + a * p
            f1, g1 = fg(z1)
            if f1 <= f + 1e-4 * a * (g @ p):
                break
            a *= 0.5
            if a < 1e-10:
                return z, f
        s, yv = z1 - z, g1 - g
        sy = s @ yv
        if sy > 1e-12:
            r = 1 / sy
            I = np.eye(len(z))
            H = (I - r * np.outer(s, yv)) @ H @ (I - r * np.outer(yv, s)) + r * np.outer(s, s)
        z, f, g = z1, f1, g1
    return z, f


def gp_fit(X, y):
    """Fit a GP to (X, y): standardize y, maximize the marginal likelihood
    from three starting length scales, keep the best."""
    d = X.shape[1]
    ym = float(np.mean(y))
    ys = float(np.std(y)) or 1.0
    yz = (y - ym) / ys
    best = None
    for ell0 in (0.1, 0.3, 1.0):
        z0 = to_z(np.array([math.log(ell0)] * d + [0.0, math.log(0.1)]), d)
        z, f = bfgs(lambda zz: nll_grad(zz, X, yz), z0)
        if best is None or f < best[1]:
            best = (z, f)
    theta, _ = to_theta(best[0], d)
    gp = gp_build(X, y, np.exp(theta[:d]), math.exp(2 * theta[d]), math.exp(2 * theta[d + 1]))
    gp["nll"] = best[1]
    return gp


def gp_build(X, y, ell, sf2, sn2):
    """GP conditioned on (X, y) with given hyperparameters (standardized units):
    the Cholesky factor L of K and alpha = K^-1 y."""
    ym = float(np.mean(y))
    ys = float(np.std(y)) or 1.0
    K = matern52(X, X, ell, sf2) + (sn2 + JITTER) * np.eye(len(X))
    L = np.linalg.cholesky(K)
    alpha = np.linalg.solve(L.T, np.linalg.solve(L, (y - ym) / ys))
    return dict(X=X, ym=ym, ys=ys, ell=np.asarray(ell, float), sf2=sf2, sn2=sn2, L=L, alpha=alpha)


def gp_predict(gp, G):
    """Posterior mean and variance of the true function at the points G
    (in the units of y)."""
    Ks = matern52(G, gp["X"], gp["ell"], gp["sf2"])            # (M, n)
    mean = gp["ym"] + gp["ys"] * (Ks @ gp["alpha"])
    V = np.linalg.solve(gp["L"], Ks.T)                         # (n, M)
    var = np.maximum(gp["sf2"] - np.sum(V ** 2, axis=0), 0.0)
    return mean, var * gp["ys"] ** 2


def posterior_cov(gp, G):
    """Posterior covariance of the (standardized) function between all grid
    points, C = K(G, G) - V^T V,  shape (M, M)."""
    V = np.linalg.solve(gp["L"], matern52(gp["X"], G, gp["ell"], gp["sf2"]))
    return matern52(G, G, gp["ell"], gp["sf2"]) - V.T @ V


# ---------------------------------------------------------------- designs
def lhs_maximin(rng, n, d, tries=50):
    """Latin hypercube of n points: each input's range is cut into n equal
    slices with one point per slice.  Of `tries` random ones, keep the one
    whose closest pair of points is farthest apart (maximin)."""
    best, best_dmin = None, -1.0
    for _ in range(tries):
        X = np.empty((n, d))
        for i in range(d):
            perm = rng.permutation(n)
            for k in range(n):
                X[k, i] = (perm[k] + rng.uniform()) / n
        D = np.sqrt(np.sum((X[:, None, :] - X[None, :, :]) ** 2, axis=-1))
        dmin = np.min(D[np.triu_indices(n, 1)]) if n > 1 else 1.0
        if dmin > best_dmin:
            best, best_dmin = X, dmin
    return best


def greedy_batch(C, sn2, b, rule):
    """Choose b grid points, one at a time.

    rule "maxvar": the point where the model is least certain (largest variance).
    rule "imse":   the point that most reduces the AVERAGE variance over the grid.
    After each choice the covariance is updated as if that experiment had been
    run (a rank-one downdate; it does not need the measured value).
    Returns the grid indices and the scores of the first choice."""
    C = C.copy()
    M = len(C)
    picks, first = [], None
    for _ in range(b):
        var = np.diag(C)
        if rule == "maxvar":
            score = var.copy()
        else:
            score = np.sum(C ** 2, axis=0) / (var + sn2) / M
        j = int(np.argmax(score))
        if first is None:
            first = score
        picks.append(j)
        u = C[:, j] / math.sqrt(C[j, j] + sn2)
        C -= np.outer(u, u)
    return picks, first


# ---------------------------------------------------------------- one session
def run_session(truth, strategy, n0, batch, budget, noise_pct, seed, keep=True):
    """Simulate a sequential design session.

    Start with an n0-point maximin LHS, then repeat: fit the GP, measure its
    true error on the grid, choose the next batch, run those experiments,
    until the budget is used.  Strategy "lhs" instead re-plans a one-shot
    LHS of the new size at every round (no learning from the data).
    Returns one record per round."""
    T = TRUTHS[truth]
    d, f = T["d"], T["f"]
    G = grid(d)
    fG = f(G)
    fstd = float(np.std(fG))
    sigma = noise_pct / 100 * fstd                            # noise standard deviation

    def experiment(X, rng):
        return f(X) + sigma * np.array([rng.normal() for _ in range(len(X))])

    rng_noise, rng_pick = Rng(seed, 1), Rng(seed, 2)
    X = lhs_maximin(Rng(seed, 0), n0, d)
    y = experiment(X, rng_noise)
    rounds = []
    while True:
        gp = gp_fit(X, y)
        mean, var = gp_predict(gp, G)
        rec = dict(n=len(X), nrmse=float(np.sqrt(np.mean((mean - fG) ** 2)) / fstd),
                   est=float(np.sqrt(np.mean(var)) / fstd),
                   ell=gp["ell"].tolist(), nll=gp["nll"], sf=math.sqrt(gp["sf2"]) * gp["ys"],
                   sn=math.sqrt(gp["sn2"]) * gp["ys"])
        if keep:
            rec.update(X=X.copy(), y=y.copy(), mean=mean, sd=np.sqrt(var), next=None, scores=None)
        rounds.append(rec)
        if len(X) >= budget:
            return rounds
        b = min(batch, budget - len(X))
        if strategy == "lhs":
            N = len(X) + b
            X = lhs_maximin(Rng(seed, 1000 + N), N, d)
            y = experiment(X, Rng(seed, 2000 + N))
            if keep:
                rec["next"] = X.copy()
            continue
        if strategy == "random":
            new = np.array([[rng_pick.uniform() for _ in range(d)] for _ in range(b)])
        else:
            idx, score = greedy_batch(posterior_cov(gp, G), gp["sn2"], b, strategy)
            new = G[idx]
            if keep:
                rec["scores"] = score
        if keep:
            rec["next"] = new.copy()
        X = np.vstack([X, new])
        y = np.concatenate([y, experiment(new, rng_noise)])
