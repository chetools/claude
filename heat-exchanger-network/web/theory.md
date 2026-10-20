## 1. The problem

Hot process streams $i$ must be cooled from $T^\text{in}_i$ to $T^\text{out}_i$ and cold streams $j$ heated from
$T^\text{in}_j$ to $T^\text{out}_j$; $F$ [kW/K] is the heat-capacity flow rate, so a stream's duty is
$Q = F\,|T^\text{in}-T^\text{out}|$. Heat goes from hot to cold streams in exchangers ("matches"); whatever is left is
supplied by hot utilities (steam, a fired heater) and removed by cold utilities (cooling water, seawater,
refrigeration). Every exchanger must keep a temperature difference of at least **EMAT** at both ends.
The target is the lowest **total annualised cost**,

$$\text{TAC} = \sum_{\text{units}} C_\text{ann}(A) \;+\; \sum_{\text{utilities}} c_u\,Q_u .$$

Two kinds of restriction are hard constraints:
- **forbidden matches**, e.g. an oxygen-rich stream and a hydrocarbon stream, where a tube leak would bring them together;
- **material incompatibility**: both fluids touch the tubes, so the tube material must suit both; the shell only touches the
  shell-side fluid. If no shell/tube pair of the cost table suits both fluids (HF needs Monel, seawater titanium or brass),
  the pair cannot be matched.

A hazardous but allowed pair can be given a **penalty factor** that multiplies its exchanger cost.

## 2. Exchanger area and cost

For a counter-current exchanger with end differences $\Delta T_1$ and $\Delta T_2$,

$$A = \frac{Q}{U\,\Delta T_\text{lm}},\qquad \Delta T_\text{lm} = \frac{\Delta T_1-\Delta T_2}{\ln(\Delta T_1/\Delta T_2)},\qquad
\frac{1}{U} = \frac{1}{h_\text{hot}} + \frac{1}{h_\text{cold}} .$$

(Clean coefficients, no fouling; when $\Delta T_1 \approx \Delta T_2$ the page uses the series $\Delta T_\text{lm} \approx m - d^2/(12m)$,
$m$ the mean and $d$ the difference.)

Three cost laws are available:

| law | annualised cost of one exchanger | source |
|---|---|---|
| paper (benchmarks) | $c_f + c_v A^\beta$ in \$/yr, as published for each benchmark | the benchmark's source |
| Seider et al. | $\text{AF}\,\dfrac{\text{CEPCI}}{567}\, C_B(A)\,\big(F_{BM} + F_L F_P F_M(A) - 1\big)$ | Seider, Seader, Lewin et al., *Product and Process Design Principles*, as coded in BioSTEAM |
| Turton (CAPCOST) | $\text{AF}\,\dfrac{\text{CEPCI}}{397}\, C_p^0(A)\,(B_1 + B_2 F_M F_P)$ | Turton et al., *Analysis, Synthesis and Design of Chemical Processes*, App. A |

**Seider.** $C_B = \exp(c_0 + c_1\ln A + c_2\ln^2 A)$ with $A$ in ft² (floating head 12.0310, −0.8709, 0.09005; fixed head 11.4185,
−0.9228, 0.09861; U tube 11.5510, −0.9186, 0.09790), at CE = 567. Material factor $F_M = a + (A/100)^b$ (Seider Eq. 16.44), pressure
factor $F_P = 0.9803 + 0.018\,(P/100) + 0.0017\,(P/100)^2$ with $P$ in psig, tube-length factor $F_L$ (8 ft 1.25, 12 ft 1.12, 16 ft 1.05,
20 ft 1.00) and bare-module factor $F_{BM} = 3.17$. The bare-module rule $C_B(F_{BM} + F_L F_P F_M - 1)$ is BioSTEAM's
installed-cost rule. The correlation is meant for 150–12 000 ft²; below 150 ft² the page charges the cost of a 150 ft² unit,
above 12 000 ft² it extrapolates. (BioSTEAM lists the 1.12 length point at 13 ft.)

| shell / tube | $a$ | $b$ | | shell / tube | $a$ | $b$ |
|---|---|---|---|---|---|---|
| CS / CS | 0 | 0 | | CS / Cr-Mo | 1.55 | 0.05 |
| CS / brass | 1.08 | 0.05 | | Cr-Mo / Cr-Mo | 1.70 | 0.07 |
| CS / SS | 1.75 | 0.13 | | SS / SS | 2.70 | 0.07 |
| CS / Monel | 2.10 | 0.13 | | Monel / Monel | 3.30 | 0.08 |
| CS / Ti | 5.20 | 0.16 | | Ti / Ti | 9.60 | 0.06 |

