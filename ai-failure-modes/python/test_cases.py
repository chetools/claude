"""Checks of cases.py against independent methods and reference property codes.

    python -m pytest -q test_cases.py

CoolProp (IAPWS-95, Lemmon propane, Span-Wagner CO2, its own Peng-Robinson backend) and the
iapws package (IAPWS-IF97) are used here only; the page itself runs cases.py without them.
"""
import math

import pytest
from CoolProp.CoolProp import PropsSI
from iapws import IAPWS97

import cases


def rel(a, b):
    return abs(a - b) / abs(b)


@pytest.mark.parametrize("T", [274.0, 293.15, 333.15, 363.15, 403.15, 453.15, 550.0, 620.0])
def test_if97_psat_vs_iapws95(T):
    assert rel(cases.water_psat_kpa(T) * 1e3, PropsSI("P", "T", T, "Q", 0, "Water")) < 3e-4


@pytest.mark.parametrize("T", [280.5, 330.5, 403.7, 455.2, 600.5])
def test_water_table_interpolation(T):
    s = cases.water_sat(T)
    assert rel(s["rho_l"], PropsSI("D", "T", T, "Q", 0, "Water")) < 1e-4
    assert rel(s["h_l"], PropsSI("H", "T", T, "Q", 0, "Water") / 1e3) < 1e-3
    assert rel(s["h_v"], PropsSI("H", "T", T, "Q", 1, "Water") / 1e3) < 1e-4
    assert rel(s["rho_v"], PropsSI("D", "T", T, "Q", 1, "Water")) < 2e-3


@pytest.mark.parametrize("P", [1.25, 5.75, 21.87, 33.3, 39.8])
def test_propane_table_interpolation(P):
    s = cases.propane_sat(P)
    assert rel(s["T"], PropsSI("T", "P", P * 1e5, "Q", 1, "Propane")) < 1e-3
    lam = (PropsSI("H", "P", P * 1e5, "Q", 1, "Propane") - PropsSI("H", "P", P * 1e5, "Q", 0, "Propane")) / 1e3
    assert rel(s["lam"], lam) < 5e-3
    assert rel(s["Z"], PropsSI("Z", "P", P * 1e5, "Q", 1, "Propane")) < 5e-3


@pytest.mark.parametrize("T", [300.0, 330.0, 351.0, 365.0])
def test_ethanol_antoine_vs_coolprop(T):
    assert rel(cases.ethanol_psat_kpa(T) * 1e3, PropsSI("P", "T", T, "Q", 0, "Ethanol")) < 1e-2


def test_raoult_pure_components_boil_at_their_normal_points():
    assert abs(cases.bubble(1e-9, 101.325, True)[0] - cases.water_tsat(101.325)) < 1e-3
    assert abs(cases.bubble(1 - 1e-9, 101.325, True)[0] - 351.4) < 0.3   # NIST Antoine gives ~351.4 K


def test_van_laar_has_an_azeotrope_and_raoult_does_not():
    x, T = cases.azeotrope()
    assert 0.85 < x < 0.95 and 350.5 < T < 352.0
    _, y = cases.bubble(x, 101.325, True)
    assert y > x + 0.02


@pytest.mark.parametrize("T,P", [(290.0, 50.0), (310.0, 80.0), (330.0, 150.0), (373.15, 100.0), (400.0, 20.0)])
def test_peng_robinson_vs_coolprop_pr_backend(T, P):
    rho = cases.co2_density(P, T - 273.15)["correct"]
    ref = PropsSI("D", "T", T, "P", P * 1e5, "PR::CO2")
    assert rel(rho, ref) < 2e-3


def test_cubic_roots():
    roots = sorted(cases.cubic_real_roots(-6.0, 11.0, -6.0))   # (z-1)(z-2)(z-3)
    assert all(abs(r - e) < 1e-12 for r, e in zip(roots, [1, 2, 3]))


