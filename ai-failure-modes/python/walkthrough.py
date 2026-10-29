"""Step-by-step breakdown of the ten cases, shared by the page's Code tab and the MoLab notebook.

SETUP is run first (it defines report()); CELLS is a list of {"title", "md", "code"} dicts. Each cell
writes out the key equations of one case with plain variables (marimo-private names start with _),
then calls report(), which prints the result of the reference function in cases.py and draws the
naive and corrected answers over the case's sweep variable.  INPUTS (one dict per case) is the
inputs cell of the notebook: edit a value and re-run.
"""
import cases

INPUTS = {c["id"]: cases.defaults(c) for c in cases.CASES}

SETUP = r'''
def report(case_id, inputs):
    """Print the naive and corrected answers of a case and plot both over its sweep variable."""
    _r = cases.run(case_id, inputs)
    _c = next(c for c in cases.CASES if c["id"] == case_id)
    print(f"{_c['naive']:>34s}: {_r['naive']:10.4g} {_r['unit']}")
    print(f"{_c['correct']:>34s}: {_r['correct']:10.4g} {_r['unit']}")
    print(f"{'naive vs corrected':>34s}: {_r['diff_pct']:+10.1f} %")
    for _d in _r["details"]:
        print("  -", _d)
    _s = cases.sweep(case_id, inputs)
    return figure([dict(x=_s["x"], y=_s["naive"], name=_c["naive"], mode="lines", line=dict(dash="dash")),
                   dict(x=_s["x"], y=_s["correct"], name=_c["correct"], mode="lines")],
                  xaxis=dict(title=dict(text=_s["xlabel"])), yaxis=dict(title=dict(text=f"{_c['quantity']} [{_r['unit']}]")),
                  margin=dict(l=60, r=20, t=20, b=50), legend=dict(orientation="h", y=1.12))
'''

