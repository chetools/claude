"""Reference answers for the measured questions (measured/questions.json), computed independently.

    python measured_ref.py      # writes ../measured/references.json

Sources: CoolProp (reference equations of state), the iapws package (IAPWS-IF97), scipy (Radau, tight
tolerances), cases.py (checked in test_cases.py), and two primary documents fetched at build preparation:
Crossref metadata for Peng & Robinson (1976), doi:10.1021/i160057a011, and 29 CFR 1910.119 Appendix A (eCFR).
Each entry: value(s), unit, the accepted range used for grading, and the typical wrong answer for context.
"""
import json
import math
import os

from CoolProp.CoolProp import PropsSI as P
from iapws import IAPWS97
from scipy.integrate import solve_ivp

import cases

HERE = os.path.dirname(os.path.abspath(__file__))
R = 8.314462618


def band(v, rel):
    return [v * (1 - rel), v * (1 + rel)]


def pipe_band():
    """4-inch sch 40 (ID 102.3 mm), 100 m, 50 m3/h water at 20 C: straight pipe and with fittings K = 2..10."""
    lo = cases.pipe_dp(K_fittings=2.0)["correct"]
    hi = cases.pipe_dp(K_fittings=10.0)["correct"]
    return cases.pipe_dp(K_fittings=0.0)["correct"], lo, hi


def hx_two_shell_area():
    """Area for two 1-2 shells in series (eps-NTU, N shells), same duty as cases.hx_area defaults."""
    Ch, Cc = 1000 / 60, 1000 / 70          # kW/K
    Cmin, Cmax = min(Ch, Cc), max(Ch, Cc)
    Cr = Cmin / Cmax
    eps = 1000 / (Cmin * 120)
    N = 2
    z = ((1 - eps * Cr) / (1 - eps)) ** (1 / N)
    e1 = (z - 1) / (z - Cr)                 # per-shell effectiveness
    s = math.sqrt(1 + Cr * Cr)
    g = (2 / e1 - 1 - Cr) / s
    NTU1 = -math.log((g - 1) / (g + 1)) / s
    return N * NTU1 * Cmin * 1e3 / 500


def robertson():
    def f(t, y):
        return [-0.04 * y[0] + 1e4 * y[1] * y[2], 0.04 * y[0] - 1e4 * y[1] * y[2] - 3e7 * y[1] ** 2, 3e7 * y[1] ** 2]
    s = solve_ivp(f, (0, 40), [1, 0, 0], method="Radau", rtol=1e-11, atol=1e-16)
    return [float(v) for v in s.y[:, -1]]


def umf_wen_yu():
    T, p = 293.15, 101325
    rho, mu = P("D", "T", T, "P", p, "Air"), P("V", "T", T, "P", p, "Air")
    d, rp = 200e-6, 2650
    Ar = d ** 3 * rho * (rp - rho) * 9.80665 / mu ** 2
    Re = math.sqrt(33.7 ** 2 + 0.0408 * Ar) - 33.7
    return Re * mu / (rho * d)


