## Process description

Toluene hydrodealkylation (HDA) converts toluene to benzene by reaction with hydrogen. The main reaction is

$$\mathrm{C_6H_5CH_3} + \mathrm{H_2} \longrightarrow \mathrm{C_6H_6} + \mathrm{CH_4}$$

and a side reaction forms diphenyl by reversible dimerisation of benzene, $2\,\mathrm{C_6H_6} \rightleftharpoons \mathrm{C_{12}H_{10}} + \mathrm{H_2}$ [1]. Unconverted toluene is recovered and recycled, and diphenyl is removed in the toluene column [1] [2]. The HDA process was first presented in a contest arranged by the American Institute of Chemical Engineers, and Douglas (1988) used a version of it to demonstrate a steady-state procedure for flowsheet design [1] [3]; the hierarchy of decision levels behind that procedure is published in [4]. A student project document attributes an HDA flowsheet to Turton et al. [5] [6].

The plant of this page is drawn on two process flow diagrams. PFD-201 (reaction section) carries the feed preparation, the fired heater, the reactor, the effluent cooler, the high-pressure separator with the recycle gas loop and purge, and the low-pressure flash drum. PFD-202 (separation section) carries the benzene column and the toluene column. Stream 20 (crude benzene) leaves PFD-201 and enters PFD-202; stream 37 (toluene recycle) returns from PFD-202 to PFD-201. The seven sections that follow take the equipment in diagram order, each with a crop of the sheet (Fig. T1 to Fig. T7).

All stream values on the sheets and in this text are **sample values** from a simple component-balance model, not the result of a converged rigorous simulation; temperatures and pressures on the sheets are nominal. Where a number in the text is quoted from a published source, the source is cited. Units used throughout:

- $\mathrm{^\circ C}$ denotes degrees Celsius; kPa denotes kilopascals (absolute); kmol/h denotes kilomoles per hour; mol% denotes moles of a component per 100 moles of the stream.
- Components are hydrogen (H2), methane (CH4), benzene (B), toluene (T) and diphenyl (D). The flow of component $\mathit{i}$ in stream $\mathit{k}$ is written $n_{i,k}$ in kmol/h.

Two sets of numbers appear. The values printed on the sheets are in integer tenths of kmol/h and close every balance exactly (section *Balance model and solution method*). The summary quantities returned by the live model on the App panel are computed in floating point; they differ from the displayed values by rounding effects of at most 0.8 kmol/h on any flow, and the text states which set a number belongs to.

## Feed preparation

<!-- crop sheet=1 x=45 y=70 w=680 h=330 caption="Feed preparation: fresh toluene (stream 1) and recycle toluene (stream 37) to V-201 and P-201; make-up hydrogen (stream 5) and recycle gas (stream 15, from Fig. T5) joined at J2; E-201; stream 8 continues to H-201 (Fig. T2)" -->

Fresh toluene (stream 1, 100.0 kmol/h of toluene at 25 $\mathrm{^\circ C}$ and 190 kPa) is joined at junction J1 by the toluene recycle (stream 37, from Fig. T7). The combined liquid (stream 2, 132.5 kmol/h at 50 $\mathrm{^\circ C}$ and 160 kPa) enters the feed drum V-201, which buffers the feed, and is raised by the feed pump P-201 to 2700 kPa (stream 4).

Make-up hydrogen (stream 5, 254.1 kmol/h) is joined at J2 by the recycle gas from the compressor C-201 (stream 15). The gas (stream 6, 974.8 kmol/h at 2550 kPa) meets the pumped liquid at J3, giving the mixed-phase reactor feed (stream 7, 1107.3 kmol/h at 45 $\mathrm{^\circ C}$). The exchanger E-201 heats the feed to 230 $\mathrm{^\circ C}$ (stream 8) with high-pressure steam.

In the Douglas-based model of [1] the fresh gas is 97 mol% hydrogen and 3 mol% methane, and the methane impurity is one of the reasons a purge is needed [1] [2]. The make-up gas of the sample plant is taken as 95 mol% hydrogen and 5 mol% methane; the displayed composition of stream 5 is 241.4 kmol/h of H2 and 12.7 kmol/h of CH4. The sheet differs from [1] in the heat integration: in [1] the feed is heated against the reactor effluent, whereas E-201 of the sheet uses steam.

The flow of make-up gas is not an input of the model. It is the quantity that makes the hydrogen-to-toluene ratio at the reactor inlet equal the specified value $\mathit{r}$ (section *Recycle gas and purge*).

## Fired heater

<!-- crop sheet=1 x=655 y=140 w=345 h=275 caption="Fired heater H-201: stream 8 in from E-201 (Fig. T1), stream 9 out to R-201 (Fig. T3); fuel gas to the burners (utility)" -->

The fired heater H-201 raises the preheated feed (stream 8, 230 $\mathrm{^\circ C}$, 2500 kPa) to reaction temperature (stream 9, 600 $\mathrm{^\circ C}$, 2450 kPa on the sheet). Fuel gas is the utility. The composition and flow do not change across the heater, so $n_{i,9} = n_{i,8}$ for every component, and the model carries no energy balance: the heater duty is not computed.

