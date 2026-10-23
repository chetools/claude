r"""**P13 · Pumped two-loop network.** Unknowns: the pump flow $Q_p$ and the piezometric heads $H_B, H_C, H_D$
(heads $H = z + p/\rho g$; velocity heads are neglected at the nodes, so $p = \rho g (H - z)$).

**Step 1: one pipe.** For a pipe with length $L$, diameter $D$, roughness $\varepsilon$ and minor-loss sum $\sum K$
(entrances, bends, valves, exit) carrying $Q$, with $V = Q/(\pi D^2/4)$:
$$ h_f = \Big(f\frac{L}{D} + \sum K\Big)\frac{V^2}{2g}, \qquad
\frac{1}{\sqrt f} = -2\log_{10}\!\Big(\frac{\varepsilon/D}{3.7} + \frac{2.51}{Re\sqrt f}\Big), \quad Re = \frac{\rho V D}{\mu}. $$
The head loss and $f$ depend on each other. Given a head difference $\Delta H$ we find the flow by iterating
$V = \sqrt{2g|\Delta H|/(fL/D + \sum K)}$ and $f(Re)$ until $f$ stops changing. Flow goes from high head to low head.
Every pipe has its own $D$, $\varepsilon$ and $K$, so every pipe has its own $f$.

**Step 2: the pump.** The pump adds $H_p = H_0 - kQ_p^2$ to the water that flows through the suction pipe.
The suction-tank surface (head $z_S$, open to the atmosphere) loses $h_{f,s}(Q_p)$ in the suction pipe, so the head at the
pump inlet is $z_S - h_{f,s}$ and the head at the pump outlet (node A) is $H_A = z_S - h_{f,s}(Q_p) + H_0 - kQ_p^2$.
The pump curve is a function of the pump flow only, not of the demand or of the delivery pipe.

**Step 3: continuity at nodes.** With signed flows $Q_i(\Delta H)$ in the pipes (positive in the direction drawn in the figure
of the statement; internal pipe 3 may carry flow either way):
$$ Q_p = Q_1 + Q_2,\quad Q_1 = Q_3 + Q_4 + q_B,\quad Q_2 + Q_3 = Q_5,\quad Q_4 + Q_5 = Q_6, $$
where pipe 6 carries the flow from node D into the elevated tank (head $z_T$, exit loss included in its $K$).
That is 4 nonlinear equations in $Q_p, H_B, H_C, H_D$.

**Step 4: solve.** Newton's method with a finite-difference Jacobian and a step-halving line search
(small Gaussian elimination written out below, no libraries).

**Step 5: results.** (a) $Q_p$; (b) $H_p = H_0 - kQ_p^2$; (c) $Q_3$ with its direction; (d) $p_C = \rho g (H_C - z_C)$ gauge;
(e) shaft power $P = \rho g Q_p H_p/\eta$."""
import math
from common import colebrook_f, G

# pipes: (L m, D m, eps m, sum of K).  s = suction pipe, 1..6 = network pipes
INPUTS = dict(
    rho=998.2, mu=1.002e-3,
    pipes=dict(s=(30.0, 0.200, 0.045e-3, 1.4),
               p1=(300.0, 0.125, 0.26e-3, 4.0),
               p2=(450.0, 0.100, 0.045e-3, 8.0),
               p3=(200.0, 0.075, 0.15e-3, 3.0),
               p4=(350.0, 0.100, 0.26e-3, 2.0),
               p5=(400.0, 0.125, 0.045e-3, 5.0),
               p6=(150.0, 0.150, 0.045e-3, 1.0)),
    H0=80.0, k=12000.0, eta=0.70,
    zS=1.0, zT=14.0, zB=8.0, zC=4.0, zD=10.0, qB=0.016)


def loss(Q, pipe, rho, mu):
    """Head loss (m), signed like Q, in one pipe carrying Q (m^3/s)."""
    L, D, eps, K = pipe
    if Q == 0:
        return 0.0
    V = abs(Q) / (math.pi * D**2 / 4)
    f = colebrook_f(rho * V * D / mu, eps / D)
    return math.copysign((f * L / D + K) * V**2 / (2 * G), Q)


def flow(dH, pipe, rho, mu):
    """Signed flow (m^3/s) for a head drop dH (m) along the pipe: iterate V <-> f."""
    if dH == 0:
        return 0.0
    L, D, eps, K = pipe
    f = 0.02
    for _ in range(200):
        V = math.sqrt(2 * G * abs(dH) / (f * L / D + K))
        f_new = colebrook_f(rho * V * D / mu, eps / D)
        if abs(f_new - f) < 1e-14:
            break
        f = f_new
    return math.copysign(V * math.pi * D**2 / 4, dH)


def gauss(A, b):
    """Solve A x = b by Gaussian elimination with partial pivoting."""
    n = len(b)
    M = [row[:] + [bi] for row, bi in zip(A, b)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(M[r][i]))
        M[i], M[p] = M[p], M[i]
        for r in range(i + 1, n):
            c = M[r][i] / M[i][i]
            for j in range(i, n + 1):
                M[r][j] -= c * M[i][j]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))) / M[i][i]
    return x


def solve(rho, mu, pipes, H0, k, eta, zS, zT, zB, zC, zD, qB):
    # Step 2: pump outlet head as a function of the pump flow
    def HA(Qp):
        return zS - loss(Qp, pipes["s"], rho, mu) + H0 - k * Qp**2

    # Step 3: residuals of continuity at A, B, C, D; x = [Qp, HB, HC, HD]
    def flows(x):
        Qp, HB, HC, HD = x
        ha = HA(Qp)
        return dict(Q1=flow(ha - HB, pipes["p1"], rho, mu), Q2=flow(ha - HC, pipes["p2"], rho, mu),
                    Q3=flow(HB - HC, pipes["p3"], rho, mu), Q4=flow(HB - HD, pipes["p4"], rho, mu),
                    Q5=flow(HC - HD, pipes["p5"], rho, mu), Q6=flow(HD - zT, pipes["p6"], rho, mu))

    def resid(x):
        q = flows(x)
        return [x[0] - q["Q1"] - q["Q2"], q["Q1"] - q["Q3"] - q["Q4"] - qB,
                q["Q2"] + q["Q3"] - q["Q5"], q["Q4"] + q["Q5"] - q["Q6"]]

    # Step 4: Newton with finite-difference Jacobian and step halving
    x = [0.04, 0.5 * (zT + zS + H0), 0.5 * (zT + zS + H0), zT + 5.0]
    for _ in range(100):
        r = resid(x)
        nr = max(abs(v) for v in r)
        if nr < 1e-13:
            break
        J = [[0.0] * 4 for _ in range(4)]
        for j in range(4):
            d = 1e-7 * max(abs(x[j]), 1e-3)
            xp = x[:]
            xp[j] += d
            rp = resid(xp)
            for i in range(4):
                J[i][j] = (rp[i] - r[i]) / d
        dx = gauss(J, [-v for v in r])
        t = 1.0
        while t > 1e-6 and max(abs(v) for v in resid([xi + t * di for xi, di in zip(x, dx)])) > nr:
            t *= 0.5
        x = [xi + t * di for xi, di in zip(x, dx)]
    Qp, HB, HC, HD = x
    q = flows(x)
    # Step 5: results
    Hp = H0 - k * Qp**2
    return dict(a=Qp * 1e3, b=Hp, c=abs(q["Q3"]) * 1e3,
                c_direction="from B to C" if q["Q3"] > 0 else "from C to B",
                d=rho * G * (HC - zC) / 1e3, e=rho * G * Qp * Hp / eta / 1e3)
