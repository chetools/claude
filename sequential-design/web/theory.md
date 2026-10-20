## 1. The task

A response $y$ depends on $d$ inputs ($d = 1$ or $2$ here), scaled to $0 \le x_i \le 1$. You can afford a **budget** of $N$
experiments ("runs"), and every measurement carries noise. The goal is a **global model**: one that predicts the response
well over the *whole* input range, not just near an optimum.

Runs are made in **batches**. A session starts with $n_0$ runs chosen before anything is known, then repeats:

1. fit a model to all runs so far;
2. let a **strategy** choose the next batch of $b$ runs;
3. run them, and go back to 1, until $N$ runs have been made.

The page compares four strategies by how good the final model is.

### Measuring "good"

All error measures use a fixed grid $G$ of $M$ points: 201 evenly spaced points in 1-D, $31 \times 31 = 961$ in 2-D. The
**normalized root-mean-square error** of a model with predictions $\mu$ is

$$\text{nRMSE} = \frac{\sqrt{\tfrac1M \sum_{j \in G} \big(\mu(\mathbf x_j) - f(\mathbf x_j)\big)^2}}{\operatorname{std}_G f},$$

where $f$ is the noise-free true function and $\operatorname{std}_G f$ its standard deviation over the grid. A value of 1 means the
model is no better than predicting the average everywhere; 0 is perfect. Because nRMSE needs $f$, only the simulation can
compute it. The model's **own** error estimate uses its predictive standard deviation $s(\mathbf x)$ instead:
$\sqrt{\tfrac1M \sum_j s(\mathbf x_j)^2} \,/\, \operatorname{std}_G f$.

## 2. The hidden true processes

| Name | $d$ | Function (physical inputs) | Input range |
|---|---|---|---|
| Forrester | 1 | $f = (6x-2)^2 \sin(12x-4)$ | $0 \le x \le 1$ |
| Gramacy & Lee | 1 | $f = \dfrac{\sin(10\pi x)}{2x} + (x-1)^4$ | $0.5 \le x \le 2.5$ |
| Reactor (1-D) | 1 | yield of B at $T = 350$ K | $0 \le \tau \le 100$ s |
| Branin | 2 | $f = \left(x_2 - \tfrac{5.1}{4\pi^2}x_1^2 + \tfrac5\pi x_1 - 6\right)^2 + 10\left(1-\tfrac1{8\pi}\right)\cos x_1 + 10$ | $-5 \le x_1 \le 10$, $0 \le x_2 \le 15$ |
| Forrester, $x_2$ inert | 2 | Forrester in $x_1$; $x_2$ has no effect | $0 \le x_1, x_2 \le 1$ |
| Reactor (2-D) | 2 | yield of B | $330 \le T \le 380$ K, $5 \le \tau \le 100$ s |

**Reactor.** First-order reactions in series, A $\to$ B $\to$ C, in an isothermal plug-flow (or batch) reactor with residence
time $\tau$ and no B in the feed. Solving $\mathrm d c_A/\mathrm d\tau = -k_1 c_A$, $\mathrm d c_B/\mathrm d\tau = k_1 c_A - k_2 c_B$
gives the yield of B (in % of the A fed)

$$Y_B = 100\,\frac{k_1}{k_2 - k_1}\left(e^{-k_1 \tau} - e^{-k_2 \tau}\right), \qquad
k_i = k_{i,\mathrm{ref}} \exp\!\left[-\frac{E_i}{R}\left(\frac1T - \frac1{350\ \mathrm K}\right)\right],$$

with $k_{1,\mathrm{ref}} = 0.05\ \mathrm{s^{-1}}$, $E_1/R = 6000$ K, $k_{2,\mathrm{ref}} = 0.02\ \mathrm{s^{-1}}$, $E_2/R = 9000$ K.
(The tests check this formula against numerical integration of the two rate equations.)