In the Douglas-based model of [1] the reactor inlet temperature must be at least 1150 $\mathrm{^\circ F}$ (computed: 621 $\mathrm{^\circ C}$) to obtain a high enough reaction rate. The Edinburgh course notes give a rate that is too slow below 600 $\mathrm{^\circ C}$ for the thermal reaction [2]. The nominal inlet temperature of the sheet, 600 $\mathrm{^\circ C}$, lies at that lower limit and below the 621 $\mathrm{^\circ C}$ of [1]; it is a nominal sample value and is not tied to a rate expression, because the model takes the conversion per pass as an input.

The reactor inlet composition (stream 9, displayed) is 661.0 kmol/h of H2, 311.4 kmol/h of CH4, 2.7 kmol/h of B and 132.2 kmol/h of T, a total of 1107.3 kmol/h.

## Reactor

<!-- crop sheet=1 x=800 y=250 w=390 h=320 caption="Reactor R-201 and effluent cooler E-202: stream 9 in from H-201 (Fig. T2); stream 11 continues to V-202 (Fig. T4)" -->

The reactor R-201 is an adiabatic packed bed. Two routes exist for the reaction, and the sheet does not select a catalyst [1] [2] [7].

- **Thermal (non-catalytic).** The homogeneous reactions take place from 600 $\mathrm{^\circ C}$ (below which the rate is too slow) to 700 $\mathrm{^\circ C}$ (above which significant hydrocracking occurs) at a pressure of about 35 bar [2]. The model of [1] bounds the reactor inlet pressure at 500 psia (computed: 3447 kPa) and the reactor outlet temperature at 1300 $\mathrm{^\circ F}$ (computed: 704 $\mathrm{^\circ C}$).
- **Catalytic.** Catalysts are usually supported chromium or molybdenum oxides, or platinum or platinum oxides, on silica or alumina, at 500 to 595 $\mathrm{^\circ C}$ and 4 to 6 MPa. Conversion per pass typically reaches 90 % and selectivity to benzene is often above 95 %; the catalytic route runs at lower temperature with higher selectivity but needs frequent catalyst regeneration [7]. A student document reports 600 to 650 $\mathrm{^\circ C}$, 20 to 60 bar and chromia on a porous carrier for a packed-bed reactor [5].

The reaction is highly exothermic; in the catalytic reactor the temperature is controlled by injecting quench hydrogen at several places [7]. In [1] the effluent of the adiabatic plug-flow reactor is quenched with part of the separator liquid to prevent coking. The Aspen model of [1] gives a reactor inlet of 1201.2 $\mathrm{^\circ F}$ and an outlet of 1277.2 $\mathrm{^\circ F}$ (computed: 650 $\mathrm{^\circ C}$ to 692 $\mathrm{^\circ C}$, a rise of 42 K) at 500 psi; this is a model value, not plant data. The sheet shows 600 $\mathrm{^\circ C}$ in and 650 $\mathrm{^\circ C}$ out (a nominal rise of 50 K), with no quench stream. A heat of reaction was not taken from any source, so an adiabatic temperature rise is not derived on this page; the temperature rise on the sheet is an assumed value and is not computed from an energy balance.

Excess hydrogen prevents coking: a hydrogen-to-aromatics ratio of 5 is required [2], stated in [1] as $\mathrm{H_2}/(\mathrm{B}+\mathrm{T}+\mathrm{D}) \geq 5$. The page specifies the ratio on a toluene basis instead, with $\mathit{r}$ denoting $n_{\mathrm{H_2},9}/n_{\mathrm{T},9}$ (dimensionless). At the sample point $\mathit{r} = 5$, the displayed ratio on the aromatics basis of [1] is $661.0/(132.2+2.7+0) = 4.90$, slightly below 5. The sample point therefore does not satisfy that constraint as stated in [1].

**Extents of reaction.** Let $\mathit{X}$ be the conversion of toluene per pass (dimensionless) and $n_{\mathrm{T},9}$ the toluene flow into the reactor (kmol/h). The extent of the main reaction (kmol/h) is

$$\xi_1 = \mathit{X}\, n_{\mathrm{T},9}.$$

The extent of the side reaction $2\,\mathrm{B} \rightarrow \mathrm{D} + \mathrm{H_2}$ (kmol/h) is taken as a fixed fraction of the first,

$$\xi_2 = \sigma\, \xi_1, \qquad \sigma = 0.005,$$

where $\sigma$ is dimensionless. A fixed $\sigma$ is a model assumption, not a kinetic result. The effluent flows (stream 10) follow from the reaction stoichiometry:

$$n_{\mathrm{T},10} = n_{\mathrm{T},9} - \xi_1,\quad n_{\mathrm{H_2},10} = n_{\mathrm{H_2},9} - \xi_1 + \xi_2,\quad n_{\mathrm{CH_4},10} = n_{\mathrm{CH_4},9} + \xi_1,$$

$$n_{\mathrm{B},10} = n_{\mathrm{B},9} + \xi_1 - 2\xi_2,\quad n_{\mathrm{D},10} = n_{\mathrm{D},9} + \xi_2.$$

Both reactions conserve the number of moles, so the total flow is unchanged (1107.3 kmol/h in and out). At the displayed design basis $\xi_1 = 99.2$ kmol/h and $\xi_2 = 0.5$ kmol/h, which reproduce stream 10: T 33.0, H2 562.3, CH4 410.6, B 100.9, D 0.5 kmol/h. The live model computes $\xi_1 = 99.27$ kmol/h and $\xi_2 = 0.50$ kmol/h.

The **selectivity** to benzene, benzene formed per toluene converted, is

$$\mathit{S} = \frac{\xi_1 - 2\xi_2}{\xi_1} = 1 - 2\sigma = 0.99,$$