(CS/CS gives $F_M = 0 + (A/100)^0 = 1$.) "auto" picks, for each pair of fluids, the shell/tube pair with the lowest cost at
100 m².

**Turton.** Floating head: $\log_{10} C_p^0 = 4.8306 - 0.8509\log_{10}A + 0.3187\log_{10}^2 A$ ($A$ in m², 10–1000 m², CEPCI 397),
$B_1 = 1.63$, $B_2 = 1.66$, $\log_{10}F_P = 0.03881 - 0.11272\log_{10}P + 0.08183\log_{10}^2P$ ($P$ in barg, 5–140; $F_P = 1$ below 5 barg).
These constants agree with the independent implementation *eqcost* (its test case, 100 m² CS at 20 barg, is reproduced in the tests).
Only same-material factors were available to check (CS 1.00, SS 2.73, Ni alloy 3.73, Ti 11.4; Monel is mapped to Ni alloy), so the
Turton law prices a CS-shell / alloy-tube unit at the all-alloy factor of its tube material (conservative), and has no brass or Cr-Mo.

**Escalation and annualisation.** CEPCI is an input: the current value is paywalled, so the default 800 is a placeholder.
The annualisation factor is the capital recovery factor $\text{AF} = \dfrac{i(1+i)^n}{(1+i)^n-1}$.

**Accuracy.** Correlations of this kind are study-level estimates; expect roughly ±30–50 % (an expectation, not a computed
error bar). They are not vendor quotes.

## 3. Utility prices from energy prices

One kW over a year of $H$ operating hours is $E = 3600H/10^6$ GJ. With a natural-gas price $p_g$ [\$/MMBtu], electricity $p_e$
[\$/kWh] and a carbon price $c$ [\$/t] (emission factors 52.91 kg CO₂/MMBtu for gas and 0.367 kg/kWh for grid electricity, EIA):

| utility | price [\$/(kW yr)] |
|---|---|
| steam at $T_s$ | $E\left[\dfrac{p_g + c\,e_g}{1.055}\,\dfrac{h_g - h_\text{fw}}{h_g - h_f}\,\dfrac{1}{\eta_b} + w_s\,\dfrac{10^3}{h_g-h_f}\right]$ |
| fired heater / hot oil | $E\,\dfrac{p_g + c\,e_g}{1.055\,\eta_f}$ |
| cooling water | $H\,(P_\text{pump} + P_\text{fan})\,(p_e + c\,e_e) + V_\text{make-up}\,(p_w + p_\text{chem})$ |
| seawater (once-through) | $H\,P_\text{pump}\,(p_e + c\,e_e)$ |
| refrigeration at $T_e$ | $H\,(p_e + c\,e_e)/\text{COP}$, $\ \text{COP} = f\,\dfrac{T_e - 5}{T_\text{cond} - (T_e - 5)}$ (K) |

$h_f, h_g$ are saturated-liquid and vapour enthalpies (IAPWS-IF97), $h_\text{fw}$ the feed water at 105 °C: the boiler also heats the
feed water, so a GJ of condensing heat costs more than a GJ of fuel. Cooling water: flow $1/(4.18\,\Delta T)$ kg/s per kW,
pump power $m g h/\eta_p$, evaporation $1/2400$ kg/s per kW and make-up $=$ evaporation $\times\,N/(N-1)$ for $N$ cycles of
concentration. Boiler and furnace efficiency, water prices, pump head, fan power, cycles and the COP fraction $f$ are assumptions
you can edit. The benchmarks keep the utility prices published with them.

## 4. Targets: problem table and the transshipment LP