**Noise.** Each run returns $y = f(\mathbf x) + \varepsilon$ with $\varepsilon$ normally distributed, mean 0 and standard deviation
$\sigma = (\text{noise \%} / 100) \operatorname{std}_G f$.

## 3. The model: a Gaussian process

A Gaussian process (GP) puts a probability distribution on the unknown function. Any set of function values is jointly
normal, with covariance given by a **covariance function** $k$. We use the Matérn 5/2 covariance with one length scale per input:

$$k(\mathbf x, \mathbf x') = \sigma_f^2 \left(1 + s + \tfrac{s^2}{3}\right) e^{-s}, \qquad
s = \sqrt5 \sqrt{\textstyle\sum_{i=1}^{d} (x_i - x_i')^2 / \ell_i^2}.$$

$\sigma_f$ sets the size of the function's variation and $\ell_i$ the distance (in scaled units) over which it changes in
input $i$. A long $\ell_i$ makes the model nearly flat in that input, so the fit can "switch off" an input that has no
effect (try the problem with $x_2$ inert and watch the second length scale).

**Data.** The measured values are standardized, $\tilde y = (y - \bar y)/s_y$, with $\bar y$ and $s_y$ their mean and standard
deviation; the GP describes $\tilde y$ with mean zero. With runs $X = (\mathbf x_1, \dots, \mathbf x_n)$ and noise variance
$\sigma_n^2$ (also in standardized units),

$$K = k(X, X) + (\sigma_n^2 + 10^{-8}) I = L L^{\mathsf T} \quad \text{(Cholesky)}, \qquad \boldsymbol\alpha = K^{-1} \tilde{\mathbf y}.$$

The small $10^{-8}$ keeps the factorization stable. At a new point $\mathbf x$, with $\mathbf k_* = k(X, \mathbf x)$ and
$\mathbf v = L^{-1} \mathbf k_*$, the prediction and its variance (back in the units of $y$) are

$$\mu(\mathbf x) = \bar y + s_y\, \mathbf k_*^{\mathsf T} \boldsymbol\alpha, \qquad
s^2(\mathbf x) = s_y^2 \left(\sigma_f^2 - \mathbf v^{\mathsf T} \mathbf v\right).$$

This is the variance of the true function at $\mathbf x$ (not of a new noisy measurement).

### Fitting the hyperparameters

The $d + 2$ hyperparameters $\boldsymbol\theta = (\ln \ell_1, \dots, \ln \ell_d, \ln \sigma_f, \ln \sigma_n)$ minimize the negative log
marginal likelihood

$$\mathrm{NLL}(\boldsymbol\theta) = \tfrac12\, \tilde{\mathbf y}^{\mathsf T} \boldsymbol\alpha + \textstyle\sum_i \ln L_{ii} + \tfrac n2 \ln 2\pi,$$

(the middle term is $\tfrac12 \ln\det K$). Its gradient is

$$\frac{\partial\, \mathrm{NLL}}{\partial \theta_k} = \tfrac12 \sum_{p,q} W_{pq} \frac{\partial K_{pq}}{\partial \theta_k}, \qquad
W = K^{-1} - \boldsymbol\alpha \boldsymbol\alpha^{\mathsf T},$$

with $\partial K/\partial \ln \sigma_f = 2\, k(X, X)$, $\partial K / \partial \ln \sigma_n = 2 \sigma_n^2 I$, and, differentiating the
Matérn formula ($s$ depends on $\ell_i$ through $s^2 = 5\sum_i (\Delta x_i/\ell_i)^2$),

$$\frac{\partial k}{\partial \ln \ell_i} = \sigma_f^2\, \tfrac53 (1 + s)\, e^{-s} \left(\frac{x_i - x_i'}{\ell_i}\right)^2 .$$

The tests compare this gradient with finite differences.

Each $\theta_k$ is kept inside a box, $\ell_i \in [0.02, 5]$, $\sigma_f \in [0.1, 10]$, $\sigma_n \in [10^{-3}, 1]$, by optimizing an
unconstrained $z_k$ with $\theta_k = \mathrm{lo}_k + (\mathrm{hi}_k - \mathrm{lo}_k)\, \tfrac12 \left(1 + \tanh \tfrac{z_k}{2}\right)$.
The minimizer is BFGS: step along $-H\nabla$, where $H$ approximates the inverse Hessian; halve the step until the NLL drops by at least
$10^{-4}$ of the predicted decrease; then update

$$H \leftarrow \left(I - \rho\, \mathbf s \mathbf q^{\mathsf T}\right) H \left(I - \rho\, \mathbf q \mathbf s^{\mathsf T}\right) + \rho\, \mathbf s \mathbf s^{\mathsf T},
\qquad \rho = 1 / \mathbf q^{\mathsf T} \mathbf s,$$

with $\mathbf s$ the step and $\mathbf q$ the change in gradient. It stops when every gradient component is below $10^{-5}$ (at most 200
iterations). Three starts, $\ell_i = 0.1$, $0.3$ and $1$ (with $\sigma_f = 1$, $\sigma_n = 0.1$), guard against local minima; the lowest
NLL wins. The tests check that the result is at least as good as scipy's L-BFGS-B.

When a length scale ends on its bound, the likelihood is nearly flat in that direction. With very few runs this often comes with a
large $\sigma_n$: the model explains the data as noise.

## 4. Choosing runs

### Space-filling designs

A **Latin hypercube** of $n$ points divides each input range into $n$ equal slices and puts one point in each slice of every input
(random order, random position within the slice). A **maximin** Latin hypercube is the best of 50 random ones by the largest
minimum distance between two points. Every session's initial design is a maximin Latin hypercube of $n_0$ points.

* **Random**: each new run is uniform over the input range.
* **One-shot LHS**: no sequential learning. A one-shot design is planned for a known total, so at each total $N$ the design is a fresh
  maximin Latin hypercube of $N$ points.

### Adaptive designs on the grid

The adaptive strategies pick grid points. They use the GP's **posterior covariance** between all grid points (standardized units):

$$C = k(G, G) - V^{\mathsf T} V, \qquad V = L^{-1} k(X, G).$$

Its diagonal $C_{jj}$ is the predictive variance at grid point $j$.

**Effect of one more run.** Suppose a run is added at grid point $j$, with noise variance $\sigma_n^2$. Conditioning the joint normal
distribution of the function values on this extra noisy observation gives the new covariance

$$C'_{rs} = C_{rs} - \frac{C_{rj}\, C_{js}}{C_{jj} + \sigma_n^2} .$$

It does **not** depend on the value that will be measured, only on where the run is.

* **Max variance** picks $j$ with the largest $C_{jj}$.
* **IMSE** (integrated mean squared error) picks $j$ with the largest drop in the grid-averaged variance:

$$\Delta_j = \frac1M \sum_{r} \left(C_{rr} - C'_{rr}\right) = \frac1M\, \frac{\sum_r C_{rj}^2}{C_{jj} + \sigma_n^2} .$$

The tests check $\Delta_j$ against adding the point to the data and recomputing the average variance.

**Batches.** Because $C'$ does not need the measured value, a batch is built greedily before any of it is run: pick $j$, apply the
update above (a rank-one change, $C \leftarrow C - \mathbf u \mathbf u^{\mathsf T}$ with $\mathbf u = C_{:,j}/\sqrt{C_{jj} + \sigma_n^2}$),
pick again. The hyperparameters stay fixed within a batch and are refitted after the batch is run. A grid point may be chosen
more than once (a replicate) if its score is still the highest.

## 5. What the simulation keeps fixed

For a given seed, all four strategies share the initial design and the noise on it. The comparison tab repeats the session for seeds
$1, 2, \dots$ and reports, at each number of runs, the median and the 25th and 75th percentiles of the nRMSE over the seeds.