constant by construction; it is not a prediction. One mole of hydrogen is consumed per mole of toluene converted by the main reaction, and the side reaction returns one mole per mole of diphenyl formed, so the net hydrogen consumption is $\xi_1 - \xi_2$ (98.7 kmol/h displayed).

## Effluent cooling and separation

<!-- crop sheet=1 x=930 y=125 w=710 h=490 caption="Effluent cooling and separation: stream 10 in from R-201 (Fig. T3); E-202, V-202 with LIC-201 and LV-201, V-203; stream 14 continues to C-201 and streams 13, 41 and 19 to the purge (Fig. T5); stream 20 continues to E-203 (Fig. T6)" -->

The effluent (stream 10, 650 $\mathrm{^\circ C}$) is cooled in E-202 with cooling water to 38 $\mathrm{^\circ C}$ (stream 11, 2350 kPa, mixed phase) and separated in the high-pressure separator V-202. In [1] the separator temperature is limited to 95 to 105 $\mathrm{^\circ F}$ (computed: 35 to 41 $\mathrm{^\circ C}$); the sheet value of 38 $\mathrm{^\circ C}$ lies in that interval. The separator liquid leaves under level control: the level indicating controller LIC-201 sets the level control valve LV-201 in stream 16.

The model sends a fixed fraction $\varphi_i^{\mathrm{HP}}$ of each component $\mathit{i}$ (dimensionless) to the vapour (stream 12); the remainder is the liquid (stream 16):

$$n_{i,12} = \varphi_i^{\mathrm{HP}}\, n_{i,11}, \qquad n_{i,16} = n_{i,11} - n_{i,12}.$$

| Component | H2 | CH4 | B | T | D |
|---|---|---|---|---|---|
| $\varphi_i^{\mathrm{HP}}$ (V-202) | 0.995 | 0.97 | 0.03 | 0.01 | 0 |
| $\varphi_i^{\mathrm{LP}}$ (V-203) | 0.98 | 0.90 | 0.02 | 0.005 | 0 |

The values are assumed sample splits, independent of temperature, pressure and composition; they are not equilibrium calculations. The liquid (stream 16, 146.2 kmol/h) is let down through LV-201 to 280 kPa (stream 17) into the low-pressure flash drum V-203, which releases the dissolved light gases with the fractions $\varphi_i^{\mathrm{LP}}$ of the table (dimensionless):

$$n_{i,18} = \varphi_i^{\mathrm{LP}}\, n_{i,17}, \qquad n_{i,20} = n_{i,17} - n_{i,18}.$$

The flash gas (stream 18, 16.0 kmol/h) joins the let-down purge (stream 41) as fuel gas (stream 19, Fig. T5); the crude benzene (stream 20, 130.2 kmol/h: B 95.9, T 32.5, D 0.5, CH4 1.2, H2 0.1) continues to the benzene column. The flash does not remove all hydrogen and methane, so the benzene column removes the remainder to prevent contamination of the benzene product [2].

## Recycle gas and purge

<!-- crop sheet=1 x=980 y=40 w=660 h=270 caption="Recycle gas and purge: stream 12 from V-202 (Fig. T4) split at J4 into the purge (stream 13, through PV-201 as stream 41) and the recycle gas (stream 14, to C-201); stream 15 continues left to J2 (Fig. T1); streams 41 and 18 join as fuel gas (stream 19)" -->

The vapour from V-202 (stream 12, 961.1 kmol/h) is split at J4: a fraction $\beta$ (the purge fraction, dimensionless) leaves as the purge (stream 13) and the remainder $1-\beta$ returns as recycle gas (stream 14) to the compressor C-201, which restores the pressure to 2550 kPa (stream 15). The pressure controller PIC-201 holds the loop pressure by moving the purge control valve PV-201, which lets the purge down to 260 kPa (stream 41) before it joins the flash gas in stream 19.

$$n_{i,13} = \beta\, n_{i,12}, \qquad n_{i,15} = n_{i,14} = (1-\beta)\, n_{i,12}.$$

At the design basis $\beta = 0.25$ (stream 13: 240.4 kmol/h displayed against 0.25 × 961.1 = 240.3, the difference being display rounding of each component).

**Why a purge is needed.** Methane is produced in the reaction and enters as an impurity in the hydrogen stream; it accumulates in the gas-recycle loop, so a purge stream is required [2]. The same reason is given in [1]. In the model, methane leaves the loop through the purge (stream 13) and through the fraction dissolved in the V-202 liquid, which is released in V-203 and in the vent of V-204.

**Loop balances.** For a component that circulates only in the gas phase, the flow at the reactor inlet is the make-up plus the recycle gas, $n_{i,9} = n_{i,5} + n_{i,15}$, and the effluent differs from the inlet by its net generation $s_i$ (kmol/h). With $a_i = (1-\beta)\varphi_i^{\mathrm{HP}}$ (dimensionless), $n_{i,15} = a_i\, n_{i,10} = a_i (n_{i,9} + s_i)$, so

$$n_{i,9} = \frac{n_{i,5} + a_i\, s_i}{1 - a_i}.$$

For hydrogen $s_{\mathrm{H_2}} = -(\xi_1 - \xi_2)$ and for methane $s_{\mathrm{CH_4}} = +\xi_1$. At the design basis $a_{\mathrm{CH_4}} = 0.7275$ and $n_{\mathrm{CH_4},9} = (12.7 + 0.7275 \times 99.2)/(1-0.7275) = 311.4$ kmol/h, equal to the displayed value. For hydrogen $a_{\mathrm{H_2}} = 0.74625$ and the same expression gives 661.0 kmol/h. Both relations are exact in this model, because neither component occurs in the toluene recycle.