def main():
    ref = {}
    ref["compressor"] = {"value": cases.compressor()["correct"], "unit": "°C", "accept": band(cases.compressor()["correct"], 0.04),
                         "wrong": cases.compressor()["naive"]}
    s, lo, hi = pipe_band()
    ref["pipe"] = {"value": [lo, hi], "unit": "kPa", "accept": [lo * 0.97, hi * 1.1], "wrong": s,
                   "note": "range covers fittings K total 2 to 10; straight pipe alone is the wrong answer"}
    ref["npsh"] = {"value": cases.npsh()["correct"], "unit": "m", "accept": band(cases.npsh()["correct"], 0.05),
                   "wrong": cases.npsh()["naive"]}
    ref["valve"] = {"value": cases.valve()["correct"], "unit": "Kv (m3/h)", "accept": band(cases.valve()["correct"], 0.07),
                    "wrong": cases.valve()["naive"]}
    ref["vle"] = {"value": cases.vle()["correct"], "unit": "mol % ethanol", "accept": [90.0, 95.0],
                  "wrong": cases.vle()["naive"], "note": "above the azeotrope the vapour is leaner than the 95 % liquid; Raoult gives y > x"}
    rho_co2 = P("D", "T", 310.15, "P", 100e5, "CO2")
    ref["co2"] = {"value": rho_co2, "unit": "kg/m3", "accept": band(rho_co2, 0.03), "wrong": cases.co2_density()["naive"]}
    a1, a2 = cases.hx_area()["correct"], hx_two_shell_area()
    ref["hx"] = {"value": [a2, a1], "unit": "m2", "accept": [37.5, a1 * 1.05], "wrong": cases.hx_area()["naive"],
                 "note": "one 1-2 shell needs F = 0.69 (area a1); two shells in series need a2; F = 1 is the wrong answer"}
    ref["relief"] = {"value": cases.relief_fire()["correct"], "unit": "in2", "accept": band(cases.relief_fire()["correct"], 0.10),
                     "wrong": cases.relief_fire()["naive"]}
    t = cases.scaleup()["correct"]
    ref["scaleup"] = {"value": t, "unit": "min", "accept": [120.0, 260.0], "wrong": 30.0,
                      "note": "must say the 30 min feed cannot be kept; shortest feed about 3 h (flat-bottom geometry, 195 min)"}
    ref["flash"] = {"value": cases.flash_steam()["correct"], "unit": "m3/h", "accept": band(cases.flash_steam()["correct"], 0.10),
                    "wrong": cases.flash_steam()["naive"]}
    pw = IAPWS97(T=453.15, x=0).P * 1e3
    T = 180.0
    p_mmhg = 10 ** (8.07131 - 1730.63 / (233.426 + T))
    ref["antoine"] = {"value": pw, "unit": "kPa", "accept": band(pw, 0.01), "wrong": p_mmhg * 0.133322,
                      "note": "IAPWS-IF97; the common mmHg/°C Antoine set (valid to about 100 °C) extrapolated gives 'wrong'"}
    ref["xylene"] = {"value": {"Tc_K": P("Tcrit", "m-Xylene"), "Pc_bar": P("pcrit", "m-Xylene") / 1e5, "omega": P("acentric", "m-Xylene")},
                     "unit": "K, bar, -", "accept": {"Tc_K": band(P("Tcrit", "m-Xylene"), 0.01), "Pc_bar": band(P("pcrit", "m-Xylene") / 1e5, 0.03),
                                                     "omega": [P("acentric", "m-Xylene") - 0.02, P("acentric", "m-Xylene") + 0.02]},
                     "wrong": {"o-xylene": [P("Tcrit", "o-Xylene"), P("pcrit", "o-Xylene") / 1e5, P("acentric", "o-Xylene")]}}
    lam = (P("H", "P", 10e5, "Q", 1, "Ammonia") - P("H", "P", 10e5, "Q", 0, "Ammonia")) / 1e3
    ref["ammonia"] = {"value": lam, "unit": "kJ/kg", "accept": band(lam, 0.03),
                      "wrong": (P("H", "P", 101325, "Q", 1, "Ammonia") - P("H", "P", 101325, "Q", 0, "Ammonia")) / 1e3,
                      "note": "'wrong' is the latent heat at 1 atm"}
    v = 1000 * 60 * 0.3048 ** 3 * (273.15 / 288.7056)
    ref["scfm"] = {"value": v, "unit": "Nm3/h", "accept": band(v, 0.015), "wrong": 1000 * 60 * 0.3048 ** 3,
                   "note": "SCF at 60 °F and 14.696 psia; Nm3 at 0 °C and 1 atm"}
    nu = 0.023 * 50000 ** 0.8 * 5 ** 0.3
    ref["dittus"] = {"value": nu, "unit": "-", "accept": band(nu, 0.02), "wrong": 0.023 * 50000 ** 0.8 * 5 ** 0.4,
                     "note": "Dittus-Boelter: Pr exponent 0.3 when the fluid is cooled, 0.4 when heated (Incropera eq. 8.60)"}
    k2 = 1.2e3 * math.exp(-75e3 / R * (1 / 393.15 - 1 / 353.15))
    ref["arrhenius"] = {"value": k2, "unit": "1/s", "accept": band(k2, 0.02),
                        "wrong": 1.2e3 * math.exp(-75e3 / R * (1 / 120 - 1 / 80)), "note": "'wrong' uses °C in the exponent"}
    q = 1000 / 17.031 * 92 / 2 / 3.6
    ref["nh3_heat"] = {"value": q, "unit": "kW", "accept": band(q, 0.03), "wrong": 2 * q,
                       "note": "ΔH = −92 kJ per mol of reaction as written, i.e. per 2 mol NH3"}
    ph = P("P", "T", 333.15, "Q", 0, "n-Hexane") / 1e3 + P("P", "T", 333.15, "Q", 0, "Water") / 1e3
    ref["immiscible"] = {"value": ph, "unit": "kPa", "accept": band(ph, 0.06), "wrong": ph / 2,
                         "note": "water and n-hexane are practically immiscible: P = Psat,w + Psat,hex; Raoult gives half"}
    u = umf_wen_yu()
    ref["umf"] = {"value": u, "unit": "m/s", "accept": band(u, 0.35), "wrong": None,
                  "note": "Wen-Yu (C1 = 33.7, C2 = 0.0408) with CoolProp air at 20 °C; other correlations scatter by tens of %"}
    y = robertson()
    ref["robertson"] = {"value": y, "unit": "mole fraction", "accept": [y[0] * 0.999, y[0] * 1.001], "wrong": None,
                        "note": "graded on y1(40); Radau rtol 1e-11"}
    rh = P("D", "T", 298.15, "P", 700e5, "Hydrogen")
    ref["h2"] = {"value": rh, "unit": "kg/m3", "accept": band(rh, 0.03), "wrong": 700e5 * 2.01588e-3 / (R * 298.15),
                 "note": "'wrong' is the ideal-gas density"}
    c_si = 21000 * 1055.05585 / 3600 * (1 / 0.3048 ** 2) ** 0.82
    ref["api521"] = {"value": c_si, "unit": "W with A in m2", "accept": band(c_si, 0.01), "wrong": None,
                     "note": "SI constant converted from the US form Q = 21000 F A^0.82 (Btu/h, ft2); verify against the standard"}
    ref["psm"] = {"value": 1500, "unit": "lb", "accept": [1500, 1500], "wrong": None,
                  "note": "29 CFR 1910.119 Appendix A, chlorine CAS 7782-50-5 (eCFR, fetched 2026-10-29)"}
    ref["citation"] = {"value": "Peng, D.-Y.; Robinson, D. B. A New Two-Constant Equation of State. Ind. Eng. Chem. Fundam. 1976, 15 (1), 59-64. doi:10.1021/i160057a011",
                       "unit": "", "accept": "authors, journal, year 1976, volume 15, pages 59-64", "wrong": None,
                       "note": "Crossref metadata"}
    ref["column_dp"] = {"value": None, "unit": "", "accept": None, "wrong": None,
                        "note": "not graded: diagnosis needs plant data"}
    out = os.path.join(HERE, "..", "measured", "references.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(ref, f, indent=1)
    for k, v in ref.items():
        print(f"{k:12s} {v['value']!s:60.60s} {v['unit']}  wrong={v['wrong']!s:.30s}")


if __name__ == "__main__":
    main()