@pytest.mark.parametrize("Re,eps", [(1e4, 1e-4), (1.72e5, 4.5e-4), (1e6, 1e-5), (5e7, 1e-3)])
def test_colebrook_vs_swamee_jain(Re, eps):
    sj = 0.25 / math.log10(eps / 3.7 + 5.74 / Re ** 0.9) ** 2
    assert rel(cases.colebrook(Re, eps), sj) < 0.02


def test_colebrook_satisfies_its_equation():
    f = cases.colebrook(1.72e5, 4.5e-4)
    assert abs(1 / math.sqrt(f) + 2 * math.log10(4.5e-4 / 3.7 + 2.51 / (1.72e5 * math.sqrt(f)))) < 1e-10


@pytest.mark.parametrize("Tc_out", [45.0, 60.0, 80.0, 95.0, 100.0, 104.0])
def test_lmtd_F_matches_effectiveness_ntu(Tc_out):
    a = cases.hx_area(Tc_out=Tc_out)["correct"]
    b = cases.hx_area_entu(Tc_out=Tc_out)
    assert rel(a, b) < 1e-8


def test_F_infeasible_beyond_limit():
    assert math.isnan(cases.hx_area(Tc_out=110.0)["correct"])
    assert math.isnan(cases.hx_area_entu(Tc_out=110.0))


def test_compressor_by_hand():
    r = cases.compressor()
    assert abs(r["naive"] - (300.15 * 20 ** (0.4 / 1.4) - 273.15)) < 1e-9
    assert abs(r["correct"] - (300.15 * (114.696 / 19.696) ** (0.4 / 1.4) - 273.15)) < 1e-9


def test_npsh_cold_case_agrees():
    r = cases.npsh(T_C=20.0)
    assert abs(r["naive"] - r["correct"]) < 1e-12


def test_valve_not_choked_case_agrees():
    r = cases.valve(P1_bar=6.0, P2_bar=5.0, T_C=40.0)
    assert abs(r["naive"] - r["correct"]) < 1e-12


def test_api520_C_coefficient():
    C = lambda k: 520 * math.sqrt(k * (2 / (k + 1)) ** ((k + 1) / (k - 1)))
    assert abs(C(1.4) - 356.06) < 0.05          # tabulated in API 520-1 as 356


def test_relief_rate_is_heat_over_latent_heat():
    r = cases.run("relief")
    s = cases.propane_sat((250 * 1.21 + 14.696) / 14.503774)
    Q = 21000 * 500 ** 0.82
    assert f"corrected {Q / (s['lam'] * 0.429923):.0f} lb/h" in r["details"][3]


def test_flash_fraction_vs_iapws97():
    r = cases.flash_steam()
    p1, p2 = (10 + 1.01325) / 10, 1.01325 / 10          # MPa
    l1, l2, v2 = IAPWS97(P=p1, x=0), IAPWS97(P=p2, x=0), IAPWS97(P=p2, x=1)
    x = (l1.h - l2.h) / (v2.h - l2.h)
    V = 1000 * (x * v2.v + (1 - x) * l2.v)
    assert rel(r["correct"], V) < 2e-3
    assert rel(r["naive"], 1000 * l1.v) < 1e-3


def test_scaleup_time_grows_as_cube_root_of_volume():
    t1 = cases.scaleup(V_plant_m3=1.0, t_lab_min=1e-6)["correct"]
    t8 = cases.scaleup(V_plant_m3=8.0, t_lab_min=1e-6)["correct"]
    assert abs(t8 / t1 - 2.0) < 1e-9


@pytest.mark.parametrize("case", cases.CASES, ids=lambda c: c["id"])
def test_every_case_runs_and_sweeps(case):
    r = cases.run(case["id"])
    assert r["naive"] == r["naive"] and r["correct"] == r["correct"]
    s = cases.sweep(case["id"])
    assert len(s["x"]) >= 50
    names = [n for n, _, _ in case["inputs"]]
    assert names == list(cases.defaults(case))