**Hydrogen-to-toluene ratio fixes the make-up rate.** The model specifies $n_{\mathrm{H_2},9} = \mathit{r}\, n_{\mathrm{T},9}$ with $\mathit{r}$ the hydrogen-to-toluene molar ratio at the reactor inlet. Solving the hydrogen relation for the make-up gives

$$n_{\mathrm{H_2},5} = (1-a_{\mathrm{H_2}})\,\mathit{r}\, n_{\mathrm{T},9} + a_{\mathrm{H_2}}\,(\xi_1 - \xi_2).$$

The methane make-up follows from the 95/5 composition, $n_{\mathrm{CH_4},5} = (0.05/0.95)\, n_{\mathrm{H_2},5}$. The toluene entering the reactor is fixed by the toluene balance. Toluene reaches the reactor from the fresh feed, from the recycle gas, and from the toluene recycle. A fraction $\kappa_{\mathrm{T}} = (1-\varphi_{\mathrm{T}}^{\mathrm{HP}})(1-\varphi_{\mathrm{T}}^{\mathrm{LP}})(1-\rho_{\mathrm{T}}^{(1)})\,\rho_{\mathrm{T}}^{(2)} = 0.9703$ of the unconverted toluene reaches stream 37, where $\rho_{\mathrm{T}}^{(1)}$ and $\rho_{\mathrm{T}}^{(2)}$ are the distillate recoveries of toluene in the benzene and toluene columns (sections *Benzene column* and *Toluene column*). Hence

$$n_{\mathrm{T},9} = \frac{\mathit{F}}{1 - (1-\mathit{X})\left[\kappa_{\mathrm{T}} + (1-\beta)\,\varphi_{\mathrm{T}}^{\mathrm{HP}}\right]},$$

where $\mathit{F}$ is the fresh toluene feed rate (kmol/h). These three closed forms were checked against the model's own solution at three input combinations (agreement to better than $10^{-9}$ kmol/h); the model itself does not use them but solves the full balance (section *Balance model and solution method*).

**Quantities reported for the loop.** The methane mole fraction in the recycle gas is $y_{\mathrm{CH_4}} = n_{\mathrm{CH_4},15}/\sum_i n_{i,15}$: 298.7/720.7 = 41.4 mol% (displayed and live model). The hydrogen utilisation is the net hydrogen consumed divided by the hydrogen make-up,

$$\eta_{\mathrm{H_2}} = \frac{\xi_1 - \xi_2}{n_{\mathrm{H_2},5}} = \frac{98.7}{241.4} = 40.9\ \%.$$

**Trade-off.** A larger purge fraction lowers the methane level in the loop but loses hydrogen to the fuel gas and raises the make-up. With the other inputs at the design basis, the live model gives:

| $\beta$ | 0.05 | 0.10 | 0.25 | 0.40 | 0.60 |
|---|---|---|---|---|---|
| $y_{\mathrm{CH_4}}$ in recycle gas (mol%) | 69.9 | 59.3 | 41.4 | 32.4 | 25.6 |
| H2 make-up (kmol/h) | 129.7 | 157.7 | 241.6 | 325.5 | 437.2 |
| $\eta_{\mathrm{H_2}}$ (%) | 76.2 | 62.7 | 40.9 | 30.3 | 22.6 |

The benzene yield varies only weakly with $\beta$ in this model (0.9612 at 0.05, 0.9546 at 0.25, 0.9433 at 0.60, computed), because a larger purge also sends more of the benzene carried in the gas to the fuel gas; the ratio $\mathit{r}$ does not change it (0.9546 at $\mathit{r} = 2$ and 10). The effect of the methane fraction on hydrogen partial pressure and reaction rate is not modelled and was not verified. The hydrogen lost in the purge and fuel gas is the price of the lower methane level [1] [2].

## Benzene column

<!-- crop sheet=2 x=45 y=95 w=920 h=570 caption="Benzene column: stream 20 in from V-203 (Fig. T4); E-203, T-201, E-204, V-204, P-202, J6, E-205; streams 24 (light ends) and 28 (benzene product) continue to the right; stream 31 continues to T-202 (Fig. T7)" -->

The crude benzene (stream 20, 37 $\mathrm{^\circ C}$, 280 kPa) is heated by low-pressure steam in E-203 to 90 $\mathrm{^\circ C}$ (stream 21, 130.2 kmol/h) and fed to T-201. Benzene is taken overhead; in [1] the specification is a benzene mole fraction of at least 0.9997 in the distillate. The overhead vapour (stream 22, 211.5 kmol/h, 108 $\mathrm{^\circ C}$, 220 kPa) is condensed by cooling water in E-204 (stream 23, 45 $\mathrm{^\circ C}$) into the reflux drum V-204. The dissolved light gases leave the drum as a vent (stream 24, 1.4 kmol/h) to the fuel gas. The drum liquid (stream 25) is pumped by P-202 (stream 26, 400 kPa) and split at J6 into reflux (stream 27, to the top of T-201) and benzene product (stream 28, 45 $\mathrm{^\circ C}$). The bottoms (stream 29) are reboiled in E-205 with medium-pressure steam; the vapour returns as boil-up (stream 30) and the liquid leaves as bottoms product (stream 31, 142 $\mathrm{^\circ C}$).