CELLS = [
dict(title="Gauge vs absolute pressure in a compression ratio", md=r"""
The isentropic discharge temperature of an ideal gas is
$T_2 = T_1\,(P_2/P_1)^{(k-1)/k}$, with **absolute** pressures. Adding atmospheric pressure to each gauge
reading changes the ratio a lot when the suction is near atmospheric.
""", code=r'''
_q = INPUTS["compressor"]
_e = (_q["k"] - 1) / _q["k"]
_r_gauge = _q["P2_psig"] / _q["P1_psig"]
_r_abs = (_q["P2_psig"] + _q["Patm_psia"]) / (_q["P1_psig"] + _q["Patm_psia"])
print(f"ratio: gauge {_r_gauge:.2f}, absolute {_r_abs:.2f}")
report("compressor", _q)
'''),

dict(title="Pipe pressure drop: friction factor and fittings", md=r"""
Darcy–Weisbach: $\Delta p = \left(f_D \dfrac{L}{D} + \sum K\right)\dfrac{\rho u^2}{2}$, with the Darcy friction
factor $f_D$ from Colebrook, $\dfrac{1}{\sqrt{f_D}} = -2\log_{10}\!\left(\dfrac{\varepsilon/D}{3.7} + \dfrac{2.51}{Re\sqrt{f_D}}\right)$.
The Fanning factor is $f_F = f_D/4$.
""", code=r'''
_q = INPUTS["pipe"]
_D = _q["D_mm"] / 1e3
_u = _q["Q_m3h"] / 3600 / (3.14159265 * _D ** 2 / 4)
_Re = _q["rho"] * _u * _D / (_q["mu_cP"] / 1e3)
_fD = cases.colebrook(_Re, _q["rough_mm"] / _q["D_mm"])
print(f"u = {_u:.2f} m/s, Re = {_Re:.3g}, Darcy f = {_fD:.5f}, Fanning f = {_fD / 4:.5f}")
report("pipe", _q)
'''),

dict(title="NPSH available for a hot liquid", md=r"""
$\mathrm{NPSH_a} = \dfrac{P_s - P_v(T)}{\rho(T)\,g} + z - h_f$, with $z$ the **lowest** liquid level above the
pump suction. The vapour pressure comes from IAPWS-IF97 (region 4), the density from the CoolProp table.
""", code=r'''
_q = INPUTS["npsh"]
_T = _q["T_C"] + 273.15
print(f"Pv = {cases.water_psat_kpa(_T):.2f} kPa, rho = {cases.water_sat(_T)['rho_l']:.1f} kg/m3 at {_q['T_C']:g} C")
report("npsh", _q)
'''),

dict(title="Control valve on a hot liquid: choked and flashing flow", md=r"""
IEC 60534-2-1 (SI): $K_v = Q\sqrt{SG/\Delta p}$, but the pressure drop that drives flow is limited to
$\Delta p_{ch} = F_L^2\,(P_1 - F_F P_v)$ with $F_F = 0.96 - 0.28\sqrt{P_v/P_c}$.
If $P_2 < P_v$ the liquid flashes.
""", code=r'''
_q = INPUTS["valve"]
_Pv = cases.water_psat_kpa(_q["T_C"] + 273.15) / 100
_FF = 0.96 - 0.28 * (_Pv / 220.64) ** 0.5
print(f"Pv = {_Pv:.3f} bar, FF = {_FF:.3f}, choked dP = {_q['FL'] ** 2 * (_q['P1_bar'] - _FF * _Pv):.2f} bar")
report("valve", _q)
'''),

dict(title="Non-ideal VLE: ethanol-water near the azeotrope", md=r"""
Modified Raoult's law, $y_i P = x_i\,\gamma_i\,P_i^{sat}(T)$, with van Laar activity coefficients
$\ln\gamma_1 = A_{12}\left(\dfrac{A_{21}x_2}{A_{12}x_1 + A_{21}x_2}\right)^2$ (and the mirror for $\gamma_2$).
Raoult's law sets $\gamma_i = 1$. The sweep is the y–x diagram.
""", code=r'''
_q = INPUTS["vle"]
_xa, _Ta = cases.azeotrope(_q["P_kPa"])
print(f"van Laar azeotrope: x = {_xa:.3f}, T = {_Ta - 273.15:.2f} C")
print("gamma at x = %.2f:" % _q["x1"], tuple(round(g, 3) for g in cases.van_laar(_q["x1"])))
report("vle", _q)
'''),

dict(title="Dense-phase CO2: ideal gas vs an equation of state", md=r"""
Ideal gas: $\rho = PM/(RT)$. Peng–Robinson gives $Z$ from a cubic; $\rho = PM/(ZRT)$. Near the critical point
($T_c$ = 304.13 K, $P_c$ = 73.77 bar) $Z$ falls far below 1, and even Peng–Robinson has errors of several percent
(the reference table on the App tab).
""", code=r'''
_q = INPUTS["co2"]
_Z = cases.peng_robinson_Z(_q["T_C"] + 273.15, _q["P_bar"], 304.13, 73.773, 0.22394)
print(f"Peng-Robinson Z = {_Z:.4f}")
report("co2", _q)
'''),

dict(title="Shell-and-tube area: LMTD correction and temperature cross", md=r"""
$A = Q/(U\,F\,\Delta T_{lm})$, with $R = \dfrac{T_{h,in}-T_{h,out}}{T_{c,out}-T_{c,in}}$,
$P = \dfrac{T_{c,out}-T_{c,in}}{T_{h,in}-T_{c,in}}$ and the 1-2 shell factor $F(R,P)$. The effectiveness–NTU
method for a 1-2 shell gives the same area independently.
""", code=r'''
_q = INPUTS["hx"]
print(f"LMTD-F area {cases.hx_area(**_q)['correct']:.3f} m2,  e-NTU area {cases.hx_area_entu(**_q):.3f} m2")
report("hx", _q)
'''),

dict(title="Fire-case relief valve: latent heat at relieving conditions", md=r"""
API 521: $Q = C\,F\,A_{ws}^{0.82}$ [Btu/h], relief rate $W = Q/\lambda$. API 520-1 critical vapour flow:
$A = \dfrac{W}{C_k K_d P_1}\sqrt{\dfrac{TZ}{M}}$ with $C_k = 520\sqrt{k\left(\frac{2}{k+1}\right)^{\frac{k+1}{k-1}}}$
(US units). $\lambda$, $T$, $Z$ and $k$ are taken at the relieving pressure from the CoolProp propane table.
""", code=r'''
_q = INPUTS["relief"]
_P1 = (_q["set_psig"] * (1 + _q["overpressure_pct"] / 100) + 14.696) / 14.503774
_s = cases.propane_sat(_P1)
print(f"relieving P = {_P1:.2f} bar a: T = {_s['T'] - 273.15:.1f} C, latent heat = {_s['lam']:.0f} kJ/kg, Z = {_s['Z']:.3f}")
report("relief", _q)
'''),

dict(title="Semi-batch scale-up: heat removal falls with size", md=r"""
The jacket removes at most $U A \Delta T$. Releasing a heat $qV$ over a feed time $t$ needs
$t \ge qV/(UA\,\Delta T)$. For geometrically similar vessels $A \propto V^{2/3}$, so the shortest feed time grows as
$V^{1/3}$.
""", code=r'''
_q = INPUTS["scaleup"]
_A, _D = cases.vessel_area(_q["V_plant_m3"], _q["HD"])
print(f"plant vessel: D = {_D:.2f} m, jacketed area = {_A:.1f} m2")
report("scaleup", _q)
'''),

dict(title="Condensate return: flash steam dominates the volume", md=r"""
Flash fraction from an energy balance on the let-down: $x = \dfrac{h_l(P_1) - h_l(P_2)}{h_v(P_2) - h_l(P_2)}$.
The two-phase volume is $\dot m\,[x/\rho_v + (1-x)/\rho_l]$ (homogeneous). Pressures are gauge here; atmospheric
pressure is added before the steam tables are used.
""", code=r'''
_q = INPUTS["flash"]
_T1 = cases.water_tsat((_q["P1_barg"] + _q["Patm_bar"]) * 100)
print(f"trap inlet saturation temperature = {_T1 - 273.15:.1f} C")
report("flash", _q)
'''),
]