Shift the cold temperatures up by EMAT and cut the range at every supply and target temperature. Cascading each interval's
surplus downwards gives the minimum hot utility $Q_{H,\min}$ (the most negative cumulative flow, Linnhoff's problem table) and
$Q_{C,\min} = Q_{H,\min} + \sum Q_\text{cold} - \sum Q_\text{hot}$. The composite and grand composite curves on the page come from
this cascade (computed in Rust).

The problem table cannot see forbidden matches. The **expanded transshipment model** (Papoulias & Grossmann 1983) can: with
$q_{ijk}$ the heat from hot $i$ to cold $j$ in interval $k$ and $R_{ik}$ the heat hot $i$ carries down to interval $k+1$,

$$R_{ik} - R_{i,k-1} + \sum_j q_{ijk} = Q^H_{ik},\qquad \sum_i q_{ijk} = Q^C_{jk},\qquad q, R \ge 0,$$

where hot utilities are hot "streams" with an unknown load spread over their temperature range (all at one level if isothermal),
and cold utilities likewise. A forbidden or material-incompatible pair has no $q_{ijk}$, utility–utility pairs none either.
Minimising $\sum_u c_u Q_u$ gives the utility cost target **with** the restrictions; the difference to the unrestricted LP is
the energy penalty of the restrictions. Solved by HiGHS: highs-js in the page, scipy's HiGHS in Python.

## 5. Fewest matches: the MILP

With the utility loads fixed at their LP values, a binary $y_{ab}$ marks that hot $a$ and cold $b$ (process streams or utilities)
exchange any heat:

$$\sum_k q_{abk} \le U_{ab}\, y_{ab},\qquad U_{ab} = \min(Q_a, Q_b),\qquad \min \sum w_{ab}\, y_{ab} .$$

$w = 1$ counts units; the "weighted" option uses each pair's exchanger cost at 100 m² relative to a carbon-steel unit, so
expensive materials and penalty factors are avoided where possible. The model does not split the problem at the pinch; it counts
each pair once, as Letsios et al. (2018) do.

## 6. The network: stage-wise superstructure

The network model is the stage-wise superstructure of Yee & Grossmann (1990), with **isothermal mixing**. There are $K$ stages
(default $\max(N_H, N_C)$); in stage $k$ any hot $i$ may meet any allowed cold $j$, and a stream with several matches in a stage
is split, all branches leaving at the stage temperature. With loads $q_{ijk}$ the temperatures follow from energy balances,

$$t_{i,k+1} = t_{i,k} - \frac{1}{F_i}\sum_j q_{ijk},\qquad t_{j,k} = t_{j,k+1} + \frac{1}{F_j}\sum_i q_{ijk},$$

with $t_{i,1} = T^\text{in}_i$ and $t_{j,K+1} = T^\text{in}_j$. Match $(i,j,k)$ has end differences
$t_{ik} - t_{jk} \ge \text{EMAT}$ and $t_{i,k+1} - t_{j,k+1} \ge \text{EMAT}$. A cooler sits at the cold end of each hot stream
and a heater at the hot end of each cold stream, with loads $F_i(t_{i,K+1} - T^\text{out}_i) \ge 0$ and
$F_j(T^\text{out}_j - t_{j1}) \ge 0$; a utility may be switched off, and the stream must then meet its target exactly. Each stream
uses one utility, chosen among those whose temperatures fit its target (part of the topology).

## 7. The loads: a barrier NLP

For a fixed topology the loads minimise

$$\varphi(q) = \frac{\text{TAC}(q)}{s} - \tau\sum_c \ln \sigma_c(q) + \mu\sum_{\text{off}} \left(\frac{Q_s}{Q_s^\text{duty}}\right)^2 ,$$

where the slacks $\sigma_c$ are the loads, the end differences minus EMAT and the loads of switched-on utilities (all linear in
$q$), and the last sum drives the utility load of switched-off streams to zero. $\tau$ goes from $10^{-3}$ to $10^{-9}$ and $\mu$
from $10$ to $10^7$ in seven levels; each level is an L-BFGS run (memory 8, Armijo backtracking) whose steps never leave the
interior: because the slacks are linear, the largest safe step is $\min\{-\sigma_c/\Delta\sigma_c : \Delta\sigma_c < 0\}$, and the
step is capped at 0.99 of it. The gradient is exact: the cost sensitivities to every stage temperature are collected and sent
back through the temperature recurrences in reverse (an adjoint), checked against finite differences in the tests. A start
point with infeasible loads is scaled down by the largest factor that makes it feasible (bisection).

Concave costs ($\beta < 1$) make this NLP non-convex, so it finds a local optimum; the topology search above it explores
the rest.

## 8. Topology: simulated annealing

A move adds a random allowed match $(i,j,k)$, removes one, moves one to another stage, or changes one stream's utility (or
switches it off). The candidate's loads are optimised (warm start: surviving matches keep their loads) and it is accepted with
probability $\min(1, e^{-\Delta/T})$, where $\Delta$ is the change of TAC plus a penalty for missed targets; $T$ falls
geometrically from 5 % to 0.01 % of the starting TAC. On the page several chains run in parallel Web Workers; after each
epoch all chains restart from the best network found, at a start temperature of 1 %.

## 9. The sequential route, step 3

The MILP gives matches and loads but no arrangement. Step 3 gives each MILP process match its own stage, ordered by the
heat-weighted mean temperature of its exchange (hotter first), gives each stream the utility the MILP used, optimises the loads
(section 7), and then greedily moves single matches to other stages and switches single utilities, keeping any change that lowers
the TAC.