**Model rules.** The vent takes the fractions $\varepsilon_i$ of the condensed distillate (dimensionless; $\varepsilon_{\mathrm{H_2}} = \varepsilon_{\mathrm{CH_4}} = 1$, $\varepsilon_{\mathrm{B}} = 0.001$, others 0). The column recovers a fixed fraction $\rho_i^{(1)}$ of each component in the distillate (H2, CH4: 1; B: 0.995; T: 0.005; D: 0):

$$n_{i,\mathrm{dist}} = \rho_i^{(1)}\, n_{i,21},\quad n_{i,24} = \varepsilon_i\, n_{i,\mathrm{dist}},\quad n_{i,28} = n_{i,\mathrm{dist}} - n_{i,24},\quad n_{i,31} = n_{i,21} - n_{i,\mathrm{dist}}.$$

The reflux ratio $\mathit{R}_1 = 1.2$ (dimensionless) is defined as the reflux flow divided by the benzene product flow, component by component: $n_{i,27} = \mathit{R}_1\, n_{i,28}$ (114.6 kmol/h against 95.5 kmol/h displayed). The overhead is then $n_{i,22} = n_{i,24} + (1+\mathit{R}_1)\, n_{i,28}$.

**Boil-up rule.** The total boil-up equals the total overhead vapour, $\sum_i n_{i,30} = \sum_i n_{i,22}$ (constant molar overflow with saturated-liquid feed), and its composition is proportional to the weight $\alpha_i$ times the bottoms product composition (weights: B 2.5, D 0.05, others 1). Because stream 30 re-enters only the column bottoms (stream 29 = 30 + 31), it does not feed any balance of another unit.

**Benzene product.** The displayed stream 28 contains 95.3 kmol/h of benzene and 0.2 kmol/h of toluene, 99.79 mol% benzene (computed). That is below the benzene mole fraction of 0.9997 of the case study [1]: the fixed recoveries do not enforce a purity specification. The vent and the fuel gas also carry benzene (displayed 0.1 and 2.8 kmol/h); the boiling point of benzene is 80.08 $\mathrm{^\circ C}$ [7].

**Yield.** The benzene yield is the benzene product divided by the fresh toluene,

$$\mathit{Y} = \frac{n_{\mathrm{B},28}}{\mathit{F}}.$$

The displayed values give $95.3/100.0 = 0.953$; the live model gives 0.9546. A toluene balance on the displayed values reads $\mathit{F} = \xi_1 + (\text{toluene in streams 19, 28, 40})$, that is $100.0 = 99.2 + 0.3 + 0.2 + 0.3$. The benzene formed, $\xi_1 - 2\xi_2 = 98.2$ kmol/h, divides into 95.3 kmol/h of product and 2.9 kmol/h lost with the fuel gas (streams 19 and 24).

## Toluene column

<!-- crop sheet=2 x=880 y=200 w=770 h=470 caption="Toluene column: stream 31 in from E-205 (Fig. T6); T-202, E-206, V-205, P-203, J7, E-207; stream 37 returns to J1 on PFD-201 (Fig. T1); stream 40 (diphenyl) to fuel" -->

The bottoms product of T-201 (stream 31, 33.3 kmol/h at 142 $\mathrm{^\circ C}$, 230 kPa) is the feed of the toluene column T-202, which recovers unreacted toluene from diphenyl [1] [2]. The overhead (stream 32, 58.5 kmol/h, 127 $\mathrm{^\circ C}$, 160 kPa) is condensed by cooling water in E-206 into the reflux drum V-205. Pump P-203 (stream 35, 350 kPa) delivers the liquid to junction J7, which divides it into reflux (stream 36) and the toluene recycle (stream 37, 32.5 kmol/h: T 32.0, B 0.5). Stream 37 returns to feed preparation (Fig. T1). The bottoms (stream 38, 134 $\mathrm{^\circ C}$) are reboiled in E-207 with high-pressure steam (stream 39, 173 $\mathrm{^\circ C}$); the liquid leaves as diphenyl (stream 40, 0.8 kmol/h: D 0.5, T 0.3), sold as fuel in [1].

**Model rules.** The distillate recoveries are $\rho_i^{(2)}$ (H2, CH4, B: 1; T: 0.99; D: 0) and the reflux ratio is $\mathit{R}_2 = 0.8$, defined on the recycle flow:

$$n_{i,37} = \rho_i^{(2)}\, n_{i,31},\quad n_{i,40} = n_{i,31} - n_{i,37},\quad n_{i,36} = \mathit{R}_2\, n_{i,37},\quad n_{i,32} = (1+\mathit{R}_2)\, n_{i,37}.$$

The displayed values give 26.0 = 0.8 × 32.5 and 58.5 = 1.8 × 32.5. The boil-up rule is that of the benzene column: total boil-up equal to the total overhead vapour, with composition proportional to the weight (T 15, others 1) times the composition of stream 40.

**Diphenyl.** Diphenyl boils at 256.1 $\mathrm{^\circ C}$ (benzene 80.08 $\mathrm{^\circ C}$) [8] [7], so the toluene column bottoms are the natural exit. In the model no diphenyl leaves with the gas or the distillate ($\varphi_{\mathrm{D}}^{\mathrm{HP}} = \varphi_{\mathrm{D}}^{\mathrm{LP}} = \rho_{\mathrm{D}}^{(1)} = \rho_{\mathrm{D}}^{(2)} = 0$), so the diphenyl formed in the reactor leaves in stream 40:

$$n_{\mathrm{D},40} = \xi_2 \quad (0.5 = 0.5\ \text{kmol/h displayed}).$$

Whether diphenyl could instead be recycled to extinction, the side reaction being reversible, was not verified in a source and is not modelled.

## Balance model and solution method

The model computes $n_{i,k}$ for five components in streams 1 to 41 from four inputs: $\mathit{F}$ (10 to 500 kmol/h), $\mathit{X}$ (0.30 to 0.95), $\beta$ (0.05 to 0.60) and $\mathit{r}$ (2 to 10). Inputs outside these ranges, or malformed, are rejected with a plain-language message. The design basis is $\mathit{F} = 100$ kmol/h, $\mathit{X} = 0.75$, $\beta = 0.25$, $\mathit{r} = 5$.

**Tear variables.** The flowsheet contains two recycles, the toluene recycle (stream 37) and the recycle gas (stream 15), and one specification (the ratio $\mathit{r}$). Choosing as unknowns the five component flows of stream 37, the five of stream 15 and the make-up gas rate $\mathit{f}_5$ (kmol/h) gives 11 tear variables, collected in a vector $\mathbf{u}$.

**One pass.** For a guess $\mathbf{u}$ one pass through the flowsheet computes every stream in diagram order using the rules of the preceding sections. It returns new values of stream 37 and stream 15 and the ratio residual $\mathit{r}\, n_{\mathrm{T},9} - n_{\mathrm{H_2},9}$. The residual vector

$$\mathbf{f}(\mathbf{u}) = \left(\, \mathbf{n}_{37} - \mathbf{n}_{37}^{\mathrm{new}},\ \mathbf{n}_{15} - \mathbf{n}_{15}^{\mathrm{new}},\ \mathit{r}\, n_{\mathrm{T},9} - n_{\mathrm{H_2},9} \,\right)$$

has 5 + 5 + 1 = 11 components.

**Affine residual and linear solve.** Every unit rule is linear in the incoming flows (fixed split fractions, fixed recoveries, extents proportional to $n_{\mathrm{T},9}$), so $\mathbf{f}$ is affine: $\mathbf{f}(\mathbf{u}) = \mathbf{f}(\mathbf{0}) + \mathbf{J}\mathbf{u}$. The two boil-up streams are the only nonlinear quantities (they involve a normalisation) and they feed no other balance. The matrix $\mathbf{J}$ (11 × 11) is built column by column from $\mathbf{f}(\mathbf{e}_j) - \mathbf{f}(\mathbf{0})$ with unit vectors $\mathbf{e}_j$, and the system $\mathbf{J}\mathbf{u} = -\mathbf{f}(\mathbf{0})$ is solved by Gaussian elimination with partial pivoting. A pivot below $10^{-14}$ raises an error, and a final pass checks that the residual is below $10^{-6}\,\max(1, \mathit{F})$.

**Independent check and display rule.** An independent solution by successive substitution, with a damped update of $\mathit{f}_5$, reproduces the linear solve. At the 16 corners of the input ranges, the largest difference between the two floating-point solutions was $2.8\times10^{-9}$ kmol/h (computed). The same iteration run in integer tenths of kmol/h produces the displayed values: every split is rounded to a tenth for its first outlet and the last outlet is taken by difference, and mixing is exact addition. Every unit balance formed from the displayed values therefore closes exactly. The displayed overall balance reads: in, 100.0 (stream 1) + 254.1 (stream 5) = 354.1 kmol/h; out, 256.4 (stream 19) + 95.5 (stream 28) + 1.4 (stream 24) + 0.8 (stream 40) = 354.1 kmol/h. Component balances close as well, for example methane: $12.7 + 99.2 = 111.9 = 110.7 + 1.2$ kmol/h and hydrogen: $241.4 - 98.7 = 142.7 = 142.6 + 0.1$ kmol/h.

**Floating point against the display.** The displayed values are a rounded fixed point, not the rounding of the floating-point solution; the largest difference over all streams and components is 0.77 kmol/h (H2 in stream 6: 661.0 displayed, 661.8 live).

**Design-basis anchors.** The model reproduces, at the design basis, the displayed values of nine anchor streams (1, 5, 9, 13, 15, 19, 28, 37, 40), for example stream 13: H2 139.9, CH4 99.6 kmol/h; stream 28: B 95.3, T 0.2 kmol/h.

**Limitations.** The model has no energy balance, kinetics or pressure drop: temperatures, pressures, duties and phases on the sheets are nominal. The conversion $\mathit{X}$ is an input, $\sigma$ is fixed, and the split fractions and recoveries are fixed and independent of conditions. The benzene purity is not enforced. The sample point does not meet two constraints quoted from [1] (inlet temperature, hydrogen-to-aromatics ratio), as noted in the section *Reactor*.

## Production scale

Worldwide benzene production was reported as more than 61 million metric tons in 2019; this is a statement of the authors of [9], who cite a market-statistics site, and is a secondary statement. For the United States, the EPA Chemical Data Reporting aggregated range was 15 000 000 000 lb to under 20 000 000 000 lb for 2023 (computed: 6.8 to 9.1 million t), the same range for 2021 and 2020, and 10 000 000 000 lb to under 15 000 000 000 lb for 2022 (computed: 4.5 to 6.8 million t) [7]. These are reporting ranges, not point values.

Toluene hydrodealkylation, thermal and catalytic together, contributes 25 to 30 % of the world's benzene supply; catalytic reforming about 30 % and pyrolysis gasoline 30 to 35 % [7]. The text of [7] gives no basis year, so these shares are indicative.

Commercial processes: Detol, Litol and Pyrotol (catalytic dehydrogenation and dealkylation of toluene, light oil and pyrolysis petrol, respectively) are exclusively licensed by Lummus Technology, with catalysts supplied by Clariant [10]. Axens describes its thermal HDA as a non-catalytic process achieving nearly theoretical benzene yields, with more than 35 plants licensed worldwide (vendor claims) [11]. Hydeal (catalytic) and HDA and THD (thermal) are named as the main processes in [7]; their licensors were not verified.

The sample plant produces 95.5 kmol/h of benzene product (displayed, stream 28), against 268 lbmol/h (computed: 121.6 kmol/h) at the sample point of [1].

## Process economics

Only figures from a source that was read are given; capital cost of HDA units, current benzene, toluene and hydrogen prices, and the price history were not found in a citable open source and are not stated. The page does not compute an economic potential.

Product and feed values of the case study of [1] (Table 7, based on Douglas (1988); the source states no basis year, so these are not current market prices):

| Item | Value in source | Computed per kmol |
|---|---|---|
| Benzene | 9.04 US dollars per lbmol | 19.93 US dollars per kmol |
| Toluene | 6.04 US dollars per lbmol | 13.32 US dollars per kmol |
| Fresh gas (97 mol% H2) | 1.32 US dollars per lbmol | 2.91 US dollars per kmol |
| Furnace fuel | $4.00\times10^{-6}$ US dollars per Btu | 3.79 US dollars per GJ |
| Steam | $2.50\times10^{-6}$ US dollars per Btu | 2.37 US dollars per GJ |

Operation is 8150 h/y. Purge, stabiliser distillate and toluene-column bottoms are sold as fuel, and the objective in [1] is the economic potential: product and by-product fuel value minus feed, fuel, cooling water, power and steam costs. The computed spread between benzene and toluene is 3.00 US dollars per lbmol, 33 % of the toluene price. At the sample operating point of [1] (Aspen model; 300 lbmol/h of fresh toluene, computed: 136.1 kmol/h; 268 lbmol/h of benzene; 8 lbmol/h of diphenyl bottoms) the paper reports a nominal optimum profit of 4693.4 thousand US dollars per year under those prices. The corresponding benzene-to-toluene ratio is 0.893 (computed), against 0.953 at the displayed design basis of this page, which is a different operating point.

The dependence of HDA economics on the benzene-toluene spread was not found stated for HDA in a source that was read. For the competing disproportionation route, [7] states that its economic feasibility depends on the relative prices of benzene, toluene and xylene (undated text).

## Safety and environmental issues

**Toxicity.** Benzene is classified by IARC as carcinogenic to humans (Group 1; Volume 100F, 2012; Volume 120, 2018) [7]. The OSHA permissible exposure limit is 1 ppm as an 8-hour time-weighted average and 5 ppm as a 15-minute short-term exposure limit [12] [7]; the ACGIH threshold limit value is 0.5 ppm (time-weighted average) and 2.5 ppm (short-term), with a skin notation and the A1 confirmed-human-carcinogen classification [7]. Here ppm denotes parts per million by volume. Hydrogen is a simple asphyxiant [13].

**Flammability.** Flammable limits in air (volume %) are 4.0 to 75 for hydrogen [13], 5.3 to 14.0 for methane [14], 1.1 to 7.1 for toluene [15] and 1.2 to 7.8 for benzene [7]. The flash point of toluene is 4.4 $\mathrm{^\circ C}$ and it is a Class IB flammable liquid [15]; the flash point of benzene is below 0 $\mathrm{^\circ F}$ [7]. The fuel gas of the sheet (stream 19) contains 142.6 kmol/h of H2, 110.7 kmol/h of CH4 and 2.8 kmol/h of benzene: 55.6, 43.2 and 1.1 mol% (computed from the displayed values).

**High temperature hydrogen attack (HTHA).** Industry uses API RP 941 and its Nelson curves to judge the susceptibility of steels in hydrogen service. The U.S. Chemical Safety Board found that HTHA severely cracked and weakened a carbon steel heat exchanger, leading to a rupture, at the Tesoro Anacortes refinery, that the 2016 edition of API RP 941 reports 13 new failures below the carbon steel curve, and that inspection should not be relied on alone [16]. This applies to hot hydrogen-bearing equipment of the plant (H-201, R-201, and the tube sides of E-201 and E-202); an assessment of this plant against the curves was not made.

**Environment.** Benzene enters the environment from production, storage, transport, venting and combustion of gasoline [7]. Fired-heater hazards and emissions specific to HDA were not found in a source that was read and are not stated.

## Issues of special concern

- **Selectivity loss.** The side reaction forms diphenyl, which must be separated and disposed of as fuel [1] [2]. At the sample point of [1], 8 lbmol/h of diphenyl leaves with 268 lbmol/h of benzene product (computed ratio 0.030); on the sheet the ratio is 0.5/95.3 = 0.005, fixed by the choice $\sigma = 0.005$.
- **Temperature control and runaway.** The reaction is highly exothermic [7], and hydrocracking begins above about 700 $\mathrm{^\circ C}$ [2]. The review in [1] reports that Wolff (1994) concluded that the HDA process is controllable provided the instability of the heat-integrated reactor is resolved; this is a cited conclusion that was not independently checked. The page has no dynamic model.
- **Coking.** Coking is prevented by the hydrogen excess and the effluent quench [1] [2]. The sample point has a hydrogen-to-aromatics ratio of 4.90 (section *Reactor*).
- **Methane build-up and hydrogen loss.** The purge avoids methane accumulation and necessarily removes hydrogen (section *Recycle gas and purge*) [1] [2].
- **Product purity.** The sample benzene product is 99.79 mol%, below the 99.97 mol% distillate specification of [1].
- **Model scope.** Results of the live model rest on fixed split fractions, fixed $\sigma$ and no energy balance; they illustrate the structure of the recycle balances and are not design values.

## References

1. de Araujo, A. C. B.; Govatsmark, M.; Skogestad, S. (2007). Application of plantwide control to the HDA process. I - steady-state optimization and self-optimizing control. Control Engineering Practice 15(10), Elsevier. https://doi.org/10.1016/j.conengprac.2006.10.014. Accessed 2026-10-24.

2. University of Edinburgh, School of Engineering (n.d.). Whole Process Control - Example 2 - HDA Process. University of Edinburgh course web page. https://www.homepages.ed.ac.uk/jwp/control06/controlcourse/restricted/course/fourth/course/casestudy/example2-HDA1.html. Accessed 2026-10-24.

3. Douglas, J. M. (1988). Conceptual Design of Chemical Processes. McGraw-Hill, New York. https://openlibrary.org/isbn/9780070177628. Accessed 2026-10-24.

4. Douglas, J. M. (1985). A hierarchical decision procedure for process synthesis. AIChE Journal 31(3), 353-362. https://doi.org/10.1002/aic.690310302. Accessed 2026-10-24.

5. Indian Institute of Technology Bombay, FOSSEE DWSIM flowsheeting project (student submission) (n.d.). Production of Benzene via the hydrodealkylation of Toluene (DWSIM project document). FOSSEE, IIT Bombay. https://dwsim.fossee.in/flowsheeting-project/download/project-file/47. Accessed 2026-10-24.

6. Turton, R.; Bailie, R. C.; Whiting, W. B.; Shaeiwitz, J. A.; Bhattacharya, D. (2012). Analysis, Synthesis, and Design of Chemical Processes, 4th ed. Prentice Hall. https://openlibrary.org/isbn/9780132618120. Accessed 2026-10-24.

7. National Center for Biotechnology Information (2026). PubChem Compound Summary for CID 241, Benzene (compiled from HSDB, NTP, NIOSH, ACGIH, IARC and Kirk-Othmer entries). PubChem, U.S. National Library of Medicine, National Institutes of Health. https://pubchem.ncbi.nlm.nih.gov/compound/241. Accessed 2026-10-24.

8. National Center for Biotechnology Information (2026). PubChem Compound Summary for CID 7095, Biphenyl. PubChem, U.S. National Library of Medicine, National Institutes of Health. https://pubchem.ncbi.nlm.nih.gov/compound/7095. Accessed 2026-10-24.

9. Meng, Q.; Yan, J.; Wu, R.; Liu, H.; Sun, Y.; Wu, N.; Xiang, J.; Zheng, L.; Zhang, J.; Han, B. (2021). Sustainable production of benzene from lignin. Nature Communications 12, 4534. https://doi.org/10.1038/s41467-021-24780-8. Accessed 2026-10-24.

10. Clariant (2026). Detol (selective dehydrogenation and dealkylation catalyst for conversion of toluene to benzene). Clariant product page (edition date 2 October 2026). https://www.clariant.com/en/Solutions/Products/2014/06/16/09/04/Detol. Accessed 2026-10-24.

11. Axens (2026). Benzene production (Hydrodealkylation, HDA). Axens web page. https://www.axens.net/markets/petrochemicals/benzene-production. Accessed 2026-10-24.

12. U.S. Department of Labor, Occupational Safety and Health Administration (current text). 29 CFR 1910.1028, Benzene. Code of Federal Regulations, Title 29 (text read at the Cornell Law School Legal Information Institute reproduction). https://www.law.cornell.edu/cfr/text/29/1910.1028. Accessed 2026-10-24.

13. National Center for Biotechnology Information (2026). PubChem Compound Summary for CID 783, Hydrogen. PubChem, U.S. National Library of Medicine, National Institutes of Health. https://pubchem.ncbi.nlm.nih.gov/compound/783. Accessed 2026-10-24.

14. National Center for Biotechnology Information (2026). PubChem Compound Summary for CID 297, Methane. PubChem, U.S. National Library of Medicine, National Institutes of Health. https://pubchem.ncbi.nlm.nih.gov/compound/297. Accessed 2026-10-24.

15. National Center for Biotechnology Information (2026). PubChem Compound Summary for CID 1140, Toluene. PubChem, U.S. National Library of Medicine, National Institutes of Health. https://pubchem.ncbi.nlm.nih.gov/compound/1140. Accessed 2026-10-24.

16. U.S. Chemical Safety and Hazard Investigation Board (2016). CSB Safety Alert: Preventing High Temperature Hydrogen Attack (HTHA). U.S. Chemical Safety and Hazard Investigation Board. https://www.csb.gov/assets/1/20/Safety_Alert_HTHA_Final.pdf. Accessed 2026-10-24.